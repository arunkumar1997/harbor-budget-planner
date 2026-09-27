import { categorizePayee } from "@/lib/categories";
import { roundMoney } from "@/lib/format";
import { bankPayee } from "@/lib/parse-bank-statement";
import { detectBank, holderFirstName, isSelfNarration } from "@/lib/statement-common";
import type { DraftTransaction, TxType } from "@/lib/budget-store";
import type { ParsedStatement } from "@/lib/parse-statement";

// Parses a bank ACCOUNT statement exported as .xls / .xlsx. A spreadsheet keeps
// the columns intact, so this is the most reliable import. It handles both
// column namings seen on Indian statements:
//   HDFC: Withdrawal Amt. / Deposit Amt. / Closing Balance
//   SBI:  Debit / Credit / Balance
// Debit/Withdrawal -> expense, Credit/Deposit -> income; self-transfers between
// the user's own accounts are tagged "self" and excluded from in/out.

export class SpreadsheetEncryptedError extends Error {
  wrong: boolean;
  constructor(wrong = false) {
    super(wrong ? "Wrong spreadsheet password" : "Spreadsheet is password-protected");
    this.name = "SpreadsheetEncryptedError";
    this.wrong = wrong;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function toIso(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3]!;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year.length === 2) year = `20${year}`;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // strip currency, commas, and a trailing CR/DR marker
  const s = String(v ?? "")
    .replace(/[,\s₹]/g, "")
    .replace(/(cr|dr)$/i, "")
    .trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function clean(s: unknown): string {
  return String(s ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function parseSpreadsheet(
  file: File,
  password?: string,
): Promise<ParsedStatement> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();

  let wb;
  try {
    wb = XLSX.read(buf, { type: "array" });
  } catch (e) {
    if (!/password|encrypt/i.test(String(e))) throw e;
    // Encrypted workbook. Without a password, ask for one; with one, decrypt on
    // the server (Node) and re-read.
    if (!password) throw new SpreadsheetEncryptedError(false);
    const { decryptSpreadsheet } = await import("@/lib/spreadsheet-decrypt");
    const res = await decryptSpreadsheet({
      data: { base64: bytesToBase64(new Uint8Array(buf)), password },
    });
    if (!res.ok || !res.base64) {
      throw new SpreadsheetEncryptedError(res.error === "wrong_password");
    }
    wb = XLSX.read(base64ToBytes(res.base64), { type: "array" });
  }

  const transactions: DraftTransaction[] = [];
  let skipped = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    });

    // Locate the header row and its columns (either bank's naming).
    let headerIdx = -1;
    const col = { date: -1, narr: -1, out: -1, in: -1 };
    for (let i = 0; i < rows.length; i += 1) {
      const cells = (rows[i] ?? []).map((c) => String(c).toLowerCase());
      const find = (re: RegExp) => cells.findIndex((c) => re.test(c));
      const out = find(/withdrawal|withdrawl|^debit$|\bdebit\b/);
      const inc = find(/deposit|^credit$|\bcredit\b/);
      const bal = find(/balance/);
      if (out >= 0 && inc >= 0 && bal >= 0) {
        headerIdx = i;
        col.date = find(/^date/);
        col.narr = find(/narration|details|description|particular/);
        if (col.narr < 0) col.narr = col.date >= 0 ? col.date + 1 : 1;
        col.out = out;
        col.in = inc;
        break;
      }
    }
    if (headerIdx < 0) continue;

    // Identify bank + account holder from the metadata ABOVE the table only —
    // transaction rows embed counterparties' IFSC codes (e.g. SBIN0…) that would
    // otherwise mis-detect the bank.
    const headerText = rows
      .slice(0, headerIdx)
      .map((r) => (r ?? []).map((c) => clean(c)).join(" "))
      .join(" ");
    const bank = detectBank(headerText);
    const holder = holderFirstName(headerText);

    for (let i = headerIdx + 1; i < rows.length; i += 1) {
      const row = rows[i] ?? [];
      const dateRaw = String(row[col.date] ?? "").trim();
      if (!dateRaw || /^\*+$/.test(dateRaw)) {
        skipped += 1;
        continue;
      }
      const date = toIso(dateRaw);
      if (!date) {
        skipped += 1;
        continue;
      }
      const outAmt = num(row[col.out]);
      const inAmt = num(row[col.in]);
      let type: TxType;
      let amount: number;
      if (outAmt && outAmt > 0) {
        type = "expense";
        amount = outAmt;
      } else if (inAmt && inAmt > 0) {
        type = "income";
        amount = inAmt;
      } else {
        skipped += 1;
        continue;
      }

      const narration = clean(row[col.narr]);
      if (isSelfNarration(narration, holder, type === "expense")) type = "self";
      const payee = bankPayee(narration);
      const catText = narration.replace(
        /^(UPI|NEFT|IMPS|RTGS|POS|ATW|ATM|ACH|NACH|MMT|IB|INB|CMS|INT|EMI|WDL TFR|DIRECT DR)[-\s:]+/i,
        "",
      );
      const category =
        type === "self" ? "Transfers" : categorizePayee(catText || payee, type).category;
      transactions.push({
        type,
        amount: roundMoney(amount),
        category,
        payee,
        date,
        source: "pdf",
        bank,
      });
    }
    if (transactions.length > 0) break;
  }

  return { transactions, skipped };
}

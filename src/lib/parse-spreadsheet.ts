import { categorizePayee } from "@/lib/categories";
import { roundMoney } from "@/lib/format";
import { bankPayee } from "@/lib/parse-bank-statement";
import type { DraftTransaction } from "@/lib/budget-store";
import type { ParsedStatement } from "@/lib/parse-statement";

// Parses a bank ACCOUNT statement exported as .xls / .xlsx. A spreadsheet keeps
// the columns intact, so this is the most reliable import: Withdrawal Amt. ->
// expense, Deposit Amt. -> income, read straight from their columns.

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
  const s = String(v ?? "").replace(/[,\s₹]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function parseSpreadsheet(file: File): Promise<ParsedStatement> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

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

    // Locate the header row carrying the bank's columns.
    let headerIdx = -1;
    const col = { date: -1, narr: -1, wd: -1, dep: -1 };
    for (let i = 0; i < rows.length; i += 1) {
      const cells = (rows[i] ?? []).map((c) => String(c).toLowerCase());
      const find = (re: RegExp) => cells.findIndex((c) => re.test(c));
      const w = find(/withdrawal/);
      const d = find(/deposit/);
      const c = find(/closing/);
      if (w >= 0 && d >= 0 && c >= 0) {
        headerIdx = i;
        col.date = find(/^date/);
        col.narr = find(/narration|description|particular/);
        if (col.narr < 0) col.narr = 1;
        col.wd = w;
        col.dep = d;
        break;
      }
    }
    if (headerIdx < 0) continue;

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
      const wd = num(row[col.wd]);
      const dep = num(row[col.dep]);
      let type: "income" | "expense";
      let amount: number;
      if (wd && wd > 0) {
        type = "expense";
        amount = wd;
      } else if (dep && dep > 0) {
        type = "income";
        amount = dep;
      } else {
        skipped += 1;
        continue;
      }

      const narration = String(row[col.narr] ?? "").trim();
      const payee = bankPayee(narration);
      const catText = narration.replace(
        /^(UPI|NEFT|IMPS|RTGS|POS|ATW|ATM|ACH|NACH|MMT|IB|INB|CMS|INT|EMI)[-\s:]+/i,
        "",
      );
      const { category } = categorizePayee(catText || payee, type);
      transactions.push({
        type,
        amount: roundMoney(amount),
        category,
        payee,
        date,
        source: "pdf",
      });
    }
    if (transactions.length > 0) break;
  }

  return { transactions, skipped };
}

import { categorizePayee } from "@/lib/categories";
import { roundMoney } from "@/lib/format";
import type { DraftTransaction } from "@/lib/budget-store";
import type { ParsedStatement } from "@/lib/parse-statement";
import type { PdfRow } from "@/lib/pdf-text";

// Bank ACCOUNT statements (e.g. HDFC savings) list a running ClosingBalance
// with separate Withdrawal / Deposit columns. Once the text is flattened the
// two amount columns look identical, so debit-vs-credit is recovered from the
// direction the balance moves — which also validates the amount.

const ROW_DATE = /^\s*(\d{2}\/\d{2}\/\d{2})\b/; // DD/MM/YY at line start
const AMOUNT = /\d{1,3}(?:,\d{3})*\.\d{2}/g; // 1,998.40 / 89,053.45
const REF = /\b\d{12,}\b/; // 16-digit Chq./Ref.No.

const CREDIT_HINT =
  /salary|neft cr|imps[- ]?cr|\bcr\b|credit|refund|reversal|interest|deposit|received|cashback|dividend/i;

interface RawRow {
  date: string;
  narration: string;
  amount: number;
  balance: number;
}

function toIso(ddmmyy: string): string | null {
  const m = ddmmyy.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `20${m[3]}-${m[2]}-${m[1]}`;
}

// Turn an HDFC UPI/NEFT narration into a readable payee.
function bankPayee(narration: string): string {
  let s = narration.replace(/\s+/g, " ").trim();
  const chan = s.match(
    /^(UPI|NEFT|IMPS|RTGS|POS|ATW|ATM|ACH|NACH|MMT|IB|INB|CMS|INT|EMI)[-\s:]+/i,
  );
  if (chan) s = s.slice(chan[0].length);
  s = s.split("@")[0] ?? s;
  const dash = s.indexOf("-");
  if (dash > 2) s = s.slice(0, dash);
  s = s
    .replace(/[^A-Za-z0-9 &.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || narration.slice(0, 40).trim() || "Bank transaction";
}

export function parseBankStatementLines(lines: string[]): ParsedStatement {
  const raw: RawRow[] = [];
  let skipped = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const dateMatch = line.match(ROW_DATE);
    if (!dateMatch) {
      skipped += 1;
      continue;
    }
    const amounts = line.match(AMOUNT);
    if (!amounts || amounts.length < 2) {
      // A dated line with fewer than two money amounts isn't a posted row
      // (the row always carries amount + closing balance).
      skipped += 1;
      continue;
    }
    const date = toIso(dateMatch[1] ?? "");
    if (!date) {
      skipped += 1;
      continue;
    }
    const amount = Number(amounts[amounts.length - 2]!.replace(/,/g, ""));
    const balance = Number(amounts[amounts.length - 1]!.replace(/,/g, ""));
    if (!Number.isFinite(amount) || !Number.isFinite(balance) || amount === 0) {
      skipped += 1;
      continue;
    }
    const afterDate = line.slice(dateMatch[0].length);
    const refM = afterDate.match(REF);
    const narration = (refM ? afterDate.slice(0, refM.index) : afterDate).trim();
    raw.push({ date, narration, amount: roundMoney(amount), balance });
  }

  // Direction from balance movement; first row falls back to narration hint.
  const transactions: DraftTransaction[] = [];
  let prevBalance: number | null = null;
  for (const row of raw) {
    let type: "income" | "expense";
    if (prevBalance === null) {
      type = CREDIT_HINT.test(row.narration) ? "income" : "expense";
    } else {
      type = row.balance > prevBalance + 0.001 ? "income" : "expense";
    }
    prevBalance = row.balance;

    const payee = bankPayee(row.narration);
    // Categorise on the narration minus the rail prefix (UPI-/NEFT-/…) so the
    // merchant keywords match; keep the balance-derived type as source of truth.
    const catText = row.narration.replace(
      /^(UPI|NEFT|IMPS|RTGS|POS|ATW|ATM|ACH|NACH|MMT|IB|INB|CMS|INT|EMI)[-\s:]+/i,
      "",
    );
    const { category } = categorizePayee(catText, type);
    transactions.push({
      type,
      amount: row.amount,
      category,
      payee,
      date: row.date,
      source: "pdf",
    });
  }

  return { transactions, skipped };
}

// COLUMN-BASED parser (preferred). Reads each amount from its own column by
// x-position — Withdrawal Amt. -> expense, Deposit Amt. -> income — so it never
// confuses the amount with the Closing Balance and never has to infer debit vs
// credit. Needs positioned rows (see extractPdfRows in pdf-text.ts).
export function parseBankStatementRows(rows: PdfRow[]): ParsedStatement {
  const header = rows.find(
    (r) =>
      /withdrawal/i.test(r.text) && /deposit/i.test(r.text) && /closing/i.test(r.text),
  );
  if (!header) return { transactions: [], skipped: rows.length };

  const anchorX = (re: RegExp) => header.cells.find((c) => re.test(c.str))?.x ?? null;
  const wX = anchorX(/withdrawal/i);
  const dX = anchorX(/deposit/i);
  const cX = anchorX(/closing/i);
  const refX = anchorX(/chq|ref/i) ?? 283;
  if (wX == null || dX == null || cX == null) {
    return { transactions: [], skipped: rows.length };
  }

  const MONEY = /^\d[\d,]*\.\d{2}$/; // 471.00 / 28,796.78 / 1,35,000.00
  const isDate = (s: string) => /^\d{2}\/\d{2}\/\d{2}$/.test(s);

  const transactions: DraftTransaction[] = [];
  let skipped = 0;

  for (const r of rows) {
    if (r === header) {
      skipped += 1;
      continue;
    }
    const monies = r.cells
      .filter((c) => MONEY.test(c.str))
      .map((c) => ({ x: c.x, v: Number(c.str.replace(/,/g, "")) }))
      .filter((m) => Number.isFinite(m.v));
    if (monies.length === 0) {
      skipped += 1;
      continue;
    }
    // Balance is the rightmost column; a real posted row always has one.
    const bal = monies.find((m) => m.x >= cX - 5);
    if (!bal) {
      skipped += 1;
      continue;
    }
    const wd = monies.find((m) => m.x < dX - 5);
    const dep = monies.find((m) => m.x >= dX - 5 && m.x < cX - 5);

    let type: "income" | "expense";
    let amount: number;
    if (wd && wd.v > 0) {
      type = "expense";
      amount = wd.v;
    } else if (dep && dep.v > 0) {
      type = "income";
      amount = dep.v;
    } else {
      skipped += 1;
      continue;
    }

    const dateCell = r.cells.find((c) => isDate(c.str));
    const date = dateCell ? toIso(dateCell.str) : null;
    if (!date) {
      skipped += 1;
      continue;
    }

    // Narration sits left of the Chq./Ref. column; drop the date, ref number,
    // and any amounts.
    const narration = r.cells
      .filter(
        (c) =>
          c.x < refX - 5 &&
          !isDate(c.str) &&
          !MONEY.test(c.str) &&
          !/^\d{6,}$/.test(c.str),
      )
      .map((c) => c.str)
      .join(" ")
      .trim();
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

  return { transactions, skipped };
}

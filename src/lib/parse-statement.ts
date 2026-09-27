import { categorizePayee } from "@/lib/categories";
import { roundMoney } from "@/lib/format";
import type { DraftTransaction } from "@/lib/budget-store";

// Header / summary lines that are never a posted transaction.
const SKIP =
  /\b(opening|closing|previous|balance|subtotal|total|statement|period|account|page|exported|purchases subtotal|cardmember|northline|credit limit|available|minimum|due date|reward|points|summary|gstin|hsn|cardmember statement)\b/i;

const DATE_TOKEN =
  /(\d{4}-\d{2}-\d{2}|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/;

// Amount at end of a statement line. Handles:
//   ₹ / Rs / Rs. / INR / "C" (the rupee glyph some exports emit), $
//   Indian grouping 1,00,000.00 as well as 1,075.00 / 648.00 / 648
//   optional decimals, trailing CR/DR, wrapping ( ) for negatives
const CURRENCY_PREFIX = "(?:\\u20b9|Rs\\.?|INR|C|\\$)";
const NUMBER = "(?:\\d{1,3}(?:,\\d{2,3})+|\\d+)(?:\\.\\d{1,2})?";
const AMOUNT_TOKEN = new RegExp(
  `([+\\-\\u2212(])?\\s*${CURRENCY_PREFIX}?\\s*(${NUMBER})\\s*\\)?\\s*(CR|DR|CREDIT|DEBIT)?`,
  "i",
);

export interface ParsedStatement {
  transactions: DraftTransaction[];
  skipped: number;
}

function toIsoDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const compact = raw.replace(/[.-]/g, "/");
  const parts = compact.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!parts) return null;
  let a = Number(parts[1]);
  let b = Number(parts[2]);
  let year = parts[3]!;
  // Decide day/month order. Indian statements are DD/MM/YYYY; fall back to
  // that unless the numbers force US MM/DD (first field > 12).
  let day: number, month: number;
  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  } else if (b > 12 && a <= 12) {
    month = a;
    day = b;
  } else {
    // ambiguous — prefer day-first (INR default)
    day = a;
    month = b;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year.length === 2) year = Number(year) > 70 ? `19${year}` : `20${year}`;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseAmount(raw: string, sign?: string, qualifier?: string) {
  const negativeParens = /\(/.test(raw);
  const cleaned = raw.replace(/[₹$,()]/g, "").replace(/\b(Rs\.?|INR|C)\b/gi, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  const q = (qualifier ?? "").toUpperCase();
  const s = sign ?? "";
  let type: "income" | "expense";
  if (q === "CR" || q === "CREDIT" || s === "+") type = "income";
  else if (q === "DR" || q === "DEBIT") type = "expense";
  else if (negativeParens || s === "-" || s === "−") type = "expense";
  else type = "expense";
  return { amount: roundMoney(abs), type };
}

// Strip statement noise that otherwise trips up amount detection.
function cleanLine(line: string) {
  return line
    .replace(/\(Ref#[^)]*\)/gi, " ")
    .replace(/\(cid:[^)]*\)/gi, " ")
    .replace(/\|\s*\d{1,2}:\d{2}(?::\d{2})?/g, " ") // "| 00:00" time
    .replace(/\s+l\s*$/i, " ") // trailing PI bullet
    .replace(/\s+/g, " ")
    .trim();
}

export function parseStatementLines(lines: string[]): ParsedStatement {
  const transactions: DraftTransaction[] = [];
  let skipped = 0;

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    if (SKIP.test(line)) {
      skipped += 1;
      continue;
    }

    const dateMatch = line.match(DATE_TOKEN);
    if (!dateMatch || dateMatch.index === undefined) {
      skipped += 1;
      continue;
    }

    const date = toIsoDate(dateMatch[1] ?? "");
    if (!date) {
      skipped += 1;
      continue;
    }

    const afterDate = line.slice(dateMatch.index + dateMatch[0].length).trim();
    const amounts = [...afterDate.matchAll(new RegExp(AMOUNT_TOKEN, "gi"))].filter(
      (m) => (m[2] ?? "").replace(/[.,]/g, "").length > 0,
    );
    if (amounts.length === 0) {
      skipped += 1;
      continue;
    }

    const last = amounts[amounts.length - 1]!;
    const parsed = parseAmount(last[2] ?? "", last[1], last[3]);
    if (!parsed || parsed.amount === 0) {
      skipped += 1;
      continue;
    }

    const payee = cleanPayee(afterDate.slice(0, last.index).trim()) || "Statement entry";
    if (SKIP.test(payee) && payee.length < 28) {
      skipped += 1;
      continue;
    }

    const hinted =
      last[3] && /cr|credit/i.test(last[3])
        ? "income"
        : last[3] && /dr|debit/i.test(last[3])
          ? "expense"
          : parsed.type;

    const { category, type } = categorizePayee(payee, hinted);
    transactions.push({
      type,
      amount: parsed.amount,
      category,
      payee,
      date,
      source: "pdf",
    });
  }

  return { transactions, skipped };
}

// Keep the merchant string readable without destroying its original casing
// (Indian statements concatenate city, e.g. "Swiggy FoodBENGALURU").
function cleanPayee(payee: string) {
  return payee
    .replace(/^[+\-−₹$]+/, "")
    .replace(/\b(Rs\.?|INR)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parsedToDrafts(rows: AiTransaction[]): DraftTransaction[] {
  return rows
    .filter((row) => row.amount > 0 && row.payee && row.date)
    .map((row) => {
      const type = row.type === "income" ? "income" : "expense";
      const { category } = categorizePayee(row.payee, type);
      return {
        type,
        amount: roundMoney(row.amount),
        category: row.category || category,
        payee: row.payee.trim(),
        date: row.date,
        source: "pdf" as const,
      };
    });
}

export interface AiTransaction {
  date: string;
  payee: string;
  amount: number;
  type: "income" | "expense";
  category?: string;
}

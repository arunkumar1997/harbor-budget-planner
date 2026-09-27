import { parseStatementLines, type ParsedStatement } from "@/lib/parse-statement";
import {
  parseBankStatementLines,
  parseBankStatementRows,
} from "@/lib/parse-bank-statement";
import type { PdfRow } from "@/lib/pdf-text";

// Picks the right parser for whatever statement was uploaded.
//
// When positioned rows are available (from extractPdfRows), a bank ACCOUNT
// statement is parsed by column (Withdrawal / Deposit read from their own
// columns) — this is preferred because it can't confuse the amount with the
// closing balance, and it reads credits vs debits from the column, not a guess.
// Otherwise it falls back to comparing the credit-card and flattened bank
// parsers and taking whichever recognises more rows.
export function parseAnyStatement(lines: string[], rows?: PdfRow[]): ParsedStatement {
  if (rows && rows.length) {
    const bankByColumn = parseBankStatementRows(rows);
    if (bankByColumn.transactions.length > 0) return bankByColumn;
  }
  const card = parseStatementLines(lines);
  const bankLines = parseBankStatementLines(lines);
  return bankLines.transactions.length > card.transactions.length ? bankLines : card;
}

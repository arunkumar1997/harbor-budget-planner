import { parseStatementLines, type ParsedStatement } from "@/lib/parse-statement";
import { parseBankStatementLines } from "@/lib/parse-bank-statement";

// Runs both the credit-card and bank-account parsers and returns whichever
// recognises more transactions. The card parser wins ties. This lets the
// import flow accept either kind of statement without the user choosing a type.
export function parseAnyStatement(lines: string[]): ParsedStatement {
  const card = parseStatementLines(lines);
  const bank = parseBankStatementLines(lines);
  return bank.transactions.length > card.transactions.length ? bank : card;
}

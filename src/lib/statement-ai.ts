import { createServerFn } from "@tanstack/react-start";
import type { AiTransaction } from "@/lib/parse-statement";

const SYSTEM = `You extract transactions from bank or credit-card PDF statement text (India / INR).
Return JSON only, no markdown:
{"transactions":[{"date":"YYYY-MM-DD","payee":"string","amount":number,"type":"income"|"expense","category":"string"}]}
Rules:
- amounts are in Indian rupees; a leading ₹, "Rs", "INR" or a bare "C" glyph all mean rupees. Strip them.
- Indian digit grouping is used: 1,00,000.00 means one lakh. Return amount as a plain number (100000).
- dates are usually DD/MM/YYYY; convert to YYYY-MM-DD. Ignore any time like "| 00:00".
- amount is always a positive number
- purchases, debits, POS, UPI spends, fees = expense
- salary/payroll credits, deposits, refunds, reversals, credits (CR) or a leading "+" = income
- a "CREDIT CARD PAYMENT" / net-banking payment to the card is income (a credit to the account)
- GST/IGST/CGST/SGST, finance charges, late fees, DCC markup = expense, category "Fees & Charges"
- skip balances, totals, credit-limit lines, reward-point summaries, headers, page footers, GST summary totals
- category must be one of: Housing, Groceries, Dining, Transport, Utilities, Health, Shopping, Entertainment, Subscriptions, Travel, Fees & Charges, Transfers, Salary, Freelance, Interest, Refund, Other
- keep payee short and human-readable`;

export const parseStatementWithAi = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => input)
  .handler(async ({ data }): Promise<{
    ok: boolean;
    error?: string;
    transactions: AiTransaction[];
  }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "AI is not available", transactions: [] };
    }

    const text = data.text.slice(0, 12000);
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0,
        max_tokens: 1800,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: text },
        ],
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `xAI API error ${res.status}`, transactions: [] };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    const jsonText = extractJson(content);
    if (!jsonText) {
      return { ok: false, error: "Could not read statement", transactions: [] };
    }

    try {
      const parsed = JSON.parse(jsonText) as { transactions?: AiTransaction[] };
      const transactions = Array.isArray(parsed.transactions)
        ? parsed.transactions.filter(
            (row) =>
              row &&
              typeof row.payee === "string" &&
              typeof row.date === "string" &&
              typeof row.amount === "number",
          )
        : [];
      return { ok: true, transactions };
    } catch {
      return { ok: false, error: "Could not read statement", transactions: [] };
    }
  });

function extractJson(content: string) {
  const fenced = content.match(/\{[\s\S]*\}/);
  return fenced?.[0] ?? null;
}

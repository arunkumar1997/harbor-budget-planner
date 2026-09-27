// Shared helpers for statement parsers: identify the bank, the account holder,
// and self-transfers (moving money between the user's own accounts).

export function detectBank(text: string): string | undefined {
  const t = text.toUpperCase();
  if (/STATE BANK OF INDIA|\bSBIN0|\bSBI\b/.test(t)) return "SBI";
  if (/HDFC/.test(t)) return "HDFC";
  if (/ICICI/.test(t)) return "ICICI";
  if (/AXIS BANK|\bUTIB0/.test(t)) return "Axis";
  if (/KOTAK/.test(t)) return "Kotak";
  if (/YES BANK|\bYESB0/.test(t)) return "Yes Bank";
  if (/PUNJAB NATIONAL|\bPUNB0|\bPNB\b/.test(t)) return "PNB";
  if (/CANARA/.test(t)) return "Canara";
  if (/BANK OF BARODA|\bBARB0/.test(t)) return "BoB";
  if (/UNION BANK/.test(t)) return "Union";
  if (/IDFC/.test(t)) return "IDFC";
  if (/INDUSIND/.test(t)) return "IndusInd";
  return undefined;
}

// The account holder's first name, e.g. "Mr. ARUNKUMAR DATTATREYA BHAT" -> ARUNKUMAR.
export function holderFirstName(text: string): string | undefined {
  const m = text.match(/\bM(?:R|RS|S)\.?\s+([A-Z][A-Za-z]{3,})/);
  return m ? (m[1] as string).toUpperCase() : undefined;
}

// A self-transfer: an explicit "/self" tag (used by SBI for own-account IMPS),
// or a DEBIT transfer whose narration names the account holder (moving money to
// their own other account). Credits are never matched on the holder name — an
// incoming salary/credit legitimately names the holder as the beneficiary.
export function isSelfNarration(
  narration: string,
  holderFirst?: string,
  isDebit = false,
): boolean {
  const n = narration.toUpperCase();
  if (/\/\s*SELF\b/.test(n)) return true;
  const isTransfer = /(UPI|IMPS|NEFT|RTGS|TFR|TRANSFER)/.test(n);
  if (isTransfer && /\bSELF\b/.test(n)) return true;
  if (
    isDebit &&
    isTransfer &&
    holderFirst &&
    holderFirst.length >= 5 &&
    n.includes(holderFirst)
  ) {
    return true;
  }
  return false;
}

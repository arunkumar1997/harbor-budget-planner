import { format, parseISO } from "date-fns";

// Currency is centralised here. The whole app formats money through
// formatMoney / formatSignedMoney, so this is the only place to change it.
export const CURRENCY = "INR";
export const LOCALE = "en-IN";

export function formatMoney(value: number) {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
    // INR amounts are usually whole rupees on statements; show paise only
    // when they exist so lists stay easy to scan.
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSignedMoney(value: number) {
  const abs = formatMoney(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

export function formatMonthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year ?? 2026, (m ?? 1) - 1, 1);
  return format(date, "MMMM yyyy");
}

export function formatShortDate(iso: string) {
  try {
    return format(parseISO(iso), "MMM d");
  } catch {
    return iso;
  }
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year ?? 2026, (m ?? 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

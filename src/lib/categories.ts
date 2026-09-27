export const EXPENSE_CATEGORIES = [
  "Housing",
  "Groceries",
  "Dining",
  "Transport",
  "Utilities",
  "Health",
  "Shopping",
  "Entertainment",
  "Subscriptions",
  "Travel",
  "Fees & Charges",
  "Transfers",
  "Other",
] as const;

export const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Interest",
  "Refund",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

const PAYEE_RULES: { pattern: RegExp; category: string; type: "income" | "expense" }[] = [
  // Income
  { pattern: /payroll|salary|direct dep|paycheck|siemens|neft cr|imps cr|credited/i, category: "Salary", type: "income" },
  { pattern: /freelance|invoice|1099|consult/i, category: "Freelance", type: "income" },
  { pattern: /interest|dividend|cashback|reward/i, category: "Interest", type: "income" },
  { pattern: /refund|reversal|reimb/i, category: "Refund", type: "income" },
  { pattern: /card payment|payment received|net banking/i, category: "Refund", type: "income" },

  // Card fees, taxes and finance charges (HDFC / Indian statements)
  { pattern: /igst|cgst|sgst|\bgst\b|finance charge|late fee|interest charge|dcc transaction|markup|surcharge|annual fee|joining fee|cash advance fee|over ?limit/i, category: "Fees & Charges", type: "expense" },

  // Housing / rent
  { pattern: /rent|mortgage|lofts|apartment|lease|housing|nobroker|nestaway/i, category: "Housing", type: "expense" },

  // Entertainment / gaming / events
  { pattern: /playstation|\bpsn\b|xbox|steam|nintendo|epic games|riot games|bookmyshow|pvr|inox|cinema|movie/i, category: "Entertainment", type: "expense" },

  // Subscriptions / digital
  { pattern: /netflix|spotify|apple\.com|hotstar|jiocinema|jio ?cinema|sony ?liv|zee5|prime video|youtube premium|anthropic|claude|openai|chatgpt|adobe|icloud|google one|subscription|sub\b/i, category: "Subscriptions", type: "expense" },

  // Shopping / e-commerce / retail
  { pattern: /amazon|flipkart|myntra|ajio|meesho|nykaa|tata cliq|croma|reliance digital|nordstrom|store|retail|decathlon|ikea/i, category: "Shopping", type: "expense" },

  // Groceries / quick-commerce
  { pattern: /blinkit|blink commerce|zepto|instamart|bigbasket|big ?basket|dmart|d-?mart|jiomart|jio ?mart|grocery|more supermarket|reliance fresh|licious|country delight|milk basket|supermarket|kirana|farmers market/i, category: "Groceries", type: "expense" },

  // Dining / food delivery
  { pattern: /swiggy|zomato|eatsure|dominos|domino|pizza|mcdonald|kfc|burger|starbucks|chai|cafe|coffee|restaurant|dine|eat|food|bakery|third wave|blue tokai/i, category: "Dining", type: "expense" },

  // Transport / fuel / cabs / transit
  { pattern: /uber|ola|rapido|namma metro|bmtc|ksrtc|metro|irctc|indian oil|iocl|bharat petroleum|bpcl|hpcl|shell|fuel|petrol|fastag|parking|toll|redbus/i, category: "Transport", type: "expense" },

  // Utilities / telecom / broadband
  { pattern: /bescom|electricity|kseb|tneb|water board|bwssb|airtel|jio|vodafone|vi |bsnl|act fibernet|\bact\b|hathway|broadband|dth|tata play|gas|indane|utility|recharge|bill ?pay/i, category: "Utilities", type: "expense" },

  // Health / pharmacy
  { pattern: /pharmacy|apollo|pharmeasy|1mg|netmeds|hospital|clinic|dental|diagnostic|practo|medplus|manipal|fortis|kaiser|cvs/i, category: "Health", type: "expense" },

  // Travel
  { pattern: /makemytrip|goibibo|cleartrip|ixigo|indigo|vistara|air india|spicejet|akasa|airline|hotel|oyo|airbnb|travel|booking\.com/i, category: "Travel", type: "expense" },

  // Transfers (rails like UPI/NEFT alone are not a category — only explicit transfers)
  { pattern: /\btransfer\b|to savings|own account|self ?transfer/i, category: "Transfers", type: "expense" },
];

export function categorizePayee(
  payee: string,
  hintedType?: "income" | "expense",
): { category: string; type: "income" | "expense" } {
  for (const rule of PAYEE_RULES) {
    if (rule.pattern.test(payee)) {
      return { category: rule.category, type: hintedType ?? rule.type };
    }
  }
  return {
    category: "Other",
    type: hintedType ?? "expense",
  };
}

export function categoriesFor(type: "income" | "expense" | "self") {
  if (type === "income") return INCOME_CATEGORIES;
  if (type === "self") return ["Transfers", "Other"] as const;
  return EXPENSE_CATEGORIES;
}

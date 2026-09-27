import { create } from "zustand";
import { persist } from "zustand/middleware";
import { currentMonth, roundMoney } from "@/lib/format";

export type TxType = "income" | "expense";

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  payee: string;
  date: string;
  source: "manual" | "pdf";
}

export interface SavingsGoal {
  name: string;
  target: number;
  saved: number;
}

export interface DraftTransaction {
  type: TxType;
  amount: number;
  category: string;
  payee: string;
  date: string;
  source: "manual" | "pdf";
}

interface BudgetState {
  transactions: Transaction[];
  goal: SavingsGoal;
  month: string;
  setMonth: (month: string) => void;
  addTransaction: (draft: DraftTransaction) => void;
  updateTransaction: (id: string, patch: Partial<DraftTransaction>) => void;
  deleteTransaction: (id: string) => void;
  importTransactions: (drafts: DraftTransaction[]) => number;
  setGoal: (patch: Partial<SavingsGoal>) => void;
  applyLeftover: (amount: number) => void;
}

const SEED: Transaction[] = [
  {
    id: "seed-payroll",
    type: "income",
    amount: 145000,
    category: "Salary",
    payee: "Siemens salary",
    date: "2026-09-01",
    source: "manual",
  },
  {
    id: "seed-rent",
    type: "expense",
    amount: 32000,
    category: "Housing",
    payee: "Flat rent",
    date: "2026-09-02",
    source: "manual",
  },
  {
    id: "seed-bescom",
    type: "expense",
    amount: 2480,
    category: "Utilities",
    payee: "BESCOM electricity",
    date: "2026-09-08",
    source: "manual",
  },
  {
    id: "seed-freelance",
    type: "income",
    amount: 18000,
    category: "Freelance",
    payee: "Side project invoice 18",
    date: "2026-09-15",
    source: "manual",
  },
  {
    id: "seed-savings",
    type: "expense",
    amount: 15000,
    category: "Transfers",
    payee: "Transfer to savings",
    date: "2026-09-26",
    source: "manual",
  },
];

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function withId(draft: DraftTransaction): Transaction {
  return { ...draft, id: makeId(), amount: roundMoney(draft.amount) };
}

function fingerprint(tx: { date: string; payee: string; amount: number }) {
  return `${tx.date}|${tx.payee.trim().toLowerCase()}|${roundMoney(tx.amount)}`;
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      transactions: SEED,
      goal: {
        name: "Emergency fund",
        target: 300000,
        saved: 125000,
      },
      month: currentMonth(),
      setMonth: (month) => set({ month }),
      addTransaction: (draft) =>
        set({ transactions: [withId(draft), ...get().transactions] }),
      updateTransaction: (id, patch) =>
        set({
          transactions: get().transactions.map((tx) =>
            tx.id === id
              ? { ...tx, ...patch, amount: roundMoney(patch.amount ?? tx.amount) }
              : tx,
          ),
        }),
      deleteTransaction: (id) =>
        set({ transactions: get().transactions.filter((tx) => tx.id !== id) }),
      importTransactions: (drafts) => {
        const existing = new Set(get().transactions.map(fingerprint));
        const next: Transaction[] = [];
        for (const draft of drafts) {
          const tx = withId(draft);
          const key = fingerprint(tx);
          if (existing.has(key)) continue;
          existing.add(key);
          next.push(tx);
        }
        if (next.length === 0) return 0;
        set({ transactions: [...next, ...get().transactions] });
        return next.length;
      },
      setGoal: (patch) => set({ goal: { ...get().goal, ...patch } }),
      applyLeftover: (amount) => {
        if (amount <= 0) return;
        set({
          goal: {
            ...get().goal,
            saved: roundMoney(get().goal.saved + amount),
          },
        });
      },
    }),
    {
      name: "harbor-budget-inr-v1",
      skipHydration: true,
      partialize: (state) => ({
        transactions: state.transactions,
        goal: state.goal,
        month: state.month,
      }),
    },
  ),
);

export function monthTotals(transactions: Transaction[], month: string) {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (!tx.date.startsWith(month)) continue;
    if (tx.type === "income") income += tx.amount;
    else expense += tx.amount;
  }
  return {
    income: roundMoney(income),
    expense: roundMoney(expense),
    remaining: roundMoney(income - expense),
  };
}

export function spendingByCategory(transactions: Transaction[], month: string) {
  const map = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type !== "expense" || !tx.date.startsWith(month)) continue;
    map.set(tx.category, roundMoney((map.get(tx.category) ?? 0) + tx.amount));
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

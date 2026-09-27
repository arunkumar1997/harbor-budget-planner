import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileUp, Files, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CategoryChart } from "@/components/budget/category-chart";
import { ImportDialog } from "@/components/budget/import-dialog";
import { StatementsDialog } from "@/components/budget/statements-dialog";
import { TransactionDialog } from "@/components/budget/transaction-dialog";
import {
  monthTotals,
  spendingByCategory,
  useBudgetStore,
  type Transaction,
} from "@/lib/budget-store";
import {
  formatMoney,
  formatMonthLabel,
  formatShortDate,
  shiftMonth,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type Filter = "all" | "expense" | "income" | "self";

export function BudgetApp() {
  const transactions = useBudgetStore((s) => s.transactions);
  const month = useBudgetStore((s) => s.month);
  const setMonth = useBudgetStore((s) => s.setMonth);
  const goal = useBudgetStore((s) => s.goal);
  const setGoal = useBudgetStore((s) => s.setGoal);
  const applyLeftover = useBudgetStore((s) => s.applyLeftover);
  const coverFromSavings = useBudgetStore((s) => s.coverFromSavings);
  const addTransaction = useBudgetStore((s) => s.addTransaction);
  const updateTransaction = useBudgetStore((s) => s.updateTransaction);
  const deleteTransaction = useBudgetStore((s) => s.deleteTransaction);
  const importTransactions = useBudgetStore((s) => s.importTransactions);
  const clearMonth = useBudgetStore((s) => s.clearMonth);

  const [filter, setFilter] = useState<Filter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [statementsOpen, setStatementsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmCover, setConfirmCover] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);

  useEffect(() => {
    void useBudgetStore.persist.rehydrate();
  }, []);

  const totals = useMemo(() => monthTotals(transactions, month), [transactions, month]);
  const breakdown = useMemo(
    () => spendingByCategory(transactions, month),
    [transactions, month],
  );
  const monthTx = useMemo(() => {
    return transactions
      .filter((tx) => tx.date.startsWith(month))
      .filter((tx) => (filter === "all" ? true : tx.type === filter))
      .sort((a, b) => b.date.localeCompare(a.date) || b.payee.localeCompare(a.payee));
  }, [transactions, month, filter]);

  const monthCount = useMemo(
    () => transactions.filter((tx) => tx.date.startsWith(month)).length,
    [transactions, month],
  );

  const goalPct = goal.target <= 0 ? 0 : Math.min(100, (goal.saved / goal.target) * 100);
  const remainingTone = totals.remaining >= 0 ? "text-foreground" : "text-expense";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                <path
                  d="M4 16h16M6 16V11.5L12 8l6 3.5V16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 18.5h18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <div>
              <p className="font-display text-xl leading-tight tracking-tight">Harbor</p>
              <p className="text-xs text-muted-foreground">Monthly ledger</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              aria-label="Imported statements"
              onClick={() => setStatementsOpen(true)}
            >
              <Files />
              <span className="hidden sm:inline">Statements</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Import PDF"
              onClick={() => setImportOpen(true)}
            >
              <FileUp />
              <span className="hidden sm:inline">Import PDF</span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus />
              Add
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 pb-16">
        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Left this month</p>
            <p className={cn("font-display text-5xl tracking-tight tabular-nums sm:text-6xl", remainingTone)}>
              {totals.remaining < 0
                ? `−${formatMoney(Math.abs(totals.remaining))}`
                : formatMoney(totals.remaining)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="tabular-nums text-income">{formatMoney(totals.income)}</span> in
              <span className="mx-2 text-border-strong">·</span>
              <span className="tabular-nums text-expense">{formatMoney(totals.expense)}</span> out
              {totals.self > 0 ? (
                <>
                  <span className="mx-2 text-border-strong">·</span>
                  <span className="tabular-nums">{formatMoney(totals.self)}</span> self
                </>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-1 self-start rounded-md bg-muted p-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft />
            </Button>
            <p className="min-w-36 text-center text-sm font-medium">{formatMonthLabel(month)}</p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Income" value={formatMoney(totals.income)} tone="text-income" />
          <Stat label="Spent" value={formatMoney(totals.expense)} tone="text-expense" />
          <Stat
            label="Toward savings"
            value={formatMoney(Math.max(0, totals.remaining))}
            tone="text-foreground"
          />
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Card>
            <CardHeader className="mb-3 flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Savings goal</CardTitle>
                <CardDescription>{goal.name}</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Edit savings goal"
                onClick={() => setEditingGoal((v) => !v)}
              >
                <Pencil />
              </Button>
            </CardHeader>
            <CardContent>
              {editingGoal ? (
                <form
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    setGoal({
                      name: String(form.get("name") || goal.name),
                      target: Number(form.get("target")) || goal.target,
                      saved: Number(form.get("saved")) || 0,
                    });
                    setEditingGoal(false);
                  }}
                >
                  <div className="grid gap-2">
                    <Label htmlFor="goal-name">Name</Label>
                    <Input id="goal-name" name="name" defaultValue={goal.name} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="goal-saved">Saved</Label>
                      <Input
                        id="goal-saved"
                        name="saved"
                        inputMode="decimal"
                        defaultValue={goal.saved}
                        className="tabular-nums"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="goal-target">Target</Label>
                      <Input
                        id="goal-target"
                        name="target"
                        inputMode="decimal"
                        defaultValue={goal.target}
                        className="tabular-nums"
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm">
                    Save goal
                  </Button>
                </form>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-display text-3xl tabular-nums tracking-tight">
                      {formatMoney(goal.saved)}
                    </p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      of {formatMoney(goal.target)}
                    </p>
                  </div>
                  <Progress value={goalPct} className="mt-3" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatMoney(Math.max(0, goal.target - goal.saved))} to go · {Math.round(goalPct)}%
                  </p>
                  {totals.remaining >= 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-4"
                      disabled={totals.remaining === 0}
                      onClick={() => applyLeftover(totals.remaining)}
                    >
                      {totals.remaining === 0
                        ? "Nothing left to apply"
                        : `Apply ${formatMoney(totals.remaining)} to savings`}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-4 text-expense"
                      onClick={() => setConfirmCover(true)}
                    >
                      Cover {formatMoney(Math.abs(totals.remaining))} from savings
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spending by category</CardTitle>
              <CardDescription>Imported statements and ledger entries, grouped.</CardDescription>
            </CardHeader>
            <CardContent>
              <CategoryChart data={breakdown} />
            </CardContent>
          </Card>
        </div>

        <Card className="p-0">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-lg font-medium tracking-tight">Activity</h2>
              <p className="text-sm text-muted-foreground">
                Tap a row to edit. Import a PDF to pull card expenses in.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {monthCount > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-expense"
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 />
                  <span className="hidden sm:inline">Clear month</span>
                </Button>
              ) : null}
              <div className="flex rounded-md bg-muted p-1">
                {(["all", "expense", "income", "self"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={cn(
                      "h-9 rounded-sm px-3 text-sm capitalize transition-colors duration-150",
                      filter === value
                        ? "bg-card font-medium shadow-[var(--shadow-border)]"
                        : "text-muted-foreground",
                    )}
                  >
                    {value === "all"
                      ? "All"
                      : value === "expense"
                        ? "Out"
                        : value === "income"
                          ? "In"
                          : "Self"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Separator />
          {monthTx.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">Nothing in this month yet.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
                  Import PDF
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <ul>
              {monthTx.map((tx) => (
                <li key={tx.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(tx);
                      setFormOpen(true);
                    }}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/70"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium">{tx.payee}</span>
                        {tx.bank ? (
                          <Badge variant="secondary" className="shrink-0">
                            {tx.bank}
                          </Badge>
                        ) : tx.source === "pdf" ? (
                          <Badge className="shrink-0">Statement</Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
                        <span>{tx.type === "self" ? "Self transfer" : tx.category}</span>
                        <span className="tabular-nums">{formatShortDate(tx.date)}</span>
                      </span>
                    </span>
                    <span
                      className={cn(
                        "text-sm font-medium tabular-nums",
                        tx.type === "income"
                          ? "text-income"
                          : tx.type === "self"
                            ? "text-muted-foreground"
                            : "text-expense",
                      )}
                    >
                      {tx.type === "income" ? "+" : tx.type === "self" ? "⇄ " : "−"}
                      {formatMoney(tx.amount)}
                    </span>
                  </button>
                  <Separator />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>

      <TransactionDialog
        open={formOpen}
        transaction={editing}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        onSave={(draft) => {
          if (editing) updateTransaction(editing.id, draft);
          else addTransaction(draft);
        }}
        onDelete={editing ? () => deleteTransaction(editing.id) : undefined}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={importTransactions}
      />
      <StatementsDialog open={statementsOpen} onOpenChange={setStatementsOpen} />

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear {formatMonthLabel(month)}?</AlertDialogTitle>
            <AlertDialogDescription>
              All {monthCount} {monthCount === 1 ? "entry" : "entries"} in{" "}
              {formatMonthLabel(month)} — added and imported — will be deleted. This can’t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-expense text-primary-foreground hover:bg-expense/90"
              onClick={() => {
                clearMonth(month);
                setConfirmClear(false);
              }}
            >
              Clear month
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCover} onOpenChange={setConfirmCover}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cover the shortfall from savings?</AlertDialogTitle>
            <AlertDialogDescription>
              You spent {formatMoney(Math.abs(totals.remaining))} more than you earned in{" "}
              {formatMonthLabel(month)}. Deduct {formatMoney(Math.abs(totals.remaining))} from your
              savings goal to balance the month? This adds a “Withdrawn from savings” entry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                coverFromSavings(Math.abs(totals.remaining));
                setConfirmCover(false);
              }}
            >
              Deduct from savings
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={cn("mt-1 font-display text-2xl tabular-nums tracking-tight", tone)}>{value}</p>
    </Card>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { categoriesFor } from "@/lib/categories";
import { currentMonth } from "@/lib/format";
import type { DraftTransaction, Transaction, TxType } from "@/lib/budget-store";
import { cn } from "@/lib/utils";

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: Transaction | null;
  onSave: (draft: DraftTransaction) => void;
  onDelete?: () => void;
}

export function TransactionDialog({
  open,
  onOpenChange,
  transaction,
  onSave,
  onDelete,
}: TransactionDialogProps) {
  const isEdit = Boolean(transaction);
  const [type, setType] = useState<TxType>(transaction?.type ?? "expense");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [payee, setPayee] = useState(transaction?.payee ?? "");
  const [category, setCategory] = useState(transaction?.category ?? "Other");
  const [date, setDate] = useState(
    transaction?.date ?? `${currentMonth()}-${String(new Date().getDate()).padStart(2, "0")}`,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(transaction?.type ?? "expense");
    setAmount(transaction ? String(transaction.amount) : "");
    setPayee(transaction?.payee ?? "");
    setCategory(transaction?.category ?? (transaction?.type === "income" ? "Salary" : "Other"));
    setDate(
      transaction?.date ??
        `${currentMonth()}-${String(new Date().getDate()).padStart(2, "0")}`,
    );
    setConfirmDelete(false);
  }, [open, transaction]);

  const options = useMemo(() => categoriesFor(type), [type]);

  useEffect(() => {
    if (!(options as readonly string[]).includes(category)) {
      setCategory(type === "income" ? "Salary" : "Other");
    }
  }, [type, options, category]);

  function handleSave() {
    const value = Number(amount);
    if (!payee.trim() || !Number.isFinite(value) || value <= 0) return;
    onSave({
      type,
      amount: value,
      payee: payee.trim(),
      category,
      date,
      source: transaction?.source ?? "manual",
    });
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit transaction" : "Add transaction"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Update the details or remove this entry." : "Log income or spending."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
              {(["expense", "income"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  className={cn(
                    "h-10 rounded-sm text-sm font-medium capitalize transition-colors duration-150",
                    type === value
                      ? "bg-card text-foreground shadow-[var(--shadow-border)]"
                      : "text-muted-foreground",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="font-medium tabular-nums"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="payee">Payee</Label>
              <Input
                id="payee"
                placeholder={type === "income" ? "Acme Corp" : "Merchant"}
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-11 rounded-md border border-border bg-card px-3 text-sm shadow-[var(--shadow-border)] focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:outline-none"
                >
                  {options.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            {isEdit && onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className="text-expense sm:mr-auto"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave}>
              {isEdit ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              {transaction?.payee} will be removed from your ledger.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-expense hover:bg-expense/90"
              onClick={() => {
                onDelete?.();
                setConfirmDelete(false);
                onOpenChange(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

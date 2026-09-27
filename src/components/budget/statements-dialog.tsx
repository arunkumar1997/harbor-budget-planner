import { useState } from "react";
import { ChevronDown, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { formatMoney, formatShortDate } from "@/lib/format";
import { useBudgetStore, type Statement } from "@/lib/budget-store";
import { cn } from "@/lib/utils";

interface StatementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StatementsDialog({ open, onOpenChange }: StatementsDialogProps) {
  const statements = useBudgetStore((s) => s.statements) ?? [];
  const transactions = useBudgetStore((s) => s.transactions);
  const deleteStatement = useBudgetStore((s) => s.deleteStatement);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Statement | null>(null);

  const entriesFor = (id: string) => transactions.filter((t) => t.statementId === id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Imported statements</DialogTitle>
            <DialogDescription>
              Statements you’ve imported. Deleting one also removes every entry it added to
              your ledger.
            </DialogDescription>
          </DialogHeader>

          {statements.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No statements imported yet. Use “Import PDF” to add one.
            </div>
          ) : (
            <ul className="grid max-h-[min(60dvh,520px)] gap-2 overflow-auto">
              {statements.map((st) => {
                const entries = entriesFor(st.id);
                const isOpen = expanded === st.id;
                return (
                  <li key={st.id} className="rounded-lg border border-border bg-muted/40">
                    <div className="flex items-center gap-3 p-3">
                      <FileText className="size-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{st.name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {entries.length} {entries.length === 1 ? "entry" : "entries"} ·{" "}
                          {formatMoney(entries.reduce((s, t) => s + t.amount, 0))} ·{" "}
                          {new Date(st.importedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpanded(isOpen ? null : st.id)}
                      >
                        {isOpen ? "Hide" : "View"}
                        <ChevronDown
                          className={cn("transition-transform", isOpen && "rotate-180")}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${st.name}`}
                        className="text-muted-foreground hover:text-expense"
                        onClick={() => setPendingDelete(st)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {isOpen ? (
                      <ul className="border-t border-border">
                        {entries.length === 0 ? (
                          <li className="px-3 py-2 text-xs text-muted-foreground">
                            No entries left from this statement.
                          </li>
                        ) : (
                          entries.map((t) => (
                            <li
                              key={t.id}
                              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                            >
                              <span className="min-w-0">
                                <span className="block truncate">{t.payee}</span>
                                <span className="text-xs text-muted-foreground">
                                  {t.category} · {formatShortDate(t.date)}
                                </span>
                              </span>
                              <span
                                className={cn(
                                  "shrink-0 tabular-nums",
                                  t.type === "income" ? "text-income" : "text-expense",
                                )}
                              >
                                {t.type === "income" ? "+" : "−"}
                                {formatMoney(t.amount)}
                              </span>
                            </li>
                          ))
                        )}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this statement?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `“${pendingDelete.name}” and its ${entriesFor(pendingDelete.id).length} ledger ${
                    entriesFor(pendingDelete.id).length === 1 ? "entry" : "entries"
                  } will be removed. This can’t be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-expense text-primary-foreground hover:bg-expense/90"
              onClick={() => {
                if (!pendingDelete) return;
                const n = entriesFor(pendingDelete.id).length;
                deleteStatement(pendingDelete.id);
                toast.success(`Deleted statement and ${n} ${n === 1 ? "entry" : "entries"}.`);
                setPendingDelete(null);
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

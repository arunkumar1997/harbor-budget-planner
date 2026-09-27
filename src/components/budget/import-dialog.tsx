import { useRef, useState } from "react";
import { FileUp, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { parsedToDrafts } from "@/lib/parse-statement";
import { parseAnyStatement } from "@/lib/statement-parsers";
import type { PdfRow } from "@/lib/pdf-text";
import { parseStatementWithAi } from "@/lib/statement-ai";
import { categoriesFor } from "@/lib/categories";
import type { DraftTransaction } from "@/lib/budget-store";
import { cn } from "@/lib/utils";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: DraftTransaction[], meta?: { name?: string }) => number;
}

export function ImportDialog({ open, onOpenChange, onImport }: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<DraftTransaction[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const [pwError, setPwError] = useState("");
  const [fileName, setFileName] = useState("");

  function reset() {
    setBusy(false);
    setStatus("");
    setRows([]);
    setSelected(new Set());
    setPendingFile(null);
    setPassword("");
    setNeedPassword(false);
    setPwError("");
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(file: File, pw?: string) {
    setBusy(true);
    setStatus(pw ? "Unlocking statement…" : "Reading statement…");
    setFileName(file.name);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".csv")) {
        setStatus(pw ? "Unlocking spreadsheet…" : "Reading spreadsheet…");
        const { parseSpreadsheet } = await import("@/lib/parse-spreadsheet");
        const result = await parseSpreadsheet(file, pw);
        setPendingFile(null);
        setNeedPassword(false);
        setPassword("");
        setPwError("");
        showDrafts(result.transactions);
        return;
      }
      const { extractStatementFromFile } = await import("@/lib/pdf-text");
      const { lines, rows } = await extractStatementFromFile(file, pw);
      setPendingFile(null);
      setNeedPassword(false);
      setPassword("");
      setPwError("");
      await parseLines(lines, rows);
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === "PdfPasswordError" || name === "SpreadsheetEncryptedError") {
        // Encrypted file — reveal the password field and hold the file for retry.
        setPendingFile(file);
        setNeedPassword(true);
        setPwError((error as { wrong?: boolean })?.wrong ? "Wrong password — try again." : "");
        setStatus("");
        setBusy(false);
        return;
      }
      console.error(error);
      toast.error(
        error instanceof Error && error.message.includes("ZIP")
          ? error.message
          : "Could not read that file.",
      );
      setBusy(false);
      setStatus("");
    }
  }

  function submitPassword() {
    if (!pendingFile || !password.trim()) return;
    void handleFile(pendingFile, password.trim());
  }

  async function handleSample() {
    setBusy(true);
    setStatus("Loading sample statement…");
    setFileName("Sample statement");
    try {
      const res = await fetch("/sample-statement.pdf");
      const buffer = await res.arrayBuffer();
      const { extractStatementFromBytes } = await import("@/lib/pdf-text");
      const { lines, rows } = await extractStatementFromBytes(buffer);
      await parseLines(lines, rows);
    } catch (error) {
      console.error(error);
      toast.error("Could not load the sample statement.");
      setBusy(false);
      setStatus("");
    }
  }

  async function parseLines(lines: string[], rows?: PdfRow[]) {
    const local = parseAnyStatement(lines, rows);
    let drafts = local.transactions;

    if (drafts.length === 0) {
      setStatus("Reading with Harbor…");
      try {
        const ai = await parseStatementWithAi({ data: { text: lines.join("\n") } });
        if (ai.ok && ai.transactions.length > 0) {
          drafts = parsedToDrafts(ai.transactions);
        }
      } catch {
        // Fall through to the empty state below.
      }
    }

    if (drafts.length === 0) {
      toast.error("No transactions found in that statement.");
      setBusy(false);
      setStatus("");
      return;
    }

    showDrafts(drafts);
  }

  function showDrafts(drafts: DraftTransaction[]) {
    if (drafts.length === 0) {
      toast.error("No transactions found in that statement.");
      setBusy(false);
      setStatus("");
      return;
    }
    setRows(drafts);
    setSelected(new Set(drafts.map((_, i) => i)));
    setBusy(false);
    setStatus("");
  }

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function updateRow(index: number, patch: Partial<DraftTransaction>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function confirmImport() {
    const chosen = rows.filter((_, i) => selected.has(i));
    const added = onImport(chosen, { name: fileName });
    if (added === 0) toast.message("Those entries are already in your ledger.");
    else toast.success(`Imported ${added} ${added === 1 ? "expense" : "expenses"}.`);
    reset();
    onOpenChange(false);
  }

  const selectedTotal = rows.reduce(
    (sum, row, i) => (selected.has(i) && row.type === "expense" ? sum + row.amount : sum),
    0,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import statement</DialogTitle>
          <DialogDescription>
            Upload an exported bank or card statement — PDF or Excel (.xls/.xlsx). Harbor reads the charges and maps them to
            categories so you can review before they hit your ledger.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <div className="grid gap-3">
            {needPassword ? (
              <div className="grid gap-2 rounded-lg border border-border bg-muted/60 p-3">
                <p className="text-sm font-medium">This file is password-protected</p>
                <p className="text-xs text-muted-foreground">
                  Enter the password your bank uses to open this statement.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    autoFocus
                    value={password}
                    placeholder="PDF password"
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        submitPassword();
                      }
                    }}
                    aria-label="PDF password"
                  />
                  <Button
                    type="button"
                    disabled={busy || !password.trim()}
                    onClick={submitPassword}
                  >
                    {busy ? "…" : "Unlock"}
                  </Button>
                </div>
                {pwError ? <p className="text-xs text-expense">{pwError}</p> : null}
              </div>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-muted/60 px-4 text-center transition-colors hover:bg-muted"
            >
              {busy ? (
                <LoaderCircle className="size-6 animate-spin text-primary" />
              ) : (
                <FileUp className="size-6 text-primary" />
              )}
              <span className="text-sm font-medium">
                {busy
                  ? status || "Working…"
                  : needPassword
                    ? "Choose a different file"
                    : "Drop a PDF or Excel file, or browse"}
              </span>
              <span className="text-xs text-muted-foreground">
                PDF or Excel (.xls/.xlsx) · Excel is most accurate · password-protected files supported
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf,.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip,.zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setNeedPassword(false);
                  setPassword("");
                  setPwError("");
                  void handleFile(file);
                }
              }}
            />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void handleSample()}>
              Use sample statement
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex items-end justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {selected.size} selected · {formatMoney(selectedTotal)} in expenses
              </p>
              <button
                type="button"
                className="text-sm text-primary"
                onClick={() =>
                  setSelected(
                    selected.size === rows.length ? new Set() : new Set(rows.map((_, i) => i)),
                  )
                }
              >
                {selected.size === rows.length ? "Clear" : "Select all"}
              </button>
            </div>
            <ul className="max-h-[min(50dvh,420px)] overflow-auto rounded-lg bg-muted/70">
              {rows.map((row, index) => (
                <li
                  key={`${row.date}-${row.payee}-${index}`}
                  className={cn(
                    "grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0",
                    !selected.has(index) && "opacity-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(index)}
                    onChange={() => toggle(index)}
                    className="size-4 accent-primary"
                    aria-label={`Include ${row.payee}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.payee}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">{row.date}</span>
                      <select
                        value={row.category}
                        onChange={(e) => updateRow(index, { category: e.target.value })}
                        className="h-8 rounded-sm border border-border bg-card px-2 text-xs"
                      >
                        {categoriesFor(row.type).map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                      <Badge variant={row.type === "income" ? "income" : "expense"}>
                        {row.type}
                      </Badge>
                    </div>
                  </div>
                  <p
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      row.type === "income" ? "text-income" : "text-expense",
                    )}
                  >
                    {row.type === "income" ? "+" : "−"}
                    {formatMoney(row.amount)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          {rows.length > 0 ? (
            <Button type="button" disabled={selected.size === 0} onClick={confirmImport}>
              Import {selected.size}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

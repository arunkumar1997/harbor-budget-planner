import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

interface TextItem {
  str?: string;
  transform?: number[];
}

// Thrown when a PDF is encrypted. `wrong` is true when a password was supplied
// but rejected, false when one is required and none was given yet.
export class PdfPasswordError extends Error {
  wrong: boolean;
  constructor(wrong: boolean) {
    super(wrong ? "Wrong PDF password" : "PDF password required");
    this.name = "PdfPasswordError";
    this.wrong = wrong;
  }
}

export async function extractPdfLines(
  data: ArrayBuffer,
  password?: string,
): Promise<string[]> {
  let pdf;
  try {
    // Clone the buffer — pdf.js transfers (detaches) the array it's handed,
    // which would break a retry with a password on the same bytes.
    pdf = await getDocument({
      data: new Uint8Array(data.slice(0)),
      password: password || undefined,
    }).promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e && (e.name === "PasswordException" || e.code === 1 || e.code === 2)) {
      // code 2 = INCORRECT_PASSWORD, code 1 = NEED_PASSWORD
      throw new PdfPasswordError(e.code === 2);
    }
    throw err;
  }

  const lines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const buckets = new Map<number, { x: number; str: string }[]>();

    for (const raw of content.items) {
      const item = raw as TextItem;
      const str = item.str?.trim();
      if (!str || !item.transform) continue;
      const y = Math.round(item.transform[5] ?? 0);
      const x = item.transform[4] ?? 0;
      const bucket = buckets.get(y) ?? [];
      bucket.push({ x, str });
      buckets.set(y, bucket);
    }

    const sortedYs = [...buckets.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const parts = (buckets.get(y) ?? []).sort((a, b) => a.x - b.x);
      const line = parts
        .map((p) => p.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (line) lines.push(line);
    }
  }

  return lines;
}

// Returns the PDF bytes from a dropped file. If the file is a .zip (some banks
// mail the statement zipped), the first PDF entry is extracted. An encrypted
// PDF *inside* a plain zip is handled downstream by the password flow.
export async function readPdfBytes(file: File): Promise<ArrayBuffer> {
  const isZip =
    /\.zip$/i.test(file.name) ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed";
  const buf = await file.arrayBuffer();
  if (!isZip) return buf;

  const { unzipSync } = await import("fflate");
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(buf));
  } catch {
    // fflate can't open an encrypted/AES zip container.
    throw new Error(
      "This ZIP is itself password-protected. Unzip it on your phone, then upload the PDF (the app can take the PDF's password).",
    );
  }
  const pdfName = Object.keys(entries).find(
    (n) => /\.pdf$/i.test(n) && !n.startsWith("__MACOSX"),
  );
  if (!pdfName) throw new Error("No PDF was found inside that ZIP.");
  const bytes = entries[pdfName]!;
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

export async function extractPdfFromFile(
  file: File,
  password?: string,
): Promise<string[]> {
  const bytes = await readPdfBytes(file);
  return extractPdfLines(bytes, password);
}

// A positioned cell and a row of them, grouped by vertical position. This keeps
// each token's x so a parser can read data by COLUMN (e.g. a bank statement's
// Withdrawal / Deposit / Closing Balance columns) instead of guessing from a
// flattened line.
export interface PdfCell {
  x: number;
  str: string;
}
export interface PdfRow {
  y: number;
  page: number;
  cells: PdfCell[];
  text: string;
}

export async function extractPdfRows(
  data: ArrayBuffer,
  password?: string,
): Promise<PdfRow[]> {
  let pdf;
  try {
    pdf = await getDocument({
      data: new Uint8Array(data.slice(0)),
      password: password || undefined,
    }).promise;
  } catch (err) {
    const e = err as { name?: string; code?: number };
    if (e && (e.name === "PasswordException" || e.code === 1 || e.code === 2)) {
      throw new PdfPasswordError(e.code === 2);
    }
    throw err;
  }

  const rows: PdfRow[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const items: { x: number; y: number; str: string }[] = [];
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[] };
      const str = item.str?.trim();
      if (!str || !item.transform) continue;
      items.push({ x: item.transform[4] ?? 0, y: item.transform[5] ?? 0, str });
    }
    // Cluster into visual rows top-to-bottom; tokens within 3px of vertical are
    // the same row (handles baselines that don't round identically).
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let cur: { y: number; cells: PdfCell[] } | null = null;
    const flush = () => {
      if (!cur) return;
      const cells = cur.cells.slice().sort((a, b) => a.x - b.x);
      rows.push({
        y: cur.y,
        page: pageNum,
        cells,
        text: cells.map((c) => c.str).join(" ").replace(/\s+/g, " ").trim(),
      });
      cur = null;
    };
    for (const it of items) {
      if (!cur || Math.abs(it.y - cur.y) > 3) {
        flush();
        cur = { y: it.y, cells: [] };
      }
      cur.cells.push({ x: it.x, str: it.str });
    }
    flush();
  }
  return rows;
}

// Read both a flattened-line view (for the credit-card parser) and a positioned
// row view (for the column-based bank parser) from one file, in a single parse.
export async function extractStatementFromFile(
  file: File,
  password?: string,
): Promise<{ lines: string[]; rows: PdfRow[] }> {
  const bytes = await readPdfBytes(file);
  const rows = await extractPdfRows(bytes, password);
  const lines = rows.map((r) => r.text).filter(Boolean);
  return { lines, rows };
}

export async function extractStatementFromBytes(
  data: ArrayBuffer,
  password?: string,
): Promise<{ lines: string[]; rows: PdfRow[] }> {
  const rows = await extractPdfRows(data, password);
  const lines = rows.map((r) => r.text).filter(Boolean);
  return { lines, rows };
}

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

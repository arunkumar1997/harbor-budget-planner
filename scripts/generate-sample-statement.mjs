import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Sample INR credit-card statement used by the import demo.
// Rows exercise the parser: DD/MM/YYYY dates, "Rs" + Indian digit grouping,
// a "+" salary credit, and fee/tax lines.
const rows = [
  ["02/09/2026", "SWIGGY FOOD BENGALURU", "Rs 542.00"],
  ["03/09/2026", "BLINKIT GURGAON", "Rs 618.00"],
  ["04/09/2026", "NETFLIX.COM", "Rs 649.00"],
  ["05/09/2026", "OLA CABS BENGALURU", "Rs 236.00"],
  ["06/09/2026", "BIGBASKET BBDAILY", "Rs 1,284.00"],
  ["07/09/2026", "AMAZON.IN MARKETPLACE", "Rs 2,199.00"],
  ["08/09/2026", "APOLLO PHARMACY", "Rs 415.00"],
  ["09/09/2026", "INDIAN OIL FUEL", "Rs 2,000.00"],
  ["10/09/2026", "AIRTEL BROADBAND", "Rs 999.00"],
  ["11/09/2026", "NAMMA METRO BMRCL", "Rs 90.00"],
  ["12/09/2026", "ZOMATO BENGALURU", "Rs 388.00"],
  ["13/09/2026", "FLIPKART INTERNET", "Rs 3,499.00"],
  ["14/09/2026", "ANTHROPIC* CLAUDE SUB", "Rs 2,399.00"],
  ["15/09/2026", "BESCOM ELECTRICITY", "Rs 1,860.00"],
  ["18/09/2026", "IGST-VPS RATE 18.0", "Rs 71.82"],
  ["20/09/2026", "FINANCE CHARGES", "Rs 0.00"],
];

const salaryCredit = ["01/09/2026", "SALARY CREDIT SIEMENS", "+ Rs 1,45,000.00"];

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

let stream = "BT\n";
function at(font, size, x, y, text) {
  stream += `/${font} ${size} Tf\n1 0 0 1 ${x} ${y} Tm\n(${esc(text)}) Tj\n`;
}

at("F2", 18, 54, 742, "MILLENNIA CREDIT CARD");
at("F1", 11, 54, 722, "Cardmember Statement  -  Account ending 6626");
at("F1", 10, 54, 706, "Statement period  14 Aug 2026  -  13 Sep 2026");
at("F1", 10, 54, 690, "Exported PDF statement (INR)");
at("F2", 10, 54, 662, "Date");
at("F2", 10, 130, 662, "Description");
at("F2", 10, 430, 662, "Amount");

let y = 644;
at("F1", 10, 54, y, salaryCredit[0]);
at("F1", 10, 130, y, salaryCredit[1]);
at("F1", 10, 430, y, salaryCredit[2]);
y -= 16;
for (const [date, desc, amount] of rows) {
  at("F1", 10, 54, y, date);
  at("F1", 10, 130, y, desc);
  at("F1", 10, 430, y, amount);
  y -= 16;
}

at("F1", 10, 54, y - 12, "Purchases subtotal     Rs 21,649.82");
at("F1", 9, 54, y - 32, "Skip running totals and previous balance when importing.");
stream += "ET\n";

function obj(n, body) {
  return `${n} 0 obj\n${body}\nendobj\n`;
}

const content = obj(
  4,
  `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
);

const parts = [
  "%PDF-1.4\n",
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>"),
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
  obj(
    3,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
  ),
  content,
  obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  obj(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"),
];

let pdf = parts.join("");
const xrefPos = pdf.length;
let xref = `xref\n0 7\n0000000000 65535 f \n`;
let running = parts[0].length;
for (let i = 1; i < parts.length; i++) {
  xref += `${String(running).padStart(10, "0")} 00000 n \n`;
  running += parts[i].length;
}
pdf += xref;
pdf += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const out of [
  "public/sample-statement.pdf",
  ".vercel/output/static/sample-statement.pdf",
]) {
  try {
    writeFileSync(resolve(root, out), pdf);
    console.log("wrote", out, pdf.length, "bytes");
  } catch (e) {
    console.log("skip", out, String(e));
  }
}

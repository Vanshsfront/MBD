// MBD Clinic OS — Invoice XLSX rendering (PRD §6.1, §6.2).
//
// Loads one of the 4 invoice templates, writes header data + line items into
// known cells, returns a Buffer of the modified workbook. Formulas in the
// templates (VLOOKUP, SUMPRODUCT, SUM) are preserved by ExcelJS unless we
// explicitly overwrite them.
//
// Header / line-item layout (per format-parser report):
//
//   Row 15: company + client + invoice number
//   Row 16: invoice date
//   Row 17: valid-till (Proforma only)
//   Rows 28–53: 26 line items.
//     Services: B service, D consultant, E HSN, F qty, G disc, H price, I gst, J amount
//     Products: B product, D notes, E price/piece, F HSN, G qty, H disc, I amount
//     Manual:   B desc, D consultant, E HSN, F qty, G disc, H price, I gst, J amount
//   Row 54: additional discount label/value
//   Row 55: total paid
//   Row 58: totals (sessions / GST sum / grand total)

import { promises as fs } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { INVOICE_TEMPLATES, type InvoiceFlavor } from "@/lib/templates/keys";

const TEMPLATES_ROOT = path.join(process.cwd(), "templates");

const HEADER = {
  invoiceNumberCell: "H15",
  invoiceNumberSuffixCell: "K15",
  invoiceDateCell: "H16",
  validTillCell: "H17",
  clientNameCell: "D15",
  centreNameCell: "B15",
  referredByCell: "I23",
} as const;

const LINE_ITEM_FIRST_ROW = 28;
const LINE_ITEM_MAX_ROWS = 26;

const TOTALS = {
  additionalDiscountPercentCell: "H55",
  additionalDiscountAmountCell: "J54",
  totalPaidCell: "I55",
} as const;

export interface InvoiceLineCommon {
  /** "Service" name (Services / Manual) or "Product" name (Products) */
  description: string;
  /** Optional notes column (Products) */
  notes?: string;
  /** Consultant display name (Services / Manual) */
  consultant?: string;
  /** HSN/SAC code */
  hsnSac?: string;
  /** Quantity (sessions / pieces) */
  qty: number;
  /** Per-unit price (sessions / per-piece) */
  perAmount: number;
  /** Per-line discount fraction (0–1) */
  lineDiscountFraction?: number;
  /** GST rate fraction (0–1), e.g. 0.18 */
  gstRate?: number;
  /** Pre-computed line amount (post-discount, pre-GST). Optional — the renderer
   *  will compute and write it if omitted. */
  lineAmount?: number;
}

export interface RenderInvoiceArgs {
  flavor: InvoiceFlavor;
  centreName: string;
  clientName: string;
  invoiceNumber: string;
  invoiceDate: Date;
  /** Proforma only */
  validTill?: Date;
  referredBy?: string;
  lineItems: InvoiceLineCommon[];
  /** Across-the-invoice manual discount (PERCENT). */
  additionalDiscountPercent?: number;
  /** Or a flat discount amount. */
  additionalDiscountAmount?: number;
  /** Total paid so far. */
  totalPaid?: number;
}

export async function renderInvoice(args: RenderInvoiceArgs): Promise<Buffer> {
  if (args.lineItems.length > LINE_ITEM_MAX_ROWS) {
    throw new Error(
      `Invoice has ${args.lineItems.length} line items; template only supports ${LINE_ITEM_MAX_ROWS}.`,
    );
  }

  const filename = INVOICE_TEMPLATES[args.flavor];
  const fullPath = path.join(TEMPLATES_ROOT, filename);
  const buf = await fs.readFile(fullPath);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  // The first sheet is the invoice template.
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Invoice template has no worksheets");

  // Header
  setCell(sheet, HEADER.centreNameCell, args.centreName);
  setCell(sheet, HEADER.clientNameCell, args.clientName);
  setCell(sheet, HEADER.invoiceNumberCell, args.invoiceNumber);
  setCell(sheet, HEADER.invoiceDateCell, formatDate(args.invoiceDate));
  if (args.flavor === "proforma" && args.validTill) {
    setCell(sheet, HEADER.validTillCell, formatDate(args.validTill));
  }
  if (args.referredBy) {
    setCell(sheet, HEADER.referredByCell, args.referredBy);
  }

  // Line items
  for (let i = 0; i < args.lineItems.length; i++) {
    const row = LINE_ITEM_FIRST_ROW + i;
    writeLineItem(sheet, row, args.flavor, args.lineItems[i]!);
  }

  // Clear any leftover line-item rows beyond what we wrote (in case the
  // template had previous values).
  for (let i = args.lineItems.length; i < LINE_ITEM_MAX_ROWS; i++) {
    const row = LINE_ITEM_FIRST_ROW + i;
    clearLineItem(sheet, row, args.flavor);
  }

  // Totals
  if (args.additionalDiscountPercent !== undefined) {
    setCell(sheet, TOTALS.additionalDiscountPercentCell, args.additionalDiscountPercent);
  }
  if (args.additionalDiscountAmount !== undefined) {
    setCell(sheet, TOTALS.additionalDiscountAmountCell, args.additionalDiscountAmount);
  }
  if (args.totalPaid !== undefined) {
    setCell(sheet, TOTALS.totalPaidCell, args.totalPaid);
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

// ---------- helpers ----------

function setCell(
  sheet: ExcelJS.Worksheet,
  address: string,
  value: string | number | Date,
): void {
  const cell = sheet.getCell(address);
  cell.value = value;
}

function formatDate(d: Date): string {
  // dd-MMM-yyyy is the format the original templates display.
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleString("en-IN", { month: "short" });
  return `${day}-${month}-${d.getFullYear()}`;
}

function writeLineItem(
  sheet: ExcelJS.Worksheet,
  row: number,
  flavor: InvoiceFlavor,
  item: InvoiceLineCommon,
): void {
  if (flavor === "products") {
    sheet.getCell(`B${row}`).value = item.description;
    sheet.getCell(`D${row}`).value = item.notes ?? "";
    sheet.getCell(`E${row}`).value = item.perAmount;
    sheet.getCell(`F${row}`).value = item.hsnSac ?? "";
    sheet.getCell(`G${row}`).value = item.qty;
    sheet.getCell(`H${row}`).value = item.lineDiscountFraction ?? 0;
    if (item.lineAmount !== undefined) {
      sheet.getCell(`I${row}`).value = item.lineAmount;
    }
    return;
  }

  // Services / Manual / Proforma share the same column layout.
  sheet.getCell(`B${row}`).value = item.description;
  sheet.getCell(`D${row}`).value = item.consultant ?? "";
  sheet.getCell(`E${row}`).value = item.hsnSac ?? "";
  sheet.getCell(`F${row}`).value = item.qty;
  sheet.getCell(`G${row}`).value = item.lineDiscountFraction ?? 0;
  sheet.getCell(`H${row}`).value = item.perAmount;
  if (item.gstRate !== undefined) {
    sheet.getCell(`I${row}`).value = item.gstRate;
  }
  if (item.lineAmount !== undefined) {
    sheet.getCell(`J${row}`).value = item.lineAmount;
  }
}

function clearLineItem(
  sheet: ExcelJS.Worksheet,
  row: number,
  flavor: InvoiceFlavor,
): void {
  const cols = flavor === "products" ? ["B", "D", "E", "F", "G", "H", "I"] : ["B", "D", "E", "F", "G", "H", "I", "J"];
  for (const col of cols) {
    const cell = sheet.getCell(`${col}${row}`);
    // Don't clobber template formulas — only blank text/number values.
    if (typeof cell.value === "string" || typeof cell.value === "number") {
      cell.value = "";
    }
  }
}

// MBD Clinic OS — Invoice XLSX rendering (PRD §6.1, §6.2).
//
// The four invoice workbooks look similar but their totals/payment rows are
// not identical. Keep the write map per flavor so data never lands in label
// cells such as "Invoice No.", "Invoice Date", or "Total Paid".

import { promises as fs } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import PizZip from "pizzip";
import { CLINIC_TIME_ZONE } from "@/lib/date-format";
import { INVOICE_TEMPLATES, type InvoiceFlavor } from "@/lib/templates/keys";

const TEMPLATES_ROOT = path.join(process.cwd(), "templates");
const LINE_ITEM_FIRST_ROW = 28;
export const INVOICE_TEMPLATE_LINE_LIMIT = 26;

type CellValue = string | number | null;

interface FlavorMap {
  clientNameCell: string;
  clientAddressCell: string;
  clientGstCell: string;
  invoiceNumberCell: string;
  invoiceNumberClearCells: string[];
  invoiceDateCell: string;
  invoiceDateClearCells: string[];
  validTillCell?: string;
  validTillClearCells?: string[];
  referredByCell: string;
  taxLabelCell: string;
  taxValueCell: string;
  totalGstCell?: string;
  totalAmountCell: string;
  amountWordsCell: string;
  paidByCell?: string;
  txnIdCell?: string;
  additionalDiscountPercentCell?: string;
  preTaxTotalCell?: string;
  lineColumns: {
    description: string;
    notes?: string;
    consultant?: string;
    hsnSac?: string;
    qty: string;
    discount: string;
    perAmount: string;
    gstRate?: string;
    amount: string;
  };
  clearColumns: string[];
}

const FLAVOR_MAPS: Record<InvoiceFlavor, FlavorMap> = {
  services: {
    clientNameCell: "D16",
    clientAddressCell: "D17",
    clientGstCell: "D18",
    invoiceNumberCell: "J15",
    invoiceNumberClearCells: ["K15", "L15", "M15", "N15"],
    invoiceDateCell: "J16",
    invoiceDateClearCells: ["K16", "L16", "M16", "N16"],
    referredByCell: "J23",
    taxLabelCell: "H24",
    taxValueCell: "J24",
    totalGstCell: "J58",
    totalAmountCell: "J61",
    amountWordsCell: "C61",
    paidByCell: "C64",
    txnIdCell: "B60",
    additionalDiscountPercentCell: "H55",
    preTaxTotalCell: "J54",
    lineColumns: {
      description: "B",
      consultant: "D",
      hsnSac: "E",
      qty: "F",
      discount: "G",
      perAmount: "H",
      gstRate: "I",
      amount: "J",
    },
    clearColumns: ["B", "D", "E", "F", "G", "H", "I", "J"],
  },
  products: {
    clientNameCell: "D16",
    clientAddressCell: "D17",
    clientGstCell: "D18",
    invoiceNumberCell: "J15",
    invoiceNumberClearCells: ["K15", "L15", "M15", "N15"],
    invoiceDateCell: "J16",
    invoiceDateClearCells: ["K16", "L16", "M16", "N16"],
    referredByCell: "J23",
    taxLabelCell: "H24",
    taxValueCell: "J24",
    totalAmountCell: "I55",
    amountWordsCell: "C55",
    paidByCell: "C58",
    txnIdCell: "C60",
    lineColumns: {
      description: "B",
      notes: "D",
      perAmount: "E",
      hsnSac: "F",
      qty: "G",
      discount: "H",
      amount: "I",
    },
    clearColumns: ["B", "D", "E", "F", "G", "H", "I"],
  },
  manual: {
    clientNameCell: "D16",
    clientAddressCell: "D17",
    clientGstCell: "D18",
    invoiceNumberCell: "J15",
    invoiceNumberClearCells: ["K15", "L15", "M15", "N15"],
    invoiceDateCell: "J16",
    invoiceDateClearCells: ["K16", "L16", "M16", "N16"],
    referredByCell: "J23",
    taxLabelCell: "H24",
    taxValueCell: "J24",
    totalGstCell: "J54",
    totalAmountCell: "J57",
    amountWordsCell: "C57",
    paidByCell: "C60",
    txnIdCell: "C62",
    lineColumns: {
      description: "B",
      consultant: "D",
      hsnSac: "E",
      qty: "F",
      discount: "G",
      perAmount: "H",
      gstRate: "I",
      amount: "J",
    },
    clearColumns: ["B", "D", "E", "F", "G", "H", "I", "J"],
  },
  proforma: {
    clientNameCell: "D16",
    clientAddressCell: "D17",
    clientGstCell: "D18",
    invoiceNumberCell: "J15",
    invoiceNumberClearCells: ["K15", "L15", "M15", "N15"],
    invoiceDateCell: "J16",
    invoiceDateClearCells: ["K16", "L16", "M16", "N16"],
    validTillCell: "J17",
    validTillClearCells: ["K17", "L17", "M17", "N17"],
    referredByCell: "J23",
    taxLabelCell: "H24",
    taxValueCell: "J24",
    totalGstCell: "J54",
    totalAmountCell: "J57",
    amountWordsCell: "C57",
    lineColumns: {
      description: "B",
      consultant: "D",
      qty: "F",
      discount: "G",
      perAmount: "H",
      gstRate: "I",
      amount: "J",
    },
    clearColumns: ["B", "D", "F", "G", "H", "I", "J"],
  },
};

export interface InvoiceLineCommon {
  description: string;
  notes?: string;
  consultant?: string;
  hsnSac?: string;
  qty: number;
  perAmount: number;
  lineDiscountFraction?: number;
  gstRate?: number;
  lineAmount?: number;
}

export interface RenderInvoiceArgs {
  flavor: InvoiceFlavor;
  centreName: string;
  centreAddress?: string;
  centrePhone?: string | null;
  centreGstNumber?: string | null;
  centrePanNumber?: string | null;
  clientName: string;
  clientAddress?: string;
  clientGstNumber?: string | null;
  invoiceNumber: string;
  invoiceDate: Date;
  validTill?: Date;
  referredBy?: string;
  lineItems: InvoiceLineCommon[];
  additionalDiscountPercent?: number;
  totalGst: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalAmount: number;
  amountInWords: string;
  paidBy?: string;
  txnId?: string;
}

export async function renderInvoice(args: RenderInvoiceArgs): Promise<Buffer> {
  if (args.lineItems.length > INVOICE_TEMPLATE_LINE_LIMIT) {
    throw new Error(
      `Invoice has ${args.lineItems.length} line items; template only supports ${INVOICE_TEMPLATE_LINE_LIMIT}.`,
    );
  }

  const filename = INVOICE_TEMPLATES[args.flavor];
  const fullPath = path.join(TEMPLATES_ROOT, filename);
  const buf = await fs.readFile(fullPath);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Invoice template has no worksheets");

  const map = FLAVOR_MAPS[args.flavor];
  writeHeader(sheet, map, args);
  writeLineItems(sheet, map, args);
  writeTotals(sheet, map, args);

  const out = await wb.xlsx.writeBuffer();
  return restoreTableParts(Buffer.from(out), buf);
}

/**
 * Repairs ExcelJS's table round-trip, which otherwise makes Excel show
 * "We found a problem with some content in this file" on every download.
 *
 * Each invoice template keeps a lookup table (ServiceTable / ProductTable) on
 * the MasterData sheet, with its header row at row 2. ExcelJS re-serializes
 * that definition wrong: it writes headerRowCount="0" and totalsRowShown="1"
 * while keeping the original ref (which spans the header row) *and* an
 * <autoFilter>, which is invalid on a table with no header row. Excel sees the
 * contradiction and offers to repair.
 *
 * We only ever write to worksheets[0] (InvoiceGenerator) and never touch
 * MasterData or the table, so copying the template's table parts back in
 * verbatim restores exactly what Excel expects.
 *
 * (Note: `xl/calcChain.xml` is *not* involved — ExcelJS drops it on write and
 * removes it from [Content_Types].xml, so there's no stale formula index.)
 */
function restoreTableParts(rendered: Buffer, template: Buffer): Buffer {
  const source = new PizZip(template);
  const tableParts = Object.keys(source.files).filter((name) =>
    /^xl\/tables\/.*\.xml$/.test(name),
  );
  if (tableParts.length === 0) return rendered;

  const out = new PizZip(rendered);
  for (const name of tableParts) {
    out.file(name, source.file(name)!.asNodeBuffer());
  }
  return out.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

function writeHeader(
  sheet: ExcelJS.Worksheet,
  map: FlavorMap,
  args: RenderInvoiceArgs,
): void {
  setCell(sheet, "B16", args.centreName);
  const centreLines = splitAddress(args.centreAddress);
  setCell(sheet, "B17", centreLines[0] ?? "");
  setCell(sheet, "B18", centreLines[1] ?? "");
  setCell(sheet, "B19", centreLines[2] ?? "");
  setCell(sheet, "B20", centreLines[3] ?? "");
  setCell(
    sheet,
    "B21",
    args.centrePhone ? `Contact No. : ${args.centrePhone}` : "",
  );
  if (args.centrePanNumber) setCell(sheet, "J20", args.centrePanNumber);
  if (args.centreGstNumber) setCell(sheet, "J21", args.centreGstNumber);

  setCell(sheet, map.clientNameCell, args.clientName);
  setCell(sheet, map.clientAddressCell, args.clientAddress ?? "");
  setCell(
    sheet,
    map.clientGstCell,
    args.clientGstNumber ? `Client GST: ${args.clientGstNumber}` : "",
  );

  setCell(sheet, map.invoiceNumberCell, args.invoiceNumber);
  clearCells(sheet, map.invoiceNumberClearCells);
  setCell(sheet, map.invoiceDateCell, formatDate(args.invoiceDate));
  clearCells(sheet, map.invoiceDateClearCells);
  if (map.validTillCell) {
    setCell(sheet, map.validTillCell, args.validTill ? formatDate(args.validTill) : "");
    clearCells(sheet, map.validTillClearCells ?? []);
  }
  setCell(sheet, map.referredByCell, args.referredBy ?? "");

  setCell(sheet, map.taxLabelCell, "GST split");
  setCell(sheet, map.taxValueCell, formatTaxSplit(args));
}

function writeLineItems(
  sheet: ExcelJS.Worksheet,
  map: FlavorMap,
  args: RenderInvoiceArgs,
): void {
  for (let i = 0; i < args.lineItems.length; i++) {
    const row = LINE_ITEM_FIRST_ROW + i;
    const item = args.lineItems[i]!;
    const cols = map.lineColumns;
    setCell(sheet, `${cols.description}${row}`, item.description);
    if (cols.notes) setCell(sheet, `${cols.notes}${row}`, item.notes ?? "");
    if (cols.consultant) setCell(sheet, `${cols.consultant}${row}`, item.consultant ?? "");
    if (cols.hsnSac) setCell(sheet, `${cols.hsnSac}${row}`, item.hsnSac ?? "");
    setCell(sheet, `${cols.qty}${row}`, item.qty);
    setCell(sheet, `${cols.discount}${row}`, item.lineDiscountFraction ?? 0);
    setCell(sheet, `${cols.perAmount}${row}`, item.perAmount);
    if (cols.gstRate) setCell(sheet, `${cols.gstRate}${row}`, item.gstRate ?? 0);
    setCell(sheet, `${cols.amount}${row}`, item.lineAmount ?? lineAmount(item));
  }

  for (let i = args.lineItems.length; i < INVOICE_TEMPLATE_LINE_LIMIT; i++) {
    const row = LINE_ITEM_FIRST_ROW + i;
    for (const col of map.clearColumns) {
      sheet.getCell(`${col}${row}`).value = "";
    }
  }
}

function writeTotals(
  sheet: ExcelJS.Worksheet,
  map: FlavorMap,
  args: RenderInvoiceArgs,
): void {
  if (map.additionalDiscountPercentCell) {
    setCell(
      sheet,
      map.additionalDiscountPercentCell,
      args.additionalDiscountPercent ? args.additionalDiscountPercent / 100 : 0,
    );
  }
  if (map.preTaxTotalCell) setCell(sheet, map.preTaxTotalCell, round2(args.totalAmount - args.totalGst));
  if (map.totalGstCell) setCell(sheet, map.totalGstCell, args.totalGst);
  setCell(sheet, map.totalAmountCell, args.totalAmount);
  setCell(sheet, map.amountWordsCell, args.amountInWords);
  if (map.paidByCell) setCell(sheet, map.paidByCell, args.paidBy ?? "");
  if (map.txnIdCell) {
    const labelPrefix = map.txnIdCell === "B60" ? "TXN ID     : " : "";
    setCell(sheet, map.txnIdCell, args.txnId ? `${labelPrefix}${args.txnId}` : "");
  }
}

function setCell(sheet: ExcelJS.Worksheet, address: string, value: CellValue): void {
  sheet.getCell(address).value = value;
}

function clearCells(sheet: ExcelJS.Worksheet, cells: string[]): void {
  for (const cell of cells) setCell(sheet, cell, "");
}

function splitAddress(address: string | undefined): string[] {
  if (!address) return [];
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 4) return parts;
  return [
    parts.slice(0, 2).join(", "),
    parts.slice(2, 4).join(", "),
    parts.slice(4, 6).join(", "),
    parts.slice(6).join(", "),
  ];
}

function formatDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: CLINIC_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

function lineAmount(item: InvoiceLineCommon): number {
  return round2(item.qty * item.perAmount * (1 - (item.lineDiscountFraction ?? 0)));
}

function formatTaxSplit(args: RenderInvoiceArgs): string {
  const parts: string[] = [];
  if ((args.cgstAmount ?? 0) > 0) parts.push(`CGST INR ${round2(args.cgstAmount!).toFixed(2)}`);
  if ((args.sgstAmount ?? 0) > 0) parts.push(`SGST INR ${round2(args.sgstAmount!).toFixed(2)}`);
  if ((args.igstAmount ?? 0) > 0) parts.push(`IGST INR ${round2(args.igstAmount!).toFixed(2)}`);
  if (parts.length === 0 && args.totalGst > 0) parts.push(`GST INR ${round2(args.totalGst).toFixed(2)}`);
  return parts.join(" | ");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

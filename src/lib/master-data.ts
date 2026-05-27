// Parser for the MBD Master Data XLSX. Both the seed (`prisma/seed.ts`) and
// the bulk-import endpoint (`/api/admin/services/import`) hand a workbook
// buffer in and get the same shape out.

import ExcelJS from "exceljs";

export interface ParsedService {
  department: string;
  consultantName: string;
  name: string;
  hsnSac: string;
  basePrice: number;
  gstRate: number;
}

export interface ParsedProduct {
  name: string;
  hsnSac: string;
}

/**
 * Parse a `MBD Master Data.xlsx`-shaped Buffer into typed services + products.
 * Handles the two header conventions the client uses (department + consultant
 * appear sparsely on grouping rows; lower rows reuse the most recent value).
 * Stops at the "DROPDOWN OPTION LIST" sentinel rows.
 */
export async function parseMasterDataBuffer(buf: Buffer): Promise<{
  services: ParsedService[];
  products: ParsedProduct[];
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(new Uint8Array(buf).buffer as ArrayBuffer);

  const services: ParsedService[] = [];
  const seenServices = new Set<string>();
  const products: ParsedProduct[] = [];
  const seenProducts = new Set<string>();

  const servicesSheet = wb.getWorksheet("ServicesMasterData");
  if (servicesSheet) {
    let currentDepartment = "";
    let currentConsultant = "";
    for (let r = 4; r <= servicesSheet.rowCount; r++) {
      const row = servicesSheet.getRow(r);
      const dept = stringValue(row.getCell(1));
      const consultant = stringValue(row.getCell(2));
      const name = stringValue(row.getCell(3))?.trim();
      const hsn = stringValue(row.getCell(4));
      const cost = numberValue(row.getCell(5));
      const gst = numberValue(row.getCell(6));

      if (dept === "DROPDOWN OPTION LIST" || name === "DROPDOWN OPTION LIST") break;

      if (dept) currentDepartment = dept;
      if (consultant) currentConsultant = consultant;
      if (!name) continue;

      const key = `${currentDepartment}::${name}`;
      if (seenServices.has(key)) continue;
      seenServices.add(key);

      services.push({
        department: currentDepartment,
        consultantName: currentConsultant,
        name,
        hsnSac: hsn ?? "",
        basePrice: cost ?? 0,
        gstRate: gst ?? 0,
      });
    }
  }

  const productsSheet = wb.getWorksheet("ProductMasterData");
  if (productsSheet) {
    for (let r = 3; r <= productsSheet.rowCount; r++) {
      const row = productsSheet.getRow(r);
      const a = stringValue(row.getCell(1));
      if (!a || a === "Product") break;
      const hsn = stringValue(row.getCell(2)) ?? "";
      const name = a.trim();
      if (seenProducts.has(name)) continue;
      seenProducts.add(name);
      products.push({ name, hsnSac: hsn });
    }
  }

  return { services, products };
}

function stringValue(cell: ExcelJS.Cell): string | null {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "result" in (v as { result?: unknown })) {
    const r = (v as { result: unknown }).result;
    return r != null ? String(r) : null;
  }
  return String(v);
}

function numberValue(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && "result" in (v as { result?: unknown })) {
    const r = (v as { result: unknown }).result;
    if (typeof r === "number") return r;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map the "Service Type" classification to PRD §6 type codes used in MIS rows.
 * Default is "CLINIC". Heuristic — keeps the registry simple.
 */
export function inferServiceType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("gym") || lower.includes("personal coaching")) return "GYM";
  if (lower.includes("online")) return "ONLINE";
  if (lower.includes("home")) return "HOME_VISIT";
  return "CLINIC";
}

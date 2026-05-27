import { prisma } from "./prisma";

const DEFAULT_SLUG = "MBD";

async function resolveSlug(centreId?: string | null): Promise<string> {
  if (!centreId) return DEFAULT_SLUG;
  const centre = await prisma.centre.findUnique({ where: { id: centreId }, select: { slug: true } });
  return centre?.slug || DEFAULT_SLUG;
}

/**
 * Generate a unique client code per clinic. e.g. MBD-0001, MBDCOLABA-0001.
 *
 * @param centreId - the centre the client belongs to; slug is looked up and used as prefix
 */
export async function generateClientCode(centreId?: string | null): Promise<string> {
  const prefix = await resolveSlug(centreId);
  const lastClient = await prisma.client.findFirst({
    where: { clientCode: { startsWith: `${prefix}-` } },
    orderBy: { clientCode: "desc" },
    select: { clientCode: true },
  });

  let nextNum = 1;
  if (lastClient?.clientCode) {
    const match = lastClient.clientCode.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  return `${prefix}-${String(nextNum).padStart(4, "0")}`;
}

/**
 * Generate invoice number per clinic. e.g. MBD/001/2026, MBDCOLABA/001/2026.
 * NOTE: client has indicated the format may also include a month segment. Update here
 * when confirmed.
 */
export async function generateInvoiceNumber(centreId?: string | null): Promise<string> {
  const prefix = await resolveSlug(centreId);
  const year = new Date().getFullYear();
  const lastInvoice = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: `${prefix}/` } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  let nextSeq = 1;
  if (lastInvoice?.invoiceNumber) {
    const parts = lastInvoice.invoiceNumber.split("/");
    if (parts.length === 3) {
      nextSeq = parseInt(parts[1], 10) + 1;
    }
  }

  return `${prefix}/${String(nextSeq).padStart(3, "0")}/${year}`;
}

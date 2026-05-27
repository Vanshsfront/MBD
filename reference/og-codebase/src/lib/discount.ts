// MBD Clinic OS — Discount + promo stacking (PRD §6.3).
//
// Order: line discount FIRST, promo SECOND. GST is computed per line on the
// post-discount, post-promo, pre-tax amount.

export type DiscountType = "PERCENT" | "FLAT";

export interface InvoiceLine {
  qty: number;
  perAmount: number;
  /** Per-line discount fraction (0–1) — already applied at line level. */
  lineDiscountFraction: number;
  /** Per-line GST rate (fraction, e.g. 0.18). */
  gstRate: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  promotionDiscount: number;
  amountBeforeTax: number;
  totalGst: number;
  totalAmount: number;
}

export interface ComputeArgs {
  lines: InvoiceLine[];
  /** Manual additional discount (across the whole invoice). */
  additionalDiscount?: { type: DiscountType; value: number };
  /** Promo code applied AFTER manual discount. */
  promotion?: { type: DiscountType; value: number; maxAmount?: number | null };
}

function applyAdditional(
  preDiscount: number,
  additional?: { type: DiscountType; value: number },
): { afterDiscount: number; discount: number } {
  if (!additional || additional.value <= 0) {
    return { afterDiscount: preDiscount, discount: 0 };
  }
  if (additional.type === "PERCENT") {
    const discount = preDiscount * (additional.value / 100);
    return { afterDiscount: preDiscount - discount, discount };
  }
  return {
    afterDiscount: Math.max(0, preDiscount - additional.value),
    discount: Math.min(additional.value, preDiscount),
  };
}

function applyPromo(
  postDiscount: number,
  promo?: { type: DiscountType; value: number; maxAmount?: number | null },
): { afterPromo: number; promoDiscount: number } {
  if (!promo || promo.value <= 0) {
    return { afterPromo: postDiscount, promoDiscount: 0 };
  }
  let raw =
    promo.type === "PERCENT"
      ? postDiscount * (promo.value / 100)
      : promo.value;
  if (promo.maxAmount != null && promo.maxAmount > 0) {
    raw = Math.min(raw, promo.maxAmount);
  }
  raw = Math.min(raw, postDiscount);
  return { afterPromo: postDiscount - raw, promoDiscount: raw };
}

export function computeInvoiceTotals({
  lines,
  additionalDiscount,
  promotion,
}: ComputeArgs): InvoiceTotals {
  // Subtotal applies the per-line discount fraction.
  let subtotal = 0;
  for (const line of lines) {
    const grossLine = line.qty * line.perAmount;
    const netLine = grossLine * (1 - line.lineDiscountFraction);
    subtotal += netLine;
  }

  // Manual additional discount
  const { afterDiscount, discount } = applyAdditional(subtotal, additionalDiscount);

  // Promo
  const { afterPromo, promoDiscount } = applyPromo(afterDiscount, promotion);

  // GST per line, scaled by overall (post-discount, post-promo) ratio.
  const ratio = subtotal > 0 ? afterPromo / subtotal : 0;
  let totalGst = 0;
  for (const line of lines) {
    const grossLine = line.qty * line.perAmount;
    const netLine = grossLine * (1 - line.lineDiscountFraction);
    const lineAfterAll = netLine * ratio;
    totalGst += lineAfterAll * line.gstRate;
  }

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discount),
    promotionDiscount: round2(promoDiscount),
    amountBeforeTax: round2(afterPromo),
    totalGst: round2(totalGst),
    totalAmount: round2(afterPromo + totalGst),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

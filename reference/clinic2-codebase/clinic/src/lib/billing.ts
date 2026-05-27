/**
 * Calculate billing amounts with GST
 */
export interface LineItem {
  service: string;
  consultant: string;
  hsnSac?: string;
  sessions: number;
  discountPercent: number;
  discountAmount?: number;
  discountType?: "PERCENT" | "FLAT";
  perSessionAmount: number;
  gstRate: number;
}

export interface BillingResult {
  lineItems: Array<LineItem & { subtotal: number; gstAmount: number; total: number }>;
  subtotal: number;
  totalDiscount: number;
  totalGst: number;
  totalAmount: number;
}

export function calculateBilling(items: LineItem[]): BillingResult {
  const calculatedItems = items.map((item) => {
    const grossAmount = item.sessions * item.perSessionAmount;

    let discountValue = 0;
    if (item.discountType === "FLAT" && item.discountAmount) {
      discountValue = item.discountAmount;
    } else {
      discountValue = grossAmount * (item.discountPercent / 100);
    }

    const subtotal = grossAmount - discountValue;
    const gstAmount = subtotal * item.gstRate;
    const total = subtotal + gstAmount;

    return {
      ...item,
      subtotal,
      gstAmount,
      total,
    };
  });

  const subtotal = calculatedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const totalDiscount = items.reduce((sum, item) => {
    const gross = item.sessions * item.perSessionAmount;
    if (item.discountType === "FLAT" && item.discountAmount) {
      return sum + item.discountAmount;
    }
    return sum + gross * (item.discountPercent / 100);
  }, 0);
  const totalGst = calculatedItems.reduce((sum, item) => sum + item.gstAmount, 0);
  const totalAmount = calculatedItems.reduce((sum, item) => sum + item.total, 0);

  return {
    lineItems: calculatedItems,
    subtotal,
    totalDiscount,
    totalGst,
    totalAmount,
  };
}

/**
 * Calculate GST components (CGST + SGST or IGST)
 */
export function calculateGstBreakdown(totalGst: number, isInterState: boolean = false) {
  if (isInterState) {
    return { igst: totalGst, cgst: 0, sgst: 0 };
  }
  return { igst: 0, cgst: totalGst / 2, sgst: totalGst / 2 };
}

/**
 * Apply a promotion on top of an already-discounted amount.
 * Promo is second-priority: it's applied AFTER the manual invoice discount.
 * Returns the promo discount in rupees (not the new total).
 *
 * Example: 100 invoice, 10% manual → 90, 5% promo → 4.50 promo discount → 85.50 final.
 */
export interface PromotionInput {
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  maxDiscount?: number | null;
}

export function calculatePromoDiscount(discountedSubtotal: number, promo: PromotionInput): number {
  if (!promo || discountedSubtotal <= 0) return 0;
  let discount = 0;
  if (promo.discountType === "PERCENT") {
    discount = discountedSubtotal * (promo.discountValue / 100);
    if (promo.maxDiscount != null && discount > promo.maxDiscount) {
      discount = promo.maxDiscount;
    }
  } else {
    discount = Math.min(promo.discountValue, discountedSubtotal);
  }
  return Math.round(discount * 100) / 100;
}

/**
 * Discount tiers available in the system
 */
export const DISCOUNT_TIERS = [0, 5, 10, 15, 20, 25, 30];

/**
 * Discount types
 */
export type DiscountType = "PERCENT" | "FLAT";

/**
 * Payment methods available
 */
export const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "CHEQUE",
  "NEFT",
  "UPI",
  "RAZORPAY",
  "OTHER",
] as const;

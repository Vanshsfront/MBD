import { normalizeState } from "@/lib/address";

export interface TaxSplit {
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
}

export function splitGstAmount(args: {
  gstAmount: number;
  clientState: string | null | undefined;
  centreState: string | null | undefined;
}): TaxSplit {
  const total = round2(args.gstAmount);
  const client = normalizeState(args.clientState);
  const centre = normalizeState(args.centreState);
  if (!client || !centre) {
    throw new Error("client_and_centre_state_required");
  }
  if (client === centre) {
    const half = round2(total / 2);
    return {
      cgstAmount: half,
      sgstAmount: round2(total - half),
      igstAmount: 0,
    };
  }
  return {
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: total,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

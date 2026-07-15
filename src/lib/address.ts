export interface AddressJson {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

export function parseAddress(json: string | null | undefined): AddressJson | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as AddressJson;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function formatAddress(address: AddressJson | null | undefined): string {
  if (!address) return "";
  return [address.line1, address.line2, address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(", ");
}

export function normalizeState(state: string | null | undefined): string | null {
  const value = state?.trim().toLowerCase();
  if (!value) return null;
  if (value === "mh" || value === "maharastra") return "maharashtra";
  return value.replace(/\s+/g, " ");
}

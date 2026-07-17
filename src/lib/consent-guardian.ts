// Guardian block for the consent DOCX (change spec 08 G).
//
// The guardian's name and relationship have been captured and stored since the
// minor-consent work landed, but never reached the printed document — so a
// minor's consent form came out with no trace of who consented on their
// behalf. These helpers feed the template's {{guardian.*}} tags and are shared
// by the render and preview routes so the two can't drift.

export interface GuardianSource {
  guardianConsent?: boolean | null;
  guardianName?: string | null;
  guardianRelationship?: string | null;
  guardianSignatureDataUrl?: string | null;
}

export interface GuardianBlock {
  /**
   * Drives the template's `{{#guardian.show}}` section. False removes those
   * paragraphs outright rather than rendering them empty — blank paragraphs
   * still take up space and would push an extra, near-empty page onto every
   * adult's consent form.
   */
  show: boolean;
  name: string;
  relationship: string;
  /** "Guardian: NAME (RELATIONSHIP)". */
  nameLine: string;
  /** Prose line for the consent paragraph. */
  acknowledgement: string;
}

const EMPTY: GuardianBlock = {
  show: false,
  name: "",
  relationship: "",
  nameLine: "",
  acknowledgement: "",
};

/**
 * Builds the printable guardian fields. Returns empty strings (not null) so
 * docxtemplater renders nothing rather than "undefined" for an adult patient —
 * every field here is blank unless a guardian is genuinely on the record.
 */
export function guardianBlock(intake: GuardianSource | null | undefined): GuardianBlock {
  const name = intake?.guardianName?.trim() ?? "";
  const relationship = intake?.guardianRelationship?.trim() ?? "";
  if (!intake?.guardianConsent || !name) return EMPTY;
  return {
    show: true,
    name,
    relationship,
    nameLine: `Guardian: ${name}${relationship ? ` (${relationship})` : ""}`,
    acknowledgement: `Patient is a minor. Consent given on their behalf by ${name}${
      relationship ? `, ${relationship}` : ""
    }.`,
  };
}

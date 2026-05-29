// Past records repository — shown above the consultation form on the
// clinical page so therapists can review the patient's history without
// leaving the screen. Includes the signed consent + every prior COMPLETED
// or LOCKED consultation across all template families. Each entry has
// a one-click PDF download.
//
// Server component — rendered by the clinical/page.tsx server entry.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ConsultationAttachments } from "./consultation-attachments";

interface PastConsultation {
  id: string;
  templateKey: string;
  date: Date;
  status: string;
  consultant: { name: string } | null;
  // Whether the current viewer is permitted to upload a new version. Pre-
  // computed in the server entry (page.tsx) so the client component doesn't
  // have to re-evaluate role + ownership.
  canUpload: boolean;
}

interface Props {
  clientId: string;
  consentSigned: boolean;
  consultations: PastConsultation[];
}

// Pretty-print the template key for the row. Falls back to the raw key when
// no friendly label is known — better to show "yoga-followup" than to drop
// the row silently.
const TEMPLATE_LABELS: Record<string, string> = {
  physician: "Physician consultation",
  "physician-followup": "Physician follow-up",
  physiotherapy: "Physiotherapy consultation",
  "physiotherapy-followup": "Physiotherapy follow-up",
  "yoga-intake": "Wellness yoga intake",
  "yoga-followup": "Yoga follow-up",
  "counselling-intake": "Counselling intake",
  "counselling-followup": "Counselling follow-up",
  "nutrition-followup": "Nutrition follow-up",
  "sc-followup": "S&C follow-up",
  fab: "Functional assessment battery",
};

export function PastRecordsList({ clientId, consentSigned, consultations }: Props) {
  const empty = !consentSigned && consultations.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Past records
          <Badge variant="default" className="text-[10px]">
            {consultations.length + (consentSigned ? 1 : 0)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {empty ? (
          <div className="p-6">
            <EmptyState
              title="No past records yet"
              description="Once consent is captured or a consultation is locked, downloads appear here."
            />
          </div>
        ) : (
          <ul className="divide-y">
            {consentSigned ? (
              <li className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div>
                  <p className="text-sm font-medium">Signed consent form</p>
                  <p className="text-xs text-muted-foreground">
                    Common patient intake — signed by patient and FO
                  </p>
                </div>
                <a
                  href={`/api/clients/${clientId}/consent-render`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  Download DOCX
                </a>
              </li>
            ) : null}
            {consultations.map((c) => (
              <li key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {TEMPLATE_LABELS[c.templateKey] ?? c.templateKey}
                      {c.status === "LOCKED" ? (
                        <Badge variant="warning" className="ml-2 text-[10px]">
                          locked
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {c.consultant ? ` · ${c.consultant.name}` : ""}
                    </p>
                  </div>
                  <a
                    href={`/api/consultations/${c.id}/render`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    System-rendered DOCX
                  </a>
                </div>
                <ConsultationAttachments
                  consultationId={c.id}
                  canUpload={c.canUpload}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

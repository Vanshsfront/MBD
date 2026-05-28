import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SharePortalButton } from "./share-portal-button";
import { EditDemographicsDialog } from "./edit-demographics-dialog";

export default async function PatientOverview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user.role, "patients:view_assigned")) redirect("/dashboard");

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      doctorAssignments: {
        where: { endedAt: null },
        include: { staff: { select: { name: true, designation: true } } },
      },
      referralSource: { select: { name: true } },
      consultations: {
        orderBy: { date: "desc" },
        take: 5,
        include: { consultant: { select: { name: true } } },
      },
      appointments: {
        orderBy: { startTime: "desc" },
        take: 5,
        include: {
          therapist: { select: { name: true } },
          service: { select: { name: true } },
        },
      },
      invoices: { orderBy: { createdAt: "desc" }, take: 5 },
      packages: { orderBy: { createdAt: "desc" }, take: 5 },
      intakeForms: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, consentSigned: true, consentMethod: true },
      },
    },
  });
  if (!client) notFound();

  const address = parseJson<{ line1?: string; city?: string; pincode?: string }>(client.address);
  const emergency = parseJson<{ name?: string; phone?: string; relationship?: string }>(
    client.emergencyContact,
  );

  // FO-side staff (anyone who can edit demographics) can share a portal link
  // and edit the patient's demographic fields.
  const canEditDemographics = hasPermission(session.user.role, "patients:edit_demographics");
  const canSharePortal = canEditDemographics;

  const intake = client.intakeForms[0] ?? null;
  const hasIntake = Boolean(intake);
  const hasConsent = Boolean(intake?.consentSigned) && Boolean(client.consentFormPhotoUrl);
  const hasAssignment = client.doctorAssignments.length > 0;
  const profileSteps: ReadonlyArray<{ label: string; done: boolean; hint?: string }> = [
    {
      label: "Intake form on file",
      done: hasIntake,
      hint: hasIntake ? undefined : "Capture intake from the Assignment queue.",
    },
    {
      label: "Therapist assigned",
      done: hasAssignment,
      hint: hasAssignment ? undefined : "Assign from the Assignment queue.",
    },
    {
      label: "Consent signed",
      done: hasConsent,
      hint: hasConsent
        ? undefined
        : hasIntake
          ? "Capture consent from the Assignment queue."
          : "Intake form first, then consent.",
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Profile completeness</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {profileSteps.map((s) => (
              <li key={s.label} className="flex items-baseline gap-2">
                <span
                  className={
                    s.done
                      ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                      : "inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700"
                  }
                  aria-hidden
                >
                  {s.done ? "✓" : "·"}
                </span>
                <span className={s.done ? "" : "text-muted-foreground"}>
                  {s.label}
                  {s.hint ? (
                    <span className="ml-1 text-xs text-muted-foreground">— {s.hint}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>Patient details</CardTitle>
          {canEditDemographics ? (
            <EditDemographicsDialog
              client={{
                id: client.id,
                firstName: client.firstName,
                lastName: client.lastName,
                phone: client.phone,
                email: client.email ?? null,
                dob: client.dob ? client.dob.toISOString() : null,
                age: client.age ?? null,
                sex: client.sex ?? null,
                occupation: client.occupation ?? null,
                sport: client.sport ?? null,
                maritalStatus: client.maritalStatus ?? null,
                address: address ?? null,
                emergencyContact: emergency ?? null,
              }}
            />
          ) : null}
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <KV k="Phone" v={client.phone} />
          <KV k="Email" v={client.email} />
          <KV k="Age / Sex" v={[client.age, client.sex].filter(Boolean).join(" ")} />
          <KV k="DOB" v={client.dob ? formatDate(client.dob) : null} />
          <KV k="Occupation" v={client.occupation} />
          <KV k="Sport" v={client.sport} />
          <KV k="Address" v={[address?.line1, address?.city, address?.pincode].filter(Boolean).join(", ")} />
          <KV k="Emergency" v={emergency?.name ? `${emergency.name} (${emergency.relationship ?? "—"}) · ${emergency.phone ?? ""}` : null} />
          <KV k="Customer type" v={client.customerType} />
          <KV k="Referral" v={client.referralSource?.name ?? client.referredByName} />
          <KV k="Registered" v={formatDate(client.createdAt)} />
          {canSharePortal ? (
            <div className="pt-2">
              <SharePortalButton clientId={client.id} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Currently assigned</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {client.doctorAssignments.length === 0 ? (
            <p className="text-muted-foreground">No active assignments.</p>
          ) : (
            client.doctorAssignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between">
                <span>
                  {a.staff?.name}
                  {a.staff?.designation ? (
                    <span className="text-muted-foreground"> · {a.staff.designation}</span>
                  ) : null}
                </span>
                {a.isPrimary ? <Badge variant="info">primary</Badge> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent consultations</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {client.consultations.length === 0 ? (
            <p className="text-muted-foreground">No consultations yet.</p>
          ) : (
            <ul className="divide-y">
              {client.consultations.map((c) => (
                <li key={c.id} className="flex justify-between py-2">
                  <span>
                    {c.templateKey}{" "}
                    {c.consultant ? (
                      <span className="text-muted-foreground">· {c.consultant.name}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(c.date)} · {c.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent appointments</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {client.appointments.length === 0 ? (
            <p className="text-muted-foreground">No appointments yet.</p>
          ) : (
            <ul className="divide-y">
              {client.appointments.map((a) => (
                <li key={a.id} className="flex justify-between py-2">
                  <span>
                    {a.service.name}
                    <span className="text-muted-foreground"> · {a.therapist.name}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(a.startTime)} · {a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {hasPermission(session.user.role, "billing:view_packages") ? (
        <Card>
          <CardHeader>
            <CardTitle>Packages</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {client.packages.length === 0 ? (
              <EmptyState
                title="No packages"
                description="Create one from a consultation's recommendations."
                className="border-none p-6"
              />
            ) : (
              <ul className="divide-y">
                {client.packages.map((p) => (
                  <li key={p.id} className="flex justify-between py-2">
                    <span>
                      {p.completedSessions}/{p.totalSessions} sessions · ₹{p.totalPrice.toFixed(0)}
                    </span>
                    <Badge variant="info">{p.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {hasPermission(session.user.role, "billing:view_invoices") ? (
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {client.invoices.length === 0 ? (
              <EmptyState
                title="No invoices"
                description="Invoices linked to this patient will appear here."
                className="border-none p-6"
              />
            ) : (
              <ul className="divide-y">
                {client.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between py-2">
                    <span className="font-mono text-xs">{inv.invoiceNumber}</span>
                    <span className="flex items-center gap-3">
                      <span>₹{inv.totalAmount.toFixed(0)}</span>
                      <Badge variant={inv.status === "PAID" ? "success" : inv.status === "OVERDUE" ? "danger" : "info"}>
                        {inv.status}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string | number | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{k}</span>
      <span className="text-right">{v != null && v !== "" ? String(v) : <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

function parseJson<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

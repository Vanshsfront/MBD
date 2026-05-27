// FO daily overview — Journey D entry point (PRD §4 D1).
// Pending intakes + today's appointments + unpaid invoices + low-stock +
// change requests pending review.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatINR } from "@/lib/utils";

export async function FrontOfficeDashboard({
  userName,
  centreId,
}: {
  userName: string;
  centreId: string | null;
}) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  // Lazy-expire pending intake tokens past their TTL.
  await prisma.intakeToken.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });

  const [
    pendingIntakeTokens,
    pendingDraftClients,
    todaysAppointments,
    unpaidInvoices,
    lowStock,
    pendingChangeRequests,
  ] = await Promise.all([
    prisma.intakeToken.count({
      where: { status: "PENDING", ...(centreId ? { centreId } : {}) },
    }),
    prisma.client.count({
      where: { status: "DRAFT", ...(centreId ? { centreId } : {}) },
    }),
    prisma.appointment.findMany({
      where: {
        startTime: { gte: startOfDay, lt: endOfDay },
        ...(centreId ? { centreId } : {}),
      },
      orderBy: { startTime: "asc" },
      take: 30,
      include: {
        client: { select: { firstName: true, lastName: true } },
        therapist: { select: { name: true } },
        service: { select: { name: true } },
      },
    }),
    prisma.invoice.findMany({
      where: {
        status: { in: ["SENT", "PARTIAL", "OVERDUE"] },
        ...(centreId ? { centreId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        client: { select: { firstName: true, lastName: true, clientCode: true } },
      },
    }),
    prisma.inventoryItem.findMany({
      where: {
        ...(centreId ? { centreId } : {}),
        stock: { lte: 5 }, // also covered by stock <= minStock check below
      },
      orderBy: { stock: "asc" },
      take: 8,
      include: { product: { select: { name: true } } },
    }),
    prisma.changeRequest.count({ where: { status: "PENDING" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, {firstName(userName)}</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <Badge variant="outline">FRONT_OFFICE</Badge>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatLink href="/dashboard/intake" label="Pending intake tokens" value={pendingIntakeTokens} />
        <StatLink href="/dashboard/assign" label="Awaiting assignment" value={pendingDraftClients} />
        <StatLink href="/dashboard/billing/invoices" label="Unpaid invoices" value={unpaidInvoices.length} />
        <StatLink href="/dashboard/admin/change-requests" label="Change requests" value={pendingChangeRequests} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s schedule</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {todaysAppointments.length === 0 ? (
              <EmptyState title="No appointments booked for today" />
            ) : (
              <ul className="divide-y">
                {todaysAppointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {a.client.firstName} {a.client.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.service.name} · {a.therapist.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono tabular-nums">
                        {a.startTime.toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <Badge variant={a.status === "CONFIRMED" ? "info" : "default"}>{a.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unpaid invoices</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {unpaidInvoices.length === 0 ? (
              <EmptyState title="All invoices paid" />
            ) : (
              <ul className="divide-y">
                {unpaidInvoices.map((inv) => (
                  <li key={inv.id} className="px-6 py-3">
                    <Link
                      href={`/dashboard/billing/invoices/${inv.id}`}
                      className="flex items-center justify-between gap-3 text-sm transition-colors hover:opacity-80"
                    >
                      <div>
                        <p className="font-mono">{inv.invoiceNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {inv.client.firstName} {inv.client.lastName} ({inv.client.clientCode})
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{formatINR(inv.totalAmount - inv.paidAmount)}</span>
                        <Badge variant={inv.status === "OVERDUE" ? "danger" : "warning"}>
                          {inv.status}
                        </Badge>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Low stock</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {lowStock.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">All inventory above threshold.</p>
            ) : (
              <ul className="divide-y">
                {lowStock.map((item) => (
                  <li key={item.id} className="flex items-center justify-between px-6 py-3 text-sm">
                    <span>{item.product.name}</span>
                    <Badge variant={item.stock <= item.minStock ? "danger" : "warning"}>
                      {item.stock} left
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link href="/dashboard/intake" className="block rounded-md border px-4 py-3 hover:bg-accent">
              <p className="font-medium">Generate intake QR</p>
              <p className="text-xs text-muted-foreground">For walk-in patients</p>
            </Link>
            <Link href="/dashboard/calendar" className="block rounded-md border px-4 py-3 hover:bg-accent">
              <p className="font-medium">Open calendar</p>
              <p className="text-xs text-muted-foreground">Book / reschedule appointments</p>
            </Link>
            <Link
              href="/dashboard/billing/payments"
              className="block rounded-md border px-4 py-3 hover:bg-accent"
            >
              <p className="font-medium">Recent payments</p>
              <p className="text-xs text-muted-foreground">Activity feed</p>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatLink({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: number;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-accent">
        <CardContent className="pt-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function firstName(s: string): string {
  return s.split(" ")[0] ?? s;
}

import { prisma } from "@/lib/prisma";
import { IntakeFormView } from "./form";

export const metadata = { title: "MBD intake form" };

export default async function PublicIntakePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const row = await prisma.intakeToken.findUnique({
    where: { token },
    select: { status: true, expiresAt: true },
  });

  if (!row) {
    return <Notice title="Link not found">This intake link is invalid. Ask the front office for a new one.</Notice>;
  }
  if (row.expiresAt < new Date() || row.status === "EXPIRED") {
    return <Notice title="Link expired">Please ask the front office to issue a fresh QR code.</Notice>;
  }
  if (row.status === "COMPLETED") {
    return (
      <Notice title="Already submitted">
        Thanks — your form is in. The front office will guide you through the next step.
      </Notice>
    );
  }

  return <IntakeFormView token={token} />;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

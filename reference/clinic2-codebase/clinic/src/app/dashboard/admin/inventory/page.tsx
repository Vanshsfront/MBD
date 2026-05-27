"use client";

import { Boxes, Lock } from "lucide-react";
import { useSession } from "next-auth/react";
import { hasPermission } from "@/lib/permissions";

export default function InventoryPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role ?? "THERAPIST";

  if (!hasPermission(userRole, "admin:inventory")) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-text-tertiary">
        <Lock className="h-12 w-12 mb-4" />
        <p className="text-lg font-semibold">Access Restricted</p>
        <p className="text-sm">Inventory management is restricted to Admin, Owner, and Front Office.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Boxes className="h-6 w-6 text-blue-600" />
        <h2 className="text-xl font-bold text-text-primary">Inventory Management</h2>
      </div>
      <div className="bg-surface rounded-xl border border-border-light p-8 text-center">
        <Boxes className="h-16 w-16 text-text-tertiary mx-auto mb-4" />
        <p className="text-text-tertiary text-lg font-medium">Inventory Tracker</p>
        <p className="text-text-tertiary text-sm mt-2">
          Track clinic supplies, log usage, and monitor stock levels.
        </p>
        <p className="text-blue-600 text-sm mt-4 font-medium">Coming in Phase 4</p>
      </div>
    </div>
  );
}

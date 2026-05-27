"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import { mapApiError, readApiError } from "@/lib/error-messages";

interface ServiceRow {
  id: string;
  name: string;
  department: string;
  hsnSac: string | null;
  basePrice: number;
  gstRate: number;
  isActive: boolean;
  participantCount: number;
}

export function ServicesAdminView({
  services,
  canImport,
}: {
  services: ServiceRow[];
  canImport: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editGst, setEditGst] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [importPending, setImportPending] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so picking the same file re-fires
    if (!file) return;
    setImportPending(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/services/import", {
        method: "POST",
        body: fd,
      });
      const j = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            created?: number;
            updated?: number;
            skipped?: number;
            unknownDepartments?: string[];
          }
        | null;
      if (!res.ok || !j?.ok) {
        throw new Error(mapApiError(j, { fallback: "Couldn't import services." }));
      }
      const skippedNote =
        j.skipped && j.skipped > 0
          ? ` · ${j.skipped} skipped (${(j.unknownDepartments ?? []).join(", ")})`
          : "";
      toast.success(
        `Imported: ${j.created ?? 0} new, ${j.updated ?? 0} updated${skippedNote}`,
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportPending(false);
    }
  }

  function startEdit(s: ServiceRow) {
    setEditing(s.id);
    setEditPrice(String(s.basePrice));
    setEditGst(String(s.gstRate));
  }

  async function save(id: string) {
    setPending(id);
    try {
      const res = await fetch("/api/admin/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          basePrice: Number(editPrice),
          gstRate: Number(editGst),
        }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't save the service." }),
        );
      }
      toast.success("Saved");
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(null);
    }
  }

  async function toggle(s: ServiceRow) {
    try {
      const res = await fetch("/api/admin/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, isActive: !s.isActive }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, { fallback: "Couldn't toggle the service." }),
        );
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Toggle failed");
    }
  }

  const filtered = search
    ? services.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.department.toLowerCase().includes(search.toLowerCase()),
      )
    : services;

  // Group by department for readability.
  const grouped = new Map<string, ServiceRow[]>();
  for (const s of filtered) {
    const arr = grouped.get(s.department) ?? [];
    arr.push(s);
    grouped.set(s.department, arr);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Services &amp; rates</h1>
          <p className="text-sm text-muted-foreground">
            Edit price + GST in place. {services.length} services across{" "}
            {new Set(services.map((s) => s.department)).size} departments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          {canImport ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleImport}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={importPending}
              >
                {importPending ? "Importing…" : "Import XLSX"}
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {Array.from(grouped.entries()).map(([dept, rows]) => (
        <Card key={dept}>
          <CardHeader>
            <CardTitle>
              {dept} <span className="text-muted-foreground">({rows.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Service</th>
                    <th className="px-3 py-2 text-left">HSN/SAC</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">GST</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{s.name}</p>
                        {s.participantCount > 1 ? (
                          <p className="text-[11px] text-muted-foreground">
                            qty locked to {s.participantCount}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px]">{s.hsnSac ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {editing === s.id ? (
                          <Input
                            type="number"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="w-28 text-right"
                          />
                        ) : (
                          formatINR(s.basePrice)
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {editing === s.id ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={editGst}
                            onChange={(e) => setEditGst(e.target.value)}
                            className="w-20 text-right"
                          />
                        ) : (
                          `${(s.gstRate * 100).toFixed(0)}%`
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={s.isActive ? "success" : "default"}>
                          {s.isActive ? "active" : "inactive"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {editing === s.id ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => save(s.id)}
                                disabled={pending === s.id}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditing(null)}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => startEdit(s)}>
                                Edit
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => toggle(s)}>
                                {s.isActive ? "Disable" : "Enable"}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

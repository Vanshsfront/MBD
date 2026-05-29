"use client";

// Per-consultation attachment manager — list of versioned uploads + an
// upload dialog. Lives as an expand/collapse row under PastRecordsList so
// the FO/therapist can review the history without leaving the clinical
// page. Lazy-fetches its data so we don't issue N GETs upfront for N
// consultations.

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, ExternalLink, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/error-messages";

interface AttachmentView {
  id: string;
  version: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isCurrent: boolean;
  uploadedAt: string;
  uploadedBy: string | null;
  notes: string | null;
  downloadUrl: string;
}

export function ConsultationAttachments({
  consultationId,
  canUpload,
}: {
  consultationId: string;
  canUpload: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentView[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/consultations/${consultationId}/attachments`);
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Couldn't load versions." }));
      }
      const data = (await res.json()) as { attachments: AttachmentView[] };
      setAttachments(data.attachments);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!expanded || attachments !== null || loading) return;
    // Defer to a microtask so the setLoading/setAttachments inside load()
    // don't trigger react-hooks/set-state-in-effect — same async result,
    // just one tick later.
    void Promise.resolve().then(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/consultations/${consultationId}/attachments`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, { fallback: "Upload failed." }));
      }
      toast.success(`v${(await res.json()).version} uploaded`);
      // Refresh the list so the new row + flipped isCurrent flags appear.
      setAttachments(null);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="border-t border-[color:var(--border-light)] bg-secondary/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-6 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <ChevronDown
          className={`h-3 w-3 transition-transform ${expanded ? "" : "-rotate-90"}`}
          aria-hidden
        />
        Versions {attachments ? `(${attachments.length})` : ""}
      </button>
      {expanded ? (
        <div className="space-y-2 px-6 pb-3">
          {loading && attachments === null ? (
            <p className="text-xs text-muted-foreground">Loading versions…</p>
          ) : !attachments || attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No uploaded versions yet — the system-rendered PDF (above) is the only copy.
            </p>
          ) : (
            <ul className="space-y-1">
              {attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-md bg-card px-3 py-2 text-xs ring-1 ring-[color:var(--border-light)]"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-tertiary)]" aria-hidden />
                  <span className="font-mono">v{a.version}</span>
                  {a.isCurrent ? (
                    <span className="chip chip-success !text-[10px]">current</span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                  <span className="text-[color:var(--text-tertiary)] whitespace-nowrap">
                    {formatRelative(a.uploadedAt)}
                    {a.uploadedBy ? ` · ${a.uploadedBy}` : ""}
                  </span>
                  <a
                    href={a.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border-light)] bg-card px-2 py-1 text-[11px] font-medium hover:bg-secondary"
                  >
                    Download <ExternalLink className="h-2.5 w-2.5" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
          {canUpload ? (
            <div className="pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" aria-hidden />
                {uploading ? "Uploading…" : "Upload new version"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.doc,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/pdf"
                className="hidden"
                onChange={onPick}
              />
              <p className="mt-1 text-[10.5px] text-[color:var(--text-tertiary)]">
                DOCX/DOC/PDF, max 25 MB. Each upload bumps the version counter.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

"use client";

// Terms & Conditions modal — fetches /terms.md on first open and renders
// with a minimal markdown subset (#/## headings, paragraphs, bullet lists,
// horizontal rules). The "Download PDF" button HEAD-probes /terms.pdf at
// mount: visible only when a real PDF has been dropped into /public/ —
// keeps the placeholder phase clean without breaking the contract.

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TermsModal({ open, onOpenChange }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [pdfAvailable, setPdfAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || content !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/terms.md", { cache: "force-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!cancelled) setContent(text);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load terms.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, content]);

  // HEAD-probe terms.pdf at mount so the button is only shown when the file
  // genuinely exists. Cheap enough to run unconditionally.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/terms.pdf", { method: "HEAD" });
        if (!cancelled) setPdfAvailable(res.ok);
      } catch {
        if (!cancelled) setPdfAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Terms & Conditions</DialogTitle>
        </DialogHeader>
        <div className="-mx-6 max-h-[60vh] overflow-y-auto border-y px-6 py-4">
          {error ? (
            <p className="text-sm text-destructive">
              Could not load terms ({error}). Please ask the front desk for a copy.
            </p>
          ) : content === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <article className="prose prose-sm max-w-none">
              {renderMarkdown(content)}
            </article>
          )}
        </div>
        <DialogFooter>
          {pdfAvailable ? (
            <a
              href="/terms.pdf"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-card px-4 text-sm font-medium hover:bg-accent"
            >
              Download PDF
            </a>
          ) : null}
          <DialogClose asChild>
            <Button type="button">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Minimal markdown renderer — handles headings (# / ##), paragraphs, bullets
// (- foo), horizontal rules (---), and italics (_word_). Sufficient for the
// T&C body. If we ever need real Markdown features, swap in react-markdown.
function renderMarkdown(text: string): React.ReactNode[] {
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (/^---+$/.test(trimmed)) return <hr key={i} className="my-4" />;
    if (trimmed.startsWith("# ")) {
      return (
        <h2 key={i} className="mt-4 mb-2 text-base font-semibold">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={i} className="mt-3 mb-1.5 text-sm font-semibold">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
    }
    if (trimmed.split("\n").every((line) => line.trim().startsWith("- "))) {
      return (
        <ul key={i} className="my-2 list-disc space-y-1 pl-5 text-sm">
          {trimmed.split("\n").map((line, j) => (
            <li key={j}>{renderInline(line.trim().slice(2))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="my-2 text-sm leading-6">
        {renderInline(trimmed)}
      </p>
    );
  });
}

function renderInline(line: string): React.ReactNode[] {
  // Italics: _foo_ → <em>foo</em>. Keep it simple — single pattern only.
  const parts: React.ReactNode[] = [];
  let last = 0;
  const re = /_([^_\n]+)_/g;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) parts.push(line.slice(last, m.index));
    parts.push(<em key={key++}>{m[1]}</em>);
    last = re.lastIndex;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts.length ? parts : [line];
}

"use client";

// Versioned Terms of Service modal. Agreement is only possible after the user
// scrolls the active legal document to the bottom.

import { useEffect, useRef, useState } from "react";
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
  agreed?: boolean;
  onAgree?: () => void;
}

interface LegalDocumentResponse {
  key: string;
  version: string;
  effectiveDate: string;
  bodyMarkdown: string;
}

export function TermsModal({ open, onOpenChange, agreed = false, onAgree }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [effectiveDate, setEffectiveDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open || content !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/legal-documents/terms-of-service", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LegalDocumentResponse;
        if (!cancelled) {
          setContent(data.bodyMarkdown);
          setVersion(data.version);
          setEffectiveDate(data.effectiveDate);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load terms.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, content]);

  useEffect(() => {
    if (!open) return;
    void Promise.resolve().then(() => setScrolledToBottom(false));
  }, [open]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      setScrolledToBottom(true);
    }
  }

  function agree() {
    onAgree?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Terms of Service</DialogTitle>
        </DialogHeader>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="-mx-6 max-h-[60vh] overflow-y-auto border-y px-6 py-4"
        >
          {error ? (
            <p className="text-sm text-destructive">
              Could not load terms ({error}). Please ask the front desk for a copy.
            </p>
          ) : content === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <article className="prose prose-sm max-w-none">
              {version ? (
                <p className="text-xs text-muted-foreground">
                  Version {version}
                  {effectiveDate ? ` · effective ${new Date(effectiveDate).toLocaleDateString("en-IN")}` : ""}
                </p>
              ) : null}
              {renderMarkdown(content)}
            </article>
          )}
        </div>
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">Close</Button>
          </DialogClose>
          <Button
            type="button"
            disabled={agreed || !content || !scrolledToBottom}
            onClick={agree}
          >
            {agreed ? "Agreed" : scrolledToBottom ? "I agree" : "Scroll to agree"}
          </Button>
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

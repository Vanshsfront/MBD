"use client";

// Sticky left rail for the clinical-record page. Discovers `.clin-section`
// elements on mount, lists them as anchors, and highlights the one currently
// in view via IntersectionObserver. Template-agnostic — each per-template
// form already emits `.clin-section` cards (via `<Section>` in shared.tsx),
// so no per-template changes are needed when this rail is added.

import { useEffect, useMemo, useState } from "react";

interface SectionRef {
  id: string;
  label: string;
}

export function SectionRail() {
  const [sections, setSections] = useState<SectionRef[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Discover sections after the per-template form mounts. We re-discover on
  // mutations within #clinical-main so add-row / new-section interactions
  // don't leave the rail stale.
  useEffect(() => {
    function discover() {
      const root = document.getElementById("clinical-main");
      if (!root) return;
      const els = Array.from(root.querySelectorAll<HTMLElement>(".clin-section"));
      const refs: SectionRef[] = els
        .map((el) => {
          const h2 = el.querySelector("h2");
          const label = h2?.textContent?.trim() ?? "Section";
          return { id: el.id, label };
        })
        .filter((r) => r.id);
      setSections(refs);
    }
    discover();
    const root = document.getElementById("clinical-main");
    if (!root) return;
    const observer = new MutationObserver(discover);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // Highlight the most-visible section. Margin keeps the trigger band just
  // below the sticky header (top: 56px shell + ~80px page header).
  useEffect(() => {
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      {
        rootMargin: "-140px 0px -55% 0px",
        threshold: [0.01, 0.25, 0.5],
      },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  // Slug-based identity is stable enough — same title, same id.
  const items = useMemo(() => sections, [sections]);

  if (items.length === 0) return null;

  return (
    <aside className="clin-rail">
      <p className="clin-rail-label">Sections</p>
      {items.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={`clin-rail-item ${activeId === s.id ? "is-on" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById(s.id);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            // Update URL hash so deep links still work but without the jump.
            history.replaceState(null, "", `#${s.id}`);
          }}
        >
          <span>{s.label}</span>
        </a>
      ))}
    </aside>
  );
}

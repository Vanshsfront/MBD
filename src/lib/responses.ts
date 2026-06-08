// Response-header helpers for sensitive endpoints.
//
// `phiHeaders` is for endpoints that return PHI/PII/financial documents
// (consultation PDFs, invoice XLSX, consent forms). It forces every cache
// in the chain — browser, CDN, intermediate proxy, service worker — to
// avoid storing the document. Without these directives, Next.js does not
// emit any Cache-Control on /api/* responses, and intermediate caches are
// then free to retain copies by their own defaults.
//
// Reference: audit-2026-06-06.md F-002 (Critical, live-confirmed).

export interface PhiHeaderOptions {
  contentType: string;
  filename: string;
  disposition?: "attachment" | "inline";
}

export function phiHeaders(opts: PhiHeaderOptions): Record<string, string> {
  const disposition = opts.disposition ?? "attachment";
  return {
    "Content-Type": opts.contentType,
    "Content-Disposition": `${disposition}; filename="${opts.filename}"`,
    // Hard-no-cache stack. `no-store` alone is sufficient for modern clients;
    // `no-cache, must-revalidate, max-age=0` covers older HTTP/1.0 caches and
    // proxies that honour different subsets of the directive. `private`
    // explicitly excludes shared caches.
    "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

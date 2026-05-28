"use client";

// Last-resort boundary — Next.js renders this when an error blows up the
// root layout itself (where the normal error.tsx can't catch it). Must
// include its own <html> and <body>. Intentionally framework-free so a
// CSS bundle blow-up still shows readable text.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          backgroundColor: "#fbf6ee",
          color: "#1a1a1e",
          margin: 0,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            padding: 32,
            textAlign: "center",
            borderRadius: 16,
            background: "#fff",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            The app crashed
          </h1>
          <p style={{ fontSize: 14, color: "#555" }}>
            Reload the page. If this keeps happening, share the reference with
            support.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#888", marginTop: 12 }}>
              ref: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: "8px 14px",
              fontSize: 14,
              borderRadius: 8,
              border: 0,
              background: "#1a1a1e",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}

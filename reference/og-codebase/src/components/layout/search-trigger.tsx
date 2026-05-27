"use client";

export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={() => {
        const isMac = navigator.userAgent.includes("Mac");
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "k",
            ctrlKey: !isMac,
            metaKey: isMac,
            bubbles: true,
          }),
        );
      }}
      className="hidden h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-xs text-muted-foreground transition-colors hover:bg-muted md:inline-flex"
      aria-label="Open search"
    >
      <SearchIcon />
      <span>Search…</span>
      <kbd className="rounded border bg-background px-1 py-0.5 font-mono text-[10px]">⌘K</kbd>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

import React from "react";

/** Original pictograms, not official provider trademarks. */
export function ProviderIcon({ provider }: { provider: string }) {
  const paths: Record<string, React.ReactNode> = {
    local: (
      <>
        <rect x="4" y="4" width="16" height="12" rx="2" />
        <path d="M8 20h8m-4-4v4M8 9h8m-8 3h5" />
      </>
    ),
    hermes: (
      <>
        <path d="m3 5 9 4 9-4-5 8-4 7-4-7-5-8Zm9 4v11M3 5v6l5 2m13-8v6l-5 2" />
      </>
    ),
    codex: (
      <>
        <path d="m9 6-6 6 6 6m6-12 6 6-6 6M14 4l-4 16" />
      </>
    ),
    claude: (
      <>
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M12 3v5" transform={`rotate(${i * 30} 12 12)`} />
        ))}
        <circle cx="12" cy="12" r="2" />
      </>
    ),
    antigravity: (
      <>
        <path d="m12 3 9 17H3L12 3Zm-5 9h10" />
        <path d="m9 20 3-5 3 5" />
      </>
    ),
    openrouter: (
      <>
        <path d="M3 12h7m0 0 5-7h6m-11 7 5 7h6m-3-3 3 3-3 3m0-20 3 3-3 3" />
      </>
    ),
    opencode: (
      <>
        <path d="M5 3h14v18H5zM9 8l3 4-3 4m4 0h3" />
      </>
    ),
    github: (
      <>
        <path d="M8 20v-3c-5 1-5-3-6-3m6 3c-6-1-5-8-3-9-1-2 0-4 0-4l4 2h6l4-2s1 2 0 4c2 1 3 8-3 9v3" />
      </>
    ),
    gemini: (
      <path d="M12 2c0 7 3 10 10 10-7 0-10 3-10 10 0-7-3-10-10-10 7 0 10-3 10-10Z" />
    ),
  };
  return (
    <span className={`provider-glyph glyph-${provider}`} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[provider] ?? (
          <>
            <rect x="4" y="6" width="16" height="14" rx="4" />
            <path d="M12 2v4M8 11v3m8-3v3m-7 3h6" />
          </>
        )}
      </svg>
    </span>
  );
}

import React, { useState } from "react";
import { explainError } from "../shared";

/**
 * One consistent error surface: a headline an operator can act on, the next
 * step, and the raw code behind a disclosure for bug reports.
 */
export function ErrorNote({
  value,
  pl,
  action,
}: {
  value: string;
  pl: boolean;
  action?: React.ReactNode;
}) {
  const { code, title, hint, raw } = explainError(value, pl);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="error-note" role="alert">
      <div className="error-note-body">
        <strong className="error-note-title">{title}</strong>
        <p className="error-note-hint">{hint}</p>
        <details className="error-note-details">
          <summary>{pl ? "Szczegóły techniczne" : "Technical details"}</summary>
          <code>{code === "UNKNOWN" ? raw : code}</code>
          {code !== "UNKNOWN" && raw !== code && <pre>{raw}</pre>}
          <button type="button" onClick={copy} className="error-note-copy">
            {copied
              ? pl
                ? "Skopiowano"
                : "Copied"
              : pl
                ? "Kopiuj kod"
                : "Copy code"}
          </button>
        </details>
      </div>
      {action && <div className="error-note-action">{action}</div>}
    </div>
  );
}

import React from "react";
import type { RunEvent } from "../shared";

export interface Evidence {
  verdict: "approve" | "changes_requested" | "unknown";
  findings: {
    path: string;
    line: number | null;
    text: string;
    inDiff: boolean;
  }[];
  omitted?: number;
}

/** Structured evidence of the latest completed review attempt. A re-review
 * that is running or failed shows none, never an older verdict. */
export function reviewEvidence(
  events: RunEvent[] = [],
  reviewState?: string,
): Evidence | null {
  if (reviewState !== undefined && reviewState !== "completed") return null;
  const outcome = events.filter((e) => e.kind === "review_outcome").at(-1);
  const event = events.filter((e) => e.kind === "review_evidence").at(-1);
  if (event && outcome && outcome.seq > event.seq) return null;
  try {
    return event ? (JSON.parse(event.text) as Evidence) : null;
  } catch {
    return null;
  }
}

const VERDICT = {
  approve: [
    "Reviewer: no blocking findings",
    "Recenzent: brak blokujących uwag",
  ],
  changes_requested: [
    "Reviewer requested changes",
    "Recenzent prosi o poprawki",
  ],
  unknown: [
    "Reviewer gave no verdict in the required format",
    "Recenzent nie podał werdyktu w wymaganym formacie",
  ],
} as const;

export function ReviewEvidence({
  evidence,
  pl,
}: {
  evidence: Evidence;
  pl: boolean;
}) {
  const outside = evidence.findings.filter((f) => !f.inDiff).length;
  return (
    <section
      className={`review-evidence verdict-${evidence.verdict}`}
      aria-label={pl ? "Dowody z review" : "Review evidence"}
    >
      <strong>{VERDICT[evidence.verdict][pl ? 1 : 0]}</strong>
      {evidence.findings.length ? (
        <ul>
          {evidence.findings.map((f, i) => (
            <li key={i}>
              <code>
                {f.path}
                {f.line ? `:${f.line}` : ""}
              </code>
              {!f.inDiff && (
                <span className="evidence-outside">
                  {pl ? "poza diffem" : "outside the diff"}
                </span>
              )}
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="helper">
          {pl ? "Brak uwag wskazujących pliki." : "No findings citing files."}
        </p>
      )}
      {!!evidence.omitted && (
        <p className="helper">
          {pl
            ? `Pominięto ${evidence.omitted} dalszych uwag — pełny tekst jest w wyniku review.`
            : `${evidence.omitted} more findings left out — the full text is in the review result.`}
        </p>
      )}
      {outside > 0 && (
        <p className="helper">
          {pl
            ? "Uwagi poza diffem wskazują pliki, których ta zmiana nie dotyka — sprawdź je ręcznie."
            : "Findings outside the diff cite files this change does not touch — check them by hand."}
        </p>
      )}
    </section>
  );
}

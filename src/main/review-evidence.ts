/** Structured reviewer evidence: a verdict and findings that cite files. The
 * reviewer's text is untrusted; the app only parses it, it never acts on it. */
export type ReviewVerdict = "approve" | "changes_requested" | "unknown";
export interface ReviewFinding {
  path: string;
  line: number | null;
  text: string;
  /** Whether the cited file is part of the captured diff. */
  inDiff: boolean;
}
export interface ReviewEvidence {
  verdict: ReviewVerdict;
  findings: ReviewFinding[];
}

/** Attempts per task, the first run included: at most two revisions. */
export const MAX_ATTEMPTS = 3;

export const REVIEW_FORMAT = `

End your report with exactly this block:
VERDICT: APPROVE or VERDICT: CHANGES_REQUESTED
FINDINGS:
- path/to/file:line — what is wrong and how it was verified
Use one line per finding and cite a real file. Write "FINDINGS: none" when there are none.`;

export { diffFiles } from "./diff-files.js";

export function parseReview(
  text: string,
  changed: Set<string>,
): ReviewEvidence {
  // The last verdict line wins: the block is asked for at the very end.
  const verdicts = [
    ...text.matchAll(/^\s*VERDICT:\s*(APPROVE|CHANGES_REQUESTED)\b/gim),
  ];
  const last = verdicts.at(-1)?.[1]?.toUpperCase();
  const verdict: ReviewVerdict =
    last === "APPROVE"
      ? "approve"
      : last === "CHANGES_REQUESTED"
        ? "changes_requested"
        : "unknown";
  const block = text.slice(verdicts.at(-1)?.index ?? text.length);
  const findings: ReviewFinding[] = [];
  // "- path/to/file.ts:12 — text" (line optional, backticks allowed).
  for (const m of block.matchAll(
    /^\s*[-*]\s+`?([^\s`:]+)`?(?::(\d+))?\S*\s+[—–-]\s+(.+)$/gm,
  )) {
    const path = m[1]!.replace(/^\.\//, "");
    if (!/[./]/.test(path) || findings.length === 50) continue;
    findings.push({
      path,
      line: m[2] ? Number(m[2]) : null,
      text: m[3]!.trim().slice(0, 500),
      inDiff: changed.has(path),
    });
  }
  return { verdict, findings };
}

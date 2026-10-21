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
  /** Findings left out to keep the stored evidence within its budget. */
  omitted?: number;
}

/** Stored size of one evidence record (50 findings of 500 characters fit). */
export const EVIDENCE_LIMIT = 32_000;

/** Attempts per task, the first run included: at most two revisions. */
export const MAX_ATTEMPTS = 3;

export const REVIEW_FORMAT = `

End your report with exactly this block, where the verdict line holds one word, APPROVE or CHANGES_REQUESTED:
VERDICT: <verdict>
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
    // The line must end after the chosen value, so an echoed template with
    // both choices is no verdict at all.
    ...text.matchAll(
      /^\s*\**VERDICT:\s*\**\s*(APPROVE|CHANGES_REQUESTED)\s*\**\s*$/gim,
    ),
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
  // "- path/to/file.ts:12 — text": the line is optional, backticks are
  // allowed and a path may contain spaces, so the citation is everything
  // before the first spaced dash and the line number is read from its right.
  for (const m of block.matchAll(/^\s*[-*]\s+(.+?)\s+[—–-]\s+(.+)$/gm)) {
    const cite = /^(.+?)(?::(\d+)(?:[-:]\d+)?)?$/.exec(
      m[1]!.trim().replace(/^`(.*)`$/, "$1"),
    )!;
    const path = cite[1]!.replace(/^`|`$/g, "").replace(/^\.\//, "");
    // A path has a separator or an extension, or is a file this change
    // touched (Makefile, LICENSE); bare words like "general" are not cited.
    if ((!/[./]/.test(path) && !changed.has(path)) || findings.length === 50)
      continue;
    findings.push({
      path,
      line: cite[2] ? Number(cite[2]) : null,
      text: m[2]!.trim().slice(0, 500),
      inDiff: changed.has(path),
    });
  }
  return { verdict, findings };
}

/** Evidence as JSON that fits `limit`: findings past the budget are left out
 * (and counted) rather than cutting the document mid-way. */
export function serializeEvidence(evidence: ReviewEvidence, limit: number) {
  const findings = [...evidence.findings];
  for (;;) {
    const omitted = evidence.findings.length - findings.length;
    const json = JSON.stringify({
      ...evidence,
      findings,
      ...(omitted && { omitted }),
    });
    if (json.length <= limit || !findings.length) return json;
    findings.pop();
  }
}

/** Decodes one path Git wrote as a C-style quoted string (`core.quotePath`). */
function unquote(quoted: string) {
  const bytes: number[] = [];
  const named: Record<string, number> = {
    a: 7,
    b: 8,
    t: 9,
    n: 10,
    v: 11,
    f: 12,
    r: 13,
    '"': 34,
    "\\": 92,
  };
  for (let i = 1; i < quoted.length - 1; i++) {
    const c = quoted[i]!;
    if (c !== "\\") {
      bytes.push(...Buffer.from(c, "utf8"));
      continue;
    }
    const next = quoted[++i]!;
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(quoted.slice(i, i + 3), 8));
      i += 2;
    } else bytes.push(named[next] ?? next.charCodeAt(0));
  }
  return Buffer.from(bytes).toString("utf8");
}

/** The first quoted token of `text`, including its quotes. */
function quotedToken(text: string) {
  for (let i = 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === '"') return text.slice(0, i + 1);
  }
  return null;
}

/** Files a captured diff touches, from its `diff --git` headers. Captures
 * use `--no-renames`, so both sides of a header name the same path; quoted
 * (non-ASCII or special) and space-containing paths are both handled. */
export function diffFiles(diff: string) {
  const files = new Set<string>();
  for (const [, rest] of diff.matchAll(/^diff --git (.+)$/gm)) {
    if (rest!.startsWith('"')) {
      const token = quotedToken(rest!);
      if (token) files.add(unquote(token).replace(/^a\//, ""));
      continue;
    }
    const size = (rest!.length - 5) / 2;
    if (Number.isInteger(size) && size > 0) files.add(rest!.slice(2, 2 + size));
  }
  return files;
}

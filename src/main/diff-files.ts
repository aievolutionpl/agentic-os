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

/** Files a diff touches, from its `diff --git` headers: both sides of a
 * rename, Git-quoted (non-ASCII or special) and space-containing paths. */
export function diffFiles(diff: string) {
  const files = new Set<string>();
  const strip = (path: string) => path.replace(/^[ab]\//, "");
  for (const [, rest] of diff.matchAll(/^diff --git (.+)$/gm)) {
    const line = rest!;
    const first = line.startsWith('"') ? quotedToken(line) : null;
    if (first) {
      const second = line.slice(first.length + 1);
      files.add(strip(unquote(first)));
      files.add(strip(second.startsWith('"') ? unquote(second) : second));
      continue;
    }
    if (line.endsWith('"')) {
      const at = line.lastIndexOf(' "');
      files.add(strip(line.slice(0, at)));
      files.add(strip(unquote(line.slice(at + 1))));
      continue;
    }
    // Unquoted: an unchanged path reads "a/X b/X", which also covers spaces.
    const size = (line.length - 5) / 2;
    const same = line.slice(2, 2 + size);
    if (Number.isInteger(size) && size > 0 && line === `a/${same} b/${same}`)
      files.add(same);
    else {
      const m = /^a\/(.+?) b\/(.+)$/.exec(line);
      if (m) files.add(m[1]!).add(m[2]!);
    }
  }
  return files;
}

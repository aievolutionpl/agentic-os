import React, { useMemo, useState } from "react";
import { copyText } from "./clipboard";
import { Icon } from "./ui";

export interface DiffLine {
  type: "add" | "del" | "ctx" | "meta";
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  oldPath: string | null;
  status: "added" | "deleted" | "modified" | "renamed";
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  raw: string;
}

function unquoteGitPath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\([0-7]{3})/g, (_, oct) =>
        String.fromCharCode(Number.parseInt(oct, 8)),
      )
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return trimmed;
}

function stripPrefix(path: string, prefix: "a/" | "b/"): string {
  const clean = unquoteGitPath(path);
  return clean.startsWith(prefix) ? clean.slice(2) : clean;
}

export function parseUnifiedDiff(diff: string): DiffFile[] {
  if (!diff.trim()) return [];
  const files: DiffFile[] = [];
  const chunks = diff.split(/^(?=diff --git )/m).filter((c) => c.trim());

  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/);
    const header = lines[0] ?? "";
    const match = header.match(/^diff --git ("a\/.*?"|a\/\S+) ("b\/.*?"|b\/\S+)/);
    let oldPath = match ? stripPrefix(match[1], "a/") : "unknown";
    let newPath = match ? stripPrefix(match[2], "b/") : oldPath;
    let status: DiffFile["status"] = "modified";
    let additions = 0;
    let deletions = 0;
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLine = 1;
    let newLine = 1;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("new file mode")) {
        status = "added";
        continue;
      }
      if (line.startsWith("deleted file mode")) {
        status = "deleted";
        continue;
      }
      if (line.startsWith("rename from ")) {
        status = "renamed";
        oldPath = unquoteGitPath(line.slice("rename from ".length));
        continue;
      }
      if (line.startsWith("rename to ")) {
        status = "renamed";
        newPath = unquoteGitPath(line.slice("rename to ".length));
        continue;
      }
      if (line.startsWith("--- ")) {
        const p = line.slice(4).trim();
        if (p === "/dev/null") status = "added";
        else oldPath = stripPrefix(p, "a/");
        continue;
      }
      if (line.startsWith("+++ ")) {
        const p = line.slice(4).trim();
        if (p === "/dev/null") status = "deleted";
        else newPath = stripPrefix(p, "b/");
        continue;
      }
      const hunkMatch = line.match(
        /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/,
      );
      if (hunkMatch) {
        oldLine = Number.parseInt(hunkMatch[1], 10);
        newLine = Number.parseInt(hunkMatch[2], 10);
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
        continue;
      }
      if (!currentHunk) continue;
      if (line.startsWith("+")) {
        additions++;
        currentHunk.lines.push({
          type: "add",
          oldLine: null,
          newLine: newLine++,
          text: line,
        });
      } else if (line.startsWith("-")) {
        deletions++;
        currentHunk.lines.push({
          type: "del",
          oldLine: oldLine++,
          newLine: null,
          text: line,
        });
      } else if (line.startsWith("\\")) {
        currentHunk.lines.push({
          type: "meta",
          oldLine: null,
          newLine: null,
          text: line,
        });
      } else if (line.startsWith(" ") || line === "") {
        // Ignore trailing empty line at end of chunk
        if (i === lines.length - 1 && line === "") continue;
        currentHunk.lines.push({
          type: "ctx",
          oldLine: oldLine++,
          newLine: newLine++,
          text: line || " ",
        });
      }
    }

    files.push({
      path: status === "deleted" ? oldPath : newPath,
      oldPath: status === "renamed" && oldPath !== newPath ? oldPath : null,
      status,
      additions,
      deletions,
      hunks,
      raw: chunk,
    });
  }

  return files;
}

export function DiffViewer({
  diff,
  diffHash,
  language,
}: {
  diff: string;
  diffHash: string;
  language: "pl" | "en";
}) {
  const pl = language === "pl";
  const files = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const [mode, setMode] = useState<"unified" | "split" | "raw">("unified");
  const [activeFile, setActiveFile] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const totalAdditions = useMemo(
    () => files.reduce((sum, f) => sum + f.additions, 0),
    [files],
  );
  const totalDeletions = useMemo(
    () => files.reduce((sum, f) => sum + f.deletions, 0),
    [files],
  );

  const shownFiles = (
    activeFile === "all"
      ? files
      : files.filter((f) => f.path === activeFile)
  ).filter(
    (f) =>
      !searchQuery.trim() ||
      f.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.raw.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function copy(text: string, id: string) {
    void copyText(text)
      .then(() => {
        setCopied(id);
        setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
      })
      .catch(() => {});
  }

  const statusLabels: Record<DiffFile["status"], string> = pl
    ? {
        added: "Nowy plik",
        deleted: "Usunięty",
        modified: "Zmieniony",
        renamed: "Zmiana nazwy",
      }
    : {
        added: "Added",
        deleted: "Deleted",
        modified: "Modified",
        renamed: "Renamed",
      };

  return (
    <div className="diff-studio">
      <div className="diff-toolbar">
        <div className="diff-summary-badges">
          <span className="diff-stat-files">
            <Icon name="folder" />
            <strong>{files.length}</strong>{" "}
            {pl
              ? files.length === 1
                ? "plik"
                : "pliki"
              : files.length === 1
                ? "file"
                : "files"}
          </span>
          <span className="diff-stat-add" title={pl ? "Dodane linie" : "Additions"}>
            +{totalAdditions}
          </span>
          <span className="diff-stat-del" title={pl ? "Usunięte linie" : "Deletions"}>
            −{totalDeletions}
          </span>
          <span className="diff-hash-chip" title="SHA-256">
            <code>SHA-256: {diffHash.slice(0, 12)}…</code>
          </span>
        </div>
        <div className="diff-controls">
          <input
            type="search"
            aria-label={pl ? "Szukaj w zmianach" : "Search in diff"}
            placeholder={pl ? "Szukaj w diffie…" : "Search in diff…"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ maxWidth: "165px", fontSize: "12px", padding: "4px 8px" }}
          />
          {files.length > 1 && mode !== "raw" && (
            <button
              type="button"
              className="secondary"
              style={{ fontSize: "12px", padding: "4px 8px" }}
              onClick={() => {
                const allCollapsed = files.every((f) => collapsed[f.path]);
                const next: Record<string, boolean> = {};
                if (!allCollapsed) {
                  for (const f of files) next[f.path] = true;
                }
                setCollapsed(next);
              }}
            >
              {files.every((f) => collapsed[f.path])
                ? pl
                  ? "Rozwiń wszystkie"
                  : "Expand all"
                : pl
                  ? "Zwiń wszystkie"
                  : "Collapse all"}
            </button>
          )}
          <div
            className="diff-mode-switch"
            role="group"
            aria-label={pl ? "Tryb widoku diffa" : "Diff view mode"}
          >
            {(
              [
                ["unified", pl ? "Zunifikowany" : "Unified"],
                ["split", pl ? "Obok siebie" : "Split"],
                ["raw", "Raw"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`ghost ${mode === id ? "active" : ""}`}
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="secondary diff-copy-btn"
            onClick={() => copy(diff, "all")}
          >
            <Icon name={copied === "all" ? "check" : "copy"} />
            {copied === "all"
              ? pl
                ? "Skopiowano"
                : "Copied"
              : pl
                ? "Kopiuj diff"
                : "Copy diff"}
          </button>
        </div>
      </div>

      {files.length > 1 && mode !== "raw" && (
        <nav
          className="diff-file-tabs"
          aria-label={pl ? "Zmienione pliki" : "Changed files"}
        >
          <button
            type="button"
            className={`diff-file-pill ${activeFile === "all" ? "active" : ""}`}
            onClick={() => setActiveFile("all")}
          >
            {pl ? "Wszystkie pliki" : "All files"} ({files.length})
          </button>
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              className={`diff-file-pill status-${file.status} ${
                activeFile === file.path ? "active" : ""
              }`}
              onClick={() => setActiveFile(file.path)}
            >
              <span className="diff-file-name">{file.path}</span>
              <span className="diff-file-counts">
                {file.additions > 0 && (
                  <em className="add">+{file.additions}</em>
                )}
                {file.deletions > 0 && (
                  <em className="del">−{file.deletions}</em>
                )}
              </span>
            </button>
          ))}
        </nav>
      )}

      {mode === "raw" || !files.length ? (
        <pre className="diff-raw" tabIndex={0}>
          {diff}
        </pre>
      ) : (
        <div className="diff-file-list">
          {shownFiles.map((file) => (
            <article className="diff-file-card" key={file.path}>
              <header className="diff-file-header">
                <div className="diff-file-title">
                  <span className={`badge diff-status-${file.status}`}>
                    {statusLabels[file.status]}
                  </span>
                  <code>
                    {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
                  </code>
                </div>
                <div className="diff-file-meta">
                  <span className="diff-stat-add">+{file.additions}</span>
                  <span className="diff-stat-del">−{file.deletions}</span>
                  <button
                    type="button"
                    className="icon-button"
                    title={pl ? "Zwiń / Rozwiń plik" : "Toggle file collapse"}
                    onClick={() =>
                      setCollapsed((prev) => ({
                        ...prev,
                        [file.path]: !prev[file.path],
                      }))
                    }
                  >
                    <Icon name={collapsed[file.path] ? "chevron" : "down"} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title={pl ? "Kopiuj zmiany w pliku" : "Copy file diff"}
                    aria-label={pl ? "Kopiuj zmiany w pliku" : "Copy file diff"}
                    onClick={() => copy(file.raw, file.path)}
                  >
                    <Icon name={copied === file.path ? "check" : "copy"} />
                  </button>
                </div>
              </header>

              {!collapsed[file.path] &&
                (mode === "unified" ? (
                <div className="diff-table-wrap">
                  <pre className="diff-unified-pre" tabIndex={0}>
                    {file.hunks.map((hunk, hIdx) => (
                      <React.Fragment key={hIdx}>
                        <div className="diff-line diff-line-hunk">
                          <span className="diff-ln" aria-hidden="true">
                            ⋯
                          </span>
                          <span className="diff-ln" aria-hidden="true">
                            ⋯
                          </span>
                          <span className="diff-code">{hunk.header}</span>
                        </div>
                        {hunk.lines.map((line, lIdx) => (
                          <div
                            key={lIdx}
                            className={`diff-line diff-line-${line.type}`}
                          >
                            <span className="diff-ln" aria-hidden="true">
                              {line.oldLine ?? ""}
                            </span>
                            <span className="diff-ln" aria-hidden="true">
                              {line.newLine ?? ""}
                            </span>
                            <span className="diff-code">{line.text}</span>
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </pre>
                </div>
              ) : (
                <div className="diff-table-wrap diff-split-wrap">
                  <pre className="diff-split-pre" tabIndex={0}>
                    {file.hunks.map((hunk, hIdx) => (
                      <React.Fragment key={hIdx}>
                        <div className="diff-split-hunk">{hunk.header}</div>
                        {hunk.lines.map((line, lIdx) => (
                          <div
                            key={lIdx}
                            className={`diff-split-row diff-line-${line.type}`}
                          >
                            <div className="diff-split-cell old">
                              <span className="diff-ln" aria-hidden="true">
                                {line.oldLine ?? ""}
                              </span>
                              <span className="diff-code">
                                {line.type === "add" ? "" : line.text}
                              </span>
                            </div>
                            <div className="diff-split-cell new">
                              <span className="diff-ln" aria-hidden="true">
                                {line.newLine ?? ""}
                              </span>
                              <span className="diff-code">
                                {line.type === "del" ? "" : line.text}
                              </span>
                            </div>
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </pre>
                </div>
              ))}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

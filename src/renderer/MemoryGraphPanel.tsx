import React, { useEffect, useMemo, useState } from "react";
import type { MemoryGraph } from "../shared";
import { Icon } from "./ui";
import { copyText } from "./clipboard";

export function MemoryGraphPanel({
  pl,
  onUpdated,
  onSelect,
}: {
  pl: boolean;
  onUpdated: () => void;
  onSelect: (id: string) => void;
}) {
  const [graph, setGraph] = useState<MemoryGraph | null>(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(""),
    [project, setProject] = useState(""),
    [graphQuery, setGraphQuery] = useState(""),
    [copiedCluster, setCopiedCluster] = useState(false),
    [zoom, setZoom] = useState(1);
  useEffect(() => {
    let alive = true,
      pending = false;
    const read = async () => {
      if (pending || !window.agenting?.memoryGraph) return;
      pending = true;
      try {
        const value = await window.agenting.memoryGraph();
        if (alive) {
          setGraph(value);
          setError(false);
          onUpdated();
        }
      } catch {
        if (alive) setError(true);
      } finally {
        pending = false;
      }
    };
    void read();
    const timer = setInterval(() => {
      if (!document.hidden) void read();
    }, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const nodes = useMemo(
    () =>
      (graph?.nodes ?? [])
        .filter((n) => !project || n.projectId === project)
        .filter(
          (n) =>
            !graphQuery.trim() ||
            n.kind === "project" ||
            `${n.label} ${n.content} ${n.source}`
              .toLowerCase()
              .includes(graphQuery.toLowerCase()),
        )
        .slice(0, 100),
    [graph, project, graphQuery],
  );
  const neighborIds = useMemo(() => {
    const set = new Set<string>();
    if (!selected || !graph) return set;
    for (const edge of graph.edges) {
      if (edge.from === selected) set.add(edge.to);
      if (edge.to === selected) set.add(edge.from);
    }
    return set;
  }, [graph, selected]);
  const points = useMemo(() => {
    const centers = nodes.filter((n) => n.kind === "project");
    const map = new Map<string, { x: number; y: number }>();
    centers.forEach((node, i) => {
      const angle =
        (i * Math.PI * 2) / Math.max(centers.length, 1) - Math.PI / 2;
      const radius = centers.length === 1 ? 0 : 128;
      const x = 400 + Math.cos(angle) * radius * 1.65,
        y = 220 + Math.sin(angle) * radius;
      map.set(node.id, { x, y });
      const children = nodes.filter(
        (n) => n.kind === "memory" && n.projectId === node.projectId,
      );
      children.forEach((n, j) => {
        const a = (j * Math.PI * 2) / Math.max(children.length, 1);
        const r = 64 + Math.floor(j / 16) * 26;
        map.set(n.id, { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
      });
    });
    return map;
  }, [nodes]);
  const current = nodes.find((n) => n.id === selected);
  async function toggle() {
    if (!graph) return;
    setBusy(true);
    try {
      setGraph(
        await window.agenting!.memoryAutoCapture!({ enabled: !graph.enabled }),
      );
      setError(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="memory-observatory"
      aria-label={pl ? "Graf pamięci" : "Memory graph"}
    >
      <header>
        <div>
          <span className="section-eyebrow">KNOWLEDGE GRAPH</span>
          <h2>{pl ? "Połączone myśli." : "Connected thinking."}</h2>
        </div>
        <div className="graph-tools">
          <input
            type="search"
            aria-label={pl ? "Szukaj węzłów w grafie" : "Search graph nodes"}
            placeholder={pl ? "Filtruj węzły…" : "Filter nodes…"}
            value={graphQuery}
            onChange={(e) => setGraphQuery(e.target.value)}
            style={{ maxWidth: "180px" }}
          />
          <select
            aria-label={pl ? "Projekt grafu" : "Graph project"}
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="">
              {pl ? "Cały workspace" : "Whole workspace"}
            </option>
            {graph?.nodes
              .filter((n) => n.kind === "project")
              .map((n) => (
                <option key={n.id} value={n.projectId}>
                  {n.label}
                </option>
              ))}
          </select>
          <button
            className="secondary"
            disabled={!graph || busy}
            aria-pressed={graph?.enabled ?? false}
            onClick={() => void toggle()}
          >
            <span className={`status-dot ${graph?.enabled ? "active" : ""}`} />
            {pl
              ? `Autozapis ${graph?.enabled ? "włączony" : "wyłączony"}`
              : `Auto-save ${graph?.enabled ? "on" : "off"}`}
          </button>
          <button
            className="secondary"
            onClick={() =>
              void window.agenting!.memoryVaultOpen!().catch(() =>
                setError(true),
              )
            }
          >
            <Icon name="folder" />
            Markdown / Obsidian
          </button>
        </div>
      </header>
      {error && (
        <p className="error" role="alert">
          {pl
            ? "Synchronizacja nie powiodła się. Notatki pozostają w bazie; ponowimy odczyt."
            : "Sync failed. Notes remain in the database; retrying shortly."}
        </p>
      )}
      <div className="graph-stage">
        <svg
          viewBox={`${400 - 400 / zoom} ${220 - 220 / zoom} ${800 / zoom} ${440 / zoom}`}
          role="group"
          aria-label={
            pl ? "Projekty i powiązane notatki" : "Projects and linked notes"
          }
        >
          {graph?.edges.map((edge, i) => {
            const from = points.get(edge.from),
              to = points.get(edge.to);
            return from && to ? (
              <line
                key={i}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className={
                  edge.from === selected || edge.to === selected
                    ? "selected"
                    : ""
                }
              />
            ) : null;
          })}
          {nodes.map((node) => {
            const p = points.get(node.id);
            return p ? (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.label} · ${node.kind}`}
                aria-pressed={node.id === selected}
                className={`graph-node ${node.kind} ${node.id === selected ? "selected" : ""}`}
                transform={`translate(${p.x},${p.y})`}
                onClick={() => setSelected(node.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(node.id);
                  }
                }}
              >
                <circle r={node.kind === "project" ? 13 : 6} />
                <text y={node.kind === "project" ? 31 : 20} textAnchor="middle">
                  {node.label.slice(0, node.kind === "project" ? 25 : 18)}
                </text>
              </g>
            ) : null;
          })}
        </svg>
        {!nodes.length && (
          <div className="graph-empty">
            <Icon name="memory" />
            <p>
              {pl
                ? "Twoja wiedza zacznie się tutaj łączyć."
                : "Your knowledge will connect here."}
            </p>
            <small>
              {pl
                ? "Zapisz notatkę lub zakończ rozmowę z agentem."
                : "Save a note or complete an agent conversation."}
            </small>
          </div>
        )}
        <div className="graph-zoom">
          <button
            aria-label={pl ? "Oddal graf" : "Zoom out"}
            onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}
          >
            −
          </button>
          <button
            aria-label={pl ? "Przybliż graf" : "Zoom in"}
            onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
          >
            +
          </button>
          <button onClick={() => setZoom(1)}>1:1</button>
        </div>
        {current && (
          <aside className="graph-inspector">
            <button
              className="icon-button"
              aria-label={pl ? "Zamknij podgląd" : "Close preview"}
              onClick={() => setSelected("")}
            >
              <Icon name="close" />
            </button>
            <small>{current.source}</small>
            <h3>{current.label}</h3>
            <p>{current.content.slice(0, 450)}</p>
            {neighborIds.size > 0 && (
              <small style={{ display: "block", marginBottom: "8px" }}>
                {pl
                  ? `Powiązane węzły: ${neighborIds.size}`
                  : `Linked nodes: ${neighborIds.size}`}
              </small>
            )}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {current.memoryId && (
                <button
                  className="secondary"
                  onClick={() => onSelect(current.memoryId!)}
                >
                  {pl ? "Otwórz notatkę" : "Open note"}
                </button>
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const linked = (graph?.nodes ?? []).filter((n) =>
                    neighborIds.has(n.id),
                  );
                  const md = [
                    `# Knowledge Cluster: ${current.label}`,
                    `Source: ${current.source}`,
                    "",
                    current.content,
                    ...(linked.length
                      ? [
                          "",
                          "## Linked Nodes",
                          ...linked.map(
                            (n) =>
                              `### ${n.label} (${n.source})\n${n.content}`,
                          ),
                        ]
                      : []),
                  ].join("\n\n");
                  void copyText(md).then(() => {
                    setCopiedCluster(true);
                    setTimeout(() => setCopiedCluster(false), 2000);
                  });
                }}
              >
                <Icon name={copiedCluster ? "check" : "copy"} />
                {copiedCluster
                  ? pl
                    ? "Skopiowano klaster"
                    : "Copied cluster"
                  : pl
                    ? "Kopiuj klaster MD"
                    : "Copy cluster MD"}
              </button>
            </div>
          </aside>
        )}
      </div>
      <footer>
        <span>
          {graph?.nodes.filter((n) => n.kind === "memory").length ?? 0}{" "}
          {pl ? "notatek" : "notes"} · {graph?.edges.length ?? 0}{" "}
          {pl ? "połączeń" : "connections"}
        </span>
        <span>
          {graph?.engine ?? "MCP Knowledge Graph"}
          {graph &&
            ` · ${new Date(graph.syncedAt).toLocaleTimeString(pl ? "pl" : "en")}`}
        </span>
      </footer>
      <p className="helper">
        {pl
          ? "Autozapis zachowuje ostatnią wymianę rozmowy i wyniki ukończonych zadań w obrębie projektu. Notatki są lokalne; połączenia [[tytuł]] tworzą relacje. Możesz edytować pliki Markdown — treść wróci do aplikacji."
          : "Auto-save keeps the latest conversation exchange and completed task results within their project. Notes stay local; [[title]] links create relationships. Markdown edits sync back into the app."}
      </p>
    </section>
  );
}

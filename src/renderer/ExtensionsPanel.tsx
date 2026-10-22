import React, { useEffect, useState } from "react";
import type { Extension, McpTool } from "../shared";
import { Modal, SelectField, Icon } from "./ui";
const sample = JSON.stringify(
  {
    kind: "skill",
    name: "Project conventions",
    version: "1.0.0",
    author: "Your team",
    license: "Apache-2.0",
    source: "local/project-conventions",
    instructions:
      "Read the existing README and reuse project patterns. Run relevant checks and report actual results.",
  },
  null,
  2,
);
const pluginSample = JSON.stringify(
  {
    kind: "plugin",
    name: "Custom Release & QA Plugin",
    version: "1.0.0",
    author: "Your team",
    license: "Apache-2.0",
    source: "local/release-qa-plugin",
    category: "QA & Release",
    description: "Validates tests and enforces changelog summaries.",
    instructions:
      "Run project tests before completing the task and include a concise release note in the final summary.",
  },
  null,
  2,
);
export function ExtensionsPanel({
  projectId,
  language,
}: {
  projectId: string;
  language: "pl" | "en";
}) {
  const api = window.agenting!,
    pl = language === "pl";
  const [items, setItems] = useState<Extension[]>([]),
    [plugins, setPlugins] = useState<Extension[]>([]),
    [query, setQuery] = useState(""),
    [manifest, setManifest] = useState(sample),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(""),
    [tools, setTools] = useState<McpTool[]>([]),
    [tool, setTool] = useState(""),
    [args, setArgs] = useState("{}"),
    [result, setResult] = useState<{ isError: boolean; text: string } | null>(
      null,
    ),
    [pinnedNotice, setPinnedNotice] = useState(false),
    [pending, setPending] = useState<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    } | null>(null),
    [remove, setRemove] = useState<Extension | null>(null);
  async function refresh() {
    const [extList, plugList] = await Promise.all([
      api.extensionList({ projectId }),
      api.pluginCatalog
        ? api.pluginCatalog({ projectId }).catch(() => [])
        : Promise.resolve([]),
    ]);
    setItems(extList);
    setPlugins(plugList);
  }
  useEffect(() => {
    let alive = true;
    void refresh()
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(false);
    try {
      await fn();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const filtered = items.filter((item) =>
    `${item.name} ${item.kind} ${item.instructions ?? ""}`
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase().trim()),
  );
  return (
    <section className="extensions-panel">
      <div className="section-heading">
        <div>
          <h2>{pl ? "Rozszerzenia projektu" : "Project extensions"}</h2>
          <p>
            {pl
              ? "Biblioteka umiejętności Twojego zespołu. Wybierz skille w szczegółach zadania."
              : "Your team's capability library. Select skills in task details."}
          </p>
        </div>
      </div>
      <label className="skill-library-search">
        <Icon name="search" />
        <span className="sr-only">
          {pl ? "Szukaj skilla lub narzędzia" : "Search skills or tools"}
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            pl
              ? "Szukaj: design, research, memory…"
              : "Search: design, research, memory…"
          }
        />
        <span className="helper">
          {items.filter((item) => item.kind === "skill").length} skills
        </span>
      </label>
      {error && (
        <p className="inline-error" role="alert">
          {pl
            ? "Operacja odrzucona. Sprawdź manifest, zaufaną ścieżkę programu i stan połączenia."
            : "Request rejected. Check the manifest, trusted executable path and connection state."}
        </p>
      )}
      {!!plugins.length && (
        <section className="plugin-marketplace" aria-label={pl ? "Katalog Pluginów" : "Plugin Marketplace"}>
          <div className="plugin-marketplace-header">
            <h3>
              <Icon name="spark" />
              {pl ? "Katalog Pluginów (1-Klik)" : "Plugin Marketplace (1-Click)"}
            </h3>
            <span className="helper">
              {pl
                ? "Gotowe pakiety łączące reguły agentów, bramki QA oraz integracje GitHub."
                : "Bundled packs combining agent rules, QA gates and GitHub workflows."}
            </span>
          </div>
          <div className="plugin-cards-grid">
            {plugins.map((plugin) => {
              const installedRow = items.find(
                (i) => i.pluginId === plugin.id || i.id === `plugin:${projectId}:${plugin.id}`,
              );
              const isInstalled = !!installedRow || !!plugin.installed;
              const isEnabled = installedRow
                ? installedRow.enabled !== false
                : plugin.enabled !== false;
              return (
                <article key={plugin.id} className="plugin-card">
                  <div className="plugin-card-top">
                    <span className="badge">{plugin.category ?? "Plugin"}</span>
                    <span className="helper">v{plugin.version}</span>
                  </div>
                  <h4>{plugin.name}</h4>
                  <p className="helper">{plugin.description}</p>
                  <div className="plugin-card-actions">
                    {!isInstalled ? (
                      <button
                        type="button"
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api.pluginInstall?.({
                              projectId,
                              id: plugin.id,
                              consent: true,
                            });
                            await refresh();
                          })
                        }
                      >
                        <Icon name="plus" />
                        {pl ? "Zainstaluj plugin" : "Install plugin"}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={isEnabled ? "secondary" : "ghost"}
                          disabled={busy || !installedRow}
                          onClick={() => {
                            if (!installedRow) return;
                            void act(async () => {
                              await api.extensionToggle?.({
                                projectId,
                                id: installedRow.id,
                                enabled: !isEnabled,
                              });
                              await refresh();
                            });
                          }}
                        >
                          <Icon name={isEnabled ? "check" : "close"} />
                          {isEnabled
                            ? pl
                              ? "Włączony"
                              : "Enabled"
                            : pl
                              ? "Wyłączony"
                              : "Disabled"}
                        </button>
                        {installedRow && (
                          <button
                            type="button"
                            className="ghost"
                            disabled={busy}
                            onClick={() => setRemove(installedRow)}
                          >
                            {pl ? "Odinstaluj" : "Uninstall"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {loading ? (
        <p role="status">{pl ? "Wczytywanie…" : "Loading…"}</p>
      ) : (
        <ul className="extension-list">
          {filtered.map((item) => (
            <li key={item.id}>
              <div>
                <strong className="skill-name">
                  <Icon
                    name={
                      item.kind === "mcp"
                        ? "connections"
                        : item.id.includes("memory")
                          ? "memory"
                          : "spark"
                    }
                  />
                  {item.name}
                </strong>
                <span className="helper">
                  {" "}
                  {item.version} · {item.kind.toUpperCase()}
                  {item.enabled === false
                    ? pl
                      ? " · WYŁĄCZONY"
                      : " · DISABLED"
                    : ""}
                </span>
                <p className="helper">
                  {item.author} · {item.license} · {item.source}
                </p>
                {item.description && (
                  <p className="helper">{item.description}</p>
                )}
                {(item.kind === "skill" ||
                  item.kind === "plugin" ||
                  item.kind === "hook") &&
                  item.instructions && (
                    <details>
                      <summary>{pl ? "Instrukcje" : "Instructions"}</summary>
                      <pre>{item.instructions}</pre>
                    </details>
                  )}
              </div>
              {!item.id.startsWith("builtin:") && (
                <div className="button-row">
                  {api.extensionToggle && !item.installed && (
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api.extensionToggle!({
                            projectId,
                            id: item.id,
                            enabled: item.enabled === false,
                          });
                          await refresh();
                        })
                      }
                    >
                      {item.enabled === false
                        ? pl
                          ? "Włącz"
                          : "Enable"
                        : pl
                          ? "Wyłącz"
                          : "Disable"}
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setRemove(item)}
                  >
                    {pl ? "Usuń" : "Remove"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!loading && !filtered.length && (
        <p role="status">
          {pl
            ? "Brak pasujących skilli lub narzędzi."
            : "No matching skills or tools."}
        </p>
      )}
      <p className="helper">
        {pl
          ? "Skille nie są wykonywane. Wybierz je w szczegółach zadania, aby dołączyć instrukcje do podglądu kontekstu."
          : "Skills are not executed. Select them in task details to add their instructions to the context preview."}
      </p>
      <details className="extension-import">
        <summary>
          {pl ? "Importuj manifest JSON" : "Import JSON manifest"}
        </summary>
        <div className="button-row" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="ghost"
            onClick={() => setManifest(sample)}
          >
            {pl ? "Szablon: Skill" : "Template: Skill"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setManifest(pluginSample)}
          >
            {pl ? "Szablon: Plugin" : "Template: Plugin"}
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api.extensionImport({ projectId, manifest, consent: true });
              await refresh();
              setConsent(false);
            });
          }}
        >
          <label>
            {pl ? "Manifest (skill lub mcp)" : "Manifest (skill or mcp)"}
            <textarea
              className="code-input"
              rows={10}
              maxLength={32000}
              value={manifest}
              onChange={(e) => setManifest(e.target.value)}
              disabled={busy}
              required
            />
          </label>
          <p className="helper">
            {pl
              ? "MCP: kind=mcp, name, version, author, license, source, command (pełna ścieżka), args (tablica). Bez instrukcji, kluczy i sekretów. Program działa z uprawnieniami użytkownika; import nie uruchamia go."
              : "MCP: kind=mcp, name, version, author, license, source, command (absolute path), args (array). No instructions, keys or secrets. The program runs with your user permissions; importing does not launch it."}
          </p>
          <label className="dependency-choice consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              {pl
                ? "Sprawdziłem źródło, licencję i treść. Ufam temu rozszerzeniu."
                : "I reviewed the source, license and contents. I trust this extension."}
            </span>
          </label>
          <button className="primary" disabled={busy || !consent}>
            {pl ? "Importuj do projektu" : "Import into project"}
          </button>
        </form>
      </details>
      <div className="mcp-console">
        <h3>{pl ? "Narzędzia MCP" : "MCP tools"}</h3>
        <p className="helper">
          {pl
            ? "Połączenie stdio 2025-11-25. Narzędzia wywołujesz ręcznie; agent nie ma do nich automatycznego dostępu. Lokalny serwer musi sam zapewniać swoją izolację."
            : "Stdio compatibility protocol 2025-11-25. Calls are manual; agents do not automatically receive these tools. The local server must enforce its own isolation."}
        </p>
        {!items.some((i) => i.kind === "mcp") ? (
          <p className="empty-list">
            {pl
              ? "Zaimportuj manifest zaufanego serwera MCP."
              : "Import a trusted MCP server manifest to begin."}
          </p>
        ) : (
          <>
            <SelectField
              label={pl ? "Serwer MCP" : "MCP server"}
              value={selected}
              disabled={busy || !!tools.length}
              onChange={setSelected}
              options={[
                { value: "", label: pl ? "Wybierz serwer" : "Choose server" },
                ...items
                  .filter((i) => i.kind === "mcp")
                  .map((i) => ({ value: i.id, label: i.name })),
              ]}
            />
            <div className="button-row">
              <button
                className="secondary"
                disabled={busy || !selected || !!tools.length}
                onClick={() =>
                  void act(async () => {
                    const found = await api.mcpConnect({
                      projectId,
                      id: selected,
                      consent: true,
                    });
                    setTools(found);
                    setTool(found[0]?.name ?? "");
                  })
                }
              >
                {pl
                  ? "Uruchom zaufany serwer i pobierz narzędzia"
                  : "Start trusted server and list tools"}
              </button>
              <button
                className="secondary"
                disabled={busy || !selected}
                onClick={() =>
                  void act(async () => {
                    await api.mcpDisconnect({ projectId, id: selected });
                    setTools([]);
                    setTool("");
                  })
                }
              >
                {pl ? "Rozłącz" : "Disconnect"}
              </button>
            </div>
            {!!tools.length && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    const parsed = JSON.parse(args);
                    if (
                      !parsed ||
                      Array.isArray(parsed) ||
                      typeof parsed !== "object"
                    )
                      throw Error();
                    setPending({ id: selected, name: tool, arguments: parsed });
                  } catch {
                    setError(true);
                  }
                }}
              >
                <SelectField
                  label={pl ? "Narzędzie" : "Tool"}
                  value={tool}
                  disabled={busy}
                  onChange={setTool}
                  options={tools.map((t) => ({ value: t.name, label: t.name }))}
                />
                <p className="helper">
                  {tools.find((t) => t.name === tool)?.description}
                </p>
                <details>
                  <summary>
                    {pl ? "Schemat argumentów" : "Argument schema"}
                  </summary>
                  <pre>
                    {JSON.stringify(
                      tools.find((t) => t.name === tool)?.inputSchema,
                      null,
                      2,
                    )}
                  </pre>
                </details>
                {(() => {
                  const activeTool = tools.find((t) => t.name === tool);
                  const props = activeTool?.inputSchema?.properties as
                    | Record<string, { type?: string; description?: string }>
                    | undefined;
                  const keys = props ? Object.keys(props).slice(0, 8) : [];
                  if (!keys.length) return null;
                  let currentObj: Record<string, unknown> = {};
                  try {
                    const p = JSON.parse(args);
                    if (p && typeof p === "object" && !Array.isArray(p))
                      currentObj = p as Record<string, unknown>;
                  } catch {}
                  return (
                    <div className="mcp-schema-fields">
                      <span className="helper">
                        {pl
                          ? "Szybki formularz z inputSchema:"
                          : "Quick form from inputSchema:"}
                      </span>
                      {keys.map((fieldKey) => {
                        const fieldSpec = props![fieldKey];
                        return (
                          <label key={fieldKey}>
                            {fieldKey}
                            {fieldSpec?.description
                              ? ` (${fieldSpec.description})`
                              : ""}
                            <input
                              value={
                                currentObj[fieldKey] !== undefined
                                  ? String(currentObj[fieldKey])
                                  : ""
                              }
                              disabled={busy}
                              onChange={(e) => {
                                const val =
                                  fieldSpec?.type === "number" ||
                                  fieldSpec?.type === "integer"
                                    ? Number(e.target.value)
                                    : fieldSpec?.type === "boolean"
                                      ? e.target.value === "true"
                                      : e.target.value;
                                const next = {
                                  ...currentObj,
                                  [fieldKey]: val,
                                };
                                setArgs(JSON.stringify(next, null, 2));
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                  );
                })()}
                <label>
                  {pl ? "Argumenty JSON" : "JSON arguments"}
                  <textarea
                    className="code-input"
                    rows={4}
                    value={args}
                    maxLength={16000}
                    disabled={busy}
                    onChange={(e) => setArgs(e.target.value)}
                  />
                </label>
                <button className="primary" disabled={busy || !tool}>
                  {pl ? "Sprawdź wywołanie" : "Review call"}
                </button>
              </form>
            )}
          </>
        )}
        {result && (
          <div className="run-output" role="status">
            <div className="diff-toolbar">
              <strong>
                {result.isError
                  ? pl
                    ? "Narzędzie zgłosiło błąd"
                    : "Tool returned an error"
                  : pl
                    ? "Wynik narzędzia"
                    : "Tool result"}
              </strong>
              {!result.isError && result.text.trim() && (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || pinnedNotice}
                  onClick={() =>
                    void act(async () => {
                      await api.createMemory({
                        projectId,
                        source: `mcp:${tool || "tool"}`,
                        scope: "project",
                        content: result.text.slice(0, 7500),
                      });
                      setPinnedNotice(true);
                    })
                  }
                >
                  <Icon name="memory" />
                  {pinnedNotice
                    ? pl
                      ? "Przypięto do Pamięci Projektu"
                      : "Pinned to Project Memory"
                    : pl
                      ? "Przypnij wynik do Pamięci Projektu"
                      : "Pin result to Project Memory"}
                </button>
              )}
            </div>
            <pre>{result.text}</pre>
          </div>
        )}
      </div>
      {pending && (
        <Modal
          open
          titleId="tool-confirm-title"
          onClose={() => setPending(null)}
        >
          <h2 id="tool-confirm-title">
            {pl ? "Potwierdź wywołanie narzędzia" : "Confirm tool call"}
          </h2>
          <p>
            {pl
              ? "Zaufany serwer wykona to polecenie z własnymi uprawnieniami."
              : "The trusted server will execute this call with its own permissions."}
          </p>
          <pre>
            {pending.name + "\n" + JSON.stringify(pending.arguments, null, 2)}
          </pre>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setPending(null)}>
              {pl ? "Anuluj" : "Cancel"}
            </button>
            <button
              className="primary"
              onClick={() => {
                const call = pending;
                setPending(null);
                setPinnedNotice(false);
                void act(async () =>
                  setResult(
                    await api.mcpCall({ projectId, ...call, consent: true }),
                  ),
                );
              }}
            >
              {pl ? "Wywołaj raz" : "Run once"}
            </button>
          </div>
        </Modal>
      )}
      {remove && (
        <Modal
          open
          titleId="extension-remove-title"
          onClose={() => setRemove(null)}
        >
          <h2 id="extension-remove-title">
            {pl ? "Usunąć rozszerzenie?" : "Remove extension?"}
          </h2>
          <p>{remove.name}</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setRemove(null)}>
              {pl ? "Anuluj" : "Cancel"}
            </button>
            <button
              className="primary"
              onClick={() => {
                const id = remove.id;
                setRemove(null);
                void act(async () => {
                  await api.extensionRemove({ projectId, id });
                  if (selected === id) {
                    setSelected("");
                    setTools([]);
                  }
                  await refresh();
                });
              }}
            >
              {pl ? "Usuń" : "Remove"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

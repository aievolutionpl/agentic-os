import React, { useEffect, useState } from "react";
import type { Extension, Memory, Project } from "../shared";
import { Icon, Modal } from "./ui";
import { MemoryGraphPanel } from "./MemoryGraphPanel";
import { skillBenefits } from "./skill-benefits";
import { copyText } from "./clipboard";

export function SkillsHub({
  language,
  projects,
  onChat,
}: {
  language: "pl" | "en";
  projects: Project[];
  onChat: () => void;
}) {
  const api = window.agenting!,
    pl = language === "pl";
  const [items, setItems] = useState<Extension[]>([]),
    [project, setProject] = useState(projects[0]?.id ?? ""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [selected, setSelected] = useState<Extension | null>(null),
    [studioOpen, setStudioOpen] = useState(false),
    [customName, setCustomName] = useState(""),
    [customDesc, setCustomDesc] = useState(""),
    [customLicense, setCustomLicense] = useState("MIT"),
    [customBody, setCustomBody] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!project && projects.length) setProject(projects[0].id);
  }, [projects, project]);
  async function load() {
    setItems(
      project
        ? await api.extensionList({ projectId: project })
        : await api.skillCatalog!(),
    );
  }
  useEffect(() => {
    void load().catch(() =>
      setError(
        pl
          ? "Nie udało się wczytać biblioteki."
          : "Could not load the library.",
      ),
    );
  }, [project]);
  function matchCategory(s: Extension, cat: string) {
    if (cat === "all") return true;
    const slug = s.slug ?? s.name;
    if (cat === "gws") return slug.startsWith("gws-");
    if (cat === "growth")
      return slug === "marketingskills" || slug === "humanizer";
    if (cat === "design")
      return (
        slug === "taste-skill" ||
        slug === "archify" ||
        slug === "frontend-design"
      );
    if (cat === "browser")
      return (
        slug === "browserbase-skills" ||
        slug === "mcp-builder" ||
        slug === "webapp-testing"
      );
    if (cat === "engineering")
      return (
        slug === "addyosmani-agent-skills" ||
        slug === "awesome-claude-skills" ||
        slug === "agentskills-spec" ||
        slug === "systematic-debugging" ||
        slug === "test-driven-development" ||
        slug === "verification-before-completion" ||
        slug === "requesting-code-review" ||
        slug === "skill-creator"
      );
    return true;
  }
  const visible = items.filter(
    (s) =>
      s.kind === "skill" &&
      matchCategory(s, category) &&
      `${s.name} ${s.author} ${s.instructions}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function installBatch(targets: Extension[]) {
    if (!project || !targets.length) return;
    setBusy(true);
    setError("");
    try {
      for (const s of targets) {
        if (!s.installed && s.slug) {
          await api.skillInstall!({ projectId: project, id: s.id, download:true });
        }
      }
      await load();
    } catch {
      await load();
      setError(
        pl
          ? "Nie wszystkie skille zostały dodane. Sprawdź, czy folder projektu istnieje; ukończone instalacje są już widoczne."
          : "Could not install all skills in the batch.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="knowledge-hub">
      <header className="evolution-banner library-banner">
        <div>
          <span className="banner-kicker">AI EVOLUTION / SKILL LIBRARY</span>
          <h1>
            {pl
              ? "Dobre praktyki.\nWbudowane w zespół."
              : "Good practice.\nBuilt into your team."}
          </h1>
          <p>
            {pl
              ? "UI, development i weryfikacja. Wybierz kompetencje, które agent zabierze do zadania."
              : "UI, development and verification. Choose the expertise your agent takes into each task."}
          </p>
        </div>
      </header>
      <div className="hub-toolbar">
        <label className="hub-search">
          <Icon name="search" />
          <input
            aria-label={pl ? "Szukaj skilli" : "Search skills"}
            placeholder={
              pl
                ? "Szukaj: UI, debugging, testy…"
                : "Search: UI, debugging, tests…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label={pl ? "Projekt dla skilli" : "Skills project"}
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          <option value="">
            {pl ? "Biblioteka wbudowana" : "Built-in library"}
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="secondary"
          disabled={!project || busy}
          title={
            !project
              ? pl
                ? "Wybierz projekt, do którego zaimportować skill."
                : "Select a project for the import."
              : undefined
          }
          onClick={() => {
            setBusy(true);
            setError("");
            void api.skillImportFile!({ projectId: project })
              .then(() => load())
              .catch(() =>
                setError(
                  pl
                    ? "Import nie powiódł się. Wybierz plik SKILL.md do 12 000 znaków."
                    : "Import failed. Choose a SKILL.md file up to 12,000 characters.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <Icon name="download" />
          {pl ? "Importuj SKILL.md" : "Import SKILL.md"}
        </button>
        {api.skillCreateCustom && (
          <button
            type="button"
            className="secondary"
            disabled={!project || busy}
            onClick={() => {
              setError("");
              setStudioOpen(true);
            }}
          >
            <Icon name="code" />
            {pl ? "Kreator SKILL.md" : "SKILL.md Studio"}
          </button>
        )}
        {project && visible.some((s) => !s.installed && s.slug) && (
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void installBatch(visible.filter((s) => !s.installed && s.slug))
            }
          >
            <Icon name="plus" />
            {pl
              ? `Dodaj widoczne (${visible.filter((s) => !s.installed && s.slug).length})`
              : `Add visible (${visible.filter((s) => !s.installed && s.slug).length})`}
          </button>
        )}
      </div>
      <div
        className="skill-categories"
        style={{
          display: "flex",
          gap: "0.45rem",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        {[
          { id: "all", label: pl ? `Wszystkie (${items.filter(s=>s.kind === "skill").length})` : `All (${items.filter(s=>s.kind === "skill").length})` },
          { id: "engineering", label: pl ? "Inżynieria & SDLC" : "Engineering & SDLC" },
          { id: "design", label: pl ? "UI, Taste & Archify" : "UI, Taste & Archify" },
          { id: "gws", label: "Google Workspace (GWS)" },
          { id: "growth", label: pl ? "Marketing & Humanizer" : "Marketing & Humanizer" },
          { id: "browser", label: "Browserbase & MCP" },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={category === cat.id ? "primary" : "secondary"}
            style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem" }}
            onClick={() => setCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <p className="helper">
        {pl
          ? "Wybierz projekt i dodaj skill jednym przyciskiem. Instrukcja zostanie pobrana z przypiętej wersji GitHub i sprawdzona. Pełny pakiet z dołączonymi zasobami trafi do .agents/skills, a agenci dostaną go w kontekście. Instalacja zapisuje źródło w pamięci projektu; skrypty nie uruchamiają się automatycznie."
          : "Choose a project and add a skill with one click. The full package goes to .agents/skills and becomes available to its agents. Installation records its source in project memory; scripts do not run automatically."}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="skill-library">
        {visible.map((skill, i) => (
          <article key={skill.id}>
            <span className={`skill-art skill-art-${i % 3}`}>
              <Icon
                name={
                  /design|UI|taste|archify/i.test(skill.name)
                    ? "palette"
                    : /test|verification|review|agent-skills|spec/i.test(
                          skill.name,
                        )
                      ? "shield"
                      : "code"
                }
              />
            </span>
            <div>
              <span className="skill-origin">
                {skill.source.includes("officialskills.sh/googleworkspace")
                  ? "OFFICIALSKILLS.SH · GOOGLE WORKSPACE"
                  : skill.source.includes("officialskills.sh/browserbase")
                    ? "OFFICIALSKILLS.SH · BROWSERBASE"
                    : skill.source.includes("github.com")
                      ? "OPEN SOURCE · GITHUB"
                      : "AI EVOLUTION POLSKA"}
              </span>
              <h2>{skill.name}</h2>
              <p className="skill-benefit">{pl ? (skillBenefits[skill.slug ?? ""]?.[0] ?? "Własna instrukcja pracy agenta. Otwórz szczegóły, aby poznać jej zastosowanie.") : skill.description ?? skill.name}</p>
              {pl && skillBenefits[skill.slug ?? ""] && <p className="skill-power">{skillBenefits[skill.slug ?? ""]![1]}</p>}
              <p>
                {skill.author} · {skill.license}
              </p>
              <small>
                {skill.files ?? 1} {pl ? "plików" : "files"} ·{" "}
                {skill.version.slice(0, 12)}
              </small>
            </div>
            <button className="secondary" onClick={() => setSelected(skill)}>
              {pl ? "Zobacz instrukcje" : "View instructions"}
              <Icon name="arrow" />
            </button>
            <button
              className={skill.installed ? "secondary" : "primary"}
              disabled={!project || busy || skill.installed || !skill.slug}
              onClick={() => {
                setBusy(true);
                setError("");
                void api.skillInstall!({ projectId: project, id: skill.id, download:true })
                  .then(load)
                  .catch(() =>
                    setError(
                      pl
                        ? "Nie udało się dodać skilla. Folder wybranego projektu musi istnieć. Wybierz poprawny projekt; istniejących skilli nie nadpisujemy."
                        : "Could not install skill. Check the project folder; existing files are preserved.",
                    ),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              <Icon name={skill.installed ? "check" : "plus"} />
              {skill.installed
                ? pl
                  ? "Dodano do projektu"
                  : "Added to project"
                : pl
                  ? "Dodaj do workspace"
                  : "Add to workspace"}
            </button>
          </article>
        ))}
      </div>
      {!visible.length && (
        <p className="empty-hint">
          {pl ? "Brak pasujących skilli." : "No matching skills."}
        </p>
      )}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        titleId="skill-preview-title"
        className="skill-preview"
      >
        <h2 id="skill-preview-title">{selected?.name}</h2>
        <p className="helper">
          {selected?.author} · {selected?.license} · {selected?.version}
        </p>
        <p className="source-line">{selected?.source}</p>
        <pre>{selected?.instructions}</pre>
        <div className="panel-actions">
          <button className="secondary" onClick={() => setSelected(null)}>
            {pl ? "Zamknij" : "Close"}
          </button>
          <button
            className="primary"
            onClick={() => {
              setSelected(null);
              onChat();
            }}
          >
            <Icon name="message" />
            {pl ? "Przejdź do czatu" : "Go to chat"}
          </button>
        </div>
      </Modal>
      <Modal
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        titleId="skill-studio-title"
        className="skill-preview"
      >
        <h2 id="skill-studio-title">
          {pl
            ? "SKILL.md Studio — Utwórz własny skill projektowy"
            : "SKILL.md Studio — Create custom project skill"}
        </h2>
        <p className="helper">
          {pl
            ? "Zapisuje pakiet bezpośrednio w .agents/skills/<slug>/SKILL.md wybranego projektu oraz w pamięci kontekstowej."
            : "Writes the package directly to .agents/skills/<slug>/SKILL.md in the selected project and registers it in project memory."}
        </p>
        <div className="harness-slash-bar" style={{ padding: "4px 0 10px" }}>
          <span className="harness-slash-label">
            {pl ? "Szablon:" : "Template:"}
          </span>
          {[
            {
              label: "Engineering & TDD",
              name: "Project Engineering Standard",
              desc: "Enforces strict TypeScript types, deterministic unit tests, and small atomic diffs.",
              body: "# Project Engineering Standard\n\n## Rules\n1. Always run `npm run typecheck` and `npm test` before completing a task.\n2. Keep functions modular and validate all external inputs at boundaries.\n3. Never modify unrelated files or remove existing tests.",
            },
            {
              label: "UI & Design System",
              name: "Project Design System",
              desc: "Maintains visual consistency, theme token usage, and WCAG AA accessibility.",
              body: "# Project Design System\n\n## Rules\n1. Always use CSS variables (`--bg`, `--surface`, `--text`, `--accent`) instead of hardcoded hex values.\n2. Ensure full keyboard navigation (`Tab`, `Enter`, `Escape`) and ARIA labels.\n3. Verify layout across both wide desktop and narrow mobile viewports.",
            },
            {
              label: "API & Security Gate",
              name: "API Security & Contracts",
              desc: "Audits IPC/HTTP boundaries, input schemas, and secret redaction.",
              body: "# API Security & Contracts\n\n## Rules\n1. Validate every payload with strict schema checks (`exact`, `text`).\n2. Redact sensitive tokens or credentials before persisting logs or memory.\n3. Return deterministic error codes.",
            },
          ].map((tpl) => (
            <button
              key={tpl.label}
              type="button"
              className="slash-chip"
              onClick={() => {
                setCustomName(tpl.name);
                setCustomDesc(tpl.desc);
                setCustomBody(tpl.body);
              }}
            >
              <strong>+</strong>
              <span>{tpl.label}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gap: "10px", margin: "8px 0" }}>
          <label>
            {pl ? "Nazwa skilla" : "Skill name"}
            <input
              value={customName}
              maxLength={80}
              placeholder="np. Project Architecture Rules"
              onChange={(e) => setCustomName(e.target.value)}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px" }}>
            <label>
              {pl ? "Krótki opis (YAML description)" : "Short description (YAML)"}
              <input
                value={customDesc}
                maxLength={240}
                placeholder="When and how agents should apply this skill…"
                onChange={(e) => setCustomDesc(e.target.value)}
              />
            </label>
            <label>
              {pl ? "Licencja" : "License"}
              <input
                value={customLicense}
                maxLength={60}
                onChange={(e) => setCustomLicense(e.target.value)}
              />
            </label>
          </div>
          <label>
            {pl ? "Instrukcje Markdown (SKILL.md body)" : "Markdown instructions (SKILL.md body)"}
            <textarea
              rows={7}
              maxLength={10000}
              value={customBody}
              placeholder="# Instructions\n\n1. Follow project conventions…"
              onChange={(e) => setCustomBody(e.target.value)}
            />
          </label>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => setStudioOpen(false)}
          >
            {pl ? "Anuluj" : "Cancel"}
          </button>
          <button
            type="button"
            className="primary"
            disabled={
              busy ||
              !project ||
              !customName.trim() ||
              !customDesc.trim() ||
              !customBody.trim()
            }
            onClick={() => {
              setBusy(true);
              setError("");
              void api
                .skillCreateCustom!({
                  projectId: project,
                  name: customName.trim(),
                  description: customDesc.trim(),
                  license: customLicense.trim() || "MIT",
                  instructions: customBody.trim(),
                })
                .then(async () => {
                  setStudioOpen(false);
                  setCustomName("");
                  setCustomDesc("");
                  setCustomBody("");
                  await load();
                })
                .catch(() =>
                  setError(
                    pl
                      ? "Nie udało się utworzyć skilla. Sprawdź poprawność pól."
                      : "Could not create custom skill. Check all fields.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            <Icon name="check" />
            {pl ? "Zapisz w .agents/skills" : "Save to .agents/skills"}
          </button>
        </div>
      </Modal>
    </section>
  );
}

export function MemoryHub({
  language,
  projects,
  onNewProject,
}: {
  language: "pl" | "en";
  projects: Project[];
  onNewProject: () => void;
}) {
  const api = window.agenting!,
    pl = language === "pl";
  const [rows, setRows] = useState<Memory[]>([]),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [editing, setEditing] = useState<Memory | null>(null),
    [creating, setCreating] = useState(false),
    [content, setContent] = useState(""),
    [scope, setScope] = useState<"project" | "workspace">("project"),
    [pinned, setPinned] = useState(false),
    [projectId, setProjectId] = useState(projects[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [exportedBundle, setExportedBundle] = useState(false),
    [exportProject, setExportProject] = useState(""),
    [deleting, setDeleting] = useState<Memory | null>(null);
  async function load() {
    setRows(await api.memoryList!());
  }
  useEffect(() => {
    void load().catch(() =>
      setError(
        pl ? "Nie udało się wczytać pamięci." : "Could not load memory.",
      ),
    );
  }, []);
  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].id);
  }, [projects]);
  function open(entry?: Memory) {
    setEditing(entry ?? null);
    setCreating(!entry);
    setContent(entry?.content ?? "");
    setScope(entry?.scope ?? "project");
    setPinned(!!entry?.pinned);
    setProjectId(entry?.projectId ?? projects[0]?.id ?? "");
    setError("");
  }
  async function save() {
    setBusy(true);
    try {
      let item = editing;
      if (!item)
        item = await api.createMemory({
          projectId,
          content,
          source: "user:memory-hub",
          scope,
        });
      await api.memoryUpdate!({
        projectId: item.projectId,
        id: item.id,
        content,
        scope,
        pinned,
      });
      setEditing(null);
      setCreating(false);
      await load();
    } catch {
      setError(pl ? "Nie udało się zapisać wpisu." : "Could not save entry.");
    } finally {
      setBusy(false);
    }
  }
  const visible = rows.filter(
    (m) =>
      (filter === "all" ||
        (filter === "pinned" && m.pinned) ||
        m.scope === filter) &&
      `${m.content} ${m.source}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="knowledge-hub">
      <header className="evolution-banner library-banner">
        <div>
          <span className="banner-kicker">AI EVOLUTION / SHARED MEMORY</span>
          <h1>
            {pl
              ? "Wspólna pamięć"
              : "Shared memory"}
          </h1>
          <p>
            {pl
              ? "Decyzje, standardy i wiedza projektu. Przypnij to, co każdy agent powinien wiedzieć."
              : "Decisions, standards and project knowledge. Pin what every agent should know."}
          </p>
        </div>
      </header>
      <MemoryGraphPanel
        pl={pl}
        onUpdated={() => void load()}
        onSelect={(id) => {
          const entry = rows.find((m) => m.id === id);
          if (entry) open(entry);
        }}
      />
      <div className="hub-toolbar">
        <label className="hub-search">
          <Icon name="search" />
          <input
            aria-label={pl ? "Szukaj w pamięci" : "Search memory"}
            placeholder={
              pl ? "Znajdź ustalenie lub źródło…" : "Find a decision or source…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label={pl ? "Zakres pamięci" : "Memory filter"}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">{pl ? "Wszystkie wpisy" : "All entries"}</option>
          <option value="workspace">
            {pl ? "Wspólna pamięć" : "Shared memory"}
          </option>
          <option value="project">
            {pl ? "Prywatne dla projektu" : "Project private"}
          </option>
          <option value="pinned">{pl ? "Przypięte" : "Pinned"}</option>
        </select>
        <button
          className="primary"
          onClick={() => (projects.length ? open() : onNewProject())}
        >
          <Icon name="plus" />
          {pl ? "Nowy wpis" : "New entry"}
        </button>
        {api.memoryExport && <>
          <select aria-label={pl ? "Projekt do eksportu pamięci" : "Memory export project"} value={exportProject} onChange={e => { setExportProject(e.target.value); setExportedBundle(false); }}>
            <option value="">{pl ? "Wybierz projekt do eksportu" : "Choose export project"}</option>
            {projects.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
          </select>
          <button type="button" className="secondary" disabled={!exportProject || busy}
            onClick={() => {
              setBusy(true); setError(""); setExportedBundle(false);
              void api.memoryExport!({ projectId: exportProject }).then(copyText)
                .then(() => setExportedBundle(true))
                .catch(() => setError(pl ? "Eksport nie powiódł się. Sprawdź wybrany projekt i rozmiar pamięci (do 100 wpisów / 200 000 znaków)." : "Export failed. Check the project and memory size (up to 100 entries / 200,000 characters)."))
                .finally(() => setBusy(false));
            }}><Icon name={exportedBundle ? "check" : "copy"} />{exportedBundle ? (pl ? "Skopiowano AGENTS.md" : "Copied AGENTS.md") : (pl ? "Eksportuj AGENTS.md" : "Export AGENTS.md")}</button>
        </>}
      </div>
      <div className="memory-policy">
        <Icon name="shield" />
        <p>
          {pl
            ? "Przypięte wpisy trafiają automatycznie do kontekstu czatów, Mastera i zadań. Wpis projektu widzą wyłącznie jego agenci. Wpis workspace jest dostępny we wszystkich projektach. Kontekst ma limit rozmiaru."
            : "Pinned entries are included in chats, Master plans and tasks. Project entries stay within their project; workspace entries are available across projects. Context has a size limit."}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="memory-library">
        {visible.map((m) => (
          <article key={m.id}>
            <span className={`memory-scope ${m.scope}`}>
              <Icon
                name={
                  m.pinned
                    ? "pin"
                    : m.scope === "workspace"
                      ? "globe"
                      : "folder"
                }
              />
              {m.scope === "workspace"
                ? pl
                  ? "Wspólna"
                  : "Shared"
                : (projects.find((p) => p.id === m.projectId)?.name ??
                  "Project")}
              {m.pinned ? " · " + (pl ? "przypięta" : "pinned") : ""}
            </span>
            <p>{m.content}</p>
            <footer>
              <small title={m.source}>
                {m.source} ·{" "}
                {new Date(m.updatedAt ?? m.createdAt).toLocaleDateString(
                  language,
                )}
              </small>
              <button
                className="icon-button"
                aria-label={pl ? "Edytuj wpis" : "Edit entry"}
                onClick={() => open(m)}
              >
                <Icon name="edit" />
              </button>
              <button
                className="icon-button"
                aria-label={pl ? "Usuń wpis" : "Delete entry"}
                onClick={() => setDeleting(m)}
              >
                <Icon name="trash" />
              </button>
            </footer>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="conversation-empty">
          <Icon name="memory" />
          <h2>
            {pl
              ? "Zacznij od jednej ważnej decyzji."
              : "Start with one important decision."}
          </h2>
          <p>
            {pl
              ? "Zapisz standardy kodu, preferencje UI lub ustalenia zespołu. Możesz też zapisać wybraną odpowiedź z czatu."
              : "Save coding standards, UI preferences or team decisions. You can also save an answer from chat."}
          </p>
        </div>
      )}
      <Modal
        open={creating || !!editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        titleId="memory-edit-title"
      >
        <h2 id="memory-edit-title">
          {pl ? "Wiedza dla agentów" : "Knowledge for your agents"}
        </h2>
        <label>
          {pl ? "Projekt źródłowy" : "Source project"}
          <select
            aria-label={pl ? "Projekt źródłowy" : "Source project"}
            value={projectId}
            disabled={!!editing || busy}
            onChange={(e) => setProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {pl ? "Treść" : "Content"}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={20000}
          />
        </label>
        <label>
          {pl ? "Widoczność" : "Visibility"}
          <select
            aria-label={pl ? "Widoczność" : "Visibility"}
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="project">
              {pl ? "Tylko projekt" : "Project only"}
            </option>
            <option value="workspace">
              {pl
                ? "Wszyscy agenci, wszystkie projekty"
                : "All agents, all projects"}
            </option>
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
          />
          {pl
            ? "Przypnij i dołączaj automatycznie do kontekstu"
            : "Pin and include in context automatically"}
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="panel-actions">
          <button
            className="secondary"
            onClick={() => {
              setCreating(false);
              setEditing(null);
            }}
          >
            {pl ? "Anuluj" : "Cancel"}
          </button>
          <button
            className="primary"
            disabled={busy || !content.trim() || !projectId}
            onClick={() => void save()}
          >
            {pl ? "Zapisz" : "Save"}
          </button>
        </div>
      </Modal>
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        titleId="memory-delete-title"
      >
        <h2 id="memory-delete-title">
          {pl ? "Usunąć wpis pamięci?" : "Delete memory entry?"}
        </h2>
        <p>
          {pl
            ? "Nie będzie dołączany do nowych zapytań. Istniejące misje zachowają swój zapisany kontekst."
            : "It will no longer be included in new requests. Existing missions retain their frozen context."}
        </p>
        <div className="panel-actions">
          <button onClick={() => setDeleting(null)}>
            {pl ? "Anuluj" : "Cancel"}
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              if (!deleting) return;
              setBusy(true);
              void api
                .deleteMemory({
                  projectId: deleting.projectId,
                  id: deleting.id,
                })
                .then(() => {
                  setDeleting(null);
                  return load();
                })
                .catch(() =>
                  setError(
                    pl
                      ? "Nie udało się usunąć wpisu."
                      : "Could not delete entry.",
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {pl ? "Usuń" : "Delete"}
          </button>
        </div>
      </Modal>
    </section>
  );
}

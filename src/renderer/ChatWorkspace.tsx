import React, { useEffect, useRef, useState } from "react";
import type {
  Agent,
  ChatMessage,
  ChatSession,
  Extension,
  Memory,
  Project,
  ProviderSetting,
} from "../shared";
import { AGENTS, READ_ONLY_AGENTS } from "../shared";
import { Icon, Modal, agentName } from "./ui";
import { ProviderIcon } from "./ProviderIcon";

function MessageText({ content }: { content: string }) {
  return (
    <div className="message-text">
      {content.split(/```/).map((part, i) =>
        i % 2 ? (
          <pre key={i}>
            <code>{part.replace(/^[\w-]+\n/, "")}</code>
          </pre>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}
const errors: Record<string, [string, string]> = {
  PROVIDER_NOT_CONFIGURED: [
    "Najpierw podłącz wybranego agenta w Połączeniach.",
    "Connect this agent in Connections first.",
  ],
  READ_ONLY_PROVIDER_REQUIRED: [
    "Ten agent nie udostępnia zweryfikowanego trybu planowania. Wybierz tryb rozmowy lub innego agenta.",
    "This agent has no verified planning mode. Choose chat or another agent.",
  ],
  GITHUB_CLONE_FAILED: [
    "Nie udało się pobrać repozytorium. Sprawdź adres, zainstaluj GitHub CLI i zaloguj się przez gh auth login.",
    "Could not clone the repository. Check the name and sign in with gh auth login.",
  ],
  ISOLATED_GIT_WORKSPACE_REQUIRED: [
    "Hermes i Antigravity wymagają czystego repozytorium Git do utworzenia osobnego worktree. Możesz też użyć domyślnego workspace.",
    "Hermes and Antigravity require a clean Git repository for an isolated worktree, or use the default workspace.",
  ],
  QUOTA_EXHAUSTED: [
    "Odczyt dostawcy wskazuje wyczerpany limit. Sprawdź OpenQuota.",
    "The provider reports an exhausted quota. Check OpenQuota.",
  ],
  CHAT_CANCELLED: ["Odpowiedź została zatrzymana.", "Response stopped."],
  CHAT_INTERRUPTED: [
    "Aplikacja została zamknięta podczas odpowiedzi. Możesz wysłać kolejną wiadomość.",
    "The app closed during the response. You can send another message.",
  ],
  CHAT_CONTEXT_FULL: [
    "Historia przekroczyła budżet kontekstu. Zapisz podsumowanie w pamięci i rozpocznij nowy czat.",
    "History reached the context budget. Save a summary to memory and start a new chat.",
  ],
  CONTEXT_BUDGET_EXCEEDED: [
    "Zbyt dużo pamięci lub skilli. Zmniejsz wybrany kontekst.",
    "Too much memory or too many skills. Reduce selected context.",
  ],
};
export function ChatWorkspace({
  language,
  projects,
  onConfigure,
  onProjectsChanged,
  onTask,
}: {
  language: "pl" | "en";
  projects: Project[];
  onConfigure: () => void;
  onProjectsChanged: () => void;
  onTask: (projectId: string) => void;
}) {
  const api = window.agenting!,
    pl = language === "pl";
  const [sessions, setSessions] = useState<ChatSession[]>([]),
    [selected, setSelected] = useState("");
  const [agent, setAgent] = useState<Agent>("codex"),
    [mode, setMode] = useState<"chat" | "plan">("chat"),
    [source, setSource] = useState<"default" | "local" | "github">("default");
  const [path, setPath] = useState(""),
    [repository, setRepository] = useState(""),
    [existing, setExisting] = useState("");
  const [providers, setProviders] = useState<ProviderSetting[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [memory, setMemory] = useState<Memory[]>([]),
    [skills, setSkills] = useState<Extension[]>([]),
    [memoryIds, setMemoryIds] = useState<string[]>([]),
    [skillIds, setSkillIds] = useState<string[]>([]);
  const [saving, setSaving] = useState<ChatMessage | null>(null),
    [note, setNote] = useState(""),
    [scope, setScope] = useState<"project" | "workspace">("project"),
    [notice, setNotice] = useState("");
  const [handoff, setHandoff] = useState<ChatMessage | null>(null),
    [reviewer, setReviewer] = useState<Agent>("claude");
  const bottom = useRef<HTMLDivElement>(null),
    current = useRef(selected),
    live = useRef(true);
  const chat = sessions.find((s) => s.id === selected),
    running = chat?.status === "running";
  current.current = selected;
  const explain = (value: string) => {
    const key = Object.keys(errors).find((k) => value.includes(k));
    return key
      ? errors[key][pl ? 0 : 1]
      : pl
        ? "Operacja nie powiodła się. Sprawdź połączenie agenta i spróbuj ponownie."
        : "Operation failed. Check the agent connection and try again.";
  };
  async function refresh() {
    const rows = await api.chatList!();
    if (live.current) setSessions(rows);
  }
  useEffect(() => {
    live.current = true;
    void Promise.all([
      refresh(),
      api.providerSettings().then(setProviders),
    ]).catch(() => setError("LOAD_FAILED"));
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 1200);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    setMemoryIds(chat?.contextIds ?? []);
    setSkillIds(chat?.skillIds ?? []);
    setError("");
    setNotice("");
    if (!chat) {
      setMemory([]);
      setSkills([]);
      return;
    }
    let active = true;
    void Promise.all([
      api.projectData(chat.projectId),
      api.extensionList({ projectId: chat.projectId }),
    ])
      .then(([data, extensions]) => {
        if (active) {
          setMemory(data.memory);
          setSkills(extensions.filter((e) => e.kind === "skill"));
        }
      })
      .catch(() => setError("LOAD_FAILED"));
    return () => {
      active = false;
    };
  }, [selected, chat?.projectId]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [chat?.messages.length]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const row = await api.chatCreate!({
        agent,
        mode,
        source,
        ...(source === "local"
          ? existing
            ? { projectId: existing }
            : { path }
          : source === "github"
            ? { repository }
            : {}),
      });
      setSessions((rows) => [row, ...rows]);
      setSelected(row.id);
      onProjectsChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!chat || !message.trim() || running || busy) return;
    setBusy(true);
    setError("");
    try {
      const row = await api.chatSend!({
        id: chat.id,
        message,
        contextIds: memoryIds.filter(
          (id) => !memory.find((m) => m.id === id)?.pinned,
        ),
        skillIds,
        consent: true,
      });
      setSessions((rows) => rows.map((s) => (s.id === row.id ? row : s)));
      setMessage("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function action(action: "stop" | "delete") {
    if (!chat) return;
    setBusy(true);
    try {
      await api.chatAction!({ id: chat.id, action });
      if (action === "delete") setSelected("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const toggle = (values: string[], id: string) =>
    values.includes(id) ? values.filter((x) => x !== id) : [...values, id];
  return (
    <section
      className="chat-workspace"
      aria-label={pl ? "Czat z agentem" : "Agent chat"}
    >
      <div className="chat-topline">
        <div>
          <span className="section-eyebrow">
            AI EVOLUTION POLSKA / WORKSPACE
          </span>
          <h1>
            {pl
              ? "Rozmowa, od której zaczyna się praca."
              : "Where the work begins."}
          </h1>
        </div>
        <button
          className="secondary"
          onClick={() => {
            setSelected("");
            setMessage("");
          }}
        >
          <Icon name="plus" />
          {pl ? "Nowy czat" : "New chat"}
        </button>
      </div>
      <div className="chat-layout">
        <aside
          className="chat-history"
          aria-label={pl ? "Historia czatów" : "Chat history"}
        >
          <div className="mini-heading">
            <Icon name="history" />
            {pl ? "Twoje rozmowy" : "Your conversations"}
          </div>
          {!sessions.length && (
            <p className="helper">
              {pl
                ? "Rozmowy zapisują się na tym urządzeniu."
                : "Conversations are saved on this device."}
            </p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              className={selected === s.id ? "active" : ""}
              onClick={() => setSelected(s.id)}
            >
              <ProviderIcon provider={s.agent} />
              <span>
                <strong>{s.title}</strong>
                <small>
                  {agentName(s.agent)} ·{" "}
                  {s.mode === "plan"
                    ? pl
                      ? "plan"
                      : "plan"
                    : pl
                      ? "rozmowa"
                      : "chat"}
                  {s.status === "running" ? " · ●" : ""}
                </small>
              </span>
            </button>
          ))}
        </aside>
        <div className="chat-stage">
          {!chat ? (
            <>
              <header className="evolution-banner chat-banner">
                <div>
                  <span className="banner-kicker">
                    ONE WORKSPACE. YOUR AGENTS.
                  </span>
                  <h2>
                    {pl
                      ? "Twój pomysł.\nTwój agent."
                      : "Your idea.\nYour agent."}
                  </h2>
                  <p>
                    {pl
                      ? "Rozmawiaj, planuj i przekazuj zadania zespołowi. Z pamięcią, która zostaje z Tobą."
                      : "Chat, plan and hand work to your team. With memory that stays with you."}
                  </p>
                </div>
              </header>
              <div className="chat-start-form">
                <div className="form-pair">
                  <label>
                    {pl ? "Agent" : "Agent"}
                    <select
                      aria-label={pl ? "Agent czatu" : "Chat agent"}
                      value={agent}
                      onChange={(e) => {
                        setAgent(e.target.value as Agent);
                        if (!READ_ONLY_AGENTS.includes(e.target.value as Agent))
                          setMode("chat");
                      }}
                    >
                      {AGENTS.map((id) => (
                        <option key={id} value={id}>
                          {agentName(id)}
                          {providers.find((p) => p.id === id)?.configured
                            ? ""
                            : " · " + (pl ? "do połączenia" : "connect first")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {pl ? "Tryb pracy" : "Work mode"}
                    <select
                        aria-label={pl ? "Tryb pracy" : "Work mode"}
                      value={mode}
                      onChange={(e) => setMode(e.target.value as typeof mode)}
                    >
                      <option value="chat">{pl ? "Rozmowa" : "Chat"}</option>
                      <option
                        value="plan"
                        disabled={!READ_ONLY_AGENTS.includes(agent)}
                      >
                        {pl ? "Planowanie" : "Planning"}
                      </option>
                    </select>
                  </label>
                </div>
                <fieldset className="workspace-source">
                  <legend>
                    {pl ? "Gdzie pracujemy?" : "Where are we working?"}
                  </legend>
                  {(["default", "local", "github"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={source === value}
                      className={source === value ? "chosen" : ""}
                      onClick={() => setSource(value)}
                    >
                      <Icon
                        name={
                          value === "default"
                            ? "spark"
                            : value === "local"
                              ? "folder"
                              : "github"
                        }
                      />
                      <strong>
                        {value === "default"
                          ? pl
                            ? "Domyślny"
                            : "Default"
                          : value === "local"
                            ? pl
                              ? "Folder lokalny"
                              : "Local folder"
                            : "GitHub"}
                      </strong>
                      <small>
                        {value === "default"
                          ? pl
                            ? "Osobna przestrzeń rozmowy"
                            : "A separate chat workspace"
                          : value === "local"
                            ? pl
                              ? "Projekt z Twojego dysku"
                              : "A project on your device"
                            : pl
                              ? "Klon przez Twoje konto gh"
                              : "Clone with your gh account"}
                      </small>
                    </button>
                  ))}
                </fieldset>
                {source === "local" && (
                  <>
                    <label>
                      {pl ? "Istniejący projekt" : "Existing project"}
                      <select
                        aria-label={pl ? "Istniejący projekt" : "Existing project"}
                        value={existing}
                        onChange={(e) => setExisting(e.target.value)}
                      >
                        <option value="">
                          {pl
                            ? "Wybierz inny folder…"
                            : "Choose another folder…"}
                        </option>
                        {projects
                          .filter((p) => p.root)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {!existing && (
                      <div className="path-picker">
                        <input
                          aria-label={pl ? "Folder projektu" : "Project folder"}
                          placeholder="C:\Projects\my-app"
                          value={path}
                          onChange={(e) => setPath(e.target.value)}
                        />
                        <button
                          className="secondary"
                          onClick={() =>
                            void api.chooseRepository().then((p) => {
                              if (p) setPath(p);
                            })
                          }
                        >
                          {pl ? "Wybierz folder" : "Browse"}
                        </button>
                      </div>
                    )}
                  </>
                )}
                {source === "github" && (
                  <label>
                    {pl ? "Repozytorium GitHub" : "GitHub repository"}
                    <input
                      placeholder="owner/repository"
                      value={repository}
                      onChange={(e) => setRepository(e.target.value)}
                    />
                    <small>
                      {pl
                        ? "Pobierzemy lokalny klon. Dostęp prywatny przez istniejące logowanie GitHub CLI."
                        : "A local clone is created. Private access uses your existing GitHub CLI login."}
                    </small>
                  </label>
                )}
                <div className="panel-actions">
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      (source === "local" && !path && !existing) ||
                      (source === "github" && !repository)
                    }
                    onClick={() => void create()}
                  >
                    <Icon name={busy ? "refresh" : "message"} />
                    {busy
                      ? pl
                        ? "Przygotowuję…"
                        : "Preparing…"
                      : pl
                        ? "Otwórz rozmowę"
                        : "Open conversation"}
                  </button>
                  <button className="secondary" onClick={onConfigure}>
                    {pl ? "Połącz subskrypcję" : "Connect subscription"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <header className="conversation-head">
                <ProviderIcon provider={chat.agent} />
                <div>
                  <h2>{chat.title}</h2>
                  <small>
                    {agentName(chat.agent)} ·{" "}
                    {chat.mode === "plan"
                      ? pl
                        ? "Planowanie"
                        : "Planning"
                      : pl
                        ? "Rozmowa"
                        : "Chat"}{" "}
                    · {chat.source}
                  </small>
                  <span className="chat-root" title={chat.root}>
                    {chat.root}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label={pl ? "Usuń rozmowę" : "Delete conversation"}
                  title={pl ? "Usuń rozmowę" : "Delete conversation"}
                  disabled={busy || running}
                  onClick={() => {
                    if (
                      window.confirm(
                        pl
                          ? "Usunąć historię tej rozmowy? Pliki projektu pozostaną."
                          : "Delete this conversation history? Project files remain.",
                      )
                    )
                      void action("delete");
                  }}
                >
                  <Icon name="trash" />
                </button>
              </header>
              <div
                className="chat-transcript"
                role="log"
                aria-label={pl ? "Wiadomości" : "Messages"}
              >
                {!chat.messages.length && (
                  <div className="conversation-empty">
                    <Icon name={chat.mode === "plan" ? "plan" : "message"} />
                    <h3>
                      {pl ? "Od czego zaczynamy?" : "Where shall we start?"}
                    </h3>
                    <p>
                      {pl
                        ? "Opisz cel lub zadaj pytanie. Wybierz poniżej pamięć i skille, które agent ma uwzględnić."
                        : "Describe a goal or ask a question. Choose memory and skills below."}
                    </p>
                    <div className="starter-prompts">
                      {(pl
                        ? [
                            "Przeanalizuj projekt i zaproponuj plan ulepszeń.",
                            "Pomóż mi zaplanować nowy interfejs.",
                          ]
                        : [
                            "Inspect the project and propose improvements.",
                            "Help me plan a new interface.",
                          ]
                      ).map((text) => (
                        <button key={text} onClick={() => setMessage(text)}>
                          {text}
                          <Icon name="arrow" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {chat.messages.map((m) => (
                  <article key={m.id} className={`chat-message ${m.role}`}>
                    <div className="message-author">
                      {m.role === "assistant" ? (
                        <ProviderIcon provider={chat.agent} />
                      ) : (
                        <Icon name="user" />
                      )}
                      <strong>
                        {m.role === "assistant"
                          ? agentName(chat.agent)
                          : pl
                            ? "Ty"
                            : "You"}
                      </strong>
                      <time>
                        {new Date(m.at).toLocaleTimeString(language, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    {m.content ? (
                      <MessageText content={m.content} />
                    ) : (
                      <span className="thinking">
                        <i />
                        <i />
                        <i />
                        {pl ? "Agent pracuje…" : "Agent is working…"}
                      </span>
                    )}
                    {m.role === "assistant" && m.status === "complete" && (
                      <div className="message-actions">
                        <button
                          onClick={() => {
                            setSaving(m);
                            setNote(m.content);
                            setScope("project");
                          }}
                        >
                          <Icon name="memory" />
                          {pl ? "Zapamiętaj" : "Remember"}
                        </button>
                        <button
                          onClick={() => {
                            setHandoff(m);
                            setReviewer(
                              READ_ONLY_AGENTS.find((a) => a !== chat.agent) ??
                                "codex",
                            );
                          }}
                        >
                          <Icon name="task" />
                          {pl ? "Utwórz zadanie" : "Create task"}
                        </button>
                        <button
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(m.content)
                              .then(() =>
                                setNotice(pl ? "Skopiowano." : "Copied."),
                              )
                              .catch(() => setError("COPY_FAILED"))
                          }
                        >
                          <Icon name="copy" />
                          {pl ? "Kopiuj" : "Copy"}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
                <div ref={bottom} />
              </div>
              {!!chat.activity.length && (
                <details className="chat-activity">
                  <summary>
                    {pl ? "Aktywność agenta" : "Agent activity"} ·{" "}
                    {chat.activity.length}
                  </summary>
                  <ul>
                    {chat.activity.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </details>
              )}
              <details className="chat-context">
                <summary>
                  <Icon name="memory" />
                  {pl ? "Pamięć i skille" : "Memory & skills"}
                  <span>
                    {memory.filter((m) => m.pinned).length +
                      memoryIds.filter(
                        (id) => !memory.find((m) => m.id === id)?.pinned,
                      ).length}{" "}
                    {pl ? "wpisów" : "entries"} · {skillIds.length}{" "}
                    {pl ? "skilli" : "skills"}
                  </span>
                </summary>
                <div className="context-columns">
                  <fieldset disabled={running || busy}>
                    <legend>
                      {pl
                        ? "Pamięć (przypięte wpisy automatycznie)"
                        : "Memory (pinned entries included automatically)"}
                    </legend>
                    {memory.map((m) => (
                      <label key={m.id}>
                        <input
                          type="checkbox"
                          checked={!!m.pinned || memoryIds.includes(m.id)}
                          disabled={!!m.pinned}
                          onChange={() => setMemoryIds(toggle(memoryIds, m.id))}
                        />
                        <span>
                          {m.pinned ? "● " : ""}
                          {m.content.slice(0, 180)}
                          <small>
                            {m.scope === "workspace" ? "Workspace" : "Project"}
                          </small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset disabled={running || busy}>
                    <legend>{pl ? "Skille" : "Skills"}</legend>
                    {skills.map((s) => (
                      <label key={s.id}>
                        <input
                          type="checkbox"
                          checked={skillIds.includes(s.id)}
                          onChange={() => setSkillIds(toggle(skillIds, s.id))}
                        />
                        <span>
                          {s.name}
                          <small>{s.license}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </div>
              </details>
              <form
                className="chat-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  aria-label={pl ? "Wiadomość do agenta" : "Message to agent"}
                  value={message}
                  maxLength={12000}
                  placeholder={
                    pl
                      ? "Napisz, co chcesz zrobić…"
                      : "What would you like to do?"
                  }
                  disabled={busy}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <div>
                  <small>
                    <Icon name="shield" />
                    {READ_ONLY_AGENTS.includes(chat.agent)
                      ? pl
                        ? "Rozmowa i plan bez edycji plików"
                        : "Chat and planning without file edits"
                      : pl
                        ? "Osobny workspace · zmiany nie trafiają do źródła"
                        : "Separate workspace · changes are not applied to source"}
                  </small>
                  {running ? (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void action("stop")}
                    >
                      <Icon name="stop" />
                      {pl ? "Zatrzymaj" : "Stop"}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy || !message.trim()}
                    >
                      <Icon name="send" />
                      {pl ? "Wyślij" : "Send"}
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
          {(error || chat?.error) && (
            <p className="error" role="alert">
              {explain(error || chat!.error!)}
              <button onClick={onConfigure}>
                {pl ? "Połączenia" : "Connections"}
              </button>
            </p>
          )}
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
        </div>
      </div>
      <Modal
        open={!!saving}
        onClose={() => setSaving(null)}
        titleId="chat-memory-title"
      >
        <h2 id="chat-memory-title">
          {pl
            ? "Zachowaj wiedzę, nie cały szum."
            : "Keep the knowledge that matters."}
        </h2>
        <p className="helper">
          {pl
            ? "Skróć odpowiedź do trwałej decyzji lub ustalenia. Wpis pozostanie dostępny dla wybranych agentów."
            : "Condense the answer to a durable decision or fact."}
        </p>
        <textarea
          aria-label={pl ? "Treść pamięci" : "Memory content"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={20000}
        />
        <label>
          {pl ? "Widoczność" : "Scope"}
          <select
            aria-label={pl ? "Widoczność" : "Scope"}
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
          >
            <option value="project">
              {pl ? "Tylko ten projekt" : "This project only"}
            </option>
            <option value="workspace">
              {pl
                ? "Wspólna dla wszystkich projektów"
                : "Shared across all projects"}
            </option>
          </select>
        </label>
        <div className="panel-actions">
          <button className="secondary" onClick={() => setSaving(null)}>
            {pl ? "Anuluj" : "Cancel"}
          </button>
          <button
            className="primary"
            disabled={busy || !note.trim()}
            onClick={() => {
              if (!chat || !saving) return;
              setBusy(true);
              void api.chatRemember!({
                id: chat.id,
                messageId: saving.id,
                content: note,
                scope,
              })
                .then(() => {
                  setSaving(null);
                  setNotice(pl ? "Zapisano w pamięci." : "Saved to memory.");
                  return api.projectData(chat.projectId);
                })
                .then((data) => setMemory(data.memory))
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            {pl ? "Zapisz pamięć" : "Save memory"}
          </button>
        </div>
      </Modal>
      <Modal
        open={!!handoff}
        onClose={() => setHandoff(null)}
        titleId="chat-task-title"
      >
        <h2 id="chat-task-title">
          {pl ? "Przekaż do wykonania" : "Hand off for execution"}
        </h2>
        <p>
          {pl
            ? "Powstanie zadanie robocze z tą odpowiedzią. Uruchomisz je w zakładce Zadania."
            : "A draft task will contain this answer. Start it in the Tasks tab."}
        </p>
        <label>
          {pl ? "Niezależny recenzent" : "Independent reviewer"}
          <select
            aria-label={pl ? "Niezależny recenzent" : "Independent reviewer"}
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value as Agent)}
          >
            {READ_ONLY_AGENTS.filter((a) => a !== chat?.agent).map((a) => (
              <option key={a} value={a}>
                {agentName(a)}
              </option>
            ))}
          </select>
        </label>
        <div className="panel-actions">
          <button className="secondary" onClick={() => setHandoff(null)}>
            {pl ? "Anuluj" : "Cancel"}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              if (!chat || !handoff) return;
              setBusy(true);
              void api.chatTask!({
                id: chat.id,
                messageId: handoff.id,
                reviewer,
              })
                .then(() => {
                  setHandoff(null);
                  onTask(chat.projectId);
                })
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            {pl ? "Utwórz zadanie" : "Create task"}
          </button>
        </div>
      </Modal>
    </section>
  );
}

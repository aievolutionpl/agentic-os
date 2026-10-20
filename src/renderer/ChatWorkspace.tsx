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
import { Icon, Modal, agentName, connectionLabel, connectionState } from "./ui";
import { ProviderIcon } from "./ProviderIcon";
import {
  AgentStrip,
  AttachButton,
  AttachmentChips,
  useAttachments,
  useDrop,
} from "./ChatComposer";

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
  PROVIDER_MODEL_REQUIRED: [
    "W Połączeniach wybierz i zapisz model Hermesa, np. model z subskrypcji ChatGPT/Codex.",
    "Select and save a Hermes model in Connections, for example a ChatGPT/Codex subscription model.",
  ],
  PROVIDER_AUTH_REQUIRED: [
    "Zaloguj konto dostawcy w Połączeniach i ponów wiadomość.",
    "Sign in to the provider in Connections and resend the message.",
  ],
  PROVIDER_MODEL_UNAVAILABLE: [
    "Zapisany model nie jest dostępny. Odśwież modele i wybierz go ponownie w Połączeniach.",
    "The saved model is unavailable. Refresh and select a model again in Connections.",
  ],
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
  ATTACHMENT_LIMIT: [
    "Możesz dołączyć maksymalnie 5 plików do jednej wiadomości.",
    "You can attach up to 5 files per message.",
  ],
  ATTACHMENT_TOO_LARGE: [
    "Plik jest za duży. Limit to 100 KB na plik i 200 KB łącznie.",
    "The file is too large. The limit is 100 KB per file and 200 KB in total.",
  ],
  ATTACHMENT_MESSAGE_REQUIRED: [
    "Dopisz wiadomość — pliki są wysyłane razem z nią.",
    "Add a message — files are sent together with it.",
  ],
  ATTACHMENT_NOT_TEXT: [
    "Można dołączać tylko pliki tekstowe (kod, Markdown, JSON, CSV, logi).",
    "Only text files can be attached (code, Markdown, JSON, CSV, logs).",
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
  const attached = useAttachments(),
    drop = useDrop((files) => void attached.add(files));
  const [repositories, setRepositories] = useState<
    { name: string; private: boolean }[] | null | undefined
  >(undefined);
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
    // Retry a failed lookup each time GitHub is picked (e.g. after gh auth login).
    if (source !== "github" || repositories) return;
    setRepositories(undefined);
    void (api.githubRepositories?.() ?? Promise.resolve(null))
      .then((rows) => live.current && setRepositories(rows))
      .catch(() => live.current && setRepositories(null));
  }, [source]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [chat?.messages.length]);
  async function create() {
    // Files travel with a message; without one they would be dropped silently.
    if (attached.files.length && !message.trim())
      return attached.fail("ATTACHMENT_MESSAGE_REQUIRED");
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
      // The first message typed on the start screen goes straight to the agent.
      if (message.trim()) await deliver(row, []);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function deliver(target: ChatSession, contextIds: string[]) {
    const row = await api.chatSend!({
      id: target.id,
      message,
      contextIds,
      skillIds: target.id === chat?.id ? skillIds : [],
      consent: true,
      ...(attached.files.length && { attachments: attached.files }),
    });
    setSessions((rows) =>
      rows.some((s) => s.id === row.id)
        ? rows.map((s) => (s.id === row.id ? row : s))
        : [row, ...rows],
    );
    setMessage("");
    attached.clear();
  }
  async function send() {
    if (!chat || !message.trim() || running || busy) return;
    setBusy(true);
    setError("");
    try {
      await deliver(
        chat,
        memoryIds.filter((id) => !memory.find((m) => m.id === id)?.pinned),
      );
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
            attached.clear();
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
              onClick={() => {
                if (s.id !== selected) attached.clear();
                setSelected(s.id);
              }}
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
                <AgentStrip
                  value={agent}
                  providers={providers}
                  pl={pl}
                  onChange={(id) => {
                    setAgent(id);
                    if (!READ_ONLY_AGENTS.includes(id)) setMode("chat");
                  }}
                />
                <div
                  className="mode-toggle"
                  role="group"
                  aria-label={pl ? "Tryb pracy" : "Work mode"}
                >
                  {(["chat", "plan"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={mode === value}
                      className={mode === value ? "chosen" : ""}
                      disabled={
                        value === "plan" && !READ_ONLY_AGENTS.includes(agent)
                      }
                      title={
                        value === "plan" && !READ_ONLY_AGENTS.includes(agent)
                          ? pl
                            ? "Ten agent nie ma zweryfikowanego trybu tylko do odczytu"
                            : "This agent has no verified read-only mode"
                          : undefined
                      }
                      onClick={() => setMode(value)}
                    >
                      <Icon name={value === "plan" ? "plan" : "message"} />
                      {value === "plan"
                        ? pl
                          ? "Planowanie"
                          : "Planning"
                        : pl
                          ? "Rozmowa"
                          : "Chat"}
                    </button>
                  ))}
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
                        aria-label={
                          pl ? "Istniejący projekt" : "Existing project"
                        }
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
                      list="github-repositories"
                      value={repository}
                      onChange={(e) => setRepository(e.target.value)}
                    />
                    <datalist id="github-repositories">
                      {(repositories ?? []).map((r) => (
                        <option key={r.name} value={r.name}>
                          {r.private ? (pl ? "prywatne" : "private") : ""}
                        </option>
                      ))}
                    </datalist>
                    <small className="github-state">
                      <Icon name="github" />
                      {repositories === undefined
                        ? pl
                          ? "Sprawdzam logowanie GitHub CLI…"
                          : "Checking GitHub CLI sign-in…"
                        : repositories === null
                          ? pl
                            ? "GitHub CLI niepołączone. Uruchom gh auth login, aby wybierać z listy; adres owner/repo działa dla repozytoriów publicznych."
                            : "GitHub CLI not connected. Run gh auth login to pick from a list; owner/repo works for public repositories."
                          : pl
                            ? `Połączono z GitHub · ${repositories.length} repozytoriów do wyboru. Pobierzemy lokalny klon.`
                            : `Connected to GitHub · ${repositories.length} repositories to pick from. A local clone is created.`}
                    </small>
                  </label>
                )}
                <div
                  className={`chat-composer start-composer${drop.over ? " drop-over" : ""}`}
                  {...drop.props}
                >
                  <textarea
                    aria-label={pl ? "Pierwsza wiadomość" : "First message"}
                    value={message}
                    maxLength={12000}
                    placeholder={
                      pl
                        ? "Opisz, co chcesz zrobić (opcjonalnie) — możesz też upuścić tu pliki…"
                        : "Describe what you want to do (optional) — or drop files here…"
                    }
                    disabled={busy}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing &&
                        message.trim()
                      ) {
                        e.preventDefault();
                        if (
                          !busy &&
                          !(source === "local" && !path && !existing) &&
                          !(source === "github" && !repository)
                        )
                          void create();
                      }
                    }}
                    onPaste={(e) => {
                      if (e.clipboardData.files.length) {
                        e.preventDefault();
                        void attached.add(e.clipboardData.files);
                      }
                    }}
                  />
                  <AttachmentChips
                    files={attached.files}
                    pl={pl}
                    onRemove={attached.remove}
                  />
                  <div className="composer-toolbar">
                    <AttachButton
                      pl={pl}
                      disabled={busy}
                      onFiles={(f) => void attached.add(f)}
                    />
                    <span className="composer-chip">
                      <ProviderIcon provider={agent} />
                      {agentName(agent)}
                    </span>
                    <span className="composer-chip">
                      <Icon
                        name={
                          source === "github"
                            ? "github"
                            : source === "local"
                              ? "folder"
                              : "spark"
                        }
                      />
                      {source === "github"
                        ? repository || "GitHub"
                        : source === "local"
                          ? (projects.find((p) => p.id === existing)?.name ??
                            (path.split(/[\\/]/).filter(Boolean).pop() ||
                              (pl ? "Folder" : "Folder")))
                          : pl
                            ? "Domyślny workspace"
                            : "Default workspace"}
                    </span>
                    <button
                      className="primary composer-send"
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
                  </div>
                </div>
                {attached.problem && (
                  <p className="error" role="alert">
                    {explain(attached.problem)}
                  </p>
                )}
                <div className="panel-actions">
                  <button className="secondary" onClick={onConfigure}>
                    <Icon name="connections" />
                    {pl ? "Połącz subskrypcję" : "Connect subscription"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <header
                className={`conversation-head state-${connectionState(providers.find((p) => p.id === chat.agent))}`}
              >
                <span
                  className="picker-glyph"
                  title={connectionLabel(
                    connectionState(providers.find((p) => p.id === chat.agent)),
                    pl,
                  )}
                >
                  <ProviderIcon provider={chat.agent} />
                  <i className="connection-dot" aria-hidden="true" />
                </span>
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
                    ·{" "}
                    {chat.source === "github"
                      ? (chat.repository ?? "GitHub")
                      : chat.source === "local"
                        ? pl
                          ? "folder lokalny"
                          : "local folder"
                        : pl
                          ? "domyślny workspace"
                          : "default workspace"}
                    {providers.find((p) => p.id === chat.agent)?.model
                      ? ` · ${providers.find((p) => p.id === chat.agent)!.model}`
                      : ""}
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
                    {m.attachments && (
                      <AttachmentChips files={m.attachments} pl={pl} />
                    )}
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
                className={`chat-composer${drop.over ? " drop-over" : ""}`}
                {...drop.props}
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
                  onPaste={(e) => {
                    if (e.clipboardData.files.length) {
                      e.preventDefault();
                      void attached.add(e.clipboardData.files);
                    }
                  }}
                />
                <AttachmentChips
                  files={attached.files}
                  pl={pl}
                  onRemove={attached.remove}
                />
                {attached.problem && (
                  <p className="error" role="alert">
                    {explain(attached.problem)}
                  </p>
                )}
                <div className="composer-toolbar">
                  <AttachButton
                    pl={pl}
                    disabled={busy || running}
                    onFiles={(f) => void attached.add(f)}
                  />
                  <span className="composer-chip" title={chat.root}>
                    <Icon
                      name={
                        chat.source === "github"
                          ? "github"
                          : chat.source === "local"
                            ? "folder"
                            : "spark"
                      }
                    />
                    {chat.source === "default"
                      ? pl
                        ? "Domyślny workspace"
                        : "Default workspace"
                      : chat.source === "github"
                        ? (chat.repository ?? "GitHub")
                        : chat.root.split(/[\\/]/).filter(Boolean).pop()}
                  </span>
                  <span className="composer-chip">
                    <Icon name={chat.mode === "plan" ? "plan" : "message"} />
                    {chat.mode === "plan"
                      ? pl
                        ? "Planowanie"
                        : "Planning"
                      : pl
                        ? "Rozmowa"
                        : "Chat"}
                  </span>
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

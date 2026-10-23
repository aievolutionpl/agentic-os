import {VoiceInput} from "./VoiceInput";
import {CommandMenu} from "./CommandMenu";
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
import { explainError,
  AVAILABLE_AGENTS as AGENTS,
  READ_ONLY_AGENTS,
  chatMarkdown,
} from "../shared";
import { ModelPicker } from "./ModelPicker";
import { Icon, Modal, agentName, connectionLabel, connectionState } from "./ui";
import { ProviderIcon } from "./ProviderIcon";
import { PaidApproval, policyMessage } from "./PolicyPanel";
import { ErrorNote } from "./ErrorNote";
import { MessageText } from "./MessageText";
import { copyText } from "./clipboard";
import {
  AgentStrip,
  AttachButton,
  AttachmentChips,
  useAttachments,
  useDrop,
} from "./ChatComposer";

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
/**
 * Unsent work survives leaving the chat view (e.g. to fix a connection) for the
 * rest of this app session. Kept in memory only, never written to disk.
 */
const draft = {
  selected: "",
  message: "",
  files: [] as { name: string; content: string }[],
  agent: "codex" as Agent,
  model: "",
  mode: "chat" as "chat" | "plan",
  source: "default" as "default" | "local" | "github",
  path: "",
  repository: "",
  existing: "",
};
type ComposerDraft = {
  message: string;
  files: { name: string; content: string }[];
};
const drafts = new Map<string, ComposerDraft>();
/** Open the start screen next time the chat view mounts. */
export function startNewChat() {
  draft.selected = "";
  draft.message = drafts.get("")?.message ?? "";
  draft.files = drafts.get("")?.files ?? [];
}
export function ChatWorkspace({
  language,
  request,
  projects,
  onConfigure,
  onProjectsChanged,
  onTask,
}: {
  language: "pl" | "en";
  request?: { id: string; project?: string; nonce: number };
  projects: Project[];
  onConfigure: () => void;
  onProjectsChanged: () => void;
  onTask: (projectId: string) => void;
}) {
  const api = window.agenting!,
    pl = language === "pl";
  const [sessions, setSessions] = useState<ChatSession[]>([]),
    [selected, setSelected] = useState(draft.selected);
  const [agent, setAgent] = useState<Agent>(draft.agent),
    [mode, setMode] = useState<"chat" | "plan">(draft.mode),
    [source, setSource] = useState<"default" | "local" | "github">(
      draft.source,
    );
  const [model, setModel] = useState(draft.model);
  const [path, setPath] = useState(draft.path),
    [repository, setRepository] = useState(draft.repository),
    [existing, setExisting] = useState(draft.existing);
  const [providers, setProviders] = useState<ProviderSetting[]>([]),
    [message, setMessage] = useState(draft.message),
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
  const [search, setSearch] = useState(""),
    [historyOpen, setHistoryOpen] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(false);
  const autoFollow = useRef(true);
  useEffect(() => {
    const close = (event: PointerEvent | KeyboardEvent) => {
      document
        .querySelectorAll<HTMLDetailsElement>(".composer-menu[open]")
        .forEach((menu) => {
          if (
            event instanceof KeyboardEvent
              ? event.key === "Escape"
              : !menu.contains(event.target as Node)
          ) {
            menu.open = false;
            if (event instanceof KeyboardEvent)
              menu.querySelector("summary")?.focus();
          }
        });
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const attached = useAttachments(draft.files),
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
    const policy = policyMessage(value, pl);
    if (policy) return policy;
    const key = Object.keys(errors).find((k) => value.includes(k));
    if (key) return errors[key][pl ? 0 : 1];
    return explainError(value, pl).hint;
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
    setModel(chat?.model ?? "");
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
    autoFollow.current = true;
    setUnseen(false);
  }, [selected]);
  useEffect(() => {
    if (autoFollow.current)
      bottom.current?.scrollIntoView({ block: "nearest" });
    else setUnseen(true);
  }, [selected, chat?.messages.length, chat?.messages.at(-1)?.content]);
  useEffect(() => {
    draft.selected = selected;
    draft.message = message;
    draft.files = attached.files;
    drafts.set(selected, { message, files: attached.files });
    // The draft keeps its target too: agent, mode and where it will run.
    Object.assign(draft, {
      agent,
      model,
      mode,
      source,
      path,
      repository,
      existing,
    });
  }, [
    selected,
    message,
    attached.files,
    agent,
    mode,
    model,
    source,
    path,
    repository,
    existing,
  ]);
  function selectChat(id: string) {
    if (id === selected) return;
    drafts.set(selected, { message, files: attached.files });
    const saved = drafts.get(id);
    setMessage(saved?.message ?? "");
    attached.restore(saved?.files ?? []);
    current.current = id;
    setSelected(id);
    setHistoryOpen(false);
    setError("");
    setNotice("");
  }
  useEffect(() => {
    if (!request) return;
    selectChat(request.id);
    if (!request.id) {
      setExisting(request.project ?? "");
      setSource(request.project ? "local" : "default");
    }
  }, [request?.nonce]);
  async function create() {
    if (attached.reading) return;
    // Check the connection before creating a chat, so the draft stays on the
    // start screen while the user fixes it.
    if (!providers.find((p) => p.id === agent)?.configured)
      return setError("PROVIDER_NOT_CONFIGURED");
    // Files travel with a message; without one they would be dropped silently.
    if (attached.files.length && !message.trim())
      return attached.fail("ATTACHMENT_MESSAGE_REQUIRED");
    setBusy(true);
    setError("");
    try {
      const row = await api.chatCreate!({
        agent,
        model: model || null,
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
      current.current = row.id;
      setSelected(row.id);
      drafts.delete("");
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
      model: model || null,
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
    drafts.set(target.id, { message: "", files: [] });
    if (current.current === target.id) {
      setMessage("");
      attached.clear();
    }
  }
  async function send() {
    if (!chat || !message.trim() || running || busy || attached.reading) return;
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
      if (action === "delete") {
        selectChat("");
        drafts.delete(chat.id);
      }
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
      className={`chat-workspace${chat ? " has-conversation" : ""}${!sessions.length ? " no-history" : ""}${historyOpen ? " history-open" : ""}`}
      aria-label={pl ? "Czat z agentem" : "Agent chat"}
    >
      <div className="chat-topline">
        <div>
          <span className="section-eyebrow">
            AI EVOLUTION POLSKA / WORKSPACE
          </span>
          <h1>{pl ? "Przestrzeń rozmów" : "Conversation workspace"}</h1>
        </div>
        <div className="chat-heading-actions">
          {!!sessions.length && (
            <button
              className="secondary history-toggle"
              aria-expanded={historyOpen}
              aria-controls="chat-history"
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              <Icon name="history" />
              {pl ? "Historia" : "History"}
            </button>
          )}
          <button
            className="secondary"
            onClick={() => {
              selectChat("");
            }}
          >
            <Icon name="plus" />
            {pl ? "Nowy czat" : "New chat"}
          </button>
        </div>
      </div>
      <div className="chat-layout">
        <aside
          className="chat-history"
          id="chat-history"
          aria-label={pl ? "Historia czatów" : "Chat history"}
        >
          <div className="mini-heading">
            <Icon name="history" />
            {pl ? "Twoje rozmowy" : "Your conversations"}
          </div>
          {!!sessions.length && (
            <label className="chat-search">
              <Icon name="search" />
              <input
                type="search"
                aria-label={pl ? "Szukaj rozmów" : "Search conversations"}
                placeholder={pl ? "Szukaj rozmów…" : "Search conversations…"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          )}
          {!sessions.length && (
            <p className="helper">
              {pl
                ? "Rozmowy zapisują się na tym urządzeniu."
                : "Conversations are saved on this device."}
            </p>
          )}
          {sessions
            .filter((s) =>
              `${s.title} ${agentName(s.agent)}`
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase()),
            )
            .map((s) => (
              <button
                key={s.id}
                className={selected === s.id ? "active" : ""}
                onClick={() => {
                  selectChat(s.id);
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
          {!!search &&
            !sessions.some((s) =>
              `${s.title} ${agentName(s.agent)}`
                .toLocaleLowerCase()
                .includes(search.toLocaleLowerCase()),
            ) && (
              <p className="helper">
                {pl ? "Brak pasujących rozmów." : "No matching conversations."}
              </p>
            )}
        </aside>
        <div className="chat-stage">
          {!chat ? (
            <>
              <header className="conversation-welcome">
                <div>
                  <span className="banner-kicker">
                    <Icon name="layers" />
                  </span>
                  <h2>
                    {pl
                      ? "Dobry pomysł zaczyna się tutaj."
                      : "A good idea starts here."}
                  </h2>
                  <p>
                    {pl
                      ? "Nad czym dziś pracujemy?"
                      : "What are we working on today?"}
                  </p>
                </div>
              </header>
              <div className="chat-start-form">
                <div className="harness-telemetry-strip">
                  <span>
                    HARNESS // ENGINE: <code>{agentName(agent)}</code>
                  </span>
                  <span>·</span>
                  <span>
                    MODE:{" "}
                    <code>
                      {mode === "plan" ? "PLAN (READ-ONLY)" : "EXECUTION / CHAT"}
                    </code>
                  </span>
                  <span>·</span>
                  <span>
                    WORKSPACE: <code>{source.toUpperCase()}</code>
                  </span>
                </div>
                <div
                  className={`chat-composer start-composer${drop.over ? " drop-over" : ""}`}
                  {...drop.props}
                >
                  <details className="composer-tools"><summary>{pl ? "Narzędzia" : "Tools"}</summary><CommandMenu onChoose={setMessage} disabled={busy}/><VoiceInput pl={pl} onText={text=>setMessage(current=>`${current}${current ? "\n" : ""}${text}`)}/><div className="harness-slash-bar">
                    <span className="harness-slash-label">
                      {pl ? "Komendy:" : "Commands:"}
                    </span>
                    {[
                      {
                        cmd: "/plan",
                        label: pl ? "Architektura" : "Architecture",
                        action: () => {
                          if (READ_ONLY_AGENTS.includes(agent)) setMode("plan");
                          setMessage(
                            pl
                              ? "Przeanalizuj architekturę i przygotuj szczegółowy plan implementacji krok po kroku przed zmianą plików."
                              : "Analyze the architecture and prepare a step-by-step implementation plan before modifying files.",
                          );
                        },
                      },
                      {
                        cmd: "/review",
                        label: "Code Review",
                        action: () =>
                          setMessage(
                            pl
                              ? "Przeprowadź rygorystyczny code review: wskaż błędy logiczne, luki bezpieczeństwa, regresje i brakujące testy."
                              : "Run a rigorous code review: identify logic bugs, security issues, regressions, and missing tests.",
                          ),
                      },
                      {
                        cmd: "/test",
                        label: "TDD & QA",
                        action: () =>
                          setMessage(
                            pl
                              ? "Napisz testy weryfikujące obecną funkcjonalność i krawędziowe przypadki zgodnie z TDD."
                              : "Write tests verifying current functionality and edge cases following TDD.",
                          ),
                      },
                      {
                        cmd: "/archify",
                        label: "C4 Docs",
                        action: () =>
                          setMessage(
                            pl
                              ? "Użyj skilla Archify: wygeneruj przegląd architektury systemu, granic modułów i diagramy Mermaid."
                              : "Use Archify skill: generate system architecture overview, module boundaries, and Mermaid diagrams.",
                          ),
                      },
                      {
                        cmd: "/taste-ui",
                        label: "Taste UI",
                        action: () =>
                          setMessage(
                            pl
                              ? "Zastosuj Taste-Skill: zaprojektuj i dopracuj UI o wysokim kunszcie (typografia, hierarchia, brak generycznych wzorców AI)."
                              : "Apply Taste-Skill: design and refine high-craft UI (typography, hierarchy, zero generic AI slop).",
                          ),
                      },
                      {
                        cmd: "/humanize",
                        label: "Humanizer",
                        action: () =>
                          setMessage(
                            pl
                              ? "Zastosuj Humanizer: usuń sztuczne sformułowania AI i nadaj tekstowi naturalny, precyzyjny ton."
                              : "Apply Humanizer: strip AI writing tropes and rewrite with natural, precise human voice.",
                          ),
                      },
                    ].map((item) => (
                      <button
                        key={item.cmd}
                        type="button"
                        className="slash-chip"
                        disabled={busy}
                        onClick={item.action}
                      >
                        <strong>{item.cmd}</strong>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div></details>
                  <textarea
                    aria-label={pl ? "Pierwsza wiadomość" : "First message"}
                    value={message}
                    maxLength={12000}
                    placeholder={
                      pl
                        ? "Opisz swój pomysł lub dodaj pliki…"
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
                    <details className="composer-menu agent-menu">
                      <summary>
                        <ProviderIcon provider={agent} />
                        <span>{agentName(agent)}</span>
                        <Icon name="down" />
                      </summary>
                      <div className="composer-popover">
                        <AgentStrip
                          value={agent}
                          providers={providers}
                          pl={pl}
                          onChange={(id) => {
                            setAgent(id);
                            setModel("");
                            if (!READ_ONLY_AGENTS.includes(id)) setMode("chat");
                            const menu =
                              document.querySelector<HTMLDetailsElement>(
                                ".agent-menu",
                              );
                            if (menu) {
                              menu.open = false;
                              menu.querySelector("summary")?.focus();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="secondary"
                          onClick={onConfigure}
                        >
                          <Icon name="connections" />
                          {pl ? "Połączenia i modele" : "Connections & models"}
                        </button>
                      </div>
                    </details>
                    <ModelPicker
                      agent={agent}
                      value={model}
                      provider={providers.find((p) => p.id === agent)}
                      pl={pl}
                      disabled={busy}
                      onChange={setModel}
                    />
                    <details className="composer-menu workspace-menu">
                      <summary>
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
                        <Icon name="down" />
                      </summary>
                      <div className="composer-popover workspace-options">
                        {" "}
                        <fieldset className="workspace-source">
                          <legend>
                            {pl ? "Gdzie pracujemy?" : "Where are we working?"}
                          </legend>
                          {(["default", "local", "github"] as const).map(
                            (value) => (
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
                            ),
                          )}
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
                                  aria-label={
                                    pl ? "Folder projektu" : "Project folder"
                                  }
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
                                  {r.private
                                    ? pl
                                      ? "prywatne"
                                      : "private"
                                    : ""}
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
                      </div>
                    </details>
                    <button
                      type="button"
                      className="planning-toggle"
                      role="switch"
                      aria-checked={mode === "plan"}
                      disabled={!READ_ONLY_AGENTS.includes(agent)}
                      onClick={() => setMode(mode === "chat" ? "plan" : "chat")}
                    >
                      <span className="switch-track">
                        <i />
                      </span>
                      {pl ? "Planowanie" : "Planning"}
                    </button>
                    <button
                      className="primary composer-send"
                      disabled={
                        busy ||
                        attached.reading ||
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
                <div className="conversation-starters">
                  {[
                    { icon: "globe", title: pl ? "Strona ze zdjęć" : "Website from photos", detail: pl ? "Kierunek wizualny" : "Visual direction", prompt: pl ? "Chcę stronę na podstawie zdjęć. Zapytaj o cel strony i ścieżki do zdjęć w projekcie. Sprawdź dostępne narzędzia i możliwość analizy obrazów; jeśli jej nie masz, poproś o opis. Przygotuj projekt i plan wdrożenia." : "Help me design a website from photos. Ask for the goal and project asset paths. Check image capabilities; ask for descriptions if unavailable. Prepare a design and implementation plan." },
                    { icon: "play", title: pl ? "Mini gra" : "Mini game", detail: "Web / Canvas", prompt: pl ? "Zaprojektuj małą grę przeglądarkową: jedna ciekawa mechanika, sterowanie dotykiem i klawiaturą. Zaproponuj plan, a implementację przekażmy do zadania." : "Design a small browser game with one compelling mechanic, touch and keyboard controls. Prepare a plan for the task workflow." },
                    { icon: "layers", title: pl ? "Scena 3D" : "3D scene", detail: "Three.js / WebGL", prompt: pl ? "Zaprojektuj interaktywną scenę 3D do przeglądarki. Ustal temat, przygotuj kompozycję, materiały, światło i plan implementacji z budżetem wydajności." : "Design an interactive browser 3D scene. Define composition, materials, lighting and an implementation plan with a performance budget." },
                    { icon: "code", title: pl ? "Przejrzyj kod" : "Review code", detail: pl ? "Jakość i błędy" : "Quality and bugs", prompt: pl ? "Przejrzyj projekt i wskaż najważniejsze usprawnienia na podstawie kodu. Podaj konkretne pliki i sposób weryfikacji." : "Review this project. Identify actionable improvements with files and verification steps." },
                    { icon: "plan", title: pl ? "Plan projektu" : "Project plan", detail: pl ? "Od pomysłu do zadań" : "From idea to tasks", prompt: pl ? "Pomóż mi zaplanować projekt. Zacznijmy od celu i ograniczeń, następnie przygotuj zadania i kryteria akceptacji." : "Help me plan a project. Start with goals and constraints, then tasks and acceptance criteria." },
                    { icon: "spark", title: pl ? "Uporządkuj wiedzę" : "Organize knowledge", detail: pl ? "Notatki i wnioski" : "Notes and insights", prompt: pl ? "Pomóż uporządkować dostępne notatki projektu: podsumuj decyzje, pytania i kolejne kroki. Oznacz brakujące informacje." : "Organize the available project notes into decisions, open questions and next steps. Mark missing information." },
                  ].map((item) => (
                    <button
                      key={item.icon}
                        data-intent={item.icon}
                      type="button"
                      onClick={() => {
                        setMessage(item.prompt);
                        document
                          .querySelector<HTMLTextAreaElement>(
                            ".start-composer textarea",
                          )
                          ?.focus();
                      }}
                    >
                      <Icon name={item.icon} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <Icon name="arrow" />
                    </button>
                  ))}
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
                    {chat.model ||
                    providers.find((p) => p.id === chat.agent)?.model
                      ? ` · ${chat.model || providers.find((p) => p.id === chat.agent)!.model}`
                      : ""}
                  </small>
                  <span className="chat-root" title={chat.root}>
                    {chat.root}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label={
                    pl
                      ? "Kopiuj rozmowę jako Markdown"
                      : "Copy conversation as Markdown"
                  }
                  title={
                    pl
                      ? "Kopiuj rozmowę jako Markdown"
                      : "Copy conversation as Markdown"
                  }
                  disabled={!chat.messages.length}
                  onClick={() => {
                    void copyText(chatMarkdown(chat))
                      .then(() =>
                        setNotice(
                          pl
                            ? "Rozmowa skopiowana jako Markdown."
                            : "Conversation copied as Markdown.",
                        ),
                      )
                      .catch(() =>
                        setNotice(
                          pl
                            ? "Nie udało się skopiować rozmowy."
                            : "Could not copy the conversation.",
                        ),
                      );
                  }}
                >
                  <Icon name="copy" />
                </button>
                <button
                  className="icon-button"
                  aria-label={
                    pl ? "Zmień nazwę rozmowy" : "Rename conversation"
                  }
                  title={pl ? "Zmień nazwę rozmowy" : "Rename conversation"}
                  disabled={busy || running}
                  onClick={() => setRename(chat.title)}
                >
                  <Icon name="edit" />
                </button>
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
                aria-live="polite"
                aria-relevant="additions"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  autoFollow.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                  if (autoFollow.current) setUnseen(false);
                }}
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
                      <MessageText content={m.content} pl={pl} />
                    ) : m.status !== "streaming" ? (
                      <span className="message-empty">
                        {m.status === "cancelled"
                          ? pl
                            ? "Zatrzymano przed odpowiedzią."
                            : "Stopped before a reply."
                          : pl
                            ? "Brak odpowiedzi — szczegóły poniżej."
                            : "No reply — details below."}
                      </span>
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
                          type="button"
                          onClick={() => {
                            const nextAgent =
                              AGENTS.find(
                                (a) =>
                                  a !== chat.agent &&
                                  providers.find((p) => p.id === a)?.configured,
                              ) ?? (chat.agent === "codex" ? "claude" : "codex");
                            const excerpt = m.content.slice(0, 3500);
                            const consultPrompt = pl
                              ? `Przeprowadź niezależny przegląd (Second Opinion) poniższej propozycji od agenta ${agentName(chat.agent)}. Wskaż słabe punkty, luki architektoniczne oraz lepsze alternatywy:\n\n---\n${excerpt}`
                              : `Provide an independent Second Opinion review of the following proposal from ${agentName(chat.agent)}. Identify blind spots, architectural trade-offs, and better alternatives:\n\n---\n${excerpt}`;
                            setAgent(nextAgent);
                            setModel("");
                            setMode(
                              READ_ONLY_AGENTS.includes(nextAgent)
                                ? "plan"
                                : "chat",
                            );
                            drafts.set("", {
                              message: consultPrompt,
                              files: [],
                            });
                            selectChat("");
                            setMessage(consultPrompt);
                          }}
                        >
                          <Icon name="swap" />
                          {pl ? "Druga opinia" : "Second opinion"}
                        </button>
                        <button
                          onClick={() =>
                            void copyText(m.content)
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
              {unseen && (
                <button
                  className="jump-latest secondary"
                  onClick={() => {
                    autoFollow.current = true;
                    setUnseen(false);
                    bottom.current?.scrollIntoView({ block: "nearest" });
                  }}
                >
                  <Icon name="down" />
                  {pl ? "Najnowsza odpowiedź" : "Latest response"}
                </button>
              )}
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
                <div className="composer-status">
                  <span
                    className={
                      running ? "run-indicator active" : "run-indicator"
                    }
                    role="status"
                  >
                    <i aria-hidden="true" />
                    {running
                      ? pl
                        ? "Agent pracuje"
                        : "Agent working"
                      : pl
                        ? "Gotowy na wiadomość"
                        : "Ready for a message"}
                  </span>
                  <span>
                    {message.length.toLocaleString(language)} / 12 000
                  </span>
                </div>
                <details className="composer-tools"><summary>{pl ? "Narzędzia" : "Tools"}</summary><CommandMenu onChoose={setMessage} disabled={busy}/><VoiceInput pl={pl} onText={text=>setMessage(current=>`${current}${current ? "\n" : ""}${text}`)}/><div className="harness-slash-bar">
                  <span className="harness-slash-label">
                    {pl ? "Komendy:" : "Commands:"}
                  </span>
                  {[
                    {
                      cmd: "/verify",
                      label: pl ? "Weryfikacja" : "Verify",
                      prompt: pl
                        ? "Zweryfikuj ostatnie zmiany: uruchom testy, sprawdź typy i potwierdź brak regresji."
                        : "Verify recent changes: run tests, check types, and confirm zero regressions.",
                    },
                    {
                      cmd: "/diff-audit",
                      label: "Diff Audit",
                      prompt: pl
                        ? "Przeanalizuj bieżący diff pod kątem bezpieczeństwa, czytelności i przypadków brzegowych."
                        : "Audit the current diff for security, readability, and edge cases.",
                    },
                    {
                      cmd: "/archify",
                      label: "Archify",
                      prompt: pl
                        ? "Zaktualizuj dokumentację architektury i diagramy przepływu danych dla bieżących zmian."
                        : "Update architecture documentation and data flow diagrams for current changes.",
                    },
                    {
                      cmd: "/taste-ui",
                      label: "Taste UI",
                      prompt: pl
                        ? "Dopracuj warstwę wizualną i interakcje zgodnie z zasadami Taste-Skill."
                        : "Refine visual craft and interactions following Taste-Skill guidelines.",
                    },
                  ].map((item) => (
                    <button
                      key={item.cmd}
                      type="button"
                      className="slash-chip"
                      disabled={busy || running}
                      onClick={() => setMessage(item.prompt)}
                    >
                      <strong>{item.cmd}</strong>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div></details>
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
                  <span className="composer-chip">
                    <ProviderIcon provider={chat.agent} />
                    {agentName(chat.agent)}
                  </span>
                  <ModelPicker
                    agent={chat.agent}
                    value={model}
                    provider={providers.find((p) => p.id === chat.agent)}
                    pl={pl}
                    disabled={busy || running}
                    onChange={setModel}
                  />
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
                      disabled={busy || attached.reading || !message.trim()}
                    >
                      <Icon name="send" />
                      {pl ? "Wyślij" : "Send"}
                    </button>
                  )}
                </div>
              </form>
              <p className="composer-hint">
                {pl
                  ? "Enter — wyślij · Shift+Enter — nowa linia · osobny szkic dla każdej rozmowy"
                  : "Enter to send · Shift+Enter for a new line · separate draft for each conversation"}
              </p>
            </>
          )}
          {(error || chat?.error) && (
            <ErrorNote
              value={error || chat!.error!}
              pl={pl}
              action={
                <>
                  {(error || chat?.error || "").includes(
                    "POLICY_APPROVAL_REQUIRED",
                  ) && <PaidApproval agent={chat?.agent ?? agent} pl={pl} />}
                  <button onClick={onConfigure}>
                    {pl ? "Połączenia" : "Connections"}
                  </button>
                </>
              }
            />
          )}
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
        </div>
      </div>
      <Modal
        open={rename !== null}
        onClose={() => setRename(null)}
        titleId="rename-chat-title"
      >
        <h2 id="rename-chat-title">
          {pl ? "Nazwa rozmowy" : "Conversation name"}
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!chat || !rename?.trim() || busy) return;
            setBusy(true);
            void api.chatRename!({ id: chat.id, title: rename })
              .then((row) => {
                setSessions((rows) =>
                  rows.map((s) => (s.id === row.id ? row : s)),
                );
                setRename(null);
              })
              .catch((e) => setError(String(e)))
              .finally(() => setBusy(false));
          }}
        >
          <input
            aria-label={pl ? "Nazwa rozmowy" : "Conversation name"}
            value={rename ?? ""}
            maxLength={120}
            onChange={(e) => setRename(e.target.value)}
            autoFocus
          />
          <div className="panel-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => setRename(null)}
            >
              {pl ? "Anuluj" : "Cancel"}
            </button>
            <button className="primary" disabled={busy || !rename?.trim()}>
              {pl ? "Zapisz nazwę" : "Save name"}
            </button>
          </div>
        </form>
      </Modal>
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
            {READ_ONLY_AGENTS.filter((a) => a !== "gemini" && a !== chat?.agent).map((a) => (
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

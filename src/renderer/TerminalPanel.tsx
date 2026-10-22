import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { Project, TerminalSession } from "../shared";
import { Icon, Modal } from "./ui";
import { ErrorNote } from "./ErrorNote";

function TerminalView({
  session,
  pl,
  theme,
  onExit,
}: {
  session: TerminalSession;
  pl: boolean;
  theme: "dark" | "light" | "classic";
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Terminal | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const api = window.agenting!;
    const terminal = new Terminal({
      cursorBlink: false,
      fontSize: 14,
      lineHeight: 1.35,
      scrollback: 3000,
      fontFamily:
        'ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace',
      screenReaderMode: true,
      allowProposedApi: false,
      minimumContrastRatio: 4.5,
      theme: {
        background: "#0d1320",
        foreground: "#e8eef8",
        cursor: "#65d5ff",
        selectionBackground: "#355471",
      },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host.current);
    instance.current = terminal;
    setError(false);
    // Terminal output cannot write the system clipboard through OSC 52.
    const clipboardGuard = terminal.parser.registerOscHandler(52, () => true);
    let active = true,
      cursor = 0,
      polling: ReturnType<typeof setTimeout>;
    let lastSize = "";
    const resize = () => {
      if (!active || !host.current?.clientWidth) return;
      fit.fit();
      const cols = Math.max(20, Math.min(300, terminal.cols));
      const rows = Math.max(5, Math.min(100, terminal.rows));
      if (`${cols}:${rows}` === lastSize) return;
      lastSize = `${cols}:${rows}`;
      void api.terminalResize!({ id: session.id, cols, rows }).catch(
        () => active && setError(true),
      );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    terminal.focus();
    const input = terminal.onData((data) => {
      void api.terminalWrite!({ id: session.id, data }).catch(
        () => active && setError(true),
      );
    });
    const poll = async () => {
      try {
        const result = await api.terminalRead!({ id: session.id, cursor });
        if (!active) return;
        if (result.reset) terminal.reset();
        cursor = result.cursor;
        // Wait for the renderer to consume each batch; no unbounded write queue.
        if (result.data)
          await new Promise<void>((resolve) =>
            terminal.write(result.data, resolve),
          );
        if (!active) return;
        if (result.state === "exited" && !result.data) {
          terminal.options.disableStdin = true;
          terminal.writeln(
            `\r\n[${pl ? "Proces zakończony. Kod" : "Process exited. Code"}: ${result.exitCode}]`,
          );
          onExit();
          return;
        }
        polling = setTimeout(poll, result.data.length === 64_000 ? 0 : 120);
      } catch {
        if (active) setError(true);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(polling);
      observer.disconnect();
      clipboardGuard.dispose();
      input.dispose();
      terminal.dispose();
      instance.current = null;
    };
  }, [session.id]);
  useEffect(() => {
    if (instance.current)
      instance.current.options.theme =
        theme === "dark"
          ? {
              background: "#0d1320",
              foreground: "#e8eef8",
              cursor: "#65d5ff",
              selectionBackground: "#355471",
            }
          : {
              background: "#f8faff",
              foreground: "#142139",
              cursor: "#075c94",
              selectionBackground: "#bed8f2",
            };
  }, [theme, session.id]);
  return (
    <>
      <div className="terminal-toolbar">
        <span className="terminal-location" title={session.cwd}>
          <Icon name="folder" />
          {session.cwd}
        </span>
        <button
          className="secondary"
          onClick={() => {
            instance.current?.clear();
            instance.current?.focus();
          }}
        >
          {pl ? "Wyczyść ekran" : "Clear screen"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {pl
            ? "Sesja nie odpowiada. Zamknij kartę i otwórz nowy terminal."
            : "Session unavailable. Close this tab and open a new terminal."}
        </p>
      )}
      <div
        className="terminal-viewport"
        ref={host}
        aria-label={pl ? "Interaktywny terminal" : "Interactive terminal"}
      />
    </>
  );
}

export function TerminalPanel({
  language,
  projects,
  theme,
}: {
  language: "pl" | "en";
  projects: Project[];
  theme: "dark" | "light" | "classic";
}) {
  const pl = language === "pl",
    api = window.agenting!;
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [selected, setSelected] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [closing, setClosing] = useState<TerminalSession | null>(null);
  const live = useRef(true);
  const refresh = async () => {
    const list = await api.terminalList!();
    if (!live.current) return;
    setSessions(list);
    setSelected((id) =>
      list.some((s) => s.id === id) ? id : (list[0]?.id ?? ""),
    );
  };
  useEffect(() => {
    live.current = true;
    void refresh().catch(() => setError("LOAD_FAILED"));
    return () => {
      live.current = false;
    };
  }, []);
  async function open() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const session = await api.terminalOpen!({
        ...(projectId && { projectId }),
        consent: true,
        cols: 100,
        rows: 24,
      });
      if (live.current) {
        setSelected(session.id);
        await refresh();
      }
    } catch (e) {
      if (live.current) setError(String(e));
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function close(id: string) {
    setBusy(true);
    setError("");
    try {
      await api.terminalClose!({ id });
      setClosing(null);
      await refresh();
    } catch {
      setError("CLOSE_FAILED");
    } finally {
      setBusy(false);
    }
  }
  const current = sessions.find((s) => s.id === selected);
  return (
    <section className="terminal-workspace" aria-labelledby="terminal-title">
      <div className="harness-heading">
        <div>
          <span className="section-eyebrow">WORKSPACE / CLI</span>
          <h1 id="terminal-title">{pl ? "Terminal" : "Terminal"}</h1>
          <p className="helper">
            {pl
              ? "Twoje narzędzia. Twój katalog. Pełna sesja powłoki."
              : "Your tools. Your directory. A full shell session."}
          </p>
        </div>
      </div>
      <div className="terminal-launch">
        <label>
          {pl ? "Katalog początkowy" : "Start directory"}
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            disabled={busy}
          >
            <option value="">
              {pl ? "Osobny folder terminala" : "Dedicated terminal folder"}
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
        <button
          className="primary"
          onClick={() => void open()}
          disabled={busy || sessions.length >= 6}
        >
          <Icon name="plus" />
          {busy
            ? pl
              ? "Przygotowuję…"
              : "Preparing…"
            : pl
              ? "Otwórz terminal"
              : "Open terminal"}
        </button>
      </div>
      <p className="terminal-consent">
        <Icon name="info" />
        {pl
          ? "Otwierając terminal, uruchamiasz lokalną powłokę. Polecenia mogą zmieniać pliki i korzystać z kont CLI. Działają bez zatwierdzeń i limitów ustawionych dla agentów."
          : "Opening a terminal starts a local shell. Commands can change files and use CLI accounts. Agent approval rules and budgets do not apply to manual commands."}
      </p>
      {error && <ErrorNote value={error} pl={pl} />}
      <div className="terminal-shell">
        <div
          className="terminal-tabs"
          role="group"
          aria-label={pl ? "Sesje terminala" : "Terminal sessions"}
        >
          {sessions.map((s, i) => (
            <div
              className={`terminal-tab${s.id === selected ? " active" : ""}`}
              key={s.id}
            >
              <button
                aria-pressed={s.id === selected}
                onClick={() => setSelected(s.id)}
              >
                <Icon name="terminal" />
                <span>
                  {s.shell} {i + 1}
                </span>
                <small>
                  {s.state === "exited"
                    ? pl
                      ? "zakończono"
                      : "exited"
                    : pl
                      ? "aktywna"
                      : "active"}
                </small>
              </button>
              <button
                className="icon-button"
                disabled={busy}
                aria-label={`${pl ? "Zamknij sesję" : "Close session"} ${i + 1}`}
                onClick={() =>
                  s.state === "running" ? setClosing(s) : void close(s.id)
                }
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
          <span className="terminal-count">{sessions.length}/6</span>
        </div>
        {current ? (
          <TerminalView
            key={current.id}
            session={current}
            pl={pl}
            theme={theme}
            onExit={() =>
              void refresh().catch(() => {
                if (live.current) setError("LOAD_FAILED");
              })
            }
          />
        ) : (
          <div className="terminal-empty">
            <div className="terminal-empty-icon">
              <Icon name="terminal" />
            </div>
            <h2>
              {pl
                ? "Praca z CLI, bez zmiany okna."
                : "Work with your CLI, without switching windows."}
            </h2>
            <p>
              {pl
                ? "Uruchamiaj testy, sprawdzaj Git i pracuj z zainstalowanymi agentami. Każda karta zachowuje sesję, gdy przechodzisz do czatu."
                : "Run tests, inspect Git and use installed agents. Each tab keeps its session while you switch to chat."}
            </p>
            <div className="terminal-examples">
              <code>git status</code>
              <code>npm test</code>
              <code>codex</code>
              <code>claude</code>
            </div>
            <small>
              {pl
                ? "Przykłady poleceń — uruchamiasz je samodzielnie. Sesje kończą się po zamknięciu aplikacji."
                : "Example commands — run them yourself. Sessions end when the app closes."}
            </small>
          </div>
        )}
      </div>
      <Modal
        open={!!closing}
        onClose={() => setClosing(null)}
        titleId="close-terminal-title"
      >
        <h2 id="close-terminal-title">
          {pl ? "Zamknąć sesję terminala?" : "Close terminal session?"}
        </h2>
        <p>
          {pl
            ? "Działający proces powłoki zostanie zakończony. Historia tej karty nie jest zapisywana."
            : "The running shell will be terminated. This tab's history is not saved."}
        </p>
        <div className="panel-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setClosing(null)}
          >
            {pl ? "Anuluj" : "Cancel"}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() => closing && void close(closing.id)}
          >
            {pl ? "Zamknij sesję" : "Close session"}
          </button>
        </div>
      </Modal>
    </section>
  );
}

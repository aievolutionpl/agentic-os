import React, { useEffect, useId, useRef, useState } from "react";
import type { Agent } from "../shared";
import { ProviderIcon } from "./ProviderIcon";

export function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const paths: Record<string, React.ReactNode> = {
    layers: <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" />,
    spark: (
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
    ),
    connections: (
      <>
        <rect x="2" y="3" width="6" height="6" rx="2" />
        <rect x="16" y="15" width="6" height="6" rx="2" />
        <path d="M5 9v7a3 3 0 0 0 3 3h8M19 15V8a3 3 0 0 0-3-3H8" />
      </>
    ),
    memory: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7" />
      </>
    ),
    tokens: (
      <>
        <path d="M4 20V10m5 10V4m6 16v-7m5 7V7" />
      </>
    ),
    play: <path d="m7 4 13 8-13 8V4Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    down: <path d="m6 9 6 6 6-6" />,
    moon: <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z" />
      </>
    ),
    folder: <path d="M3 7V5h6l2 2h10v12H3V7Z" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M16 8V3H3v13h5" />
      </>
    ),
    shield: <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6" />,
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    swap: <path d="M3 7h17l-4-4m5 14H4l4 4" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v1" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    dots: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
    grid: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </>
    ),
    task: <rect x="5" y="5" width="14" height="14" rx="3" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
  };
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.task}
    </svg>
  );
}

export type Choice = { value: string; label: string; tone?: string };
export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  name,
  icon,
  prefix,
  className = "",
}: {
  label: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
  disabled?: boolean;
  name?: string;
  icon?: string;
  prefix?: string;
  className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const typeahead = useRef({ value: "", at: 0 });
  const selected = options.find((option) => option.value === value);
  function show(
    index = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  ) {
    setActive(index);
    setOpen(true);
  }
  function close(restore = false) {
    setOpen(false);
    if (restore) trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    optionRefs.current[active]?.focus();
  }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <div
      ref={root}
      className={`select-field ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        aria-label={label}
        title={label}
        aria-haspopup="listbox"
        aria-controls={`${id}-options`}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            show(
              event.key === "End"
                ? options.length - 1
                : event.key === "Home"
                  ? 0
                  : undefined,
            );
          }
        }}
      >
        {icon && <Icon name={icon} />}
        {prefix && <span className="select-prefix">{prefix}</span>}
        <span className="select-value">{selected?.label ?? value}</span>
        <Icon name="down" />
      </button>
      {open && (
        <div
          id={`${id}-options`}
          role="listbox"
          aria-label={label}
          className="select-options"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close(true);
            } else if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              setActive((index) =>
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? options.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        options.length) %
                      options.length,
              );
            } else if (
              event.key.length === 1 &&
              !event.ctrlKey &&
              !event.metaKey &&
              event.key !== " "
            ) {
              event.preventDefault();
              const now = Date.now();
              const search =
                (now - typeahead.current.at < 700
                  ? typeahead.current.value
                  : "") + event.key.toLocaleLowerCase();
              typeahead.current = { value: search, at: now };
              const index = options.findIndex((option) =>
                option.label.toLocaleLowerCase().startsWith(search),
              );
              if (index >= 0) setActive(index);
            }
          }}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              role="option"
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              tabIndex={index === active ? 0 : -1}
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                close(true);
              }}
            >
              {option.tone && (
                <span
                  className={`status-dot tone-${option.tone}`}
                  aria-hidden="true"
                />
              )}
              <span>{option.label}</span>
              {option.value === value && <Icon name="check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  titleId,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
    >
      {children}
    </dialog>
  );
}

export function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia?.("(max-width: 760px)").matches ?? false,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(media.matches);
    // The viewport may have changed between the first render and this effect.
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}

export const agentName = (agent: Agent) =>
  ({
    codex: "Codex",
    claude: "Claude Code",
    opencode: "OpenCode",
    gemini: "Gemini CLI",
    hermes: "Hermes",
    local: "Lokalny LLM",
    antigravity: "Antigravity",
  })[agent];
export function AgentAvatar({ agent }: { agent: Agent }) {
  return (
    <span
      className="agent-avatar"
      title={agentName(agent)}
      aria-label={agentName(agent)}
    >
      <ProviderIcon provider={agent} />
    </span>
  );
}
export function relativeTime(at: string, language: string) {
  const seconds = Math.round((new Date(at).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(0, "minute");
  if (Math.abs(seconds) < 3600)
    return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400)
    return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}

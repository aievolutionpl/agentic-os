import React, { useRef, useState } from "react";
import type { Agent, ProviderSetting } from "../shared";
import { AGENTS } from "../shared";
import { Icon, agentName, connectionLabel, connectionState } from "./ui";
import { ProviderIcon } from "./ProviderIcon";

/** Mirrors ATTACHMENT_LIMITS in the main process, which enforces them again. */
const LIMITS = { files: 5, bytes: 100_000, total: 200_000 };
export type Attachment = { name: string; content: string };

export function useAttachments() {
  const [files, setFiles] = useState<Attachment[]>([]),
    [problem, setProblem] = useState("");
  async function add(list: FileList | File[]) {
    setProblem("");
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= LIMITS.files) return setProblem("ATTACHMENT_LIMIT");
      const total = next.reduce((n, f) => n + new Blob([f.content]).size, 0);
      if (file.size > LIMITS.bytes || total + file.size > LIMITS.total)
        return setProblem("ATTACHMENT_TOO_LARGE");
      const content = await file.text();
      if (content.includes("\u0000")) return setProblem("ATTACHMENT_NOT_TEXT");
      if (!next.some((f) => f.name === file.name && f.content === content))
        next.push({ name: file.name, content });
      setFiles([...next]);
    }
  }
  return {
    files,
    problem,
    add,
    fail: setProblem,
    remove: (index: number) => setFiles(files.filter((_, i) => i !== index)),
    clear: () => {
      setFiles([]);
      setProblem("");
    },
  };
}

export function AttachButton({
  pl,
  disabled,
  onFiles,
}: {
  pl: boolean;
  disabled?: boolean;
  onFiles: (files: FileList) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="composer-tool"
        aria-label={pl ? "Dołącz pliki" : "Attach files"}
        title={
          pl
            ? "Dołącz pliki tekstowe (do 5, maks. 100 KB każdy)"
            : "Attach text files (up to 5, 100 KB each)"
        }
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Icon name="attach" />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

export function AttachmentChips({
  files,
  pl,
  onRemove,
}: {
  files: { name: string; bytes?: number; content?: string }[];
  pl: boolean;
  onRemove?: (index: number) => void;
}) {
  if (!files.length) return null;
  return (
    <ul
      className="attachment-chips"
      aria-label={pl ? "Załączniki" : "Attachments"}
    >
      {files.map((f, i) => {
        const bytes = f.bytes ?? new Blob([f.content ?? ""]).size;
        return (
          <li key={`${f.name}-${i}`}>
            <Icon name="file" />
            <span title={f.name}>{f.name}</span>
            <small>
              {bytes < 1024 ? `${bytes} B` : `${Math.ceil(bytes / 1024)} KB`}
            </small>
            {onRemove && (
              <button
                type="button"
                aria-label={(pl ? "Usuń " : "Remove ") + f.name}
                onClick={() => onRemove(i)}
              >
                <Icon name="close" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Agent choice as lit glyphs: a recorded passing check is visibly connected. */
export function AgentStrip({
  value,
  providers,
  pl,
  onChange,
}: {
  value: Agent;
  providers: ProviderSetting[];
  pl: boolean;
  onChange: (agent: Agent) => void;
}) {
  return (
    <div
      className="agent-strip"
      role="group"
      aria-label={pl ? "Agent czatu" : "Chat agent"}
    >
      {AGENTS.map((id) => {
        const state = connectionState(providers.find((p) => p.id === id));
        return (
          <button
            key={id}
            type="button"
            className={`state-${state}${value === id ? " chosen" : ""}`}
            aria-pressed={value === id}
            title={`${agentName(id)} · ${connectionLabel(state, pl)}`}
            onClick={() => onChange(id)}
          >
            <span className="picker-glyph">
              <ProviderIcon provider={id} />
              {state !== "none" && (
                <i className="connection-dot" aria-hidden="true" />
              )}
            </span>
            <span>
              <strong>{agentName(id)}</strong>
              <small>{connectionLabel(state, pl)}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Drop zone wrapper: files dropped anywhere on the composer are attached. */
export function useDrop(onFiles: (files: FileList) => void, enabled = true) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!enabled || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        if (!enabled || !e.dataTransfer.files.length) return;
        e.preventDefault();
        onFiles(e.dataTransfer.files);
      },
    },
  };
}

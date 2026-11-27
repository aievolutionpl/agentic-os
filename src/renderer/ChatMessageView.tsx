import React, { memo, useCallback, useLayoutEffect, useRef } from "react";
import type { Agent, ChatMessage } from "../shared";
import { Icon, agentName } from "./ui";
import { ProviderIcon } from "./ProviderIcon";
import { MessageText } from "./MessageText";
import { AttachmentChips } from "./ChatComposer";

export type MessageAction = "remember" | "task" | "second-opinion" | "copy";

/**
 * Returns a function with a stable identity that always calls the latest
 * `handler`. Lets memoized children receive callbacks without re-rendering
 * whenever the parent re-renders (for example on every composer keystroke).
 */
export function useStableCallback<A extends unknown[], R>(
  handler: (...args: A) => R,
): (...args: A) => R {
  const latest = useRef(handler);
  useLayoutEffect(() => {
    latest.current = handler;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}

interface Props {
  message: ChatMessage;
  agent: Agent;
  language: "pl" | "en";
  onAction: (action: MessageAction, message: ChatMessage) => void;
}

/**
 * One conversation message. Memoized: a message re-renders only when its own
 * data (content, status, attachments) or the chat agent/language changes, so
 * typing in the composer no longer re-parses Markdown for the whole history.
 */
export const ChatMessageView = memo(function ChatMessageView({
  message: m,
  agent,
  language,
  onAction,
}: Props) {
  const pl = language === "pl";
  return (
    <article className={`chat-message ${m.role}`}>
      <div className="message-author">
        {m.role === "assistant" ? (
          <ProviderIcon provider={agent} />
        ) : (
          <Icon name="user" />
        )}
        <strong>
          {m.role === "assistant" ? agentName(agent) : pl ? "Ty" : "You"}
        </strong>
        <time>
          {new Date(m.at).toLocaleTimeString(language, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>
      {m.attachments && <AttachmentChips files={m.attachments} pl={pl} />}
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
          <button onClick={() => onAction("remember", m)}>
            <Icon name="memory" />
            {pl ? "Zapamiętaj" : "Remember"}
          </button>
          <button onClick={() => onAction("task", m)}>
            <Icon name="task" />
            {pl ? "Utwórz zadanie" : "Create task"}
          </button>
          <button type="button" onClick={() => onAction("second-opinion", m)}>
            <Icon name="swap" />
            {pl ? "Druga opinia" : "Second opinion"}
          </button>
          <button onClick={() => onAction("copy", m)}>
            <Icon name="copy" />
            {pl ? "Kopiuj" : "Copy"}
          </button>
        </div>
      )}
    </article>
  );
}, sameMessageProps);

function sameAttachments(
  a: ChatMessage["attachments"],
  b: ChatMessage["attachments"],
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((file, i) => file.name === b[i]!.name && file.bytes === b[i]!.bytes);
}

/** Field-wise comparison: chat polling returns new objects for unchanged messages. */
export function sameMessageProps(prev: Props, next: Props): boolean {
  const a = prev.message,
    b = next.message;
  return (
    prev.agent === next.agent &&
    prev.language === next.language &&
    prev.onAction === next.onAction &&
    a.id === b.id &&
    a.role === b.role &&
    a.content === b.content &&
    a.at === b.at &&
    a.status === b.status &&
    sameAttachments(a.attachments, b.attachments)
  );
}

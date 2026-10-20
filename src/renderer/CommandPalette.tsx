import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Modal } from "./ui";

export interface Command {
  id: string;
  label: string;
  group: string;
  icon: string;
  hint?: string;
  run: () => void;
}

/** Every query word must appear in the label, hint or group. */
export function filterCommands(commands: Command[], query: string) {
  const needle = query.trim().toLocaleLowerCase(),
    words = needle.split(/\s+/).filter(Boolean);
  // Labels that start with the query rank first, then label matches, then the rest.
  const score = (c: Command) => {
    const label = c.label.toLocaleLowerCase();
    return label.startsWith(needle) ? 0 : label.includes(needle) ? 1 : 2;
  };
  return commands
    .filter((c) => {
      const text = `${c.label} ${c.hint ?? ""} ${c.group}`.toLocaleLowerCase();
      return words.every((w) => text.includes(w));
    })
    .map((c, i) => ({ c, i, s: needle ? score(c) : 0 }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map(({ c }) => c);
}

export function CommandPalette({
  open,
  onClose,
  commands,
  language,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  language: "pl" | "en";
}) {
  const pl = language === "pl";
  const [query, setQuery] = useState(""),
    [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLUListElement>(null);
  const results = useMemo(
    () => filterCommands(commands, query).slice(0, 40),
    [commands, query],
  );
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    queueMicrotask(() => input.current?.focus());
  }, [open]);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      titleId="palette-title"
      className="command-palette"
    >
      <h2 id="palette-title" className="sr-only">
        {pl ? "Paleta poleceń" : "Command palette"}
      </h2>
      <div className="palette-search">
        <Icon name="search" />
        <input
          ref={input}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-results"
          aria-activedescendant={
            results[index] ? `palette-${results[index].id}` : undefined
          }
          aria-label={pl ? "Szukaj poleceń" : "Search commands"}
          placeholder={
            pl
              ? "Przejdź do widoku, projektu lub akcji…"
              : "Go to a view, project or action…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(results[index]);
            }
          }}
        />
        <kbd>Esc</kbd>
      </div>
      <ul
        id="palette-results"
        role="listbox"
        ref={list}
        aria-label={pl ? "Polecenia" : "Commands"}
      >
        {results.map((command, i) => (
          <li
            key={command.id}
            id={`palette-${command.id}`}
            role="option"
            data-index={i}
            aria-selected={i === index}
            className={i === index ? "active" : ""}
            onMouseMove={() => setIndex(i)}
            onClick={() => run(command)}
          >
            <Icon name={command.icon} />
            <span>{command.label}</span>
            <small>{command.hint ?? command.group}</small>
          </li>
        ))}
        {!results.length && (
          <li className="palette-empty" role="option" aria-selected="false">
            {pl ? "Brak wyników" : "No results"}
          </li>
        )}
      </ul>
    </Modal>
  );
}

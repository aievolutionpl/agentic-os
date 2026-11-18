import React, { useState } from "react";
import {
  parseTemplates,
  upsertTemplate,
  type PromptTemplate,
} from "./chat-history";

type Item = [plName: string, enName: string, plPrompt: string, enPrompt: string];
const groups: { pl: string; en: string; items: Item[] }[] = [
  {
    pl: "Mój dzień",
    en: "My day",
    items: [
      ["Plan dnia", "Day plan", "Pomóż mi zaplanować dzień. Zapytaj o moje priorytety i dostępny czas, następnie zaproponuj 2–3 warianty planu.", "Help me plan my day. Ask about my priorities and available time, then propose 2–3 plan options."],
      ["Decyzja", "Decision", "Pomóż mi podjąć decyzję. Ustal cel i ograniczenia, porównaj opcje i zarekomenduj rozwiązanie.", "Help me make a decision. Establish the goal and constraints, compare the options and recommend one."],
      ["Podsumowanie", "Summary", "Podsumuj ustalenia tej rozmowy i wypisz kolejne kroki z priorytetami.", "Summarize what this conversation settled and list the next steps by priority."],
    ],
  },
  {
    pl: "Tworzenie",
    en: "Create",
    items: [
      ["Strona", "Web page", "Pomóż mi zaprojektować stronę na podstawie materiałów i celu. Zapytaj o odbiorców i styl.", "Help me design a web page from my materials and goal. Ask about the audience and style."],
      ["Tekst", "Copy", "Pomóż mi napisać tekst. Ustal odbiorców, kanał i cel, potem zaproponuj trzy kierunki.", "Help me write copy. Establish the audience, channel and goal, then propose three directions."],
      ["Projekt 3D", "3D scene", "Zaplanuj scenę 3D: kompozycję, materiały, światło i sposób wykonania dostępnymi narzędziami.", "Plan a 3D scene: composition, materials, lighting and how to build it with available tools."],
    ],
  },
  {
    pl: "Kod i wiedza",
    en: "Code and knowledge",
    items: [
      ["Przegląd kodu", "Code review", "Przejrzyj projekt i wskaż najważniejsze błędy oraz sposób ich weryfikacji.", "Review the project and point out the most important bugs and how to verify them."],
      ["Napisz testy", "Write tests", "Wskaż najważniejsze nieprzetestowane ścieżki w projekcie i zaproponuj testy, które je pokryją. Zacznij od przypadków brzegowych.", "Identify the most important untested paths in the project and propose tests that cover them. Start with edge cases."],
      ["Wyjaśnij kod", "Explain code", "Wyjaśnij, jak działa ten kod: główny przepływ, kluczowe struktury danych i miejsca, w których łatwo o błąd.", "Explain how this code works: the main flow, key data structures and the places where mistakes are easy."],
      ["Zbadaj temat", "Research", "Pomóż mi zbadać temat. Zapytaj o zakres i oczekiwany rezultat; oddziel potwierdzone fakty od hipotez.", "Help me research a topic. Ask about scope and expected outcome; separate confirmed facts from hypotheses."],
      ["Dobierz skille", "Pick skills", "Dobierz skille do mojego zadania. Sprawdź, które są zainstalowane, i wskaż brakujące możliwości.", "Pick skills for my task. Check which are installed and point out missing capabilities."],
    ],
  },
];

const STORAGE_KEY = "agenting.ui.prompt-templates.v1";
function load(): PromptTemplate[] {
  try {
    return parseTemplates(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}
function persist(list: PromptTemplate[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* Storage can be unavailable; templates then last for this session only. */
  }
}

export function CommandMenu({
  onChoose,
  disabled,
  pl = true,
  draft = "",
}: {
  onChoose: (prompt: string) => void;
  disabled?: boolean;
  pl?: boolean;
  draft?: string;
}) {
  const [mine, setMine] = useState<PromptTemplate[]>(load);
  const [naming, setNaming] = useState<string | null>(null);
  const save = (list: PromptTemplate[]) => {
    setMine(list);
    persist(list);
  };
  const commit = () => {
    if (!naming?.trim()) return;
    save(upsertTemplate(mine, naming, draft));
    setNaming(null);
  };
  return (
    <div className="command-menu-wrap">
      <label className="command-menu">
        {pl ? "Szybkie działanie" : "Quick action"}
        <select
          aria-label={pl ? "Szablony poleceń" : "Prompt templates"}
          disabled={disabled}
          value=""
          onChange={(e) => {
            if (e.target.value) onChoose(e.target.value);
          }}
        >
          <option value="">{pl ? "Wybierz zadanie…" : "Choose a task…"}</option>
          {!!mine.length && (
            <optgroup label={pl ? "Moje szablony" : "My templates"}>
              {mine.map((t) => (
                <option key={`mine-${t.name}`} value={t.prompt}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          )}
          {groups.map((g) => (
            <optgroup label={pl ? g.pl : g.en} key={g.en}>
              {g.items.map(([plName, enName, plPrompt, enPrompt]) => (
                <option key={enName} value={pl ? plPrompt : enPrompt}>
                  {pl ? plName : enName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {naming === null ? (
        <div className="command-menu-actions">
          <button
            type="button"
            className="secondary"
            disabled={disabled || !draft.trim()}
            title={
              pl
                ? "Zapisz wpisaną wiadomość jako szablon na później"
                : "Save the typed message as a reusable template"
            }
            onClick={() => setNaming("")}
          >
            {pl ? "Zapisz jako szablon" : "Save as template"}
          </button>
          {!!mine.length && (
            <select
              aria-label={pl ? "Usuń szablon" : "Delete template"}
              value=""
              onChange={(e) => {
                if (e.target.value)
                  save(mine.filter((t) => t.name !== e.target.value));
              }}
            >
              <option value="">{pl ? "Usuń szablon…" : "Delete template…"}</option>
              {mine.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : (
        // Not a <form>: this menu renders inside the composer's own form.
        <div className="command-menu-actions" role="group" aria-label={pl ? "Nowy szablon" : "New template"}>
          <input
            autoFocus
            maxLength={60}
            aria-label={pl ? "Nazwa szablonu" : "Template name"}
            placeholder={pl ? "Nazwa szablonu" : "Template name"}
            value={naming}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setNaming(null);
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                commit();
              }
            }}
          />
          <button type="button" disabled={!naming.trim()} onClick={commit}>
            {pl ? "Zapisz" : "Save"}
          </button>
          <button type="button" className="secondary" onClick={() => setNaming(null)}>
            {pl ? "Anuluj" : "Cancel"}
          </button>
        </div>
      )}
    </div>
  );
}

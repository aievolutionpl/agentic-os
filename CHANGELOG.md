# Changelog

## Unreleased

- **Matrix Terminal** palette: phosphor green on black, monospace UI, CRT scanlines, a green-tinted logo, a matching xterm palette and a quiet digital rain that freezes for reduced motion and "Reduce motion"; "Plain background" removes rain and scanlines, "Reduce glass" removes scanlines. All text tokens meet WCAG AA.
- Navigation audit: one shared screen registry for the breadcrumb, window title, command palette and `Alt` shortcuts; Plugins (`Alt+9`) and ScheduleJob (`Alt+0`) are now reachable from the palette and keyboard.
- Back navigation with `Alt+←`, the mouse back button, a header arrow and a palette entry.
- The sidebar "More" group opens while Terminal, Harness or Work & questions is active, and marks it with `aria-current`.
- Fixed a dangling `·` in the Harness palette hint; workspace layout settings are now translated to English.

## 0.5.0-rc.3 — 2026-10-24

- White-letter logo for dark themes, preserving the original logo in light palettes.
- Fixed theme-menu stacking above the conversation surface.
- Refreshed Polish/English README and real Electron gallery with six themes.

- Pure White theme, wrapping quota header without horizontal scrolling, wider composer and visible model/workspace selection.
- Polish-first Whisper settings and hold-to-talk controls; additional daily-work integrations.
- Explicit official CLI installers for Codex, Claude and Antigravity with dependency checks, PTY output, cancellation and exit/version verification.
- Official CLI login terminals and a first-project task entry point after connection verification.
- Task-aware routing with checked subscription agents; optional Jev decision-model role, bounded structured choices, rule fallback and local decision history. Jev cannot grant execution permissions.
- Electron 43.8.3, undici 8.12.3 and fast-uri 3.1.9 security updates.

Unsigned Windows preview; no automatic updater. Live provider accounts and clean-machine installer lifecycle remain separate manual checks.

## 0.5.0-rc.2 — 2026-10-23

- Pięć palet, kompaktowy czat, szerszy obszar odpowiedzi i uproszczona nawigacja projektów.
- Aktywni agenci i wspólne źródła limitów bez duplikatów; przełączniki połączeń.
- 33 pakiety skili, w tym 10 marketingowych, z zachowaniem plików przy wyłączaniu.
- Panel pluginów Google Drive, Canva, Notion i Firecrawl z szyfrowaniem danych logowania. Narzędzia uruchamiane ręcznie, wyniki przekazywane do pamięci.
- Rozbudowane ustawienia i instrukcja harness, odświeżona dokumentacja PL/EN oraz galeria.
- Nadal preview: bez podpisanego instalatora, automatycznych aktualizacji ani bezpośredniej edycji folderu / Auto accept w czacie. Logowanie do usług wymaga własnego konta.


## 0.5.0-rc.1 — opublikowany podgląd

- Workspace premium: motywy Grafit/Jasny/Classic · Terra, klasyczny nagłówek, kompaktowe opcje w polu rozmowy i rzeczywiste logotypy dostawców.
- Model wybierany osobno dla rozmowy i przekazywany do właściwego adaptera. Antigravity pozostaje; Gemini CLI znika z aktywnego interfejsu.
- Automatyczny lokalny graf pamięci MCP, dwukierunkowe notatki Markdown, jawne relacje i dobór kontekstu w granicach projektu.
- Osiem pełnych, przypiętych pakietów Anthropic/Superpowers instalowanych jednym przyciskiem z dokumentacją, licencją i zapisem w pamięci.
- Kanban „Praca i pytania”, rzeczywiste zdarzenia pracy agentów i pełne karty wszystkich skonfigurowanych subskrypcji.
- Nieblokujące wczytywanie projektów podczas odczytów CLI i poprawka wycieku workera ConPTY po zamknięciu terminala. [Opis, źródła i ograniczenia](docs/PREMIUM_WORKSPACE.md).

- Wbudowany terminal PTY: sześć kart, katalog projektu, PowerShell/Bash/sh, zachowanie sesji podczas nawigacji, potwierdzenie zamknięcia i ograniczony bufor wyjścia.
- Czat: bezpieczne renderowanie Markdown/GFM, kopiowanie kodu i całej rozmowy, wyszukiwanie historii, zmiana nazwy i osobne szkice z załącznikami. Przewijanie za odpowiedzią tylko przy końcu rozmowy.
- Poprawione wykorzystanie miejsca w małych oknach, oba motywy, stany pracy i krótkie animacje respektujące ograniczenie ruchu.
- Podgląd zespołu przed startem kolejki: role, zapisany model/CLI, daty testów i brakujące połączenia. Inspirowany analizą Claudex Loop i CC Switch; bez kopiowania ich kodu.
- Naprawione kopiowanie w sesji Electron odrzucającej ogólne uprawnienia schowka; współdzielony mechanizm kopiowania w geście użytkownika.
- Poprawiona zgodność `env-paths` z `node-gyp`, jawne rozpakowanie natywnych plików terminala w pakiecie i test PTY w wypakowanej aplikacji Windows.
- Błąd ładowania natywnego terminala nie blokuje startu całej aplikacji; nieudane otwarcie nie zostawia pozornej sesji.
- Testy prawdziwego terminala, nowy scenariusz Electron `qa:workbench`, aktualne artefakty QA w CI, audyt dokumentacji i odświeżone notices zależności.
- README po polsku, dodatkowy angielski, nowe rzeczywiste zrzuty interfejsu, porównanie projektów i opis granic wydania.

Status i ograniczenia: [RELEASE_STATUS.md](docs/RELEASE_STATUS.md). Zmiana nie publikuje instalatora i nie dodaje podpisywania ani automatycznych aktualizacji.

## 0.4.x i wcześniejsze

Historia etapów: [STATUS.md](docs/STATUS.md), [audyt workspace](docs/WORKSPACE_AUDIT.md), [audyt harnessu](docs/HARNESS_AUDIT.md). Te materiały opisują datowane wyniki wcześniejszych zmian; nie zastępują bieżącego statusu.

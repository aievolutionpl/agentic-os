# Agenting OS — Rozbudowa systemu (Q1 2027)

**Baza:** `main @ 408461e` (po merge PR #27 i #29), `v0.5.0-rc.1`, schema v16, 223/223 testów
**Metoda:** skan kodu (`src/main/**` 60 modułów, `src/renderer/**` 40 paneli, 163 metody API, 45 typów) + audyt istniejących luk.
**Rola:** plan rozwoju **funkcjonalnego** — nowe moduły i opcje. Plan higieny (`PLAN-REFINE-2026-10-22.md`) i plan produktowy A–F (`docs/ROADMAP_PRODUCT.md`) są niezależne i się nie powtarzają.

---

## 0. Diagnoza: co Agenting OS **ma** i czego **nie ma w ogóle**

### Ma (uziemione w kodzie)
worktree per zadanie · Master + misje + kroki · recenzent niezależny · review evidence · approval model · usage ledger · polityka + budżet · 5 dostawców CLI (codex/claude/gemini/opencode/local) + ACP + OpenRouter · quota 4 źródeł · pamięć + vault + graf + knowledge hub · MCP + extensions + skills · przeglądarka + terminale · backupy + diagnostyka · 40 paneli UI · 163 metody API

### Nie ma — **0 trafień w całym `src/`** (zmierzone, nie zgadnięte)

| Brak | Konsekwencja |
|---|---|
| **trybu headless / CLI** (`package.json` nie ma `bin`) | system jest wyłącznie aplikacją okienkową — nie da się go wpiąć w CI, crona, innego agenta |
| **`git push` / commita / tworzenia PR** (tylko `worktree add` w `git.ts`) | pętla się nie zamyka: zmiana powstaje lokalnie i nie ma dokąd trafić — brak „done" dla użytkownika |
| **audit trailu** (zero trafień `audit`) | nie wiadomo, kto/co/kiedy/za ile — brak odpowiedzialności i wykrywania wzorców |
| **trybu dry-run** | brak podglądu „co by się stało" przed zastosowaniem |
| **cofnięcia zastosowanej zmiany** (jest tylko SQL `ROLLBACK`) | błędny agent = ręczne `git reset` przez użytkownika |
| **watchingu repo / triggerów** (brak `fs.watch`) | agent nie reaguje na zmianę w kodzie — praca jest jednorazowa, nie ciągła |
| **harmonogramu / zadań cyklicznych** | brak „codziennie sprawdź i napraw" |
| **notyfikacji OS** (jest tylko toast w oknie) | zamknięte okno = cisza, przepadające zdarzenia |
| **wyszukiwania globalnego** (brak fuzzy indexu po Runach/Memory/Taskach) | przy >50 runach nie da się znaleźć niczego |
| **podglądu sieci MCP** (brak katalogu serwerów) | użytkownik nie wie, co może zainstalować |
| **insights/telemetrii lokalnej** | brak danych: nie wiadomo, ile realnie kosztuje i ile czasu zajmuje |

### Wniosek
Produkt ma **głęboką maszynerię** i **płytkie wejście**. Nie brakuje mu funkcji wewnętrznych — brakuje mu:
1. **wyjścia ze świata okienkowego** (headless),
2. **zamknięcia pętli do GitHuba**,
3. **warstwy zaufania** (audit, dry-run, rollback),
4. **pracy ciągłej** (watch, harmonogram, powiadomienia).

Te cztery obszary dają największy zwrot i są nieobsłużone.

---

## 1. STRUMIEŃ G — Headless core: Agenting OS jako backend (P0, ~2 tygodnie)

**Cel:** ten sam silnik dostępny bez okna — dla CI, cronów, innych agentów i Hermesa.

| # | Zadanie | Zakres | Akceptacja | Wysiłek |
|---|---|---|---|---|
| G1 | **`bin/agenting`** — CLI z `doctor`, `mission`, `run`, `review`, `apply`, `cost`, `list` | nowy `src/cli/`, `package.json` → `bin` | `agenting doctor` na czystym profilu wypisuje stan providerów, policy, budżetu; exit code ≠ 0 przy problemie | 3 d |
| G2 | **Serwer lokalny** — ten sam `Supervisor` wystawiony przez JSON-RPC **stdio** (nie HTTP) | `src/cli/serve.ts`, refaktor `src/main/index.ts` → `createCore()` | Dwa procesy (CLI + klient) dzielą jeden stan; klient nie ma dostępu do niczego poza dozwolonym API | 4 d |
| G3 | **Wynik jako JSON / NDJSON** — `--json` na każdym poleceniu, zdarzenia strumieniowo | `src/cli/output.ts` | `agenting mission --json` → stabilny schemat, `--ndjson` → strumień zdarzeń; test kontraktowy na schemat | 2 d |
| G4 | **Wyjście kodu w CI** — `--check`, `--exit-code`, `--report junit.xml` | `src/cli/report.ts` | JUnit XML wgrywa się do GitHub Actions; runner `agenting check` w 2 d | 2 d |
| G5 | **Tryb `--dry-run`** — plan i koszt bez wykonania ani płatnego requestu | `src/main/dry-run.ts` | Żaden request do providera nie wychodzi; zwraca plan, koszt i przewidywane pliki | 2 d |
| G6 | **Adapter HTTP (lokalny, z tokenem)** — do obsługi z telefonu/terminala | `src/cli/http.ts` | Token z `safeStorage`, bind na `127.0.0.1`, CORS zamknięty | 3 d |

**Dlaczego to priorytet 1:** dopóki system nie ma trybu headless, jest aplikacją desktopową — maksymalnie jednego użytkownika w jednym momencie. Po G1–G4 ten sam kod obsługuje **crona, CI i innego agenta** (Hermes, Claude Code) → z jednego produktu robi się platforma.

**Gate:** `agenting mission "napraw test" --json` w headless daje plan → wykonanie → review → koszt, bez otwierania okna.

---

## 2. STRUMIEŃ H — Round-trip do GitHuba: zamknięta pętla (P0, ~2 tygodnie)

**Cel:** zmiana nie zostaje w lokalnym worktree — trafia tam, gdzie zespół ją zobaczy.

| # | Zadanie | Zakres | Akceptacja | Wysiłek |
|---|---|---|---|---|
| H1 | **Warstwa commit** — `commit` w worktree: stage, message z modelu, autor, podpis opcjonalny | nowy `src/main/git-commit.ts` (rozszerzenie `git.ts`) | Agent tworzy commit zgodnie z Conventional Commits; `--amend` jawnie, bez automatycznego force-push | 3 d |
| H2 | **Branch z namingiem** — `feat/`, `fix/`, `chore/` + slug z celu zadania | `src/main/git-commit.ts` | Nazwa jest deterministyczna i powtarzalna dla tego samego celu | 1 d |
| H3 | **Push + PR** przez `gh` (uwierzytelnienie należy do `gh`, nie do nas) | `src/main/github-pr.ts` | Po zastosowaniu zmiany: push do fork/branch i PR z opisem, diffem, testami, kosztem i dowodami z review | 4 d |
| H4 | **PR body z dowodami** — automatyczny opis: cel, podejście, pliki, testy, screenshoty, koszt, ryzyka | `src/main/github-pr.ts`, `src/main/review-evidence.ts` | PR zawiera sekcję „Koszt" i „Dowody" wypełnioną z realnego runu, nie z szablonu | 2 d |
| H5 | **Wrzutki recenzji** — komentarze recenzenta trafiają do PR-a, nie zostają w aplikacji | `src/main/github-pr.ts` | Finding recenzenta → komentarz w PR z plik/linia; rozwiązanie → reply w wątku | 3 d |
| H6 | **Sync status** — stan PR-a (CI, review, merge) widoczny w aplikacji | `src/main/github-pr.ts` + panel | Użytkownik widzi „CI zielone / 1 oczekująca recenzja" bez wychodzenia z aplikacji | 2 d |
| H7 | **Bramka push** — push tylko po: zielonych testach, review i jawnej zgodzie | `src/main/policy.ts` | Próba push bez review → `POLICY_APPROVAL_REQUIRED`, nie cichy bypass | 2 d |

**Dlaczego priorytet 2:** dziś najdalsze, co da się zrobić, to lokalny diff. To oznacza, że cały wysiłek agenta kończy się ręcznym `git push` przez użytkownika. H1–H7 przenoszą tę ostatnią minutę do systemu — to najbardziej odczuwalna różnica „działa vs nie działa".

**Gate:** jedno zadanie → commit → push → PR z dowodami → status CI w aplikacji, bez dotykania terminala.

---

## 3. STRUMIEŃ I — Warstwa zaufania: audit, dry-run, rollback (P0, ~2 tygodnie)

**Cel:** zaufanie do automatyzacji = widoczność + odwracalność.

| # | Zadanie | Zakres | Akceptacja | Wysiłek |
|---|---|---|---|---|
| I1 | **Audit trail** — każda akcja agenta: kto, co, kiedy, na której bazie, jaki commit, jaki koszt, jaka decyzja | nowy `src/main/audit.ts` + tabela `audit_log` (schema v17) | Pełna historia w UI z filtrem po projekcie/agencie/zasobie; wpisów nie da się usunąć przez UI | 4 d |
| I2 | **Wyszukiwanie audytu** — filtry po czasie, agencie, typie akcji, wyniku | `src/renderer/AuditPanel.tsx` | Znalezienie „wszystkich płatnych requestów wczoraj przez Codex" w 2 kliknięcia | 2 d |
| I3 | **Decyzje z uzasadnieniem** — dlaczego router wybrał ten model, dlaczego agent dostał rolę | `src/main/router.ts` → `src/main/audit.ts` | Każdy wybór modelu ma wpis w audycie z alternatywami i progiem | 2 d |
| I4 | **Rollback zastosowanej zmiany** — cofnij commit w worktree, cofnij apply, cofnij merge | `src/main/rollback.ts` | Jeden przycisk „cofnij ostatnią zmianę" działa dla 3 przypadków; pytanie o zgodę zawsze | 4 d |
| I5 | **Punkty przywracania** — snapshot stanu projektu przed każdym ryzykownym krokiem | `src/main/backup.ts` | Punkt przywracania dla projektu i zadania; przywrócenie daje identyczny stan (test round-trip) | 3 d |
| I6 | **Tryb „tylko odczyt" jako domyślny dla nowych projektów** | `src/main/policy.ts` | Nowy projekt startuje z `read-only`; przełączenie na zapis wymaga świadomej akcji | 1 d |
| I7 | **Redakcja w audycie** — sekrety, tokeny, ścieżki prywatne nigdy nie trafiają do logu | `src/main/validate.ts` | Test: podanie sekretu → w audycie „[redacted]" | 2 d |

**Dlaczego priorytet 3:** agent z dostępem do kodu i płatnych API bez dziennika i bez cofnięcia to nie „automatyzacja", to „ryzyko z interfejsem". I1–I7 są warunkiem, żeby cokolwiek z G i H wdrożyć do realnego użytku.

**Gate:** pytanie „kto i ile wydał w tym tygodniu" daje odpowiedź w 30 sekund; zepsuty run da się cofnąć bez `git reset`.

---

## 4. STRUMIEŃ J — Praca ciągła: watch, harmonogram, powiadomienia (P1, ~2 tygodnie)

**Cel:** system działa, gdy użytkownik nie patrzy.

| # | Zadanie | Zakres | Akceptacja | Wysiłek |
|---|---|---|---|---|
| J1 | **Watcher repo** — `fs.watch` z debounce → zdarzenie „plik się zmienił" → oferty zadania | nowy `src/main/watcher.ts` | Zmiana pliku → pojawia się propozycja zadania; brak pętli feedbacku przy własnych zapisach agenta | 3 d |
| J2 | **Harmonogram zadań** — cykliczne: co godzinę / dziennie / po commicie | `src/main/scheduler.ts` + tabela `schedules` | Zadanie cykliczne startuje się o zaplanowanej godzinie; można włączyć/wyłączyć; historia wykonań | 4 d |
| J3 | **Wyzwalacze zdarzeń** — „gdy CI padnie", „gdy pojawi się review", „gdy zależność się zaktualizuje" | `src/main/scheduler.ts` | Wyzwalacz uruchamia misję z szablonu; zdarzenie z GitHuba przychodzi lokalnie (poll) | 3 d |
| J4 | **Powiadomienia OS** — Windows toast / macOS notification / Linux, z akcją „otwórz" | `src/main/notifications.ts` (Electron `Notification`) | Powiadomienie o zakończonym runie z zielonym/czerwonym statusem; klik otwiera właściwy widok | 2 d |
| J5 | **Bufor powiadomień** — nieprzeczytane zdarzenia czekają, widoczne w Inbox | `src/renderer/Inbox.tsx` | Zdarzenie z zamkniętym oknem nie przepada; po otwarciu Inbox znika | 2 d |
| J6 | **Ciche godziny** — powiadomienia tylko w oknach, które użytkownik ustawi | `src/main/preferences` | Tryb „nie przeszkadzać 22:00–08:00" respektowany | 1 d |
| J7 | **Zużycie zasobów w tle** — watch/scheduler nie obciążają CPU w spoczynku | test obciążeniowy | Idle < 1% CPU; watch 10 000 plików nie zjada CPU | 2 d |

**Dlaczego priorytet 4:** to jest różnica między „aplikacją, którą otwierasz" a „agentem, który pracuje". W połączeniu z G (headless) daje tryb „zostaw i zapomnij" — najbliższy temu, co faktycznie zarabia.

**Gate:** zamknięta aplikacja, nocą cykliczne zadanie wykonuje się, powiadomienie przychodzi, wynik czeka w Inbox.

---

## 5. STRUMIEŃ K — Nawigacja i skala danych (P1, ~1,5 tygodnia)

**Cel:** przy 200 runach i 50 projektach nadal da się wszystko znaleźć.

| # | Zadanie | Zakres | Akceptacja | Wysiłek |
|---|---|---|---|---|
| K1 | **Globalne wyszukiwanie** — fuzzy po Runach, Taskach, Memory, plikach, agentach | nowy `src/main/search.ts` + indeks SQLite FTS5 | Wyszukanie „failing test w repo X" zwraca właściwy run w < 300 ms przy 10 000 wpisów | 4 d |
| K2 | **Wyszukiwarka w Command Palette** (Ctrl+K już istnieje) | `src/renderer/CommandPalette.tsx` | Ten sam wynik co K1, z podglądem i akcją | 2 d |
| K3 | **Widok „Wszystkie runy"** — tabela z filtrem (agent, projekt, status, koszt, czas) | `src/renderer/RunTable.tsx` | 10 000 runów renderuje się w < 1 s (wirtualizacja) | 3 d |
| K4 | **Porównanie dwóch runów** — diff artefaktów, kosztu, czasu, decyzji | `src/renderer/RunCompare.tsx` | Porównanie dwóch runów tego samego zadania: co się różni w plikach i w decyzjach | 2 d |
| K5 | **Zapisane widoki / filtry** — własne filtry utrzymywane między sesjami | `src/renderer` + `preferences` | Filtr „drogie runy Codex z ostatniego tygodnia" zapisuje się i wraca | 2 d |
| K6 | **Lokalne insights** — wykresy kosztu i czasu per projekt/agent/tydzień | `src/main/insights.ts` | Panel insights z wykresem tygodniowym; dane tylko lokalne, eksport opcjonalny | 3 d |

**Dlaczego to priorytet 5:** to, co robi z systemu „demo" — codzienne narzędzie. Insights zamykają też pętlę dowodu wartości (brak telemetrii → lokalne wykresy).

---

## 6. STRUMIEŃ L — Ekosystem i zaufanie do rozszerzeń (P2, ~2 tygodnie)

| # | Zadanie | Akceptacja | Wysiłek |
|---|---|---|---|
| L1 | **Katalog MCP** — przeglądarka dostępnych serwerów z oceną, z opisem uprawnień | 2 d |
| L2 | **Uprawnienia per MCP per projekt** — zamiast globalnego „trust” | 3 d |
| L3 | **Podpisy treści skilli** — instalacja odcina skill, którego hash się zmienił | 3 d |
| L4 | **Kolejka instalacji** — aktualizacja, rollback wersji | 2 d |
| L5 | **Szablony workflow z marketplace** — „napraw buga”, „review PR”, „research”, „migracja” | 3 d |
| L6 | **Prywatne repo z zadaniami** — wewnętrzny serwer zadań, bez zewnętrznej zależności | 4 d |
| L7 | **Wtyczki motywów / układu** | 2 d |

---

## 7. STRUMIEŃ M — Modele własne i multimodalność (P2, ~2 tygodnie)

| # | Zadanie | Akceptacja | Wysiłek |
|---|---|---|---|
| M1 | **OpenRouter jako pełnoprawny dostawca** — nie tylko quota, ale i wykonanie | 4 d |
| M2 | **Adapter modeli lokalnych** (llama.cpp / Ollama) — z prawdziwym streamingiem | 4 d |
| M3 | **Wybór modelu per zadanie** — model może być częścią definicji misji | 2 d |
| M4 | **Wzrok i dźwięk w artefaktach** — agent dostaje screenshot jako wejście | 3 d |
| M5 | **Wideo z terminala / przeglądarki** — nagranie przepływu jako dowód | 3 d |
| M6 | **Rozpoznawanie głosu** — dyktowanie zadania | 2 d |

---

## 8. Priorytety i kolejność

| Priorytet | Strumień | Tydzień | Efekt |
|---|---|---|---|
| **P0** | **G — headless** | 1–2 | system staje się backendem, nie tylko oknem |
| **P0** | **H — round-trip GitHub** | 3–4 | pętla się zamyka: zmiana trafia do PR |
| **P0** | **I — zaufanie** | 5–6 | audit, dry-run, rollback — warunek użycia w realu |
| **P1** | **J — praca ciągła** | 7–8 | agent pracuje, gdy użytkownik nie patrzy |
| **P1** | **K — nawigacja + insights** | 9–10 | z demo na codzienne narzędzie |
| **P2** | **L — ekosystem** | 11–12 | katalogi, uprawnienia, szablony |
| **P2** | **M — modele i multimedia** | 13–14 | multimodalność i modele własne |

**Zależności:**
- G → wymaga I1 (audit) przed wypuszczeniem na zewnątrz
- H → wymaga I7 (redakcja) i I4 (rollback) — push bez rollbacku to brak odwracalności
- J → wymaga G (headless działa w tle) i I4 (rollback przy automatycznych cyklach)
- K → wymaga I1 (wyszukiwanie audytu korzysta z tego samego indeksu)

**Łączenie z planami już istniejącymi:**
- `PLAN-REFINE-2026-10-22.md` (higiena R, wydajność P6–P8, modułowość P9–P11) → wykonuje się **równolegle**, dotyczy plików, których strumienie G–M prawie nie ruszają
- `docs/ROADMAP_PRODUCT.md` (A–F) → bez zmian; **A1–A5 + B1–B5 + C1–C5 pozostają niezmienione** i są warunkiem wejścia G–M
- `PLAN-REFINE` (P9–P11: rozbicie `main.tsx`, `ChatWorkspace.tsx`, `supervisor.ts`) **musi** poprzedzić G2 i H3 — inaczej refaktor będzie pchał nowy kod w plik, który zaraz się rozpadnie

**Nowa zależność, której nie było:** rozbicie `main/index.ts` (1046) na `createCore()` jest **wymagane** przez G2 — obecnie cała logika IPC siedzi w jednym pliku i nie da się jej użyć headless.

---

## 9. Metryki sukcesu (mierzone lokalnie, zero telemetrii)

| Metryka | Dziś | Cel |
|---|---|---|
| Uruchomienia bez otwierania okna | 0 | **100% zadań możliwe headless** |
| Czas od „done" do PR-a | ręcznie, ∞ | **< 60 s** |
| Czas od decyzji do cofnięcia zmiany | ręczny `git reset` | **< 15 s** |
| Pytanie „kto wydał ile w tym tygodniu" | brak odpowiedzi | **< 30 s** |
| Zadania wykonane bez nadzoru | 0 | **codziennie ≥ 1 cykliczne** |
| Wyszukanie runu w 10 000 wpisów | brak | **< 300 ms** |
| Pełny audyt dostępnych akcji | 0% | **100%** |
| Czas od planu do zastosowania (bez ręcznego push) | ∞ | **< 3 min** |

---

## 10. Czego świadomie NIE robić

- **Nie budować kont, chmury ani logowania** — local-first jest wyróżnikiem, nie do poprawienia.
- **Nie dodawać auto-apply** — recenzja i zgoda zostają, także przy automatycznych cyklach (J).
- **Nie sprzedawać tokenów ani pośredniczyć w płatnościach** — zmienia model ryzyka.
- **Nie robić telemetrii domyślnej** — insights lokalne (K6), eksport tylko na wyraźne żądanie.
- **Nie gonić za ekosystemem (L) przed warstwą zaufania (I)** — katalog MCP bez uprawnień to Tykająca bomba.
- **Nie dodawać nowych dostawców** przed routerem (C2 z ROADMAP_PRODUCT).

---

## 11. Ustalenie z wykonania (22.10, PR #30)

**CI flake: `npm audit --audit-level=moderate` na Windows.**
`verify (windows-latest)` spadł po **10 min** z błędem `npm audit endpoint returned an error` — log pokazuje `npm warn audit network timeout at: https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`. To timeout sieciowy do registry, **nie regresja kodu** (PR #30 to jeden plik Markdown). Po `gh run rerun --job` job przeszedł w 8 min 4 s.

**Wniosek operacyjny:** audit bez fallbacku jest boja gate'em — jedna sieć wyłącza cały pipeline Windows, w tym `windows-package`. Do naprawy w planie higieny (`PLAN-REFINE`):
- `npm audit` z `--audit-level=moderate` i **retry + timeout**, a przy niedostępności registry **nie zabija joba** (fail-soft z ostrzeżeniem), bo bezpieczeństwo i tak pilnuje `npm ci` (lockfile) + CodeQL;
- albo rozdzielić audit na osobny, nieblokujący job.

Dopisek: `gh api -X DELETE repos/.../git/refs/heads/<branch>` wymaga **URL-encoding** separatora `/` w nazwie gałęzi (`claude%2Ftask-graph`). Bez tego API zwraca `Not Found` i sprzątanie wygląda na nieudaną operację.

## 12. Ryzyka

| Ryzyko | Wpływ | Mitygacja |
|---|---|---|
| Headless ujawni błędy, których okno ukrywało | wysoki | G zaczyna się od `doctor` + `--dry-run`; brak zmian w stanie runu |
| Push/PR bez rollbacku = utrata pracy | wysoki | H startuje dopiero po I4–I5 |
| Watch/scheduler zjada zasoby | średni | J7 jako gate (idle < 1% CPU) |
| Audit zapisuje sekret | wysoki | I7 + test na reakcję, redakcja w `validate.ts` |
| Refaktor plików koliduje z nowymi modułami | średni | P9–P11 przed G2/H3; jedna gałąź, kolejność PRów |
| Rozrost API (163 metody) | średni | `createCore()` z jasnym podziałem; nowe metody w namespace per moduł |
| Funkcje bez użytkownika = kod na pół roku | wysoki | każdy strumień ma **Gate** w formie demo, nie listy zadań |

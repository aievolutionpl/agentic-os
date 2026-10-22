# Agenting OS — plan rozwoju produktu (Q4 2026 → Q2 2027)

**Baza:** `main @ fe09350`, wydanie `v0.5.0-rc.1` (2026-10-22)
**Stan wejściowy:** 194 testy / 1 106 asercji, CI Ubuntu+Windows, schema v16, instalator 122,6 MB, 0 gwiazdek, 0 otwartych PR.
**Metoda:** audyt kodu, dokumentacji i artefaktów wydania. Każda pozycja ma zakres plików i kryterium akceptacji, żeby dała się zamknąć w jednym PR.

---

## 0. Diagnoza w trzech zdaniach

Produkt jest **technicznie gotowy, ale produktowo niewidzialny**: nikt nie wie, po co go otworzyć, i po 5 minutach nie ma pewności, że „działa".
Największa luka to nie brak funkcji, tylko **brak pierwszego udanego doświadczenia** (onboarding → pierwsza rozmowa → pierwsza recenzowana zmiana) i **brak dowodu wartości** (koszty, oszczędzony czas, jakość recenzji).
Drugi rząd to skala: jeden Master z maks. 6 krokami sekwencyjnie, brak routera wyboru modelu, brak pracy równoległej.

### Trzy metryki, które mają rosnąć (i które trzeba najpierw zmierzyć)

| Metryka | Definicja | Dziś | Cel Q1 |
| --- | --- | --- | --- |
| **TTFR** | czas od instalacji do pierwszej zakończonej rozmowy | nieznany | < 3 min |
| **TTFA** | czas do pierwszej zastosowanej, zrecenzowanej zmiany | nieznany | < 15 min |
| **W2** | użytkownicy wracający w drugim tygodniu | nieznany | > 25% |

Bez telemetrii (której świadomie nie ma) mierzymy **lokalnie i za zgodą**: licznik zdarzeń w SQLite + opcjonalny eksport „local insights", zero wysyłki domyślnie.

---

## 1. STRUMIEŃ A — Pierwsze 15 minut (P0, ~2 tygodnie)

**Cel:** każdy, kto uruchomi aplikację, kończy pierwszą recenzowaną zmianę bez czytania README.

| # | Zadanie | Zakres | Akceptacja | Wysiłek |
| --- | --- | --- | --- | --- |
| A1 | **Onboarding wizard** 4 ekrany: wykryj CLI → wybierz dostawcę → utwórz demo-repo → pierwsze zadanie | `src/renderer/Onboarding*`, `src/main/provider-discovery.ts`, `src/main/approvals.ts` | Świeży profil dochodzi do zielonego checku i szkicu zadania bez terminala | 4 d |
| A2 | **Demo repo jednym kliknięciem** — tworzy lokalny projekt z 3 plikami i 2 testami do przejścia | `src/main/git.ts`, nowy `src/main/demo-project.ts` | Zadanie „napraw test" kończy się diffem i recenzją | 2 d |
| A3 | **Zdrowie połączeń na starcie** — pasek: wykryty / zapisany / handshake / realny run, z datą | `src/main/connectors.ts`, `ControlCenter.tsx` | Użytkownik widzi różnicę „skonfigurowane ≠ działa" bez wchodzenia w docs | 2 d |
| A4 | **Puste stany z akcją** — każdy ekran bez danych proponuje następny krok | `src/renderer/**` | Zero ekranów bez CTA | 2 d |
| A5 | **Błędy po ludzku** — mapowanie kodów na zdanie + „co zrobić" + kopiuj log | `src/main/*`, `src/renderer/` | Każdy błąd ma `hint` i `action` | 2 d |

**Gate:** 5 osób z zewnątrz, bez pomocy, kończy TTFA < 15 min. Nagrywamy sesje, zbieramy 3 najczęstsze blokady.

---

## 2. STRUMIEŃ B — Zespół agentów, który skaluje (P0/P1, ~4 tygodnie)

Dziś: Master planuje do 6 kroków i wykonuje je **sekwencyjnie**; zależności w bazie są (`task_dependencies`), ale scheduler ich nie wykorzystuje równolegle.

| # | Zadanie | Zakres | Akceptacja | Wysiłek |
| --- | --- | --- | --- | --- |
| B1 | **DAG scheduler** — wykonuj niezależne kroki równolegle, limit 2 procesy, twarde blokady na kolizje plików | `src/main/orchestrator.ts`, `master-agent.ts`, `supervisor.ts` | 3-krokowy plan z 2 niezależnymi krokami kończy się szybciej niż sekwencyjnie; kolizja pliku → `blocked` | 6 d |
| B2 | **Structured handoff** — cel, rezultat, testy, pliki, hash diffu, ryzyka, otwarte decyzje (nie surowe logi) | `src/main/review-evidence.ts`, `src/shared.ts` | Recenzent dostaje ≤ 2 kB kontekstu na krok, bez logów | 3 d |
| B3 | **Quality gates** — uruchom testy/linter w worktree przed recenzją; FAIL blokuje apply | `src/main/supervisor.ts`, `src/main/diff-files.ts` | Zadanie z czerwonym testem nie może zostać zastosowane | 4 d |
| B4 | **Bounded revision loop** — maks. 2 poprawki, każda za zgodą, bez niekończącej się pętli | `orchestrator.ts` | Zużycie tokenów na krok ograniczone i widoczne | 3 d |
| B5 | **Run graph UI** — live graf kroków, koszt, status, dowody | `src/renderer/TaskBoard.tsx`, `RunGraph.tsx` | Widać, który krok czeka i dlaczego | 4 d |

**Gate:** demo „2 agenci, 2 równoległe kroki, inny recenzent, jawna zgoda na końcowy diff". Kolizja plików zatrzymuje apply.

---

## 3. STRUMIEŃ C — Smart Router i koszty (P1, ~3 tygodnie)

`src/main/router.ts` ma 134 linie — to zalążek, nie router.

| # | Zadanie | Zakres | Akceptacja | Wysiłek |
| --- | --- | --- | --- | --- |
| C1 | **Capability Registry** — co realnie umie dany CLI/model: rola, read-only, streaming, limity, koszt | `src/main/capabilities.ts`, `provider-discovery.ts` | Brak zgadywania: nieznane pole = `unknown` | 4 d |
| C2 | **Policy Router** — tryby Manual / Balanced / Subscription-first / Quality-first; deterministyczny, z uzasadnieniem | `src/main/router.ts` | 20 scenariuszy testowych: brak CLI, 429, quota unknown, drogi model | 6 d |
| C3 | **Budżety i blokady** — `budget_exceeded` **przed** płatnym requestem; rezerwa i twardy limit dzienny | `src/main/quota.ts`, `usage-ledger.ts` | Żaden płatny request nie wychodzi po limicie | 3 d |
| C4 | **Panel kosztów** — per run/krok/model: oficjalne tokeny, szacunek, `unknown` osobno | `src/renderer/ControlCenter.tsx` | Kwota zawsze z proweniencją (official/estimate/unknown) | 3 d |
| C5 | **Zakaz cichego fallbacku** — przełączenie dostawcy tylko jawnie, z logiem decyzji | `router.ts`, `policy.ts` | Test: brak automatycznego płatnego fallbacku | 1 d |

**Gate:** raport „ten sam task, 3 strategie" z realnym kosztem. Zero automatycznych wydatków bez zgody.

---

## 4. STRUMIEŃ D — Pamięć i wiedza (P1, ~2 tygodnie)

| # | Zadanie | Zakres | Akceptacja | Wysiłek |
| --- | --- | --- | --- | --- |
| D1 | **Snapshot pamięci w runie** — dokładnie te wpisy, których użył agent, z hashami | `memory-vault.ts`, `runs.ts` | Można odtworzyć, na czym pracował agent | 3 d |
| D2 | **TTL / supersedes / konflikty** — nowszy fakt wypiera stary, konflikt widoczny | `memory-engine`, migracja v17 | Brak „dwóch prawd" bez ostrzeżenia | 4 d |
| D3 | **Import źródeł** — folder, repo, PDF/MD z chunkingiem i przypisami | `knowledge.ts`, `memory-vault.ts` | Każdy fragment ma źródło i datę | 4 d |
| D4 | **Eksport/backup pamięci** — JSONL + Markdown, wersjonowany | `backup.ts` | Odtworzenie na czystym profilu | 2 d |

---

## 5. STRUMIEŃ E — Ekosystem i dystrybucja (P1/P2, ~4 tygodnie)

| # | Zadanie | Zakres | Akceptacja | Wysiłek |
| --- | --- | --- | --- | --- |
| E1 | **Katalog skilli** — instalacja z GitHuba z weryfikacją, wersją i podpisem treści | `community-skills.ts`, `skill-library.ts` | Instalacja bez ręcznego kopiowania plików | 4 d |
| E2 | **Rejestr MCP** — katalog zaufanych serwerów + uprawnienia per projekt | `extensions.ts`, `connectors.ts` | Uprawnienia widoczne przed pierwszym wywołaniem | 4 d |
| E3 | **Szablony workflow** — „napraw buga", „review PR", „research + notatka", „migracja" | `missions.ts`, `src/renderer` | 1 klik → gotowy plan z rolami | 3 d |
| E4 | **macOS + Linux build** — workflow macierzowy, podpis/notaryzacja lub jawne „unsigned" | `.github/workflows/release.yml` | 3 instalatory w jednym wydaniu | 5 d |
| E5 | **Auto-update** (opt-in, tylko podpisane) | `electron-updater` | Aktualizacja z 0.5 → 0.6 na czystym profilu | 4 d |
| E6 | **Signing Windows** (cert EV) | CI + release notes | SmartScreen bez ostrzeżenia | zewnętrzne |

---

## 6. STRUMIEŃ F — Higiena i wydajność (P1, ciągłe)

| # | Zadanie | Efekt | Wysiłek |
| --- | --- | --- | --- |
| F1 | Archiwizacja `docs/evidence` (61 MB) | repo 65 MB → ~4 MB | 1 d |
| F2 | Usunięcie 23 scalonych branchy | czytelność | 1 h |
| F3 | ESLint + Prettier + `npm run lint` w CI | mniej szumu w PR | 1 d |
| F4 | Rozbicie `main.tsx` (1 703) i `ChatWorkspace.tsx` (1 578) | kontrybucje z zewnątrz | 5 d |
| F5 | Code-split + WebP ilustracji (3,5 MB PNG) | szybszy start okna | 2 d |
| F6 | Testy: glob zamiast ręcznej listy 26 plików | nowy test nie wypada z CI | 1 h |
| F7 | Crash log lokalny + „spakuj diagnostykę" | wsparcie bez telemetrii | 2 d |

---

## 7. Kolejność wdrożenia

**Sprint 1 (tydzień 1–2) — „da się zacząć"**
F1, F2, F6, F3 · A3, A4, A5 · pomiar TTFR/TTFA

**Sprint 2 (tydzień 3–4) — „pierwsza zmiana"**
A1, A2 · B2 · gate z 5 użytkownikami

**Sprint 3 (tydzień 5–8) — „skala"**
B1, B3, B4, B5 · C1

**Sprint 4 (tydzień 9–12) — „pieniądze i zaufanie"**
C2, C3, C4, C5 · D1, D2

**Sprint 5 (kwartał 2) — „ekosystem"**
D3, D4 · E1, E2, E3 · E4/E6 · F4, F5

---

## 8. Czego świadomie NIE robić

- **Nie dodawać kolejnych providerów** przed routerem — więcej adapterów bez wyboru = więcej szumu.
- **Nie robić chmury ani kont** — „local-first" jest wyróżnikiem, nie ograniczeniem.
- **Nie robić auto-apply** — recenzja i zgoda to produkt, nie tarcie.
- **Nie sprzedawać tokenów** — pośrednictwo w płatnościach zmienia model ryzyka.
- **Nie gonić za 10 nowymi funkcjami UI** przed domknięciem DAG + routera.

## 9. Ryzyka

| Ryzyko | Wpływ | Mitygacja |
| --- | --- | --- |
| Równoległe kroki psują repo | wysoki | osobne worktree, blokada kolizji plików, brak automerge |
| Router wybierze drogi model | średni | determinizm + podgląd + budżet przed requestem |
| Brak telemetrii = brak danych o użyciu | średni | lokalne liczniki + opcjonalny eksport |
| Rozjazd docs ↔ kod (jak w v4) | średni | `RELEASE_STATUS.md` jako jedyne źródło prawdy, aktualizowane w PR wydania |
| Windows bez podpisu = odrzucenie przy instalacji | wysoki dla dystrybucji | jasna etykieta „unsigned preview" + SHA-256; cert w kolejce |

## 10. Definition of Done dla 1.0

1. TTFA < 15 min na czystym profilu, 5/5 testerów bez pomocy.
2. DAG z 2 równoległymi krokami i blokadą kolizji, pokazany na demo.
3. Router z 20 scenariuszami, zero cichych wydatków.
4. Instalatory Windows/macOS/Linux (macOS/Linux mogą być unsigned, ale jawnie oznaczone).
5. Zero otwartych błędów krytycznych/wysokich z zakresu bezpieczeństwa i integralności zmian.
6. Repo < 10 MB, lint w CI, README z demo GIF.

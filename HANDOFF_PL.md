# Agenting OS — przekazanie projektu

## Bieżący stan: 0.4.0 — 2026-10-19

Zrealizowano trzy uzgodnione etapy po dopracowaniu UI:

1. **0.2:** zarządzane worktree, supervisor, Codex app-server, strumieniowany wynik, przerwanie i jawne wznowienie, zapis artefaktu oraz panel wykonania/review.
2. **0.3:** pamięć FTS5 w zakresie projektu, źródła i zamrożony kontekst, szablony workflow, adapter ACP v1 oraz niezależne review → decyzja człowieka → zastosowanie dokładnego artefaktu.
3. **0.4:** katalog wersjonowanych skilli, ręczne narzędzia MCP stdio, osobne sesje przeglądarki, instalator Windows x64, CI Windows/Linux oraz dokumentacja open source Apache-2.0.

Aktualna instrukcja uruchomienia, architektura i ograniczenia są w [README](README.md). Weryfikacja oraz zakres dowodów: [0.2](docs/evidence/stage-02/README.md), [0.3](docs/evidence/stage-03/README.md), [0.4](docs/evidence/release-04/README.md). Baza ma migracje do v8. Zmiany źródłowe trafiają do pierwotnego repozytorium dopiero po review, zatwierdzeniu i osobnym zastosowaniu.

Testy protokołów używają lokalnych fixture; nie wykonano płatnych zapytań do modeli ani logowania do kont. ACP/MCP to zaufane programy lokalne — protokół nie zapewnia im izolacji systemowej. Instalator jest niepodpisany, z domyślną ikoną Electrona; podpis i test rzeczywistej instalacji/aktualizacji/deinstalacji pozostają kolejną pracą.

Właściciel wyraźnie zlecił push i merge całości. Starsze informacje o pauzie, zakazie publikacji lub wyłączonym wykonywaniu niżej są historią wcześniejszych wycinków i nie opisują obecnej wersji.

---

## Status: wznowiono rozwój na polecenie właściciela (2026-10-19)
Drugi etap kontynuacji wdrożył brief UI właściciela: pełny sidebar ze stopką, top bar ze statusem zapisu, tokeny obu motywów, własne dropdowny, zwarty composer, wiersze zadań z panelem szczegółów, potwierdzenie anulowania, toasty i timeline. Zachowano model, backend, IPC i zależności. Nie dodano fikcyjnych statusów, Undo ani wykonywania agentów.

Aktualna weryfikacja: typecheck, build, 30/30 testów i rozszerzony Electron smoke PASS na Windows. 2533 pomiary tekstu na 75 ekranach: zero błędów w badanym zakresie. Ekrany przed/po: 1440, 1024 i 390 px, dark/light. [Dowody, lista plików i ograniczenia](docs/evidence/ui-polish/README.md).

Zrealizowano pierwszy etap kontynuacji: odświeżenie interfejsu i weryfikację na natywnym Windows. Nowa typografia Inter, spokojniejszy sidebar i kompozytor, wyszukiwanie/filtrowanie zadań, rozwijane szczegóły/dziennik oraz nawigacja w małych oknach. Niezapisany tekst zadania pozostaje osobny dla każdego projektu w bieżącej sesji; trwały zapis wymaga „Zapisz szkic”. Nie wybrano finalnego logo.

Naprawiono brakującą zależność w lockfile, porównywanie ścieżek DOS 8.3 przy przechwytywaniu artefaktów oraz kolejność zamykania baz w testach. Typecheck, build, 30/30 testów i rzeczywisty Electron smoke przeszły na Windows. Kontrola tekstu: 1986 pomiarów na 41 ekranach, bez błędów w badanym zakresie. [Dowody i ograniczenia](docs/evidence/workspace-refresh/README.md).

Następny etap: jeden rzeczywisty przebieg zadanie → izolowany agent → artefakt → niezależne review → decyzja użytkownika. Wykonywanie i stosowanie patchy nadal są wyłączone. Nie wznowiono harmonogramów Hermesa, nie zmieniono logowań i nie wykonano push.

Poprzednie przekazanie nastąpiło po slice 4, podczas pauzy na prośbę właściciela. Poniższe sekcje zachowują jego kontekst; bieżący status i dowody powyżej mają pierwszeństwo.

## Najpierw przeczytaj
1. Ten plik — nadrzędny snapshot przekazania.
2. `docs/original-plan/Agenting_OS_Master_Plan_v2.1.md` i `START_TUTAJ_PL.md` — oryginalne materiały z Google Drive, nie opis ukończonych funkcji.
3. `BUILD_BRIEF.md`, `docs/PLAN.md`, `docs/STATUS.md`, `docs/KANBAN.md` — zakres i chronologia.
4. `docs/architecture/` oraz `docs/reviews/` — decyzje i historyczne review (mogą dotyczyć wcześniejszych wersji).
5. `NEXT_SLICE*.md` — historyczne pakiety zadań, NIE automatyczne polecenia wznowienia.

## Działa / zaimplementowane
- Electron + React/TypeScript, lokalne projekty, zadania i pamięć w SQLite.
- Izolacja danych projektów, PL/EN, motyw jasny/ciemny i trwałe preferencje.
- Lifecycle zadań, zależności, lease/heartbeat, timeout, retry i dziennik zdarzeń. Mechanika modelu nie jest wykonawcą agentów.
- Ograniczone read-only sondy CLI providerów; nie są integracją wykonawczą ani odczytem subskrypcji.
- Pobranie artefaktu diff z istniejącego powiązanego Git worktree i trwałe przechowanie bajtów/hash.
- Decyzja zatwierdzenia związana z konkretnym artefaktem, projektem, zadaniem i próbą; migracja SQLite v5.
- Walidacja IPC, sandbox renderera i testy bezpieczeństwa.

## Niegotowe / do wykonania
- UI: pierwsza kontynuacja wdrożyła redesign i lokalne fonty; ocena właściciela oraz dalsze udoskonalenia pozostają otwarte. Historyczna próba redesignu przed przekazaniem nie była wdrożona.
- `docs/logo-concepts/`: trzy propozycje SVG/PNG, niezatwierdzone. Nie traktować ich jako finalnej identyfikacji.
- Realne wykonywanie zadań Codex/Claude, streaming, anulowanie i fallback; OpenRouter/custom API.
- Bezpieczne przechowywanie kluczy/logowanie; rzeczywisty odczyt dostępnych limitów z provenance i unknown state.
- Tworzenie izolowanych worktree, review drugiego agenta i bezpieczny, odporny na zmiany plików mechanizm stosowania zatwierdzonych patchy. Zapis zatwierdzenia NIE oznacza gotowej bramki apply.
- Wbudowana przeglądarka z trwałymi sesjami i kontrolą uprawnień.
- Biblioteka skilli, dobór kontekstu i pełna orkiestracja multi-agent.
- Instalator Windows, aktualizacje i release QA. Natywne testy źródłowej aplikacji na Windows przeszły w pierwszej kontynuacji.

## Ostatnia niezależna weryfikacja przekazania
2026-10-19, host Linux/WSL:
- `npm run typecheck`: PASS.
- `npm test`: build PASS, 30/30 testów PASS.
- `npm run smoke:headless`: PASS, rzeczywiste okno Electron (izolacja, restart, ustawienia, bezpieczeństwo, responsywność).
- Log: `docs/evidence/handoff-verification.txt`.
Worker slice 4 wcześniej nie uruchomił okna w swoim środowisku. Ten późniejszy test kontrolera przeszedł; wcześniejsze błędy zachowano jako historię, nie jako wynik aktualnego testu.
W chwili tamtego przekazania Windows był NIEZWERYFIKOWANY. Późniejszą weryfikację natywną opisano u góry. Nadal nie reklamować jako gotowy produkt.

## Uruchomienie i bezpieczna kontynuacja
Node 22.16+ oraz npm, Git do testów worktree. `npm ci`, następnie `npm start`. Na Linux do headless smoke potrzebne Xvfb i systemowe zależności Electron. Nie kopiować node_modules pomiędzy systemami. Instalacja na czystym Windows wymaga osobnego sprawdzenia.

Pierwszy etap kontynuacji wdrożył UI i utrzymał dotychczasowe testy; finalne logo wymaga decyzji właściciela. Kolejny etap: jeden rzeczywisty przebieg zadanie → agent → artefakt → niezależne review → zatwierdzenie; apply projektować osobno. Bez fałszywych statusów/limitów, bez automatycznego rozszerzania uprawnień.

## Co celowo nie zostało opublikowane
Klucze, konta, pliki .env, lokalne bazy i profile przeglądarki, node_modules, dist, prywatne logi rozmów workerów, konfiguracja Hermesa. Repo zawiera źródła, lockfile, testy, dokumentację, oryginalny plan i materiały projektowe; nie jest kopią całego środowiska użytkownika.

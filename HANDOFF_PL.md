# Agenting OS — przekazanie projektu

## Czat, pamięć i subskrypcje — 2026-10-19

Nowy ekran startowy to **Czaty**: wybór agenta, rozmowy/planowania oraz kontekstu domyślnego, folderu lokalnego lub GitHuba. Odpowiedzi są strumieniowane i zapisywane; można je zatrzymać, zapamiętać albo przenieść do zadania z osobnym recenzentem. Odczyt zwykłego folderu bez Git i dwie tury historii potwierdzono na prawdziwych subskrypcjach Codexa i Claude'a. Klonowanie publicznego repozytorium przez `gh` i odczyt limitów Codexa również przeszły test.

Sidebar ma osobne **Wspólna pamięć** i **Biblioteka skilli**. Przypięte wpisy trafiają automatycznie do kontekstu wszystkich agentów w odpowiednim zakresie. Jest dziewięć skilli, w tym trzy ze wskazanej rewizji obra/superpowers na MIT, oraz import lokalnego SKILL.md. Baza migruje do v11. OpenQuota odświeża dane automatycznie co minutę. UI otrzymał font Sora, Lucide, fioletowy sidebar, cyan przyciski, mocniejsze obramowania i dwa wygenerowane obrazy.

Nowe widoki przeszły 30 kontroli rozmiaru/motywu, dotychczasowe 24 widoki również przeszły regresję. Gemini CLI jest lokalnie w wersji 0.1.4 bez wymaganego ACP, a Hermes nie został wykryty. Integracje i komunikaty są przygotowane, ale ich rzeczywistej inferencji nie potwierdzono. Automatyczne limity Claude'a/Hermesa/Gemini/Antigravity nadal pozostają nieznane.

Aktualne wyniki i ograniczenia: [audyt harness](docs/HARNESS_AUDIT.md), [dowody testów](docs/evidence/harness-08/README.md), [źródła i obrazy](docs/research/harness-assets-2026-10-19.md). 75/75 testów przeszło. PR #4 został już scalony; ta rozbudowa powstaje na nowej gałęzi `codex/conversation-memory-harness` z aktualnego main. Zlecenie obejmuje push, bez kolejnego merge. Poniższe sekcje opisują wcześniejsze etapy.

## Master Agent według schematu — 2026-10-19

Nowa zakładka **Master Agent** obsługuje cel → plan modelu → zatwierdzone uruchomienie → delegowanie → niezależne review (również analiz bez zmian plików) → decyzję człowieka o zastosowaniu → ocenę celu. Misje, kontekst i dziennik są trwałe w SQLite v10. Wynik można jawnie zapisać w pamięci projektu lub całego workspace.

Dodano profile Gemini ACP, Hermes ACP i lokalnego modelu przez OpenCode/Ollama/LM Studio. Masterem/recenzentem może być agent z potwierdzonym trybem odczytu; Hermes i Antigravity pozostają wykonawcami. Instalacja, logowanie i zgodność poszczególnych lokalnych CLI wymagają własnej weryfikacji. UI nie traktuje zapisanej konfiguracji jako potwierdzenia działającej inferencji.

Ważna poprawka integracyjna: istniejący profil Codexa zachowuje logowanie, lecz sesja nadzorowana wyłącza odziedziczone MCP/apps/plugins/hooks i sprawdza ich stan przed wywołaniem modelu. Globalna konfiguracja użytkownika jest niezmieniona. Starszy app-server bez potrzebnego kontraktu może wymagać aktualizacji.

Aktualny audyt: [Master Agent](docs/MASTER_AGENT_AUDIT.md), [dowody](docs/evidence/master-07), [źródła](docs/research/master-agent-2026-10-19.md). Ta aktualizacja pozostaje na gałęzi PR #4; push nie oznacza merge do `main` ani wdrożenia.

## Aktualizacja workspace — 2026-10-19

Bieżący zakres: premium UI AI Evolution Polska; połączenia Codex, natywny Claude, OpenCode/OpenRouter i eksperymentalny Antigravity; systemowe szyfrowanie klucza OpenRouter; wspólna pamięć z jawnym zakresem; sześć skilli z wyszukiwarką; osobny wybór wykonawcy i recenzenta; kolejka do 10 zadań z zatrzymaniem przed zgodą człowieka. Lokalne projekty wymagają Git, lecz nie wymagają GitHuba. Migracja bazy do v9 zachowuje prywatność istniejących wpisów. Rzeczywiste testy odczytu pliku przez subskrypcje Codex i Claude zakończyły się poprawnie.

Limity mają wskazane źródło. Codex korzysta z oficjalnego app-server, OpenRouter z budżetu klucza API. Dla Claude/Antigravity automatyczny odczyt pozostaje niedostępny. Nie są pokazywane zmyślone trendy ani domniemane pełne limity. Subskrypcje i rozliczenia API są oddzielne.

Instrukcja i macierz integracji: [README](README.md). Weryfikacja, naprawione problemy i ograniczenia: [audyt workspace](docs/WORKSPACE_AUDIT.md). Podstawy wyboru rozwiązań: [research](docs/research/agent-workspace-2026-10-19.md).

Ta aktualizacja jest przygotowana do osobnego PR. Zlecenie obejmuje push; nie obejmuje merge do `main`. Starsze wzmianki o zgodzie na merge poniżej dotyczą wcześniejszych prac i nie są upoważnieniem dla tej aktualizacji.

---

## Historia wcześniejszych etapów

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

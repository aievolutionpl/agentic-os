# Agenting OS — przekazanie projektu

## Status: PAUZA na prośbę właściciela (2026-10-19)
Dalszy development przejmuje Chris / inny agent. Nie uruchamiać autonomicznie kolejnych etapów. Oba harmonogramy budowy Hermesa zostały spauzowane. Ostatni Codex zakończył slice 4 — powiązanie decyzji zatwierdzenia z zapisanym artefaktem zmian. Nie ma włączonego wykonywania zadań przez agenty ani stosowania patchy.

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
- UI: użytkownik odrzucił obecną typografię, sidebar, przyciski i ramki. Chce dopracowania w duchu ChatGPT/Apple/Gemini, ale z własnym brandingiem. Próba redesignu subagenta nie zakończyła się wdrożonym redesignem. W źródłach mogą być przygotowane fonty, nie oznacza to ukończenia UI.
- `docs/logo-concepts/`: trzy propozycje SVG/PNG, niezatwierdzone. Nie traktować ich jako finalnej identyfikacji.
- Realne wykonywanie zadań Codex/Claude, streaming, anulowanie i fallback; OpenRouter/custom API.
- Bezpieczne przechowywanie kluczy/logowanie; rzeczywisty odczyt dostępnych limitów z provenance i unknown state.
- Tworzenie izolowanych worktree, review drugiego agenta i bezpieczny, odporny na zmiany plików mechanizm stosowania zatwierdzonych patchy. Zapis zatwierdzenia NIE oznacza gotowej bramki apply.
- Wbudowana przeglądarka z trwałymi sesjami i kontrolą uprawnień.
- Biblioteka skilli, dobór kontekstu i pełna orkiestracja multi-agent.
- Natywne testy Windows, instalator, aktualizacje i release QA.

## Ostatnia niezależna weryfikacja przekazania
2026-10-19, host Linux/WSL:
- `npm run typecheck`: PASS.
- `npm test`: build PASS, 30/30 testów PASS.
- `npm run smoke:headless`: PASS, rzeczywiste okno Electron (izolacja, restart, ustawienia, bezpieczeństwo, responsywność).
- Log: `docs/evidence/handoff-verification.txt`.
Worker slice 4 wcześniej nie uruchomił okna w swoim środowisku. Ten późniejszy test kontrolera przeszedł; wcześniejsze błędy zachowano jako historię, nie jako wynik aktualnego testu.
Windows pozostaje NIEZWERYFIKOWANY. Nie reklamować jako gotowy produkt.

## Uruchomienie i bezpieczna kontynuacja
Node 22.16+ oraz npm, Git do testów worktree. `npm ci`, następnie `npm start`. Na Linux do headless smoke potrzebne Xvfb i systemowe zależności Electron. Nie kopiować node_modules pomiędzy systemami. Instalacja na czystym Windows wymaga osobnego sprawdzenia.

Pierwszy zalecany etap: dokończyć UI, wybrać logo, utrzymać dotychczasowe testy. Kolejny: jeden rzeczywisty przebieg zadanie → agent → artefakt → niezależne review → zatwierdzenie; apply projektować osobno. Bez fałszywych statusów/limitów, bez automatycznego rozszerzania uprawnień.

## Co celowo nie zostało opublikowane
Klucze, konta, pliki .env, lokalne bazy i profile przeglądarki, node_modules, dist, prywatne logi rozmów workerów, konfiguracja Hermesa. Repo zawiera źródła, lockfile, testy, dokumentację, oryginalny plan i materiały projektowe; nie jest kopią całego środowiska użytkownika.

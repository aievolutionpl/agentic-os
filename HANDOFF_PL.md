# Agenting OS — przekazanie projektu

## Status: wznowiono rozwój na polecenie właściciela (2026-10-19)
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

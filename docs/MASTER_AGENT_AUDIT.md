# Master Agent — audyt wdrożenia, 19 października 2026

Schemat użytkownika jest przepływem wykonania: jeden lokalny workspace, wybierany Master, wykonawcy, wspólna pamięć i monitor limitów. Zastąpiono brakującą warstwę planowania rzeczywistymi zapytaniami do skonfigurowanego modelu. Ręczna kolejka pozostaje dostępna.

## Zaimplementowane

- Master przygotowuje plan 1–6 kroków z przypisaniem wykonawcy, innego recenzenta, zależnościami i kryteriami odbioru. Host waliduje JSON, role, rozmiary, klucze i kolejność zależności. Odrzucenie planu nie tworzy zadań.
- Plan i zamrożony kontekst trafiają do SQLite, migracja v10 zachowuje stare projekty, zadania i prywatność pamięci. Utworzenie zadań i przypisanie ich do misji jest jedną transakcją.
- Po uruchomieniu planu supervisor wykonuje kroki kolejno, przekazując wybrane wpisy pamięci, skille i dostępne wyniki poprzedników. Zmiany plików wymagają osobnego review i decyzji użytkownika o zastosowaniu. Master nie zatwierdza własnych zmian Git.
- Po zakończeniu kroków Master sprawdza repozytorium w trybie odczytu, ocenia kryteria i zapisuje wynik `complete` albo `needs_changes`. Użytkownik może zachować ocenę w pamięci projektu lub workspace; zapis ma źródło misji i nie jest automatyczny.
- Zatrzymanie anuluje aktywny proces, historia zostaje. Restart zmienia aktywne misje na `interrupted`; nic nie jest odtwarzane automatycznie. Kontynuacja nie tworzy ponownie zadań.
- Kontrola kwoty poprzedza wywołania Mastera, wykonawcy i recenzenta. Wyczerpany, świeży odczyt dostawcy zatrzymuje wykonanie; nieznany odczyt jest jawnie odnotowany. Ręczne budżety nie udają danych dostawcy.
- Panel przedstawia Mastera, siedem profili wykonawców, pamięć i limity. Pokazuje plan, dziennik, decyzje, historię i ocenę. Interfejs PL/EN, motywy jasny/ciemny, responsywność.

## Integracje i granice

Gemini używa istniejącego adaptera ACP z `--experimental-acp`; na Windows obsługiwany jest npm `dist/index.js` uruchamiany przez Node.js bez powłoki. Hermes używa `hermes acp`. Profil lokalny wykorzystuje narzędzia OpenCode z wyborem modelu i endpointu loopback zgodnego z OpenAI; klucz OpenRouter nie jest przekazywany do tego profilu. Konfiguracja lokalnego serwera nie dowodzi lokalności inferencji, jeśli sam serwer wybiera model chmurowy.

Gemini/Hermes/OpenCode/lokalny model wymagają osobnej instalacji, logowania lub uruchomienia serwera. W tym środowisku nie wykonano ich rzeczywistej inferencji. Hermes i Antigravity pozostają wykonawcami bez roli Mastera/recenzenta, ponieważ nie deklarujemy niepotwierdzonego trybu odczytu. W ACP host pozwala wyłącznie na jednorazowe edycje plików ze wskazaną lokalizacją wewnątrz worktree; odrzuca powłokę, ścieżki zewnętrzne, `.git` i hardlinki. Sam program ACP nadal jest zaufanym lokalnym kodem.

Test rzeczywistego Mastera wykrył zapis `.serena` przez odziedziczony serwer MCP Codexa w sesji odczytu. Kontrola worktree odrzuciła wynik. Wprowadzono per-thread konfigurację ograniczającą MCP/apps/plugins/hooks i sprawdzenie runtime MCP przed wysłaniem promptu. Istniejące logowanie CLI pozostaje używane; globalna konfiguracja użytkownika nie jest zmieniana. Starsze app-servery bez wymaganych metod kończą się błędem zamiast osłabiać kontrolę.

Nie ma automatycznego merge/pusha z misji, nieograniczonej pętli poprawek, równoległego łączenia worktree, chmurowej synchronizacji pamięci ani dostępu do pełnych liczników tokenów wszystkich subskrypcji. Nieznane kwoty nie są prezentowane jako zera ani jako pełny pozostały limit.

## Dowody

| Warstwa | Wynik lokalny |
| --- | --- |
| TypeScript i build | PASS |
| Pełne testy jednostkowe/integracyjne | **67/67 PASS**, prawdziwe procesy, Git worktree i SQLite |
| Electron smoke | PASS: projekty, zadania, restart, PL/EN, uprawnienia IPC i responsywność |
| Wizualne QA | **24 widoki**, 1440/390 px, dark/light; zero wykrytych przepełnień, błędów kontrastu i błędów strony; zapis/usunięcie lokalnego modelu i walidacja loopback przez IPC |
| Rzeczywiste modele | **PASS**: Codex planuje, Claude czyta plik w tymczasowym repozytorium, Codex recenzuje i ocenia cel, użytkownik zapisuje wynik przez UI do pamięci; źródło i commit bez zmian |
| Zależności | `npm audit --audit-level=moderate`: **0 podatności** |

Dokładny raport rzeczywistej próby: [live/result.json](evidence/master-07/live/result.json). Ten scenariusz był wyłącznie do odczytu. Zastosowanie zmian Git sprawdzono na procesach fixture; nie oznacza to rzeczywistego testu wszystkich providerów.

Wyniki lokalne w [evidence/master-07](evidence/master-07). Test `tests/master.test.mjs` obejmuje walidację DAG/roli, rollback atomowego tworzenia zadań, prywatność/frozen context, restart, kwoty, anulowanie, lokalne endpointy, granice ACP oraz pełny przebieg na rzeczywistych procesach protokołu i repozytorium Git. Osobny opt-in `scripts/live-master-smoke.mjs` sprawdza UI i prawdziwą delegację na istniejących subskrypcjach wyłącznie w jednorazowym projekcie.

Źródła i decyzje: [research Mastera](research/master-agent-2026-10-19.md). Wynik testu fixture, rzeczywistej inferencji, kontroli UI i CI należy czytać oddzielnie; żaden z nich nie dowodzi działania wszystkich kont dostawców.

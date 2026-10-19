# Audyt aktualizacji workspace — 19 października 2026

**Uzupełnienie:** warstwa wybieranego Master Agenta, migracja v10, Gemini/Hermes/local LLM i aktualne dowody są w [audycie Mastera](MASTER_AGENT_AUDIT.md). Poniższa macierz dotyczy wcześniejszego, zweryfikowanego etapu workspace-06.

## Wynik i zakres

Rozbudowano istniejący desktopowy Agenting OS od AI Evolution Polska. Zachowano Electron, React, SQLite, lokalne projekty, lifecycle zadań, Git worktree, artefakty oraz ręczne zatwierdzanie i stosowanie zmian. Nie skopiowano aplikacji referencyjnej ani nie dołączono drugiej bazy/servera.

- Nowe centrum dowodzenia: graf agentów, własne piktogramy SVG, motywy jasny/ciemny, responsywne połączenia i panel limitów.
- Cztery konfiguracje wykonawcze: Codex, natywny Claude Code, OpenCode ACP oraz eksperymentalny Antigravity CLI. OpenRouter dostarcza modele przez OpenCode.
- Jeden magazyn pamięci FTS5. Wpis jest prywatny dla projektu albo jawnie udostępniony workspace. Wykonawca i recenzent otrzymują wybrany, zamrożony kontekst ze źródłami.
- Sześć wbudowanych skilli: frontend design, research ze źródłami, kurator pamięci, review, dostępność UI i AI Evolution Polska Team handoff. Biblioteka ma wyszukiwarkę. Kolejka dołącza skill zespołu do wspólnego kontekstu; zadanie ma osobny wybór wykonawcy i recenzenta.
- Jawnie uruchamiana kolejka maksymalnie 10 zadań, respektująca zależności. Wykonanie i review używają istniejącego supervisora. Kolejka nie zatwierdza ani nie stosuje artefaktów; zatrzymuje się przed decyzją człowieka.
- Lokalne projekty nie wymagają konta/remote GitHub. Wykonywanie zmian wymaga lokalnego, czystego repozytorium Git z pierwszym commitem.

## Naprawione problemy

| Obszar | Stan poprzedni | Zmiana |
| --- | --- | --- |
| TLS limitów | Wyłączona weryfikacja certyfikatu | Stały origin HTTPS, weryfikacja certyfikatów, zaufany systemowy magazyn CA, timeout i limit odpowiedzi; bez przekierowań |
| Logowanie subskrypcyjne | Bezpośredni odczyt prywatnych plików OAuth i danych procesu Antigravity | Logowanie pozostaje we własnym CLI dostawcy; Codex udostępnia odczyty konta przez app-server |
| Wiarygodność limitów | Syntetyczne trendy, domniemane plany/pełne limity | Tylko oficjalne dane, oznaczony wpis ręczny albo brak danych; procenty nie są przeliczane na wymyśloną liczbę tokenów |
| OpenRouter | Pole klucza w ręcznym budżecie | Oddzielne połączenie z Electron safeStorage; brak klucza w publicznym IPC; usunięcie starego pola `apiKey` z poprawnych legacy rekordów |
| Profile | Detekcja CLI mogła sugerować gotowe połączenie | Osobna konfiguracja wykonawcza; login istniejącego profilu nie jest przypisywany profilowi izolowanemu |
| Wspólna pamięć | Wyłącznie zakres projektu | Jawny zakres `workspace`; dotychczasowe wpisy pozostają prywatne po migracji v9 |
| Review Claude | Recenzent bez powłoki nie miał dostępu do `git diff` | Pełny zapisany diff i kontekst przekazywane w prompcie; review odrzuca diff ponad 256 KiB zamiast milcząco go obcinać |

## Weryfikacja lokalna

Środowisko: Windows, Node 26.3.1, Electron 43.8.0. Testy protokołów korzystają z jawnych lokalnych fixture; nie podszywają się pod wynik rzeczywistego modelu.

| Sprawdzenie | Wynik / dowód |
| --- | --- |
| TypeScript i build | PASS — [typecheck](evidence/workspace-06/typecheck.log), build w [pełnym logu testów](evidence/workspace-06/tests.log) |
| Regresja jednostkowa i integracyjna | 58/58 PASS — prawdziwe Git/SQLite, migracje, prywatność pamięci, anulowanie procesów, artefakty, review i zatrzymanie kolejki przed zgodą człowieka |
| Aplikacja Electron | PASS — [smoke](evidence/workspace-06/smoke/smoke-result.json): CRUD, restart, izolacja projektów, PL/EN, klawiatura, responsywność i izolacja renderera |
| Narzędzia i przeglądarka | PASS — [raport](evidence/workspace-06/tools/result.json): oddzielne cookies projektów, brak Node/app bridge w zdalnym widoku, odmowa geolokalizacji, skille |
| Nowe UI | PASS — [20 ekranów](evidence/workspace-06/ui/result.json), 1440/390 px, dark/light; 0 błędów kontrastu tekstu w badanym zakresie, 0 poziomego overflow, 0 wyjątków renderera; role agentów i wyszukiwanie skilli |
| Klucz OpenRouter | PASS — rzeczywiste Windows safeStorage: szyfrowanie, odszyfrowanie i usunięcie sztucznego klucza; bez zapytania sieciowego z tym kluczem |
| Zależności | [npm audit](evidence/workspace-06/audit.log): 0 podatności |
| Kontrola źródeł | `git diff --check`; przegląd autoryzacji IPC, ścieżek kluczy, adapterów, migracji i bramki apply |

Scenariusze nowych testów można odtworzyć przez `npm test` i `npm run qa:workspace`. CI wykonuje je także na Windows i Linux, a później buduje niepodpisany instalator Windows. Bieżący wynik zdalnych jobs należy sprawdzić w PR; lokalne PASS nie zastępuje wyniku CI ani testu instalacji.

Pierwsze CI ujawniło dwa problemy testów: wybór projektu zależał od kolejności UUID przy jednakowej dacie utworzenia, a test UI klikał mobilną nawigację podczas aktualizacji layoutu do szerokiego okna. Testy wybierają teraz projekt jawnie i czekają na gotowy wariant nawigacji.

## Rzeczywiste sondy dostawców

[Raport odczytów](evidence/workspace-06/live-probe.json) zawiera wyłącznie podsumowania bez kluczy, e-maili, zawartości kont ani surowych odpowiedzi:

| Dostawca | Rzeczywiście sprawdzone | Niepotwierdzone |
| --- | --- | --- |
| Codex | Zainstalowany CLI, handshake, zalogowane konto, oficjalne okno limitu; rzeczywiste zadanie odczytu pliku przez subskrypcję | Pełne zadanie modyfikujące projekt na rzeczywistym koncie; zapis/review/apply testowane fixture |
| Claude | Oficjalny `auth status`, istniejące logowanie subskrypcyjne; rzeczywisty odczyt pliku przez nowy adapter | Pełne zadanie modyfikujące projekt; automatyczne limity są niedostępne |
| OpenRouter | Publiczny katalog: 470 modeli w czasie sondy | Budżet prawdziwego klucza i inferencja — brak klucza w tej sesji |
| OpenCode | Protokół ACP i przekazanie konfiguracji testowane fixture | CLI nie był zainstalowany na tym komputerze; rzeczywiste zadanie wymaga instalacji i konfiguracji |
| Antigravity | Kontrakt stdin/stream JSON, wynik, awarie i anulowanie testowane fixture | `agy` nie był zainstalowany; brak rzeczywistego zadania, read-only/review, resume i automatycznych limitów |

## Pozostałe ograniczenia

Dodatkowy [test rzeczywistej inferencji](evidence/workspace-06/live-inference.json) potwierdził poprawną odpowiedź Codex i Claude na podstawie jednego tymczasowego README oraz niezmienność plików. Uruchamiany jawnie skrypt `live-agent-smoke.mjs` nie należy do CI i korzysta z limitu istniejących subskrypcji. Nie otrzymuje kluczy API i nie zapisuje odpowiedzi modeli ani identyfikatorów kont.

1. To nadzorowana, skończona kolejka wybranych zadań. Nie ma autonomicznego planisty, samoczynnego zakupu tokenów, ukrytych retry ani harmonogramu działającego po zamknięciu aplikacji. Restart zachowuje przebiegi i oznacza przerwania, lecz nie odtwarza kolejki automatycznie.
2. Claude native celowo otrzymuje narzędzia plikowe, bez Bash i bez ambient MCP. Zadania wymagające uruchomienia testów przez agenta należy kierować do odpowiednio skonfigurowanego Codex/ACP; Claude powinien raportować tę lukę. Wszystkie natywne/ACP/MCP programy są zaufanym kodem lokalnym, a ich deklarowane tryby nie stanowią izolacji systemowej.
3. Pamięć współdzielona dotyczy jednej lokalnej bazy. Nie synchronizuje komputerów i nie importuje automatycznie prywatnych historii ChatGPT/Claude/Google. Wybór wpisów do wysłania pozostaje jawny.
4. OpenRouter to odrębnie rozliczane API. Subskrypcje Claude/ChatGPT/Google nie są uniwersalnym kredytem API. Budżet klucza OpenRouter nie jest saldem konta; bez limitu kwotowego nie pokazujemy procentu pozostałego budżetu.
5. Metadane, pamięć i diff są lokalne, lecz nieszyfrowane. Szyfrowany klucz API jest związany z kontem systemowym. Redakcja logów nie jest kompletnym detektorem sekretów.
6. Zrzuty pokazują osobny profil QA i jawnie opisany budżet demonstracyjny. Kontrola kontrastu tekstu nie jest certyfikatem pełnej dostępności ani testem czytnika ekranu. Instalator nadal wymaga podpisu i testów install/upgrade/uninstall.

Źródła, wybór gotowych protokołów i granice licencyjne: [research](research/agent-workspace-2026-10-19.md).

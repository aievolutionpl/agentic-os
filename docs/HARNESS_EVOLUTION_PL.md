# Agenting OS — harness AI Evolution Polska

## Pomysł produktu

Jedno lokalne centrum pracy z agentami: użytkownik określa cel, wybiera zespół i połączenia, sprawdza kontekst, a następnie śledzi wykonanie, dowody testów i niezależną recenzję. Pamięć, skille i narzędzia mają wspólny interfejs, ale zachowują zakres projektu oraz jawne uprawnienia. Produkt rozwijamy na istniejącym Electron + React + TypeScript + SQLite, bez migracji frameworka.

Najkrótszy przepływ: **Projekt → połączenia → Harness → cel → Master / zadania → recenzja → zatwierdzona zmiana / PR**.

Subskrypcje są obsługiwane przez oficjalne mechanizmy danego CLI. API korzysta z osobnych kluczy i rozliczeń. Model lokalny ma osobny adapter. Nie zakładamy, że abonament aplikacji udostępnia jej API albo że dowolny model może pełnić rolę recenzenta. Aktualne ograniczenia adapterów opisuje [PROVIDERS.md](PROVIDERS.md); status instalacji, konfiguracji, sprawdzenia i inferencji to różne fakty.

## Wdrożone w tej zmianie

- **Centrum Harness**: wspólna instrukcja, konfiguracja przywoływania pamięci, inspektor kontekstu, zapisane modele i statusy połączeń, wejścia do terminala, skilli, pamięci, limitów i MCP projektu.
- **Instrukcja główna**: stały rdzeń AI Evolution Polska oraz edytowalne preferencje workspace do 6000 znaków. Współdzielona przez istniejący mechanizm kontekstu czatów, Mastera i zadań; recenzent otrzymuje zamrożony kontekst wykonawcy. Preferencje nie zmieniają uprawnień narzędzi.
- **Pamięć**: pierwszeństwo przypiętych i ręcznie wybranych notatek, konfigurowalne 0–8 przywołań, możliwość wyłączenia automatyki, deduplikacja identycznych treści po normalizacji, pochodzenie i informacja o skróceniu. Limit pozostaje 20 wpisów / 24 000 znaków łącznie z instrukcjami i skillami.
- **Inspektor**: rzeczywisty manifest zawartości, powód dołączenia, źródło, rozmiar, rewizja instrukcji i SHA-256. Nie wykonuje wywołań modelu. Podgląd znika po zmianie projektu lub parametrów; spóźnione odpowiedzi nie nadpisują aktualnego wyboru.
- **Bezpieczny eksport AGENTS.md**: jawnie wybrany projekt plus wpisy udostępnione workspace. Eksport nie łączy prywatnej pamięci klientów i nie przedstawia notatek jako nadrzędnych instrukcji. Rozpoznane sekrety są maskowane; eksport ma limit 100 notatek / 200 000 znaków.
- **Trwałość**: migracja SQLite 16 → 17, ustawienia w kopii zapasowej, wykrywanie konfliktu zapisu na podstawie rewizji. Nowy zapis dotyczy kolejnych kontekstów, nie modyfikuje trwającego zadania.
- **GitHub**: selektor repozytoriów pobiera wszystkie strony, zamiast tylko pierwszych 100 wyników, z ograniczeniem czasu i bufora. Uwierzytelnienie nadal należy do GitHub CLI.

## Architektura tej zmiany

`HarnessPanel → preload allowlist → kontrola zaufanego nadawcy IPC → Harness / Knowledge → SQLite`

`Knowledge.build → rdzeń + preferencje → workflow → przypięta/wybrana pamięć → skille → przywołania w pozostałym budżecie → manifest + hash`

Nowy moduł `src/main/harness.ts` odpowiada za migrację, walidację, redakcję i zapis ustawień. `src/main/knowledge.ts` pozostaje jedynym miejscem składania wspólnego kontekstu. Główne API: `harnessGet`, `harnessSave`, `contextPreview`, `memoryExport`. Nie dodano zależności ani kluczy środowiskowych. Instrukcje i pamięć są zwykłym tekstem użytkownika, nie magazynem sekretów.

Rozmiar kontekstu podajemy w znakach. Nie jest to dokładna liczba tokenów — różne modele mają różne tokenizery. Fingerprint identyfikuje treść paczki; nie stanowi podpisu autora ani zgody na wykonanie. Podgląd jest punktem w czasie: zmiana pamięci lub skilli przed startem może zmienić następną paczkę.

## Plan dalszego rozwoju

Poniższe etapy są planem, a nie deklaracją gotowych funkcji. Dotychczasowe roadmapy zawierają historyczne braki; przed każdym etapem sprawdź aktualny kod.

| Kolejność | Zakres | Warunek ukończenia |
| --- | --- | --- |
| 1. Zespół i przekazanie pracy | Edytowalne szablony zespołów, role i capability routing; ustrukturyzowany handoff z dowodami i odnośnikami do artefaktów | Planner, wykonawca i reviewer mogą korzystać z różnych istniejących adapterów; brak cichej zmiany modelu lub dodatkowego kosztu; testy awarii i restartu |
| 2. Pamięć z cyklem życia | Typy decision/fact/preference, potwierdzenie źródła, data przeglądu, oznaczenie zastąpionych ustaleń, propozycje konsolidacji do zatwierdzenia | Odwołana decyzja nie wraca przez recall; konflikty są widoczne; testy izolacji projektów i odtwarzania backupu |
| 3. Skille i narzędzia | Deklaracje wymaganych capabilities, dry-run wyboru narzędzi, walidacja argumentów MCP, jawne uprawnienia odczyt/zapis/sieć | Agent widzi wyłącznie dozwolony katalog narzędzi; niezgodny skill jest wyjaśniony przed startem; fikcyjny wynik narzędzia nie spełnia acceptance criteria |
| 4. Integracje i routing | Jednolity kontrakt health/auth/models/usage, ręczne odświeżanie, informacja o wieku pomiaru, kontrolowany fallback | Testy kontraktowe każdego adaptera oraz osobne, jawnie autoryzowane smoke testy na prawdziwych kontach; brak zgadywania limitów subskrypcji |
| 5. Dostarczenie i obserwowalność | Widok aktywnego celu, zależności i blockerów, śledzenie statusu PR/CI, eksport śladu wykonania | Po restarcie widać realny stan; merge odnosi się do sprawdzonego SHA; nie publikuje sekretów ani prywatnej pamięci |

Najpierw wykonujemy etapy 1–2 na obecnym supervisorze i dzienniku zdarzeń. Headless, harmonogramy, pamięć wektorowa i synchronizacja chmurowa wymagają osobnego uzasadnienia. SQLite FTS pozostaje wystarczającą bazą do czasu zmierzenia problemu jakości wyszukiwania.

## Prompt do dalszej rozbudowy — gotowy do skopiowania

```text
Pracujesz nad https://github.com/aievolutionpl/agentic-os jako senior engineer AI Evolution Polska.
Celem jest lokalny harness, w którym użytkownik łączy wspierane subskrypcje CLI, klucze API i modele lokalne, a agenci współpracują na jednym celu ze wspólnym, kontrolowanym kontekstem.

Najpierw przeczytaj README, CONTRIBUTING, instrukcje repozytorium, docs/HARNESS_EVOLUTION_PL.md i aktualny kod modułów, które zamierzasz zmieniać. Oddziel aktualne działanie od historycznych roadmap. Zachowaj Electron, React, TypeScript, SQLite, existing provider adapters i komponenty UI.

Wykonaj następny nieukończony etap tej roadmapy od początku do końca. Domyślnie: szablony zespołów i ustrukturyzowany handoff na istniejącym supervisorze, bez nowego systemu orkiestracji obok obecnego. Najpierw sprawdź, co już działa w Masterze, DAG, routing, run events i review evidence.

Handoff powinien zawierać taskId/runId, cel, wykonane zmiany, artefakty, faktycznie wykonane komendy testów z wynikiem, znane problemy i następny krok. Waliduj schemat, pochodzenie, scope projektu i rozmiar. Raport agenta jest dowodem do sprawdzenia, nie uprawnieniem ani zatwierdzeniem. Zachowaj anulowanie, lease ownership, restart i idempotencję.

Użyj Knowledge.build i istniejącej instrukcji harnessa. Nie duplikuj promptów w adapterach. Pamięć innych projektów jest niedostępna, chyba że użytkownik udostępnił ją workspace. Nie podnoś przypiętych notatek do rangi nadrzędnych instrukcji. Pokaż źródła, konflikt i budżet kontekstu. Nie wprowadzaj automatycznego zapisywania niezweryfikowanych wniosków jako faktów.

Subskrypcje, API i modele lokalne mają odrębne zasady logowania, rozliczeń i możliwości. Korzystaj z oficjalnych kontraktów; nie kopiuj cookies ani tokenów z innych aplikacji. Brak danych o limicie oznacza unknown. Zmiana dostawcy, odpłatny request, publikacja i zastosowanie diffu respektują istniejącą politykę oraz autoryzację użytkownika.

UI: najważniejsze są aktywny cel, stan pracy, artefakty i następna potrzebna decyzja. Zachowaj lokalne fonty, semantyczne tokeny i motywy; jeden akcent, czytelna typografia, bez dekoracyjnych KPI. Obsłuż 320/390/768/1440 px, klawiaturę, loading/error/empty states i długie nazwy. PL/EN. Nie przedstawiaj fixture jako danych na żywo.

Dodaj testy realnych kontraktów i przypadków awarii. Uruchom typecheck, lint, npm test oraz właściwe testy Electron. Zweryfikuj wizualnie nowe flow. Nie wykonuj płatnych wywołań do modeli tylko po to, żeby test przeszedł; raportuj osobno brak testu live. Aktualizuj dokumentację tylko tam, gdzie zmieniło się działanie.

Na końcu pokaż zakres, dowody weryfikacji i ograniczenia. Jeśli użytkownik zlecił publikację i merge, utwórz PR, sprawdź CI dla aktualnego SHA i scal dopiero sprawdzoną wersję. Nie omijaj bramek bezpieczeństwa ani ochrony gałęzi.
```

## Weryfikacja

`npm run typecheck`, `npm run lint`, `npm test`, `npm run qa:harness-studio`; nowy scenariusz Electron jest również częścią macierzy CI Windows/Linux. Obejmuje zapis i konflikt rewizji, zachowanie draftu, zakres pamięci, unieważnianie podglądu, eksport do schowka, PL/EN, jasny/ciemny motyw i szerokości 1440/768/390/320. Wyniki lokalnego wykonania zapisuje `.runtime/harness-studio-qa/result.json`.

Implementacja paginacji opiera się na oficjalnym [GitHub CLI `gh api`](https://cli.github.com/manual/gh_api) (`--paginate`, `--slurp`, `--jq`). Nie zmienia sposobu logowania.

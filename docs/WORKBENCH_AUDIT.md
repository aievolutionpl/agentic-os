# Audyt workbencha 0.5.0-rc.1

Data: 20 października 2026. Punkt wyjścia: `da6e75a944b673cd7155a1399d5bf065f93bf8cd`. Zakres: desktop Electron, rozmowy, terminal, wejście do kolejki, dokumentacja i przygotowanie publicznego preview. Lokalna weryfikacja: Linux x64, Node 26.12.0, Electron 43.8.0, Xvfb. To nie audyt całego systemu operacyjnego ani certyfikacja braku błędów.

## Obserwacje i poprawki

| Obserwacja w aplikacji/kodzie | Skutek | Zmiana |
| --- | --- | --- |
| Brak lokalnej powłoki w interfejsie | Testy i agentowe CLI wymagają oddzielnego okna | Terminal oparty o node-pty i xterm, sześć kart, katalog projektu, kontrola rozmiaru, obsługa przerwania, zamknięcia i zakończenia procesu |
| Własny prosty parser odpowiedzi | Listy, tabele i formatowanie planów są trudne do czytania | Markdown/GFM, przewijane tabele, kopiowanie kodu, brak surowego HTML i zdalnych obrazów |
| Jeden wspólny szkic wiadomości | Zmiana rozmowy przenosi tekst/załączniki do innego celu | Oddzielne szkice w pamięci według rozmowy; odcięcie spóźnionego odczytu pliku przy przełączaniu |
| Rozbudowany nagłówek i historia na wąskim ekranie | Pole wiadomości jest wypychane, mało miejsca na treść | Zwinięta historia na małych ekranach, mniejszy nagłówek, elastyczny obszar rozmowy i własne przewijanie |
| Bezwarunkowe śledzenie końca odpowiedzi | Użytkownik traci miejsce podczas czytania wcześniejszych wiadomości | Auto-scroll tylko blisko końca; przycisk przejścia do najnowszej odpowiedzi |
| Brak wygodnej organizacji historii | Trudno znaleźć lub przenieść rozmowę | Szukanie tytułu/agenta, zmiana nazwy i kopiowanie całego transcriptu jako Markdown |
| Zapisany dostawca nie oznacza działającego zespołu | Brak recenzenta wychodzi dopiero po wykonaniu zadania | Podgląd ról, modeli i dat testów połączenia przed startem kolejki; bez wywołania dostawcy |
| Globalne wymuszenie env-paths 3 dla node-gyp | Instalacja natywnego terminala kończy się błędem CommonJS/ESM | Ograniczenie override do konsumentów env-paths 3; node-gyp otrzymuje zgodną wersję 2 |
| Nieudana przebudowa natywna może usunąć plik modułu | Import terminala przy starcie blokowałby otwarcie całej aplikacji | Ładowanie modułu dopiero przy otwarciu sesji; błąd pozostawia pustą listę sesji i pozwala ponowić po naprawie instalacji |
| Clipboard API przy odrzucanych uprawnieniach Electron | Przycisk kopiowania odpowiedzi zgłasza błąd | Wspólny mechanizm kopiowania w geście użytkownika, sprawdzony na systemowym schowku |
| Stary audyt kontrastu zakładał start w Control Center i indeksy zakładek | Test czekał na nieistniejący ekran lub pole | Jawna nawigacja po nazwach; osobny katalog nowych wyników |
| Historyczne artefakty QA mogły wyglądać jak aktualny wynik CI | Trudno ustalić, co naprawdę sprawdzono | CI publikuje oddzielne bieżące wyniki zestawów; release status odróżnia lokalne dowody od wydania |

Oglądano faktycznie uruchomione ekrany przed zmianami oraz nowe widoki w jasnym/ciemnym motywie i małych oknach. Zachowano istniejącą paletę, typografię i komponenty; nie wprowadzano migracji frameworka CSS. Krótkie animacje wejścia/stanu respektują `prefers-reduced-motion`.

## Dowody i odtworzenie

```sh
npm ci
npm run typecheck
npm test
npm run smoke
npm run qa:tools
npm run qa:workspace
npm run qa:harness
npm run qa:workbench
npm run qa:contrast
npm audit --audit-level=moderate
npm run notices
npm run release:audit
```

Linux headless: testy Electron uruchom przez `xvfb-run -a`. Ustaw `AGENTING_QA_OUTPUT` na odrębny katalog. `AGENTING_TEST_NO_SANDBOX=1` jest opcją izolowanego runnera i oznacza, że wynik nie dowodzi działania sandboxa Chromium.

Zestaw `qa:workbench` używa prawdziwego okna Electron, systemowego schowka i powłoki PTY. Dostawcę zastępuje lokalny proces protokołu testowego. Przykładowe treści na zrzutach są oznaczone i nie udają wyników zewnętrznego modelu. Test sprawdza również szkodliwy Markdown, rozdzielenie szkiców/załączników, zmianę nazwy, wyszukiwanie, nawigację z aktywnym terminalem, brak uruchomienia zadania w podglądzie i zakończenie wiadomości przez protokół.

Zrzuty: [docs/images](images). Metadane i końcowe wyniki: [evidence/workbench-05](evidence/workbench-05). Dokładne limity publikacji: [RELEASE_STATUS.md](RELEASE_STATUS.md).

## Granice wniosków

- Pomiary DOM obejmują tekst, kontrast i poziome przepełnienie w wybranych stanach. xterm rysuje glify na canvas; jego niewidoczna kopia dla czytników ekranu nie jest widocznym tekstem. xterm ma ustawione `minimumContrastRatio: 4.5`, ale nie zastępuje to osobnego audytu canvas ani testu technologii asystujących.
- Manualny terminal jest celowym dostępem do lokalnej powłoki. Nie podlega polityce uruchomień agentów i nie jest sandboxem. W jego treści mogą pojawić się dane użytkownika; aplikacja nie zapisuje bufora do SQLite.
- Unit/protocol/GUI testy nie dowodzą poprawności wszystkich modeli, kont i limitów subskrypcji. W tej pracy nie wykonywano live inference.
- Budowa i test instalatora Windows, podpis, upgrade/uninstall oraz macOS nie zostały zweryfikowane lokalnie. Natywny terminal rozszerza wymagania pakowania; dodany test pakietu jest obowiązkowy przed dystrybucją.
- Domyślna przebudowa Electron na tym runnerze nie mogła zapisać cache `~/.electron-gyp` poza dozwolonym workspace. Po odtworzeniu modułu przez `npm rebuild node-pty` lokalny test pakowania Linux korzysta z `--linux dir -c.npmRebuild=false` i już zbudowanego modułu N-API. Nie zmienia to domyślnej konfiguracji Windows ani nie dowodzi przebudowy ze źródeł dla Electron na Windows.
- Podgląd zespołu jest migawką zapisanych dowodów. Nie podmienia modelu, nie testuje go w tle i nie wprowadza automatycznej akceptacji.
- Vite zgłasza duży główny chunk. Terminal jest ładowany osobno; dalszy podział głównego interfejsu jest możliwą optymalizacją, nie ukrytą gwarancją wydajności.

Porównanie inspiracji, z wersjami źródeł i decyzjami: [Claudex Loop / CC Switch](research/claudex-cc-switch.md).

# Changelog

## 0.5.0-rc.1 — kandydat, jeszcze nieopublikowany

- Workspace premium: motywy Grafit/Jasny/Classic · Terra, klasyczny nagłówek, kompaktowe opcje w polu rozmowy i rzeczywiste logotypy dostawców.
- Model wybierany osobno dla rozmowy i przekazywany do właściwego adaptera. Antigravity pozostaje; Gemini CLI znika z aktywnego interfejsu.
- Automatyczny lokalny graf pamięci MCP, dwukierunkowe notatki Markdown, jawne relacje i dobór kontekstu w granicach projektu.
- Osiem pełnych, przypiętych pakietów Anthropic/Superpowers instalowanych jednym przyciskiem z dokumentacją, licencją i zapisem w pamięci.
- Kanban „Praca i pytania”, rzeczywiste zdarzenia pracy agentów i pełne karty wszystkich skonfigurowanych subskrypcji.
- Nieblokujące wczytywanie projektów podczas odczytów CLI i poprawka wycieku workera ConPTY po zamknięciu terminala. [Opis, źródła i ograniczenia](docs/PREMIUM_WORKSPACE.md).

- Wbudowany terminal PTY: sześć kart, katalog projektu, PowerShell/Bash/sh, zachowanie sesji podczas nawigacji, potwierdzenie zamknięcia i ograniczony bufor wyjścia.
- Czat: bezpieczne renderowanie Markdown/GFM, kopiowanie kodu i całej rozmowy, wyszukiwanie historii, zmiana nazwy i osobne szkice z załącznikami. Przewijanie za odpowiedzią tylko przy końcu rozmowy.
- Poprawione wykorzystanie miejsca w małych oknach, oba motywy, stany pracy i krótkie animacje respektujące ograniczenie ruchu.
- Podgląd zespołu przed startem kolejki: role, zapisany model/CLI, daty testów i brakujące połączenia. Inspirowany analizą Claudex Loop i CC Switch; bez kopiowania ich kodu.
- Naprawione kopiowanie w sesji Electron odrzucającej ogólne uprawnienia schowka; współdzielony mechanizm kopiowania w geście użytkownika.
- Poprawiona zgodność `env-paths` z `node-gyp`, jawne rozpakowanie natywnych plików terminala w pakiecie i test PTY w wypakowanej aplikacji Windows.
- Błąd ładowania natywnego terminala nie blokuje startu całej aplikacji; nieudane otwarcie nie zostawia pozornej sesji.
- Testy prawdziwego terminala, nowy scenariusz Electron `qa:workbench`, aktualne artefakty QA w CI, audyt dokumentacji i odświeżone notices zależności.
- README po polsku, dodatkowy angielski, nowe rzeczywiste zrzuty interfejsu, porównanie projektów i opis granic wydania.

Status i ograniczenia: [RELEASE_STATUS.md](docs/RELEASE_STATUS.md). Zmiana nie publikuje instalatora i nie dodaje podpisywania ani automatycznych aktualizacji.

## 0.4.x i wcześniejsze

Historia etapów: [STATUS.md](docs/STATUS.md), [audyt workspace](docs/WORKSPACE_AUDIT.md), [audyt harnessu](docs/HARNESS_AUDIT.md). Te materiały opisują datowane wyniki wcześniejszych zmian; nie zastępują bieżącego statusu.

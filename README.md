<div align="center">

# Agenting OS

**Jedno okno do rozmów z agentami, pracy w terminalu i wdrażania sprawdzonych zmian.**

[![CI](https://github.com/aievolutionpl/agentic-os/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aievolutionpl/agentic-os/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/aievolutionpl/agentic-os?include_prereleases&color=4F46E5)](https://github.com/aievolutionpl/agentic-os/releases/latest)
[![License](https://img.shields.io/badge/license-Apache--2.0-4F46E5)](LICENSE)
[![Node](https://img.shields.io/badge/Node.js-24%20%7C%2026-339933?logo=nodedotjs&logoColor=white)](.nvmrc)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D6)](#pobranie)

[Pobierz](#pobranie) · [Zbuduj ze źródeł](#uruchomienie-ze-źródeł) · [Jak to działa](#jak-to-działa) · [Dostawcy](docs/PROVIDERS.md) · [Stan wydania](docs/RELEASE_STATUS.md) · [Współpraca](CONTRIBUTING.md) · [English](README.en.md)

</div>

Agenting OS to otwarty pulpit do pracy z agentami AI od **AI Evolution Polska**. Łączy czat, projekty, wspólną pamięć, skille, terminal i kontrolowany proces zmian w Git. Wybierasz wykonawcę i recenzenta, widzisz rezultat i decydujesz o jego zastosowaniu.

![Agenting OS: motyw Classic Terra i pole rozmowy](docs/images/classic-start.png)

## Dlaczego to istnieje

- **Jeden kontekst zamiast pięciu terminali.** Czat, terminal, projekty i pamięć w jednym oknie, z tym samym workspace i tymi samymi skillami.
- **Zmiana przechodzi przez recenzenta.** Wykonawca pracuje w osobnym worktree, zostawia diff z SHA-256, a niezależny agent go ocenia. Nic nie trafia do repo bez Twojej zgody.
- **Wszystko zostaje lokalnie.** SQLite, pamięć i diffy leżą w `userData` Electron. Nie ma konta, chmury ani telemetrii.

**0.5.0-rc.1 — kandydat do publicznego preview.** To aplikacja desktopowa. Zrzuty przedstawiają rzeczywisty interfejs z oznaczonymi danymi przykładowymi. Weryfikacja lokalna i warunki publikacji są opisane w [raporcie wydania](docs/RELEASE_STATUS.md). Instalator Windows jest niepodpisany; nie udostępniamy automatycznych aktualizacji.

**Nowości workspace:** Classic · Terra i ciemny Grafit, wybór modelu w rozmowie, automatyczny graf pamięci z Markdown, osiem pełnych skilli z GitHuba oraz Kanban z rzeczywistą aktywnością agentów. [Szczegóły i źródła](docs/PREMIUM_WORKSPACE.md).

## Pobranie

Niepodpisany instalator Windows x64 leży w [Releases](https://github.com/aievolutionpl/agentic-os/releases/latest) wraz z sumami SHA-256.

1. Pobierz `Agenting-OS-<wersja>-windows-x64-setup.exe`.
2. Sprawdź sumę: `certutil -hashfile <plik> SHA256` i porównaj z `SHA256SUMS.txt`.
3. Uruchom instalator. Windows SmartScreen pokaże ostrzeżenie o nieznanym wydawcy — to oczekiwane przy braku certyfikatu podpisu.

Gotowych instalatorów Linux i macOS obecnie nie dostarczamy — poniżej opisana jest budowa ze źródeł.

## Uruchomienie ze źródeł

Potrzebujesz **Node.js 24 lub 26** (plik `.nvmrc` wskazuje 26), npm, Git i środowiska graficznego. Terminal korzysta z natywnego `node-pty`: gdy dla Twojej platformy nie ma gotowego pliku binarnego, potrzebne są Python 3 i kompilator C++ (Linux: `make`, `g++`; Windows: Visual Studio Build Tools z narzędziami C++; macOS: Xcode Command Line Tools).

```sh
git clone https://github.com/aievolutionpl/agentic-os.git
cd agentic-os
npm ci
npm start
```

`npm start` buduje aplikację, zapewnia przypięty runtime Electron i otwiera okno. Do obejrzenia interfejsu i testów automatycznych nie potrzebujesz konta dostawcy ani kluczy API. Do rozmowy z modelem potrzebujesz zainstalowanego i skonfigurowanego CLI lub połączenia API.

Na Windows x64 można zbudować i sprawdzić niepodpisany pakiet:

```sh
npm run package:win
npm run smoke:package
```

Wynik: `release/Agenting-OS-0.5.0-rc.1-windows-x64-setup.exe`. Test pakietu uruchamia wypakowaną aplikację i sprawdza również natywny terminal. Test instalacji, aktualizacji i odinstalowania to osobny warunek wydania.

## Co jest w środku

| Obszar | Do czego służy |
| --- | --- |
| **Czaty** | Rozmowa lub planowanie, strumieniowanie odpowiedzi, zatrzymywanie, historia i wyszukiwanie, zmiana nazwy, osobne szkice i załączniki dla rozmów. Markdown z tabelami, listami i kopiowaniem kodu oraz całej rozmowy. |
| **Terminal** | Prawdziwa lokalna powłoka w aplikacji: do sześciu kart, wybór katalogu projektu, zmiana rozmiaru, Ctrl+C i ciągłość sesji podczas nawigacji. PowerShell na Windows; Bash lub sh na Linux/macOS. |
| **Projekty i zadania** | Kolejka, zależności, role wykonawcy i recenzenta, kontekst oraz dziennik pracy. Podgląd zespołu przed startem pokazuje zapisane połączenia i brakującego recenzenta. |
| **Master Agent** | Wybrany agent przygotowuje plan do sześciu kroków, deleguje zatwierdzony plan i ocenia rezultat. Misja zatrzymuje się przy zmianach wymagających Twojej decyzji. |
| **Pamięć i skille** | Automatyczny lokalny graf MCP, edytowalne pliki Markdown, zakres projektu/workspace, przypinanie i FTS5. Osiem pełnych pakietów Anthropic/Superpowers instalowanych jednym przyciskiem oraz import SKILL.md. |
| **Połączenia i limity** | Wykrywanie CLI, konfiguracja modeli, jawne testy połączenia, rozróżnienie konfiguracji od rzeczywiście wykonanego zadania. Oficjalne limity Codex i budżet klucza OpenRouter; pozostałe mogą być nieznane. |
| **Narzędzia i dane** | Ręczne wywołania zaufanych serwerów MCP, przeglądarka projektu, kopie zapasowe, odwracalne przygotowanie przywrócenia i diagnostyka z redakcją rozpoznanych sekretów. |

Interfejs jest dostępny po polsku i angielsku, z motywami Grafit, Jasny i Classic · Terra. Animacje uwzględniają systemowe ograniczenie ruchu. `Ctrl+K` / `⌘K` otwiera wyszukiwarkę poleceń; w aktywnym terminalu skróty trafiają do powłoki.

## Jak to działa

### 1. Zacznij od rozmowy

W **Połączenia i modele** zapisz zaufany program i wykonaj test połączenia. W **Czatach** wybierz agenta, tryb rozmowy lub planowania i kontekst: domyślny workspace, folder lokalny albo repozytorium GitHub. Klonowanie z GitHub korzysta z Twojego logowania `gh`.

Napisz cel, dołącz plik tekstowy i wybierz pamięć lub skille. Odpowiedź można skopiować, zapisać w pamięci albo zamienić w szkic zadania. Szkice wiadomości i ich załączniki pozostają osobne dla każdej rozmowy podczas bieżącej sesji aplikacji; historia wysłanych wiadomości jest zapisywana lokalnie. Szkice nie są zapisywane po zamknięciu aplikacji.

### 2. Przekaż zmianę zespołowi

Do wdrażania zmian wybierz **czyste lokalne repozytorium Git z przynajmniej jednym commitem**. Utwórz zadanie, wskaż wykonawcę i innego, obsługującego przegląd recenzenta. Dodaj kryteria odbioru i kontekst.

Możesz uruchomić jedno zadanie, ręczną kolejkę do dziesięciu zadań albo plan Master Agenta. Podgląd kolejki pokazuje role, modele ustawione w aplikacji lub wybór pozostawiony CLI oraz datę ostatniego testu połączenia. Odczyt podglądu nie wywołuje modelu. Przygotowanie planu przez Master Agenta już korzysta z wybranego dostawcy.

```mermaid
flowchart LR
  A[Cel i kontekst] --> B[Zadanie / plan Mastera]
  B --> C[Wykonawca w worktree]
  C --> D[Diff i identyfikator artefaktu]
  D --> E[Niezależny recenzent]
  E --> F[Twoje zatwierdzenie]
  F --> G[Zastosowanie dokładnie tych zmian]
```

Wykonawca pracuje w osobnym worktree. Aplikacja zapisuje diff i jego SHA-256. Recenzja nie zatwierdza automatycznie zmiany: robisz to sam, a później osobno wybierasz jej zastosowanie. Zgoda wygasa po 15 minutach; zmiana artefaktu, brudny katalog źródłowy lub zmieniona baza blokują zastosowanie.

Kolejka działa sekwencyjnie, bez ukrytych ponowień i podmiany dostawcy. Błąd, zależność lub konieczność decyzji zatrzymują pracę. Po restarcie przerwane zadania pozostają do sprawdzenia i jawnego wznowienia.

### 3. Używaj terminala do ręcznej pracy

Otwórz **Terminal**, wybierz katalog i utwórz kartę. Możesz uruchomić `git status`, testy projektu lub zainstalowane `codex` / `claude`. Sesja działa dalej podczas przechodzenia do czatu. Zamknięcie karty wymaga potwierdzenia i kończy powłokę; sesje kończą się także przy zamknięciu aplikacji.

**Terminal działa z Twoimi uprawnieniami systemowymi.** Ręcznie wpisane polecenia mogą modyfikować projekt, korzystać z sieci i kont CLI. Nie przechodzą przez zatwierdzanie zmian ani budżety agenta. Historia wyświetlana w terminalu jest ograniczona i przechowywana w pamięci; sama powłoka i uruchomione programy mogą zapisywać własną historię. Terminal nie jest piaskownicą systemową.

## Zobacz aplikację

| Rozmowa w jasnym motywie | Lokalny terminal |
| --- | --- |
| ![Jasny czat z formatowaniem odpowiedzi](docs/images/chat-light.png) | ![Terminal Bash uruchomiony w katalogu projektu](docs/images/terminal-dark.png) |
| **Projekt i zadania** | **Zespół przed startem** |
| ![Projekt z kolejką zadań](docs/images/project.png) | ![Podgląd wykonawcy i brakującego połączenia recenzenta](docs/images/team-preflight.png) |
| **Połączenia i modele** | **Terminal w jasnym motywie** |
| ![Centrum połączeń i stan wykrytych narzędzi](docs/images/connections.png) | ![Jasny motyw terminala](docs/images/terminal-light.png) |

<details>
<summary>Pierwszy ekran i małe okna</summary>

![Początek pracy z agentem](docs/images/start.png)

<img src="docs/images/chat-mobile.png" alt="Czat w oknie szerokości 390 pikseli" width="320"> <img src="docs/images/terminal-mobile.png" alt="Terminal w oknie szerokości 390 pikseli" width="320">

To responsywność aplikacji desktopowej, nie osobna aplikacja mobilna. Procedura odtworzenia zrzutów: `npm run qa:workbench`.

</details>

## Dostawcy i granice działania

Obsługiwane adaptery obejmują Codex app-server, Claude Code, ACP, Gemini CLI, Hermes, OpenCode/OpenRouter, lokalny model przez OpenCode i eksperymentalne Antigravity. Dostępność ról i modeli zależy od protokołu oraz zainstalowanego programu. Hermes i Antigravity nie mają potwierdzonego trybu recenzenta tylko do odczytu. [Macierz dostawców](docs/PROVIDERS.md) opisuje szczegóły i historyczne próby; bieżącą gotowość pokazuje aplikacja.

Wykryty program, zapisane połączenie, udany handshake i zakończone zadanie to różne fakty. Nieznany limit pozostaje nieznany. Subskrypcja CLI i płatność za API to oddzielne rozliczenia. Testy automatyczne używają lokalnych procesów testowych i nie wykonują płatnych zapytań.

## Dane i bezpieczeństwo

Dane trafiają do katalogu `userData` Electron: baza SQLite, worktree, profile dostawców i sesje przeglądarki. `AGENTING_DATA_DIR` pozwala wskazać oddzielny katalog do testów. Tekst rozmów, pamięć, kontekst i diff nie są szyfrowane. Klucze OpenRouter korzystają z `safeStorage`; aplikacja odrzuca zapis przy nieszyfrującym backendzie. Natywne CLI zarządzają własnym logowaniem.

Nie ma hostowanej telemetrii ani synchronizacji kont. Wybrany dostawca otrzymuje treść zadania i kontekst, a lokalne programy i odwiedzane strony mogą korzystać z sieci. ACP/MCP to zaufane procesy lokalne, nie izolowane wtyczki. Markdown nie wykonuje HTML ani nie pobiera zdalnych obrazów; zwykłe odnośniki HTTP(S) otwierasz ręcznie w przeglądarce. Szczegóły: [SECURITY.md](SECURITY.md).

Izolacja procesu renderera: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP w `index.html`, blokada nawigacji i nowych okien. Wywołania IPC przechodzą przez allowlistę kanałów i sprawdzenie nadawcy.

## Jak jest zbudowany

| Warstwa | Technologia |
| --- | --- |
| Powłoka desktopowa | Electron 43 + TypeScript 5.9 |
| Interfejs | React 19 + Vite 7 |
| Dane | SQLite (wbudowany sterownik, migracje schematu) |
| Terminal | `node-pty` 1.1 |
| Testy | `node:test` + jsdom + Playwright |

```text
src/renderer   interfejs React
src/main       proces główny Electron, nadzór procesów, dostawcy, storage
src/shared.ts  kontrakt IPC
tests/         26 plików, 194 testy, 1 106 asercji
docs/          architektura, ADR-y, dostawcy, dowody weryfikacji
```

## Weryfikacja i rozwój

```sh
npm run typecheck
npm test
npm run smoke
npm run qa:tools
npm run qa:workspace
npm run qa:harness
npm run qa:workbench
npm audit --audit-level=moderate
npm run release:audit
```

CI (GitHub Actions) uruchamia typecheck, pełny zestaw testów, audyt zależności i natywną weryfikację Electron na Ubuntu oraz Windows. Na Linux bez pulpitu uruchamiaj testy Electron przez `xvfb-run -a`. Opcja `AGENTING_TEST_NO_SANDBOX=1` jest przeznaczona dla izolowanego runnera testowego wymagającego wyłączenia sandboxa Chromium; nie należy jej ustawiać do codziennej pracy. Zrzuty i wyniki można skierować poza repo przez `AGENTING_QA_OUTPUT`.

Kod interfejsu jest w `src/renderer`, backend Electron i nadzór procesów w `src/main`, kontrakt IPC w `src/shared.ts`. [Audyt 0.5](docs/WORKBENCH_AUDIT.md) opisuje poprawki i dowody. [Porównanie Claudex Loop i CC Switch](docs/research/claudex-cc-switch.md) wyjaśnia wybrane inspiracje i świadomie odłożone funkcje. [Changelog](CHANGELOG.md) zbiera zmiany.

## FAQ

**Czy potrzebuję klucza API?**
Nie, żeby obejrzeć interfejs i uruchomić testy. Do rozmowy z modelem potrzebujesz własnego CLI (np. Codex, Claude Code) albo połączenia API — aplikacja nie sprzedaje tokenów i nie pośredniczy w rozliczeniach.

**Czy aplikacja wysyła moje dane na zewnątrz?**
Sama nie. Treść zadania trafia tylko do wybranego przez Ciebie dostawcy. Nie ma telemetrii, konta ani synchronizacji.

**Czy to działa na macOS i Linuxie?**
Kod buduje się i przechodzi testy na obu systemach (CI to sprawdza), ale gotowe instalatory wydajemy tylko dla Windows x64. Na macOS/Linux uruchamiasz ze źródeł.

**Czy agent może sam zmienić moje repo?**
Nie. Wykonawca pracuje w osobnym worktree, zmiana wymaga Twojego zatwierdzenia, a zgoda wygasa po 15 minutach.

**Dlaczego instalator jest niepodpisany?**
Projekt nie ma certyfikatu code signing. SmartScreen pokaże ostrzeżenie; sumy SHA-256 pozwalają sprawdzić plik.

**Czy jest auto-update?**
Nie. Świadomie — przy preview aktualizujesz ręcznie z Releases.

## Współpraca

Zgłoszenia i pomysły: [Issues](https://github.com/aievolutionpl/agentic-os/issues). Zasady i środowisko: [CONTRIBUTING.md](CONTRIBUTING.md). Zachowanie w projekcie: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Luki bezpieczeństwa zgłaszaj według [SECURITY.md](SECURITY.md), nie przez publiczne issue.

**Apache-2.0** · [Licencja](LICENSE) · [Notice](NOTICE) · [Licencje zależności](licenses/THIRD_PARTY_NOTICES.md)

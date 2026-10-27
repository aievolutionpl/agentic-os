# Audyt workspace — 27.10.2026

Zakres: nawigacja między ekranami (routing widoków), routing modeli, motywy i spójność wizualna. Punkt wyjścia: `main` po 0.5.0-rc.3. Typecheck, lint i 274 testy przechodziły przed zmianami.

## Routing widoków — znalezione problemy

| # | Problem | Skutek | Poprawka |
| --- | --- | --- | --- |
| 1 | Etykiety ekranów zdefiniowane osobno w breadcrumbie (zagnieżdżony ternary na 30 linii) i w palecie poleceń | Ryzyko rozjazdu nazw przy kolejnych ekranach | Wspólny rejestr `src/renderer/views.ts` (`viewLabel`, `VIEW_SHORTCUTS`) |
| 2 | Pluginy i ScheduleJob nieosiągalne z palety `Ctrl+K` ani ze skrótów `Alt` | Dwa ekrany z sidebaru bez dostępu z klawiatury | Wpisy w palecie, `Alt+9` (Pluginy) i `Alt+0` (ScheduleJob) |
| 3 | Podpowiedź Harness w palecie kończyła się na „Przejdź · ” | Kosmetyczny błąd | Skrót pokazywany tylko wtedy, gdy istnieje |
| 4 | Aktywny Terminal / Harness / Praca i pytania był schowany w zwiniętej grupie „Więcej” | Brak widocznego zaznaczenia w sidebarze | Grupa otwiera się sama przy aktywnym ekranie; przyciski mają `aria-current` |
| 5 | Brak powrotu do poprzedniego ekranu | Każdy powrót wymagał ponownego szukania w menu | Historia widoków: `Alt+←`, boczny przycisk myszy, strzałka w nagłówku i wpis „Wstecz” w palecie |
| 6 | Tytuł okna zawsze „Agenting OS” | Trudniej rozpoznać okno na pasku zadań | Tytuł `Ekran · Agenting OS` |

## Routing modeli

`src/main/router.ts` jest deterministyczny, każde odrzucenie ma kod przyczyny, a remisy rozstrzyga stała kolejność agentów. Testy `router.test.mjs` i `model-routing.test.mjs` pokrywają tryby manual, subscription-first i quality-first. Nie znalazłem błędów wymagających zmian.

## Wygląd

- Nowa paleta **Matrix Terminal** (`src/renderer/matrix.css`, `MatrixRain.tsx`): zieleń fosforu, monospace, linie CRT, przyciemnione zielono logo, paleta xterm i cyfrowy deszcz za treścią.
- Deszcz rysuje canvas za zawartością (`z-index:-1`, bez obsługi kliknięć), ok. 14 klatek/s. Zatrzymuje się przy ograniczeniu ruchu i ukrytym oknie. „Jednolite tło” wyłącza deszcz i linie CRT.
- Kursory w motywie są rysowane (`content:""`), nie wpisywane, więc nazwy dostępności przycisków i nagłówków się nie zmieniają.
- Kontrast wszystkich tokenów tekstu Matrix ≥ 4.5:1 (test `tests/views.test.mjs`).
- Ustawienia „Wygląd i wygoda pracy” były tylko po polsku — dodano wersję angielską.

## Pozostawione do decyzji

- W katalogu głównym leżą notatki robocze agentów (`NEXT_SLICE*.md`, `NEXT_RESULT.md`, `WORKER_RESULT.md`). Warto je przenieść do `docs/` lub usunąć.
- `npm run lint` zgłasza 43 ostrzeżenia (nieużywane zmienne); żadnych błędów.
- Etykieta „Zadania” w grupie „Więcej” prowadzi do ekranu „Praca i pytania”. Nazwę zostawiłem bez zmian, bo opierają się na niej skrypty QA.

## Weryfikacja

`npm run typecheck`, `npm run lint`, `npm test` (279 testów) oraz suity Electron z CI pod Xvfb: smoke, qa:tools, qa:workspace, qa:harness, qa:workbench, qa:premium, qa:calm (teraz 7 motywów), qa:onboarding, qa:header.

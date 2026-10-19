# Agent OS — przygotowanie warsztatu

Status: przygotowanie narzędzi, nie implementacja produktu. Chris przekaże wymagania; nie zakładać funkcji z anulowanego formularza.

## Wybrany proces
- Główny proces: obra/superpowers — istniejący plugin, lokalny commit b36e0829c6d0140e93cfef2ca599b1b07d4a7797. Brainstorming, plan, TDD, subagenci, osobny reviewer, weryfikacja przed ukończeniem.
- Uzupełnienie Git/PR: coleam00/skills — lokalny checkout 847be0848ae7b997ae4420bc0eac267177a066a2. PIV, worktree, review. Nie uruchamiać równolegle drugiego nadrzędnego procesu.
- 40 istniejących skilli software-engineering potwierdzonych na dysku. Nie oznacza to przetestowania wszystkich workflow.
- Browser QA: istniejący browser-e2e-qa; pobrany upstream anthropics/skills/webapp-testing, commit dbd4588f9e1033efb41dad4bef2f7947c8993d44. Dodatkowy materiał i helper, nie nowy globalny plugin.

## Dowody
- GitHub README Superpowers i Cole odczytane.
- Załadowane TDD, requesting-code-review i browser-e2e-qa.
- Python Playwright uruchomił prawdziwy headless Chromium, kliknął przycisk na izolowanej stronie testowej i potwierdził zmianę tekstu: PASS.
- with_server.py --help: exit 0. Pełen lifecycle helpera nieprzetestowany.
- Nie testowano funkcji Agent OS — aplikacja nie powstała w ramach przygotowania.

## Praca po otrzymaniu briefu
1. Kryteria akceptacji i model danych, następnie małe pionowe fragmenty funkcjonalne.
2. Test wykazujący brak funkcji → implementacja → zielony test → refactor.
3. Niezależne zadania w osobnych worktree; reviewer nie jest autorem poprawki.
4. Unit + integration + prawdziwe E2E, ścieżki błędów, anulowanie, restart i trwałość danych stosownie do wymagań.
5. Build, lint i typecheck z rzeczywistych skryptów projektu; PIV validate ma szablony, nie gotowe komendy aplikacji.
6. Przegląd diffu i sekretów przed publicznym PR. Bez modyfikowania instalacji Hermesa.

## Źródła
- https://github.com/obra/superpowers
- https://github.com/coleam00/skills
- https://github.com/anthropics/skills/tree/main/skills/webapp-testing

Licencja narzędzi developerskich nie jest automatycznie licencją budowanej aplikacji. Nie kopiować cudzych pakietów do publicznego repo bez sprawdzenia warunków.

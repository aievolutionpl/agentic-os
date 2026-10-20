# Claudex Loop i CC Switch — co warto przenieść

Przegląd kodu i dokumentacji: 20 października 2026. Porównanie dotyczy konkretnych pobranych commitów, nie wszystkich późniejszych wersji. Nie uruchamiano ich instalatorów, proxy ani modeli. To analiza repozytoriów, nie porównawczy benchmark jakości agentów.

## Źródła

- **Claudex Loop**, MIT, commit [`53cddc4`](https://github.com/chaseai-yt/claudex-loop/tree/53cddc42e39346fb8c6d5d612281a3b1add14e66): [README](https://github.com/chaseai-yt/claudex-loop/blob/53cddc42e39346fb8c6d5d612281a3b1add14e66/README.md), [runner i walidacja recenzji](https://github.com/chaseai-yt/claudex-loop/blob/53cddc42e39346fb8c6d5d612281a3b1add14e66/skills/claudex-loop/scripts/runner.py), [routing ról](https://github.com/chaseai-yt/claudex-loop/blob/53cddc42e39346fb8c6d5d612281a3b1add14e66/skills/claudex-route/SKILL.md), [licencja](https://github.com/chaseai-yt/claudex-loop/blob/53cddc42e39346fb8c6d5d612281a3b1add14e66/LICENSE).
- **CC Switch**, MIT, commit [`19798e2`](https://github.com/farion1231/cc-switch/tree/19798e2f92a4ff949a7647e07c33351bf597fa10): [funkcje](https://github.com/farion1231/cc-switch/blob/19798e2f92a4ff949a7647e07c33351bf597fa10/README.md#features), [akcje kart dostawców](https://github.com/farion1231/cc-switch/blob/19798e2f92a4ff949a7647e07c33351bf597fa10/src/components/providers/ProviderCardActions.tsx), [przełączanie failover](https://github.com/farion1231/cc-switch/blob/19798e2f92a4ff949a7647e07c33351bf597fa10/src-tauri/src/proxy/failover_switch.rs), [zachowanie konfiguracji Codex](https://github.com/farion1231/cc-switch/blob/19798e2f92a4ff949a7647e07c33351bf597fa10/src-tauri/src/services/provider/codex_direct.rs), [licencja](https://github.com/farion1231/cc-switch/blob/19798e2f92a4ff949a7647e07c33351bf597fa10/LICENSE).

Nie skopiowano kodu, tekstów instrukcji ani grafik tych projektów. Wdrożenia opisane poniżej są własnym kodem Agenting OS inspirowanym ich sposobem organizacji pracy. Zależności aplikacji zachowują własne licencje i notices.

## Różnice i decyzje

| Pomysł | Co mają referencje | Co ma Agenting OS | Decyzja |
| --- | --- | --- | --- |
| Jawne role i granice pracy | Claudex wybiera innego recenzenta, ogranicza rundy planu/poprawek/inspekcji i zapisuje zakończenie | Różny wykonawca i recenzent, kolejka do 10 zadań, Master do 6 kroków; brak automatycznych ponowień | Zachować mechanizm. **Dodano podgląd zespołu przed startem**: role, zapisany model lub CLI, test połączenia, brak recenzenta i granice kolejki. |
| Akceptacja związana z treścią | Claudex wiąże akceptację planu z SHA-256; końcową inspekcję z kompletnym manifestem zmian | Niezmienny artefakt diff, hash, osobna recenzja, wygasająca zgoda i sprawdzanie bazy przed apply | Fundament już istnieje. Nie zastępować go statusem „agent zatwierdził”. |
| Ustrukturyzowane ustalenia przeglądu | Claudex ma APPROVED/REVISE/BLOCKED, dowód, wagę, zakres i ograniczenia; nie akceptuje pustej odpowiedzi | Recenzja artefaktu i dziennik; plan Mastera ma schemat, ale brak analogicznego rejestru ustaleń planu | **Następny etap o wysokiej wartości**: wersjonowane ustalenia planu i jawne rozstrzygnięcia. Wymaga zmian schematu, adapterów i testów unieważniania po zmianie planu. Nie deklarujemy tego jako wdrożonego. |
| Czytelność połączeń | CC Switch pokazuje aktywny tryb/dostawcę i akcje testowania; przełącza konfiguracje | Wykrywanie, profile, handshake, dowody prawdziwego uruchomienia, modele i polityka wydatków | **Przeniesiono zapisane dowody do miejsca startu kolejki**. Odczyt nie uruchamia CLI ani modelu. |
| Przenośne rozmowy | CC Switch czyta logi narzędzi, ma outline, wyszukiwanie, kopiowanie tur/rozmów i eksport Markdown | Własne rozmowy, aktywność i kopiowanie pojedynczej odpowiedzi | **Dodano kopiowanie całej rozmowy jako Markdown**, wraz ze statusem nieukończonych tur, bez ukrytej pamięci i ścieżek workspace. Dodano wyszukiwanie tytułów/agentów i zmianę nazwy. Import cudzych logów/outline pozostaje poza tą zmianą. |
| Szybki dostęp do CLI | CC Switch otwiera terminal dla dostawcy/sesji | Wcześniej brak interaktywnej powłoki w oknie | **Dodano prawdziwy terminal PTY w kartach**, wspólny dla narzędzi użytkownika. Nie wpisuje poleceń ani nie uruchamia modeli automatycznie. |
| Profile, backup i rollback | CC Switch przełącza konfiguracje narzędzi, zachowuje pozostałe ustawienia i robi kopie przed zapisami | Profile istniejące/izolowane Codex, ustawienia modeli, backup i staged restore danych aplikacji | Zachować backup. Wieloprofilowy przełącznik połączeń na projekt rozważyć później, z podglądem zmian i odwróceniem operacji. |
| Routing API i automatyczny failover | CC Switch konwertuje protokoły, ma kolejki failover i circuit breaker | Adaptery uruchamiają jawnie wybranego dostawcę; polityki i limity są sprawdzane przed pracą | **Odłożone**: zmiana dostawcy/modelu/rozliczeń w trakcie zadania wymaga odrębnego projektu i testów. W tej wersji błąd pozostaje widoczny. |
| Chmura, deep links, marketplace, auto-update | CC Switch oferuje szeroki ekosystem konfiguracji i dystrybucji | Lokalna pamięć, jawny import skilli/MCP, niepodpisany instalator | Nie są warunkiem dobrego harnessu. Aktualizator dopiero po podpisywaniu i QA instalacji; import z sieci wymaga modelu zaufania. |

## Dlaczego te dodatki

Największy zysk w codziennej pracy daje skrócenie drogi: rozmowa → zadanie → sprawdzenie zespołu → wynik → decyzja. Podgląd ujawnia brak recenzenta przed zużyciem czasu wykonawcy. Markdown pozwala przenieść całą rozmowę do issue lub dokumentu. Terminal pozwala samodzielnie uruchomić testy i agentowe CLI bez opuszczania aplikacji.

Podgląd nie obiecuje dostępności modelu: pokazuje zapisany stan i czas testu. Dostawca bez przypisanego modelu jest opisany jako „Model ustawiony w CLI”, a nie jako model rzekomo zaobserwowany. Skopiowana rozmowa zawiera treści użytkownika i modelu; nie jest automatycznie anonimizowana.

Dowody wdrożenia: `TeamPreflight.tsx`, `OrchestrationPanel.tsx`, `ChatWorkspace.tsx`, `chatMarkdown` w `shared.ts`, `terminals.ts` i `TerminalPanel.tsx`. Testy: `tests/chats.test.mjs`, `tests/terminals.test.mjs`, `scripts/workbench-qa.mjs`. [Stan wydania](../RELEASE_STATUS.md) opisuje zakres weryfikacji.

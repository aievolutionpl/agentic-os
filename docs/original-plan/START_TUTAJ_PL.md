# Agenting OS - START TUTAJ (polski przewodnik)

**Co dostajesz:** specyfikację własnego systemu, architekturę, dokumentację wszystkich modułów, prompt dla Hermesa, reguły bezpieczeństwa, audyt multi-agentowy, testy, przykładowe schematy danych i skrypt pobierający repozytoria referencyjne.

**Co jest gotowe:** plan i dokumenty. **Czego jeszcze nie ma:** ukończonego programu Agenting OS ani sprawdzonych na twoim PC logowań CLI. Hermes ma dopiero wykonać audyt R0 i następnie budować produkt.

## Najważniejsza idea
- Agenting OS to **nazwy produktu**. Hermes go **buduje**. Po uruchomieniu w każdym Workspace wybierasz Master Agenta: Codex/Claude/Gemini/Hermes/OpenCode/inny wspierany.
- Zlecasz zadanie raz. Router deleguje podzadania na agentów po sprawdzeniu **uprawnień, umiejętności, dostępności, kosztów i quota**. Wyniki wspólnie zapisują się do pamięci danego Workspace.
- Abonamenty nie zmieniają się w „jeden pakiet tokenów”. Program zarządza niezależnymi logowaniami i metrykami i używa wyłącznie wspieranych sposobów dostępu.

## Jak zacząć
1. Pobierz ZIP i rozpakuj na Windows, np. `D:\Projects\AgentingOS`.
2. Zapoznaj się z `README.md` (przegląd) oraz `docs/08-ux-ui.md` (dashboard).
3. Skontroluj i uruchom PowerShell `scripts/clone-reference-repos.ps1` (pobranie źródeł, bez wykonywania ich kodu).
4. W Hermes podaj: **„Otwórz `HERMES_MASTER_PROMPT.md` w tym folderze i rozpocznij wyłącznie audyt R0. Zanim napiszesz kod, pokaż mi źródła, ryzyka i plan wdrożenia.”**
5. Po raporcie R0 zatwierdź wybór adapterów; wtedy Hermes przechodzi do kolejnych etapów i pokazuje działające przyrosty.

## Główne moduły dashboardu
Overview / Workspaces / New Task / Agent Fleet / Subscription Quotas / Model Catalog / Smart Router / Task Graph / Shared Memory / GitHub / Approvals / Activity / Settings.

## Gdzie czytać szczegóły
- `HERMES_MASTER_PROMPT.md` - główny prompt dla Hermesa.
- `AGENTS.md` - zasady dla każdego programującego agenta.
- `docs/01` do `docs/11` - cel, architektura, integracje, routing, pamięć, GitHub, limity, UI, bezpieczeństwo, open source i roadmapa.
- `docs/12` do `docs/14` - niezależne audyty, kontrakty API, Windows.

**Ważne:** Po uruchomieniu programu agenci nie powinni mieć dostępu do sekretnych danych klientów innych Workspace. Operacje o skutkach zewnętrznych wymagają zatwierdzenia użytkownika.

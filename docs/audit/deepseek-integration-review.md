# DeepSeek — przegląd integracji providerów (zakres ograniczony)

Stan na chwilę audytu: 2026-10-19, po odczycie kodu z tego dnia.
Zakres: obsługa błędów providerów, anulowanie zadań, limity subskrypcji, wyciek sekretów.
Metoda: wyłącznie odczyt kodu i dokumentacji.

**Żaden test, build, typecheck ani smoke nie został uruchomiony w ramach tego audytu.** Wszystko, co niżej opisane jako „działa", to wniosek z lektury kodu, nie z wykonania. Wymagania testowe w sekcji 5 są PLANEM — nie zostały napisane ani uruchomione.

Nie modyfikowano plików innych agentów, konfiguracji Hermesa ani cronów. Ten plik jest jedynym wyjściem.

## 0. Kluczowy wniosek

Kod integracji providerów JESZCZE NIE ISTNIEJE. Nie ma adapterów, klientów HTTP/SDK, wywołań modeli, odczytu quota ani składowania kluczy. Jedyne, co istnieje, to statyczna lista 9 integracji oznaczonych jako `not_configured` i quota `unknown`.

Dowody:
- `src/shared.ts:66-78` — `Integration.status` ma tylko literał `"not_configured"`; `quota` ma na sztywno `state:"unknown"`, a `remaining/unit/source/observedAt/resetAt` to literały `null`.
- `src/main/store.ts:220-243` — `integrations()` zwraca hardcoded tablicę 9 pozycji, zawsze `not_configured` + `unknown`. Brak jakiegokolwiek odczytu, cache, tabeli SQLite.
- `docs/STATUS.md:3,21` — „provider inference, quotas … NOT simulated or enabled”; następny krok to dopiero read-only adaptery Codex/Claude.
- `docs/KANBAN.md:38-42` — adaptery, cancellation, sekrety i limity są w sekcji planowanej, nie zrobionej.

Zatem punkty 1-4 opisują realne problemy w istniejącym kodzie, które uderzą przy podłączaniu providerów; punkty 5-6 to wymagania testów oznaczone wyraźnie jako PLAN.

## 1. Obsługa błędów — problemy w istniejącym kodzie

### P1. IPC gubi wszystkie kody błędów (realny, `src/main/index.ts:86-90`)
```ts
try { return handler(input); }
catch { throw Error("REQUEST_REJECTED"); }
```
Każdy błąd domenowy (`INVALID_TRANSITION`, `TASK_NOT_FOUND`, `LEASE_LOST`, `UNSUPPORTED_SCHEMA`) jest zamieniany na jeden generyczny `REQUEST_REJECTED`. Renderer nie może odróżnić błędu walidacji od awarii infrastruktury ani pokazać sensownego komunikatu.

Skutek dla providerów: nie da się zmapować `AUTH_REQUIRED`, `QUOTA_BLOCKED`, `TIMEOUT`, `TRANSIENT` (wymagane w planie, `Agenting_OS_Master_Plan_v2.1.md:241`) na UI, bo warstwa IPC i tak je spłaszczy.

### P2. Renderer redukuje błąd do boolean (realny, `src/renderer/main.tsx:22,54-56,75-77,88-90`)
`setError(true)` bez treści i bez kodu. `w.error` (`src/renderer/i18n.ts:83,188`) to jeden ogólny komunikat. Brak rozróżnienia „odrzucone dane" / „provider niedostępny" / „limit wyczerpany".

### P3. Model kodów failures jest zbyt wąski (realny, `src/shared.ts:26-27`, `src/main/lifecycle.ts:44,261-266`)
Dozwolone tylko `worker_error | validation_failed | lease_expired`. Brak `auth_required`, `quota_blocked`, `timeout`, `transient`, `unknown`, a także stanów `needs_auth` / `waiting_quota` wymaganych przez plan (`Master_Plan:232,241`). Dodanie ich wymaga migracji v3 (CHECK w `lifecycle.ts:44`) i rozszerzenia `FailureCode`.

### P4. Brak redakcji `details` (ryzyko, `src/main/lifecycle.ts:72-93`)
`event.details` to dowolny string (dependencies zapisują tam JSON, `lifecycle.ts:153`). Nie ma funkcji redakcyjnej. Gdy adapter zacznie przekazywać stderr providera, do bazy trafią np. `Authorization: Bearer ...` albo `sk-...`. Pozytywne: `finish()` odrzuca surowy tekst jako failure — test `tests/lifecycle.test.mjs:200` podaje `"raw secret text"` i oczekuje odrzucenia.

### P5. Brak mapowania wyjątków procesu potomnego
Nie istnieje supervisor ani spawn, więc nie ma obsługi: timeout, zabicia drzewa procesów, odczytu kodu wyjścia, odróżnienia „provider nie zainstalowany" od „auth wygasł". To PLAN, ale bez tego nie wolno włączyć execution.

Proponowane małe poprawki (bez implementacji providerów):
- F1 (`index.ts:86-90`): allowlist kodów domenowych; zwracaj `{ code }` dla znanych, `INTERNAL` dla nieznanych. Nie przekazuj `error.message` dowolnego pochodzenia.
- F2 (`shared.ts:26-27`): dodaj kody providerowe + test, że każdy nowy kod ma tłumaczenie PL/EN.
- F3 (`lifecycle.ts:72-93`): `redactDetails()` — usuń `Bearer ...`, `sk-[A-Za-z0-9_-]{16,}`, `ghp_...`, `xox[bp]-...`, wartości po `api_key=`/`token=`; cap długości np. 500 znaków; test jednostkowy.
- F4 (`renderer/main.tsx`): zamień `error:boolean` na `{code:string}|null` i pokazuj komunikat z allowlisty.

## 2. Anulowanie zadań — stan istniejący i luki

Istniejące (zgodnie z ADR 002 i lekturą kodu):
- `src/main/lifecycle.ts:159-160` — `cancel` dozwolony tylko dla `draft`, `queued`, `failed`; `running` celowo nieanulowalny, bo nie ma supervisora, który potwierdzi zabicie procesu (`docs/adr/002-task-lifecycle.md:9`).
- Anulowanie jest transakcyjne z eventem (`lifecycle.ts:162-172`); `claim` używa `BEGIN IMMEDIATE` (`lifecycle.ts:24-34,191`), więc wyścig cancel/claim jest serializowany.
- UI pokazuje przycisk tylko dla tych trzech stanów (`src/renderer/main.tsx:412-416`).

Luki:
- C1. Brak stanu pośredniego `cancelling`/`aborting` i brak ścieżki stop dla `running`. Plan wymaga `stop` w cyklu adaptera (`Master_Plan:240`) oraz stanów `paused`/`cancelled` (`:232`).
- C2. Event `cancelled` nie ma `details` (przyczyna, aktor systemowy vs user) — `lifecycle.ts:165-172` przekazuje `null`.
- C3. Anulowany prerequisite trwale blokuje zależne zadania (`adr/002:11`); UI nie ostrzega o tym skutku.
- C4. Brak idempotencji anulowania: drugi `cancel` na już anulowanym daje `INVALID_TRANSITION` — poprawne, ale UI nie odświeża się automatycznie.

Proponowane małe poprawki:
- F5: dopóki nie ma supervisora, jawnie zwracaj `CANCELLATION_UNSUPPORTED` dla `running` (czytelniejsze niż `INVALID_TRANSITION`) + test.
- F6: `details` dla cancel: `{reason, requestedBy}` z redakcją (F3).
- F7: w UI przy anulowanym prerequisite pokaż ostrzeżenie „zależne zadania pozostaną zablokowane”.

## 3. Limity subskrypcji — stan istniejący i luki

Pozytywne (realne): brak fałszywych procentów — wszystko `unknown` z `source/observedAt/resetAt = null` (`store.ts:231-242`), zgodnie z `Master_Plan:62` i `:97` (subskrypcja ≠ pula tokenów API).

Problemy:
- Q1 (`src/shared.ts:70-77`): typ nie potrafi przedstawić zmierzonej wartości — `state` tylko `"unknown"`, pola tylko `null`. Nie ma `unit`, `window`, `provenance` jako enum, `stale`.
- Q2 (`store.ts:220-243`): brak persystencji i cache. Po restarcie nie ma „ostatnio znanego" limitu ani czasu obserwacji. Brak tabeli `integration_quota(id, state, remaining, unit, source, observedAt, resetAt)`.
- Q3 (`renderer/main.tsx:589-615`): UI ignoruje `i.status` i `i.quota` i wypisuje stałe `w.notConfigured` / `w.unknown`. Gdy backend zacznie zwracać realny status, UI nadal pokaże „not configured / unknown" — cichy błąd.
- Q4: brak reguły świeżości (np. `observedAt` starszy niż 24 h → `stale`) i brak rozróżnienia „brak wsparcia odczytu quota" od „nie sprawdzono”.

Proponowane małe poprawki:
- F8: rozszerz typ: `state: "unknown"|"known"|"stale"`, `provenance: "official_cli"|"api_endpoint"|"user_input"|null`, `window: string|null`; walidator odrzuca `known` bez `source` + `observedAt`.
- F9: tabela cache + odczyt w `snapshot()`; brak wartości = `unknown`, nigdy 0.
- F10: renderer renderuje wyłącznie dane z obiektu; dodaj test DOM, że `known` z liczbą pokazuje liczbę, a `unknown` nie pokazuje „0”.

## 4. Sekrety — ocena istniejącej powierzchni

Dobre praktyki już w kodzie:
- `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, `webviewTag:false` (`src/main/index.ts:24-30`).
- Blokada uprawnień i sieci poza lokalnym plikiem renderera (`index.ts:48-58`), blokada popupów/nawigacji (`:32-36`).
- Allowlista nadawcy IPC (`index.ts:75-85`, `src/main/security.ts:1-7`), wąski preload (`src/main/preload.cts`).
- Brak jakiegokolwiek pola na klucze w API/DB; log startowy nie zawiera szczegółów (`index.ts:97-101`).
- SQLite niezaszyfrowany (`docs/STATUS.md:19`) — tym ważniejsze, by klucze nigdy tam nie trafiły.

Ryzyka do zaadresowania przed providerami:
- S1 (`src/main/index.ts:11-12`): `AGENTING_DATA_DIR` z env procesu — OK w main, ale przyszły spawn providera domyślnie dziedziczy CAŁE env, w tym klucze. Wymagany allowlist env przy spawnie.
- S2 (`src/main/store.ts:90`): `root` przyjmuje dowolny string do 4096 znaków, bez kanonizacji. Dziś to tylko metadana, ale przyszły adapter musi rozwiązać ścieżkę, odrzucić `..`/symlink escape i sprawdzić, że katalog istnieje (`Master_Plan:244`).
- S3: brak miejsca na sekrety w main (safeStorage/OS keychain). Nic nie istnieje — i to jest poprawne na tym etapie; nie wolno dopisać kluczy do SQLite ani localStorage.
- S4: brak testu strzegącego, że API/provider snapshot nie zwraca pól sekretnych.

Proponowane małe poprawki:
- F11: interfejs `SecretStore` (main-only, `safeStorage`/keychain), bez implementacji w tym slice; test „snapshot() i projectData() nie zawierają pól `key|token|secret|password`".
- F12: `spawn` z jawnym `env` allowlist, `shell:false`, `cwd` w worktree, timeout + kill całego drzewa (PLAN).
- F13: walidacja `root`: `path.resolve`, odrzuć wyjście poza wybrany katalog, odrzuć symlinki (PLAN, po dodaniu wyboru folderu).

## 5. Wymagania testów akceptacyjnych — PLAN (nic nie uruchomione)

Oznaczenie: wszystkie poniższe to wymagania do napisania; żaden nie został wykonany w tym przeglądzie.

A. Błędy (mogą powstać od razu, bez providerów):
1. IPC zwraca `INVALID_TRANSITION` dla nielegalnego przejścia i `TASK_NOT_FOUND` dla obcego projektu (dziś oczekiwane `REQUEST_REJECTED` — test będzie RED przed F1).
2. Nieznany wyjątek handlera nie ujawnia ścieżki/stacktrace w odpowiedzi IPC.
3. `redactDetails` usuwa Bearer/sk-/ghp_/api_key i capuje długość.
4. Każdy `FailureCode` ma tłumaczenie PL i EN.

B. Anulowanie:
5. `cancel` na `running` zwraca `CANCELLATION_UNSUPPORTED` i nie zmienia statusu.
6. `cancel` na `queued` zapisuje event z `details.reason`, bez tokenu lease.
7. Równoległy `claim` i `cancel` — dokładnie jeden wygrywa, brak stanu pośredniego.
8. Po anulowaniu prerequisite dependent pozostaje `blocked`, a UI pokazuje ostrzeżenie.

C. Limity:
9. `quota.state="known"` bez `source`/`observedAt` jest odrzucane walidacją.
10. Restart aplikacji zachowuje ostatnią znaną quota z `observedAt` (cache), a po przekroczeniu TTL stan zmienia się na `stale`.
11. Brak danych ⇒ `unknown`, nigdy `0`.
12. UI: `known` renderuje wartość i jednostkę; `unknown` nie renderuje zera; `stale` ma oznaczenie.

D. Sekrety:
13. `snapshot()` i `projectData()` nie zawierają kluczy `key/token/secret/password` (rekurencyjnie).
14. Logi startowe i eventy nie zawierają wzorców sekretów po wymuszeniu błędu providera (PLAN, po adapterze).
15. Renderer nie ma dostępu do `process.env` ani modułów Node (już pokryte przez smoke, ale dopisać asercję po dodaniu providerów).

E. Provider (PLAN, po implementacji adapterów):
16. `AUTH_REQUIRED` z adaptera ⇒ status `needs_auth`, brak retry automatycznego.
17. `QUOTA_BLOCKED` ⇒ `waiting_quota`, zadanie nie jest liczone jako `failed`.
18. `TIMEOUT` ⇒ `failed/transient`, supervisor zabija proces i potomków, lease zwolniony.
19. Anulowanie `running` zatrzymuje proces i zapisuje `cancelled` dopiero po potwierdzeniu zakończenia.
20. Ponowne uruchomienie po `lease_expired` wymaga jawnego retry i ostrzega o możliwych efektach ubocznych.

## 6. Rozróżnienie: istnieje vs plan

Istnieje (wg kodu; testów nie uruchamiałem): lifecycle draft→queued→running(lease)→completed/failed, fencing tokenem, heartbeat, expiry recovery, retry max 3, DAG zależności, transakcyjny journal, wąski IPC, sandbox renderera, statyczne „not configured/unknown”.

Plan (nie istnieje): wszelkie adaptery providerów, wykonywanie zadań, odczyt quota, cache limitów, magazyn sekretów, supervisor/anulowanie running, mapowanie błędów providerów, redakcja logów, migracja v3 kodów failures.

## 7. Priorytety (małe, bezpieczne kroki)

1. F1 + F2 + testy A1-A2 (kody błędów w IPC) — małe, bez zależności.
2. F10 + Q3 (UI quota z danych) — naprawia cichy błąd na przyszłość.
3. F3 + test A3 (redakcja details) — zanim jakikolwiek adapter coś zapisze.
4. F8 + F9 + testy C9-C12 (kontrakt quota i cache).
5. Dopiero potem adapter read-only Codex/Claude (zgodnie z `docs/STATUS.md:21`).

---

Ograniczenia tego przeglądu: brak uruchomionych testów, brak weryfikacji na Windows, brak dostępu do żywych providerów (nie istnieją w kodzie). Numery linii dotyczą stanu plików z 2026-10-19 i mogą się przesunąć po zmianach innych agentów.

# Audyt: adaptery providerów i quota (Agenting OS)

Data: 19.10.2026 · task t_99c42d3f · bez sekretów (żadnych tokenów/kluczy nie czytano ani nie zapisano).
Legenda dowodów: **[LOCAL]** sprawdzone na tej maszynie (WSL) · **[DOC]** oficjalna dokumentacja odczytana dziś · **[3RD]** dokumentacja/repo osób trzecich (nieoficjalne) · **[NIE ZWERYFIKOWANE]**.

## 1. Podsumowanie (wniosek)
| Provider | Odczyt quota | Źródło | Pewność | Windows natywnie |
|---|---|---|---|---|
| OpenRouter (API) | TAK, oficjalne API: kredyty/limit/użycie klucza | [DOC] | wysoka | tak (HTTP, brak CLI) |
| Codex (ChatGPT) | TAK: `codex app-server` JSON-RPC `account/rateLimits/read` (okna 5h/tydzień, kredyty) | [LOCAL schema] + [3RD] | średnia (API "experimental") | tak (CLI + natywny sandbox) |
| Claude Code | częściowo: `/usage` tylko interaktywnie; nieoficjalny endpoint OAuth | [DOC]+[3RD] | niska–średnia | tak (natywnie), sandbox nie |
| Gemini CLI / Antigravity | słabo: `/stats model` interaktywnie; brak oficjalnego odczytu nieinteraktywnego | [DOC]+[3RD] | niska | Gemini CLI tak; Antigravity NIE ZWERYFIKOWANE |
| Ollama/LM Studio/OpenCode | brak quota (lokalne) — tylko zasoby sprzętu | — | n/d | OpenCode/Ollama nie zainstalowane tu [LOCAL] |

Zasada produktu (plan v2.1, docs/07): brak autorytatywnej wartości → `remaining=null, unit=unknown`, UI „Brak danych”, nigdy 100%/unlimited. Poniższe wyniki wspierają ten model.

## 2. OpenRouter [DOC + LOCAL]
- Źródło: https://openrouter.ai/docs/api-reference/limits (odczytane).
- `GET https://openrouter.ai/api/v1/key` (Bearer): `limit`, `limit_remaining`, `limit_reset`, `usage`, `usage_daily/weekly/monthly` (UTC), `byok_usage*`, `is_free_tier`. Pole `rate_limit` oznaczone deprecated — ignorować.
- Salda konta: `GET /api/v1/credits` — endpoint istnieje (bez klucza → 401 [LOCAL]); schemat pól NIE potwierdzony (strona docs nie zwróciła treści). Przed użyciem sprawdzić w docs.
- `GET /api/v1/models` publiczne (200 bez klucza [LOCAL]) → katalog modeli bez autoryzacji.
- Limity: dwa osobne rodzaje — **kredytowe** (saldo + opcjonalny limit klucza → błąd 402) i **rate** (modele `:free`, ochrona DDoS → 429). Kolejne konta/klucze NIE zwiększają rate limitów (limity globalne). Progi liczbowe dla `:free` w docs były niewypełnione szablonem ({FREE_MODEL_*}) — nie podawać liczb bez ponownej weryfikacji.
- Udane odpowiedzi inferencji NIE mają nagłówków `X-RateLimit-*`; one są tylko na błędach platformowych. Monitoring = polling `/key`.
- Rekomendacja adaptera: `quotaRead` = `/key` (+ `/credits`); jednostka = waluta/kredyty; zachować `limit=null` jako „bez limitu klucza”, NIE jako „bez limitu konta”. Cache ≥60 s, backoff na 429. Klucz tylko w vault/OS credential store.

## 3. Codex [LOCAL + 3RD]
- Zainstalowany: codex-cli 0.159.1 [LOCAL].
- `codex app-server generate-json-schema` wygenerowało lokalnie schematy: `GetAccountRateLimitsResponse`, `AccountRateLimitsUpdatedNotification`, `ConsumeAccountRateLimitResetCreditParams` [LOCAL] → metoda odczytu limitów i powiadomienia push istnieją w protokole tej wersji. `app-server` oznaczony `[experimental]` w `codex --help` [LOCAL] → ryzyko zmiany schematu; wersjonować adapter i generować schemat przy starcie.
- Relacje [3RD] (blog Patersona, CodexBar): `account/rateLimits/read` zwraca `primary` (5h) i `secondary` (tydzień) z `usedPercent`, `resetsAt`; wymagany handshake `initialize`. Dokładne pola zweryfikować względem wygenerowanego schematu, nie bloga.
- Oficjalnie [DOC via cytaty]: `/status` w sesji CLI pokazuje limity; strona użycia chatgpt.com/codex/settings/usage. `/usage` w CLI = tokeny, nie limity. `codex /status` poza REPL nie działa.
- Uwaga: subskrypcja ≠ pula tokenów; jednostka = % okna, nie tokeny. Nie sumować z innymi providerami.
- Nie uruchamiano realnego odczytu (wymagałby sesji konta) → **odczyt na żywo NIE przetestowany**.

## 4. Claude Code [DOC + 3RD]
- Zainstalowany: 2.1.269 [LOCAL]. `claude --help` pokazuje `auth`, `doctor`, `setup-token`; brak podkomendy quota [LOCAL].
- Oficjalnie: `/usage` (aliasy `/cost`, `/stats`) pokazuje paski: sesja 5h, tydzień, tydzień dla jednego modelu + reset. Tylko interaktywnie. Plan dla subskrypcji Pro/Max/Team/Enterprise.
- Nieoficjalnie [3RD]: `api.anthropic.com/api/oauth/usage` z tokenem OAuth z `~/.claude/.credentials.json` + nagłówek `anthropic-beta`. Brak w publicznym API; autor sam nazywa „undocumented beta”. **Nie zalecane do produktu**: wymaga czytania tokenu OAuth (plan v2.1: „avoid credential scraping without explicit review”) i może naruszać warunki. Domyślnie: Claude quota = `unknown`/„CLI lacks data” (zgodnie z przykładem w docs/07 planu).
- Dla kosztów API (nie subskrypcji): Admin API (`sk-ant-admin…`) — raportuje wydatki organizacji [3RD CodexBar]; NIE ZWERYFIKOWANE w docs Anthropic.
- Alternatywa zgodna z zasadami: zliczać własne użycie z JSON/logów sesji uruchamianych przez Agenting OS i oznaczać jako `estimated`.

## 5. Gemini CLI / Antigravity [DOC + 3RD]
- Zainstalowany: gemini 0.59.0 [LOCAL].
- Dokumentacja: limity zależą od uwierzytelnienia (konto Google 1000–2000 req/dzień, klucz API free 250 req/dzień itd.); kontrola przez `/stats model` (interaktywnie). To limity requestów/dzień, nie tokeny.
- UWAGA: strona instalacji Gemini CLI: „Gemini CLI replaced by Antigravity CLI on June 18th, 2026” dla użytkowników unpaid tier / Google One. Wymaga ponownego sprawdzenia, czy konto Chrisa dalej korzysta z Gemini CLI; adapter Antigravity: **NIE ZWERYFIKOWANE** (CodexBar wspomina lokalną sondę language-server; brak oficjalnej dokumentacji odczytanej).
- Nieoficjalnie: `retrieveUserQuota` z poświadczeń CLI (CodexBar), nieinteraktywny `/stats` nic nie wypisuje, maintainerzy: brak wbudowanego sposobu na dzienną quota [3RD].
- Rekomendacja: `hasQuotaMetric=false`, quota `unknown` + licznik własny (`estimated`).

## 6. Narzędzia referencyjne do quota (licencje/kod do audytu przed użyciem)
- steipete/CodexBar, jiliu88/CodexBar (macOS-owe; wzorzec: app-server RPC → fallback PTY), cruzanstx/cclimits (CLI sprawdzające Claude/Codex/Gemini/OpenRouter/Copilot…). Wszystkie [3RD]; **licencje nie sprawdzone**; część czyta cookies przeglądarki/tokeny — nie kopiować kodu scrapującego poświadczenia (plan v2.1 to wyklucza).

## 7. Natywny Windows
- **Codex** [DOC learn.chatgpt.com]: natywnie w PowerShell (aplikacja, CLI, IDE), sandbox `mxc` (wymaga Win11 24H2/25H2 z odpowiednim buildem), `elevated`, `unelevated`. Win11 zalecany, Win10 1809+ best effort (ConPTY). Test MXC: `codex -c windows.sandbox=mxc sandbox …` od CLI 0.162.0 (lokalnie 0.159.1 — na Windows sprawdzić wersję).
- **Claude Code** [DOC code.claude.com]: Windows 10 1809+; natywna instalacja z PowerShell/CMD, bez admina; Git for Windows opcjonalny (inaczej narzędzie PowerShell). **Sandbox Bash nie wspiera natywnego Windows** — użyć WSL2/kontenera/VM do uruchomień bez nadzoru (`--dangerously-skip-permissions` tylko w izolacji).
- **Gemini CLI** [DOC]: Windows 11 24H2+, Node 20+, PowerShell; ma natywny sandbox Windows (zmienia poziomy integralności `icacls` trwale).
- **OpenRouter**: czysty HTTPS, brak zależności platformowych.
- Wniosek: workflow v2.1 „Windows local-first” jest wykonalny dla Codex/Claude/Gemini natywnie; różnice w izolacji muszą być zapisane w `capabilities` adaptera (np. `nativeSandbox: true|false`).
- Nie testowano nic na Windows — ta maszyna to WSL. Sprawdzone tylko dokumentacją.

## 8. Rekomendacje do kontraktu adaptera
1. `quotaRead` zwraca `{provider, account, window, unit, used, remaining|null, resetsAt|null, source: official|cli|estimated|unknown, observedAt}`; zachować jednostki, nie sumować %.
2. Kolejność źródeł: oficjalne API (OpenRouter) → protokół CLI (Codex app-server) → licznik własny → unknown. Bez czytania tokenów OAuth z plików innych narzędzi.
3. Wersjonuj/ pinuj wersje CLI; testy kontraktowe na schemacie (`generate-json-schema` dla Codex).
4. Pierwszy pionowy fragment: OpenRouter (`/key`) + Codex (`rateLimits/read`); Claude/Gemini jako `unknown` z licznikiem własnym.
5. Do zrobienia przed budową: odczyt na żywo Codex (z zgodą/kontem), potwierdzenie schematu `/credits`, status Gemini→Antigravity, sprawdzenie licencji narzędzi referencyjnych, test na prawdziwym Windows.

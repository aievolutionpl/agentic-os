# Master Agent: decyzje integracyjne — 2026-10-19

Przyjęto publiczne protokoły istniejących agentów oraz lokalny, trwały dziennik misji. Nie skopiowano kodu aplikacji referencyjnych ani nie dołączono ich zależności. Istniejący research Orchestrator/Paperclip/CC Switch pozostaje w [poprzednim raporcie](agent-workspace-2026-10-19.md).

| Źródło pierwotne | Potwierdzony kontrakt | Zastosowanie |
| --- | --- | --- |
| [Gemini CLI reference](https://geminicli.com/docs/cli/cli-reference/) | Flaga `--experimental-acp`, opcje trybu akceptacji i planowania | Ponowne użycie adaptera ACP; brak automatycznego `yolo`. Tryb odczytu musi być reklamowany przez sesję. |
| [Hermes ACP](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/acp.md) | `hermes acp`, dodatkowa zależność ACP, istniejąca konfiguracja dostawcy | Profil wykonawcy bez deklarowania niezweryfikowanego trybu read-only. Nie kopiujemy tożsamości ani sekretów Hermesa. |
| [Ollama + OpenCode](https://docs.ollama.com/integrations/opencode) | Konfiguracja provider/model przez interfejs zgodny z OpenAI | OpenCode zapewnia pętlę narzędzi, Agenting OS wybiera jawny endpoint loopback i model; żadnej nowej własnej implementacji file-tool agenta. Dokumentacja zaleca odpowiednio duży kontekst (64k+) dla OpenCode. |
| [OpenCode providers](https://opencode.ai/docs/providers/) | OpenAI-compatible i istniejące ustawienia providera | Odrębny lokalny profil ACP, oddzielony od klucza OpenRouter. Faktyczna kompatybilność zależy od zainstalowanej wersji OpenCode i modelu. |
| [Codex app-server](https://learn.chatgpt.com/docs/app-server) | `config/read`, konfiguracja thread/start/resume, `mcpServerStatus/list` | Zachowanie istniejącego logowania z ograniczoną polityką narzędzi per sesja; kontrola przed inferencją. |
| [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) | Wyłączanie serwerów MCP i Apps; ruch narzędzi nie jest objęty sieciową polityką komend | Tryb `read-only` komend nie wystarcza do ograniczenia niezależnych MCP. Sprawdzone także lokalnym CLI `features list` i wygenerowanym schematem JSON RPC. |

Master otrzymuje kontrakt planu i listę skonfigurowanych agentów. Host interpretuje wyłącznie walidowany plan, a nie arbitralny kod lub wywołania narzędzi z odpowiedzi modelu. Kryteria odbioru i referencje do źródeł pozostają przy zadaniach. Wybór kolejnego kroku jest deterministyczny, ocena końcowa modelowa i jawnie odróżniona od testów oraz decyzji człowieka.

Każda adaptacja musi być weryfikowana na rzeczywistym CLI i koncie użytkownika; sama zgodność z dokumentacją nie oznacza aktywnego połączenia. Nie uznano odczytów OAuth z prywatnych magazynów, przechwytywania tokenów procesów ani wyłączania TLS za metodę integracji subskrypcji.

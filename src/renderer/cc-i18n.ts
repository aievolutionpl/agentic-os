import type { ConnectorReason, ConnectorState } from "../shared";

type Copy = {
  nav: string;
  title: string;
  subtitle: string;
  rescan: string;
  scanning: string;
  scannedAt: string;
  scanFailed: string;
  fleet: string;
  next: string;
  nextNone: string;
  statReady: string;
  statAttention: string;
  statRuns: string;
  statSpend: string;
  statSpendNote: string;
  version: string;
  signIn: string;
  location: string;
  adapter: string;
  models: string;
  providerLimit: string;
  limitUnknown: string;
  limitUnknownNote: string;
  localRuns: string;
  localRunsNote: string;
  install: string;
  unknown: string;
  notSignedIn: string;
  signedIn: string;
  smokeNote: string;
  states: Record<ConnectorState, string>;
  reasons: Record<ConnectorReason, string>;
  kinds: Record<string, string>;
  adapters: Record<string, string>;
  steps: Record<string, string>;
  safety: string;
};

export const ccWords: Record<"en" | "pl", Copy> = {
  en: {
    nav: "Control Center",
    title: "Control Center",
    subtitle:
      "Your subscriptions, local models and tools in one place. Everything below was detected on this computer just now.",
    rescan: "Re-scan",
    scanning: "Scanning…",
    scannedAt: "Last scan",
    scanFailed: "The scan could not finish. Try again.",
    fleet: "Agent fleet",
    next: "Suggested next steps",
    nextNone: "Nothing needs attention right now.",
    statReady: "Ready to run",
    statAttention: "Need attention",
    statRuns: "Runs started today",
    statSpend: "API spend",
    statSpendNote: "Not tracked yet",
    version: "Version",
    signIn: "Sign-in",
    location: "Location",
    adapter: "In Agenting OS",
    models: "Models",
    providerLimit: "Provider limit",
    limitUnknown: "Unknown",
    limitUnknownNote:
      "No verified official source yet. Nothing is estimated or invented.",
    localRuns: "Runs in Agenting OS",
    localRunsNote: "today · local count, not the provider's quota",
    install: "Install",
    unknown: "Unknown",
    notSignedIn: "Not signed in",
    signedIn: "Signed in",
    smokeNote: "Smoke test not run yet",
    states: {
      ready: "Ready",
      "needs-auth": "Sign-in needed",
      "needs-install": "Not installed",
      experimental: "Detected",
      unsupported: "Not supported",
      degraded: "Needs repair",
    },
    reasons: {
      ok: "Detected and signed in. Supervised runs are available.",
      not_found: "Not found on this computer.",
      auth_missing: "Installed, but you are not signed in.",
      auth_unknown:
        "Installed. This tool offers no safe sign-in status check, so sign-in is unknown.",
      bridge_required:
        "Installed and signed in. Runs need a compatible ACP bridge, which is not set up yet.",
      adapter_planned:
        "Detected. The execution adapter for this tool is planned, not built yet.",
      server_down: "Installed, but its local server is not responding.",
      probe_failed: "Installed, but the version check failed or timed out.",
      vault_missing:
        "API keys need the encrypted credential vault, planned for the next release.",
      no_verified_integration:
        "No official, stable way to drive this tool has been verified. It stays off until proven.",
    },
    kinds: {
      cli: "Command-line tool",
      "local-server": "Local model server",
      api: "Cloud API",
      service: "Service",
    },
    adapters: {
      available: "Supervised runs available",
      "requires-bridge": "Needs an ACP bridge",
      planned: "Planned",
      none: "Not used for runs",
    },
    steps: {
      "needs-auth": "Sign in to {name} using its own login command.",
      auth_unknown:
        "Confirm that {name} is signed in; it cannot report this safely.",
      "needs-install": "Install {name} if you want to use it.",
      server_down: "Start the {name} server.",
      probe_failed: "Update or reinstall {name}.",
      bridge_required:
        "Add an ACP bridge for {name} to run tasks through your subscription.",
    },
    safety:
      "Detection is read-only. Agenting OS never reads your credentials or session files.",
  },
  pl: {
    nav: "Centrum dowodzenia",
    title: "Centrum dowodzenia",
    subtitle:
      "Twoje subskrypcje, lokalne modele i narzędzia w jednym miejscu. Wszystko poniżej zostało wykryte na tym komputerze przed chwilą.",
    rescan: "Skanuj ponownie",
    scanning: "Skanowanie…",
    scannedAt: "Ostatni skan",
    scanFailed: "Nie udało się dokończyć skanowania. Spróbuj ponownie.",
    fleet: "Flota agentów",
    next: "Proponowane kolejne kroki",
    nextNone: "Nic nie wymaga teraz uwagi.",
    statReady: "Gotowe do pracy",
    statAttention: "Wymagają uwagi",
    statRuns: "Uruchomienia dziś",
    statSpend: "Wydatki na API",
    statSpendNote: "Jeszcze nie śledzone",
    version: "Wersja",
    signIn: "Logowanie",
    location: "Lokalizacja",
    adapter: "W Agenting OS",
    models: "Modele",
    providerLimit: "Limit dostawcy",
    limitUnknown: "Nieznany",
    limitUnknownNote:
      "Brak zweryfikowanego oficjalnego źródła. Nic nie jest szacowane ani zmyślane.",
    localRuns: "Uruchomienia w Agenting OS",
    localRunsNote: "dziś · lokalny licznik, nie limit dostawcy",
    install: "Instalacja",
    unknown: "Nieznane",
    notSignedIn: "Niezalogowany",
    signedIn: "Zalogowany",
    smokeNote: "Test dymny jeszcze niewykonany",
    states: {
      ready: "Gotowy",
      "needs-auth": "Wymaga logowania",
      "needs-install": "Niezainstalowany",
      experimental: "Wykryty",
      unsupported: "Nieobsługiwany",
      degraded: "Wymaga naprawy",
    },
    reasons: {
      ok: "Wykryty i zalogowany. Nadzorowane uruchomienia są dostępne.",
      not_found: "Nie znaleziono na tym komputerze.",
      auth_missing: "Zainstalowany, ale nie jesteś zalogowany.",
      auth_unknown:
        "Zainstalowany. Narzędzie nie ma bezpiecznego sprawdzenia logowania, więc stan logowania jest nieznany.",
      bridge_required:
        "Zainstalowany i zalogowany. Uruchomienia wymagają zgodnego mostu ACP, który nie jest jeszcze skonfigurowany.",
      adapter_planned:
        "Wykryty. Adapter wykonawczy dla tego narzędzia jest planowany, jeszcze go nie ma.",
      server_down: "Zainstalowany, ale jego lokalny serwer nie odpowiada.",
      probe_failed:
        "Zainstalowany, ale sprawdzenie wersji nie powiodło się lub przekroczyło czas.",
      vault_missing:
        "Klucze API wymagają szyfrowanego magazynu poświadczeń, planowanego w następnym wydaniu.",
      no_verified_integration:
        "Nie zweryfikowano oficjalnego, stabilnego sposobu sterowania tym narzędziem. Pozostaje wyłączone do czasu dowodu.",
    },
    kinds: {
      cli: "Narzędzie wiersza poleceń",
      "local-server": "Lokalny serwer modeli",
      api: "API w chmurze",
      service: "Usługa",
    },
    adapters: {
      available: "Nadzorowane uruchomienia dostępne",
      "requires-bridge": "Wymaga mostu ACP",
      planned: "Planowany",
      none: "Nie służy do uruchomień",
    },
    steps: {
      "needs-auth": "Zaloguj się w {name} jego własnym poleceniem logowania.",
      auth_unknown:
        "Potwierdź, że jesteś zalogowany w {name}; narzędzie nie potrafi tego bezpiecznie zgłosić.",
      "needs-install": "Zainstaluj {name}, jeśli chcesz go używać.",
      server_down: "Uruchom serwer {name}.",
      probe_failed: "Zaktualizuj lub zainstaluj ponownie {name}.",
      bridge_required:
        "Dodaj most ACP dla {name}, aby uruchamiać zadania przez Twoją subskrypcję.",
    },
    safety:
      "Wykrywanie jest tylko do odczytu. Agenting OS nigdy nie czyta Twoich poświadczeń ani plików sesji.",
  },
};

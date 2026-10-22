import React, { useEffect, useRef, useState } from "react";
import type { BrowserState } from "../shared";
export function BrowserPanel({
  projectId,
  language,
  hidden,
}: {
  projectId: string;
  language: "pl" | "en";
  hidden: boolean;
}) {
  const api = window.agenting!,
    pl = language === "pl",
    host = useRef<HTMLDivElement>(null),
    editing = useRef(false);
  const [address, setAddress] = useState("https://"),
    [state, setState] = useState<BrowserState | null>(null),
    [error, setError] = useState(false),
    [savedNotice, setSavedNotice] = useState(false);
  async function action(
    action: "navigate" | "back" | "forward" | "reload",
    url?: string,
  ) {
    setError(false);
    try {
      const next = await api.browserAction({ projectId, action, url });
      setState(next);
    } catch {
      setError(true);
    }
  }
  useEffect(() => {
    let alive = true;
    const timer = setInterval(() => {
      void api
        .browserAction({ projectId, action: "state" })
        .then((next) => {
          if (alive) setState(next);
        })
        .catch(() => {
          if (alive) setError(true);
        });
    }, 1000);
    return () => {
      alive = false;
      clearInterval(timer);
      void api.browserAction({ projectId, action: "hide" }).catch(() => {});
    };
  }, [projectId]);
  useEffect(() => {
    if (state?.url && !editing.current) setAddress(state.url);
  }, [state?.url]);
  useEffect(() => {
    let frame = 0,
      alive = true;
    function layout() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!alive) return;
        const rect = host.current?.getBoundingClientRect();
        if (
          hidden ||
          !state?.url ||
          !rect ||
          document.querySelector("dialog[open]")
        ) {
          void api.browserAction({ projectId, action: "hide" }).catch(() => {});
          return;
        }
        const x = Math.max(0, Math.ceil(rect.left)),
          y = Math.max(110, Math.ceil(rect.top)),
          right = Math.min(window.innerWidth, Math.floor(rect.right)),
          bottom = Math.min(window.innerHeight, Math.floor(rect.bottom));
        if (right - x < 50 || bottom - y < 50) {
          void api.browserAction({ projectId, action: "hide" }).catch(() => {});
          return;
        }
        void api
          .browserAction({
            projectId,
            action: "bounds",
            bounds: { x, y, width: right - x, height: bottom - y },
          })
          .catch(() => {
            if (alive) setError(true);
          });
      });
    }
    const resize = new ResizeObserver(layout);
    if (host.current) resize.observe(host.current);
    const mutation = new MutationObserver(layout);
    mutation.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["open"],
    });
    window.addEventListener("resize", layout);
    window.addEventListener("scroll", layout, true);
    layout();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", layout);
      window.removeEventListener("scroll", layout, true);
      void api.browserAction({ projectId, action: "hide" }).catch(() => {});
    };
  }, [projectId, hidden, !!state?.url]);
  return (
    <section className="browser-panel">
      <div className="section-heading">
        <div>
          <h2>{pl ? "Przeglądarka projektu" : "Project browser"}</h2>
          <p>
            {pl
              ? "Osobna sesja logowania i cookies dla każdego projektu."
              : "A separate login and cookie session for each project."}
          </p>
        </div>
      </div>
      <form
        className="browser-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void action(
            "navigate",
            /^[a-z][a-z0-9+.-]*:/i.test(address)
              ? address
              : `https://${address}`,
          );
        }}
      >
        <button
          type="button"
          className="icon-button"
          aria-label={pl ? "Wstecz" : "Back"}
          disabled={!state?.back}
          onClick={() => void action("back")}
        >
          ←
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={pl ? "Dalej" : "Forward"}
          disabled={!state?.forward}
          onClick={() => void action("forward")}
        >
          →
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={pl ? "Odśwież stronę" : "Reload page"}
          disabled={!state?.url}
          onClick={() => void action("reload")}
        >
          ↻
        </button>
        <label className="sr-only" htmlFor="browser-address">
          {pl ? "Adres strony" : "Page address"}
        </label>
        <input
          id="browser-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onFocus={() => {
            editing.current = true;
          }}
          onBlur={() => {
            editing.current = false;
          }}
          maxLength={8192}
          placeholder="https://"
          required
        />
        <button className="primary">{pl ? "Otwórz" : "Open"}</button>
        <button
          type="button"
          className="secondary"
          disabled={!state?.url && !address.trim()}
          onClick={() => {
            const targetUrl = state?.url || address.trim();
            if (!targetUrl) return;
            void api
              .createMemory({
                projectId,
                source: "browser:url-context",
                scope: "project",
                content: `Project Browser URL Context: ${targetUrl}${state?.title ? `\nPage Title: ${state.title}` : ""}`,
              })
              .then(() => {
                setSavedNotice(true);
                setTimeout(() => setSavedNotice(false), 2500);
              })
              .catch(() => setError(true));
          }}
        >
          {savedNotice
            ? pl
              ? "✓ Zapisano w Pamięci"
              : "✓ Saved to Memory"
            : pl
              ? "Zapisz URL w Pamięci"
              : "Save URL to Memory"}
        </button>
      </form>
      <div className="harness-slash-bar" style={{ padding: "0 0 10px" }}>
        <span className="harness-slash-label">
          {pl ? "Lokalne porty & Docs:" : "Local ports & Docs:"}
        </span>
        {[
          { label: "localhost:3000", url: "http://localhost:3000" },
          { label: "localhost:5173 (Vite)", url: "http://localhost:5173" },
          { label: "localhost:8080", url: "http://localhost:8080" },
          { label: "localhost:4321", url: "http://localhost:4321" },
          { label: "GitHub", url: "https://github.com" },
        ].map((item) => (
          <button
            key={item.url}
            type="button"
            className="slash-chip"
            onClick={() => {
              setAddress(item.url);
              void action("navigate", item.url);
            }}
          >
            <strong>→</strong>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      {(error || state?.error) && (
        <p className="inline-error" role="alert">
          {pl
            ? "Nie udało się otworzyć strony. Dozwolone są HTTPS i jawnie otwarty lokalny serwer. Sprawdź adres lub połączenie."
            : "Could not open this page. HTTPS and explicitly opened loopback servers are allowed. Check the address or connection."}
        </p>
      )}
      <p className="helper" role="status">
        {state?.loading
          ? pl
            ? "Ładowanie strony…"
            : "Loading page…"
          : state?.title ||
            (pl
              ? "Brak otwartej strony. Pobieranie plików, nowe okna i uprawnienia urządzeń są wyłączone."
              : "No page open. Downloads, new windows and device permissions are disabled.")}
      </p>
      <div ref={host} className="browser-surface">
        <p>
          {pl
            ? "Otwórz dokumentację, repozytorium lub lokalny podgląd projektu."
            : "Open documentation, a repository or your local project preview."}
        </p>
      </div>
    </section>
  );
}

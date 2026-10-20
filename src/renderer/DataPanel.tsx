import React, { useEffect, useState } from "react";
import type { BackupSummary } from "../shared";
import { Icon, Modal } from "./ui";

const COPY = {
  en: {
    title: "Your data",
    intro:
      "Everything stays on this computer. Back it up, move it to another machine, or send support a diagnostics file without your content.",
    backup: "Back up data",
    restore: "Restore from backup…",
    diagnostics: "Export diagnostics",
    saved: (s: BackupSummary) =>
      `Backup saved: ${s.file} · ${s.projects} projects · ${s.tasks} tasks · ${s.memory} memory entries`,
    diagSaved: (file: string) => `Diagnostics saved: ${file}`,
    diagNote:
      "Diagnostics contain versions, counts, connection states and redacted error codes — no memory, chats, task titles, paths or credentials.",
    confirmTitle: "Restore from a backup?",
    confirmBody:
      "You will choose a backup file. It is checked for integrity and compatibility, then replaces your current data at the next start. Your current database is kept next to it, so the restore can be undone.",
    choose: "Choose backup file",
    cancel: "Cancel",
    staged: (s: BackupSummary) =>
      `Ready to restore ${s.file} (${s.projects} projects, ${s.tasks} tasks, ${s.memory} memory entries, schema v${s.schema}). Restart to finish.`,
    restart: "Restart now",
    restored:
      "Data restored from backup. The previous database was kept as agenting.sqlite.before-restore-….",
    rejected:
      "A staged backup failed its checks at start-up and was not applied. Your current data is unchanged.",
    failed: {
      BACKUP_CORRUPT: "This file is damaged or not an SQLite database.",
      BACKUP_UNSUPPORTED_SCHEMA:
        "This backup comes from a newer version of Agenting OS.",
      BACKUP_NOT_AGENTING: "This file is not an Agenting OS backup.",
      BACKUP_INCOMPLETE:
        "This backup is missing tables its version requires and was not used.",
      BACKUP_INCONSISTENT:
        "This backup contains broken references between records and was not used.",
      BACKUP_TARGET_IS_LIVE:
        "Choose another location: this is the database the app is using.",
      BACKUP_SOURCE_IS_LIVE:
        "This is the database the app is already using. Choose a backup file.",
      default: "The operation failed. Your data was not changed.",
    } as Record<string, string>,
  },
  pl: {
    title: "Twoje dane",
    intro:
      "Wszystko zostaje na tym komputerze. Zrób kopię, przenieś dane na inny komputer albo wyślij wsparciu plik diagnostyczny bez Twoich treści.",
    backup: "Utwórz kopię zapasową",
    restore: "Przywróć z kopii…",
    diagnostics: "Eksportuj diagnostykę",
    saved: (s: BackupSummary) =>
      `Zapisano kopię: ${s.file} · projekty: ${s.projects} · zadania: ${s.tasks} · wpisy pamięci: ${s.memory}`,
    diagSaved: (file: string) => `Zapisano diagnostykę: ${file}`,
    diagNote:
      "Diagnostyka zawiera wersje, liczniki, stany połączeń i zanonimizowane kody błędów — bez pamięci, czatów, tytułów zadań, ścieżek i danych logowania.",
    confirmTitle: "Przywrócić dane z kopii?",
    confirmBody:
      "Wybierzesz plik kopii. Sprawdzimy jego integralność i zgodność, a przy następnym uruchomieniu zastąpi on obecne dane. Obecna baza zostanie zachowana obok, więc przywrócenie można cofnąć.",
    choose: "Wybierz plik kopii",
    cancel: "Anuluj",
    staged: (s: BackupSummary) =>
      `Gotowe do przywrócenia: ${s.file} (projekty: ${s.projects}, zadania: ${s.tasks}, pamięć: ${s.memory}, schemat v${s.schema}). Uruchom ponownie, aby zakończyć.`,
    restart: "Uruchom ponownie",
    restored:
      "Dane przywrócono z kopii. Poprzednia baza została zachowana jako agenting.sqlite.before-restore-….",
    rejected:
      "Przygotowana kopia nie przeszła kontroli przy starcie i nie została zastosowana. Obecne dane są bez zmian.",
    failed: {
      BACKUP_CORRUPT: "Plik jest uszkodzony albo nie jest bazą SQLite.",
      BACKUP_UNSUPPORTED_SCHEMA:
        "Ta kopia pochodzi z nowszej wersji Agenting OS.",
      BACKUP_NOT_AGENTING: "Ten plik nie jest kopią Agenting OS.",
      BACKUP_INCOMPLETE:
        "W tej kopii brakuje tabel wymaganych przez jej wersję — nie została użyta.",
      BACKUP_INCONSISTENT:
        "Ta kopia zawiera zerwane powiązania między rekordami — nie została użyta.",
      BACKUP_TARGET_IS_LIVE:
        "Wybierz inne miejsce: to jest baza, z której korzysta aplikacja.",
      BACKUP_SOURCE_IS_LIVE:
        "To jest baza, z której aplikacja już korzysta. Wybierz plik kopii.",
      default: "Operacja się nie udała. Twoje dane nie zostały zmienione.",
    } as Record<string, string>,
  },
};

const code = (error: unknown) =>
  String(error instanceof Error ? error.message : error).match(
    /BACKUP_[A-Z_]+/,
  )?.[0] ?? "default";

export function DataPanel({ language }: { language: "pl" | "en" }) {
  const t = COPY[language],
    api = window.agenting!;
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [staged, setStaged] = useState<BackupSummary | null>(null),
    [message, setMessage] = useState<{ text: string; error?: boolean } | null>(
      null,
    );
  useEffect(() => {
    void api.restoreStatus?.().then((status) => {
      if (status === "restored") setMessage({ text: t.restored });
      if (status === "rejected") setMessage({ text: t.rejected, error: true });
    });
  }, []);
  if (!api.backupCreate) return null;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (error) {
      setMessage({ text: t.failed[code(error)]!, error: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="data-panel" aria-labelledby="data-title">
      <h2 className="cc-section" id="data-title">
        {t.title}
      </h2>
      <p className="helper">{t.intro}</p>
      <div className="data-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const summary = await api.backupCreate!();
              if (summary) setMessage({ text: t.saved(summary) });
            })
          }
        >
          <Icon name="download" />
          {t.backup}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          <Icon name="history" />
          {t.restore}
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const file = await api.diagnosticsExport!();
              if (file) setMessage({ text: t.diagSaved(file) });
            })
          }
        >
          <Icon name="info" />
          {t.diagnostics}
        </button>
      </div>
      <p className="data-note">
        <Icon name="shield" />
        {t.diagNote}
      </p>
      {message && (
        <p role={message.error ? "alert" : "status"} className="data-message">
          {message.text}
        </p>
      )}
      {staged && (
        <div className="data-staged" role="status">
          <span>{t.staged(staged)}</span>
          <button className="primary" onClick={() => void api.restartApp?.()}>
            {t.restart}
          </button>
        </div>
      )}
      <Modal
        open={confirm}
        onClose={() => {
          if (!busy) setConfirm(false);
        }}
        titleId="restore-title"
      >
        <h2 id="restore-title">{t.confirmTitle}</h2>
        <p className="helper">{t.confirmBody}</p>
        <div className="panel-actions">
          <button
            className="secondary"
            disabled={busy}
            onClick={() => setConfirm(false)}
          >
            {t.cancel}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                // Close in every case: the modal makes the page inert, so an error
                // shown outside it would otherwise be invisible.
                try {
                  const summary = await api.backupRestore!({ consent: true });
                  if (summary) setStaged(summary);
                } finally {
                  setConfirm(false);
                }
              })
            }
          >
            {t.choose}
          </button>
        </div>
      </Modal>
    </section>
  );
}

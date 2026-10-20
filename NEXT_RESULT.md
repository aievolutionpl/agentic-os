> **Historical record.** Current release status: [docs/RELEASE_STATUS.md](docs/RELEASE_STATUS.md). This file is kept unchanged as an audit trail.

Wdrożono ograniczony przyrost: trwały cykl zadań SQLite, zależności, dzierżawy z heartbeat i ochroną przed starym wykonawcą, jawne ponawianie oraz dziennik zdarzeń w UI PL/EN. Zachowano istniejącą aplikację i testy.

- **15/15 testów PASS**, typecheck i build PASS — [dowody](/home/aibot/apps/agenting-os/docs/evidence/slice-commands.md).
- Hermes sprawdzony wyłącznie odczytowo — [mapowanie architektury](/home/aibot/apps/agenting-os/docs/architecture/HERMES_MAPPING.md).
- [STATUS](/home/aibot/apps/agenting-os/docs/STATUS.md) i KANBAN zaktualizowane.

Wykonywanie agentów pozostaje wyłączone. Smoke Electron blokuje błąd uruchomienia; Windows nadal niezweryfikowany. To nie jest wydanie produkcyjne. Niczego nie wypchnięto.
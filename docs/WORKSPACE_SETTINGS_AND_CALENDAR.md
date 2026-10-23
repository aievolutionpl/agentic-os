# Calendar expansion plan

Keep the existing durable ScheduleJob runner and SQLite history. Extend its schedule with `once`, `daily`, and `weekly`, selected ISO weekdays, an IANA timezone and local execution time. Migrate current jobs as daily without changing their next run.

UI: a compact week agenda, next execution, project, agent and status; one editor for create/edit/pause. Show a human-readable recurrence preview before saving. Include execution history and a direct conversation link.

Execution: atomically claim each occurrence, never overlap a job, retain failures, offer explicit retry. Once-only jobs finish after execution. After downtime run at most one missed occurrence; do not replay a backlog. The desktop app must be running; disclose this beside the schedule.

DST: nonexistent times advance to the first valid local time; repeated times execute once. Verify London DST transitions, selected weekdays, restart, cancellation, paused jobs and concurrent claims before release. Do not introduce OS startup or wake scheduling implicitly.

# Workspace changes

The sidebar project heading opens the overview; duplicate primary navigation and overview quotas are removed. Settings contain language, connections and product attribution. Provided application and company logos are bundled unchanged. Lucide supplies consistent interface icons (https://github.com/lucide-icons/lucide, ISC/MIT).

The skills catalog adds complete pinned Anthropic brand-guidelines, canvas-design and algorithmic-art packages. Polish benefit descriptions accompany the catalog.

OpenRouter stores disabled model IDs alongside encrypted credentials and passes them as the documented OpenCode provider blacklist. This controls picker visibility, not an authorization boundary. The selected default cannot be disabled. OpenRouter-only billing uses the OpenCode runtime; a separate Codex/Claude subscription is not required. Installation instructions and detection are provided; installers and account authorization are not silently executed.

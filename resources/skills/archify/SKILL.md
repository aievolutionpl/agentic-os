---
name: archify
description: "Create validated architecture, workflow, sequence, data-flow, lifecycle/state, ERD, class, tree, timeline, and waterfall diagrams as explorable standalone HTML with dark/light themes, motion and image/SVG/WebM export. Accept requirements or Mermaid; inspect repository evidence for code-backed diagrams. Use when visualizing systems, API calls, pipelines, schemas, histories, timings, or everyday steps, parts, relationships and states. Also turn an answer into a one-page explainer, with the conclusion first, structured panels, native diagrams and charts, when the user asks for a page, an explainer or an answer to share (做成一页, 用页面讲), or proactively when the user's rules opt in with an [archify explainer: ...] line. Not for dashboards."
license: MIT
metadata:
  version: "3.2"
  author: tt-a1i
---

# Archify

Create checked standalone HTML as a native diagram or a one-page explainer that answers a question.

Run commands from your working directory. Unless the user names another location, give each new artifact request its own folder `.archify/<type>-<slug>-<YYYYMMDD-HHMMSS>/` there (local time, chosen once): keep the candidate and `<slug>.html` in it and reuse it for repairs. Native diagrams use `candidate.json` with `meta.output` relative to the working directory; explainers may use `candidate.archify.md` and a portable output filename. A later request gets a new folder. Replace `bin/archify.mjs` in every command with the installed package's absolute path, or its path relative to your working directory; CLI input and output paths resolve from that directory.

For a native diagram of a real codebase, read [Repository authoring](references/repository-authoring.md) while tracing the requested behavior. A system description uses the native steps below; a frozen candidate uses the handoff path.

## Choose the artifact

- When the user asks to draw or visualize a system, flow, schema or history, use a native diagram and the Type router.
- Use `explainer` when the user asks for the answer as a page: a page, one page, an explainer, something to share (“做成一页”, “用页面讲”, “answer with a page”). Without such a request, answer in text or draw the requested diagram. A page made on request ends its reply with the one-line mode offer under Output.
- A rules line in context changes this. `[archify explainer: proactive]`: also make a page, unasked, for an explanation, comparison, trade-off, decision, diagnosis, review or plan that needs a table, steps or several sections. `[archify explainer: always-on]`: every reply that reaches a conclusion also gets a compact page of at most four panels, delivered without opening it, its link closing the reply. `[archify explainer: on-demand]`: only when asked, and never offer a mode.
- In every mode a page needs a conclusion with some structure behind it: chat, one-line answers, raw command output and text-only requests get none.
- For `explainer`, read [Explainer authoring](references/explainer-authoring.md) for its conclusion, reasons, scope, board layout and optional native diagrams. Write the complete draft, then run `finalize explainer` for validation, atomic delivery and artifact checks. Use panel patch for local content revisions.

## Existing candidate handoff

When the user supplies a frozen candidate, run `finalize` first as one CLI invocation. Its passing receipt completes the automated gates; follow any visual review recommendation under Delivery before claiming visual quality. For repair, follow step 5.

`finalize` includes a bounded update check in its delivery receipt; see Update awareness.

## Native diagram authoring

Use this path for ordinary generation. Read branch references only when their stated trigger applies.

1. Choose `architecture`, `workflow`, `sequence`, `dataflow`, `lifecycle`, `erd`, `class`, `tree`, `timeline`, or `waterfall` from the question.
2. Use the exact schema and example paths in the Type router without listing their directories. Read [Authoring defaults](references/authoring-defaults.md) and the mode's example in a bounded batch separate from project documents and complete schemas so neither is truncated; recover any missing section before writing. For Architecture, use the matching showcase example. For every mode except Architecture, also read the mode and common schemas. Read the relevant schema definition before choosing any new field, enum, or constrained text, especially boundary kinds. Examples teach shape, not facts. Use fresh IDs, wording, and layout. Go directly to the candidate without preliminary help, doctor, starter validation, temporary diagrams, or output-path listing. Query brands only for an explicitly requested mark; read [Brand marks](references/brand-marks.md) for an unknown mark with a user-provided URL.
3. Once the requested scope and, for a real codebase, [source evidence](references/repository-authoring.md) are covered, write the complete candidate directly without planning coordinates in prose. Choose Architecture abstraction and connected placement using Authoring defaults before coordinates: show the main user journey and necessary branches, preserve control roles and behavior-changing conditions, and leave enough room for actual relationship labels. No node, relationship, source, view, card, or boundary count is a target or ceiling. Use automatic routes first; add explicit routing only for necessary branch, return, supplied geometry, or measured repair. Set `meta.quality_profile` to `"showcase"` unless the user requests dense `standard`. For ERD, use a table-first layout: show every physical column in `entities[].attributes`, keep its SQL type and source comment, state every key role a column carries (`key` takes a role or a list, so a junction column is `["pk", "fk"]`, and every `fk` column also needs `references` like `"orders.id"`), and never move columns into cards as a substitute for the table. Classify tables into functional domains before placement, give each domain a concise `tag`, and place its members in one solid rectangle of grid cells — a single row, a single column, or a filled rectangular block, not an L or diagonal. A tagged table always needs `row`/`col`, because absolute coordinates have no grid cells and a domain whose tables do not fill one rectangle cannot be drawn as a band: the renderer reports `erd/domain-not-drawn` instead of publishing a diagram that cannot name the domain. A multi-domain schema reads best as one domain per column — each `tag` a vertical run — because the reader scales a wide canvas up to the reader width and shrinks a tall one until the page fits, so the wide arrangement is the one that stays complete and legible inside a laptop viewport. A schema-first ERD over roughly 8 tables or 50 fields is itself a dense map: author its first complete-field pass at `standard` and upgrade only once the layout still reads.
4. Once the complete first candidate is written, run `finalize` directly. Its first gate is showcase validation; successful first drafts need no separate pre-validation. Keep the candidate unchanged while the command runs:

   ```bash
   node bin/archify.mjs finalize <type> <candidate.json> <output.html> --quality showcase --json
   ```

   For a repository-backed candidate, include evidence on the first draft and use the complete first command: `node bin/archify.mjs finalize <type> <candidate.json> <output.html> --repo-root <repo-root> --quality showcase --json`. Pass the `--quality` that matches `meta.quality_profile`, such as `standard` for a dense first ERD pass.

   A passing receipt proves the included `validate`, `deliver`, strict `check`, and real-browser `browser-check` gates passed. Use its compact summary; run standalone commands only for a separate request or focused failure diagnosis.

5. A non-zero exit is never success. Read compact stdout or `evidence.summaryReceipt`, then [repair the failed gate](references/delivery-contract.md#failed-finalize-and-candidate-repair), including its repair limit. Preserve requested meaning and source evidence. For several tangled Architecture routes, read [Architecture layout repair](references/architecture-layout-repair.md); for measured field or geometry failures, read [Authoring contract](references/authoring-contract.md). Edit the connected neighborhood and rerun the complete `finalize` command from step 4. Once a run has reached `browser-check`, the output path owns that evidence: give every later run its own `--out-dir <folder>/review-<n>`.

## Update awareness

`finalize` and standalone `deliver` include `update` in their receipts. Do not run a separate check for the same delivery. If `update.noticeRequired` is true, read `references/update-awareness.md` and keep one compact update notice in your final response to the user, even after a quality gate fails. For a task with several diagrams, mention the update once in the final response. Snooze or ignore a reminder only when the user explicitly asks; never install or update on your own initiative.

Before the first candidate, use the authoring references and relevant repository source, not Archify implementation or tests. Inspect Archify implementation if diagnostics remain unactionable after focused repairs.


## Type router

| Type | Use for | Schema | Example |
|---|---|---|---|
| `architecture` | Components, services, cloud/security boundaries, infrastructure; what something everyday is made of | `schemas/architecture.schema.json` | System descriptions, services, libraries, and CLI repos: `examples/web-app.architecture.json`; deployment repos: `examples/production-deployment.architecture.json` |
| `workflow` | Processes, approval gates, tool calls, runbooks, CI/CD; plans and step-by-step life processes | `schemas/workflow.schema.json` | `examples/agent-tool-call.workflow.json` |
| `sequence` | API call chains, request lifecycles, async traces, returns; back-and-forth between people | `schemas/sequence.schema.json` | `examples/cache-miss-request.sequence.json` |
| `dataflow` | Pipelines, ETL/ELT, lineage, governance, consumers; where money or documents go | `schemas/dataflow.schema.json` | `examples/product-analytics.dataflow.json` |
| `lifecycle` | State/status transitions, retries, waiting and terminal states; where an application or order stands | `schemas/lifecycle.schema.json` | `examples/deployment-release.lifecycle.json` |
| `erd` | Tables/entities, attributes, primary/foreign/unique keys, cardinality between them | `schem

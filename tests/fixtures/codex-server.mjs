// Local protocol fixture, never selected by production environment variables or IPC.
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
let cwd = process.cwd();
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line),
    p = m.params ?? {};
  const reply = (result) => send({ id: m.id, result });
  if (m.method === "initialize")
    reply({ userAgent: "Agenting OS protocol fixture" });
  else if (m.method === "config/read")
    reply({
      config: {
        mcp_servers: { fixture: { command: "never-launch" } },
        plugins: {},
      },
    });
  else if (m.method === "thread/start" || m.method === "thread/resume") {
    if (
      p.config?.mcp_servers?.fixture?.enabled !== false ||
      p.config?.["features.apps"] !== false ||
      p.config?.["features.plugins"] !== false
    ) {
      send({ id: m.id, error: { code: -32602, message: "Unbounded tools" } });
      return;
    }
    cwd = p.cwd;
    reply({ thread: { id: "fixture-thread" } });
  } else if (m.method === "mcpServerStatus/list")
    reply({ data: [], nextCursor: null });
  else if (m.method === "account/read")
    reply({ account: null, requiresOpenaiAuth: true });
  else if (m.method === "account/rateLimits/read") reply({rateLimits:{primary:{usedPercent:25,windowDurationMins:300,resetsAt:2000000000}}});
  else if (m.method === "account/usage/read") reply({});
  else if (m.method === "turn/start") {
    reply({ turn: { id: "fixture-turn", status: "inProgress" } });
    if (process.env.QA_BEHAVIOR === "disconnect") {
      process.exit(1);
      return;
    }
    send({
      method: "turn/started",
      params: { threadId: "fixture-thread", turn: { id: "fixture-turn" } },
    });
    if (process.env.QA_BEHAVIOR === "hang") {
      writeFileSync(join(cwd, "fixture.pid"), String(process.pid));
      setInterval(() => {}, 1000);
      return;
    }
    if (p.sandboxPolicy.type !== "readOnly") {
      writeFileSync(
        join(cwd, "result.txt"),
        p.input?.[0]?.text?.includes("This is a revision")
          ? "revised result\n"
          : "isolated result\n",
      );
      if (process.env.QA_BEHAVIOR === "protected")
        writeFileSync(join(cwd, ".env"), "DUMMY=value\n");
      if (process.env.QA_BEHAVIOR === "ignored") {
        writeFileSync(join(cwd, ".gitignore"), "");
        writeFileSync(join(cwd, "ignored.txt"), "agent proposal\n");
      }
    } else if (process.env.QA_BEHAVIOR === "bad-review")
      writeFileSync(join(cwd, "review-wrote.txt"), "invalid review write\n");
    send({
      id: 100,
      method: "item/commandExecution/requestApproval",
      params: { threadId: "fixture-thread", command: "blocked escape" },
    });
    let message =
      p.sandboxPolicy.type === "readOnly"
        ? "Fixture independent review completed."
        : "Fixture implementation completed. sk-" + "q".repeat(40);
    if (
      process.env.QA_BEHAVIOR === "revise" &&
      p.sandboxPolicy.type === "readOnly"
    )
      message =
        "Fixture review.\nVERDICT: CHANGES_REQUESTED\nFINDINGS:\n- `result.txt:1` — content must say revised\n- docs/missing.md — behaviour is not documented";
    if (p.input?.[0]?.text?.includes("Continue this conversation")) {
      message = "Fixture chat reply: source reviewed. This is a protocol test, not a live model.\n\nPlan:\n1. Inspect the existing UI.\n2. Implement the bounded change.\n3. Verify with tests.";
    }
    if (process.env.QA_BEHAVIOR === "master") {
      const prompt = p.input?.[0]?.text ?? "";
      if (prompt.includes("Master Agent planning"))
        message = JSON.stringify({
          summary: "Inspect, implement, verify",
          tasks: [
            {
              key: "inspect",
              title: "Inspect repository",
              acceptance: "Report the original file",
              implementer: "claude",
              reviewer: "codex",
              dependsOn: [],
              workflow: "research",
            },
            {
              key: "build",
              title: "Create result",
              acceptance: "result.txt contains isolated result",
              implementer: "codex",
              reviewer: "claude",
              dependsOn: ["inspect"],
              workflow: "implementation",
            },
          ],
        });
      if (prompt.includes("Master Agent evaluating"))
        message = JSON.stringify({
          verdict: "complete",
          summary: "Fixture validated the accepted result",
          nextSteps: "",
        });
    }
    send({
      method: "item/agentMessage/delta",
      params: { threadId: "fixture-thread", delta: message },
    });
    send({
      method: "turn/completed",
      params: {
        threadId: "fixture-thread",
        turn: { id: "fixture-turn", status: "completed" },
      },
    });
  } else if (m.method === "turn/interrupt" || m.method === "turn/steer")
    reply({});
});

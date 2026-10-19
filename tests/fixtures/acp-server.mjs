import { createInterface } from "node:readline";
const send = (value) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...value }) + "\n");
let promptId;
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line),
    p = m.params ?? {};
  const reply = (result) => send({ id: m.id, result });
  if (m.method === "initialize")
    reply({ protocolVersion: 1, agentCapabilities: { loadSession: true } });
  else if (m.method === "session/new" || m.method === "session/load")
    reply({
      sessionId: "acp-fixture",
      modes: {
        currentModeId: "plan",
        availableModes: [{ id: "plan", name: "Read only" }],
      },
    });
  else if (m.method === "session/set_mode") reply({});
  else if (m.method === "session/prompt") {
    promptId = m.id;
    send({
      method: "session/update",
      params: {
        sessionId: "acp-fixture",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: "ACP fixture review; no model was called.",
          },
        },
      },
    });
    send({
      id: 100,
      method: "session/request_permission",
      params: {
        sessionId: "acp-fixture",
        ...(process.env.QA_ACP_EDIT
          ? {
              toolCall: {
                kind: "edit",
                locations: [{ path: process.env.QA_ACP_EDIT }],
              },
            }
          : {}),
        options: [
          { optionId: "reject", kind: "reject_once", name: "Reject" },
          { optionId: "allow", kind: "allow_once", name: "Allow once" },
        ],
      },
    });
  } else if (m.id === 100) {
    if (
      m.result?.outcome?.optionId !==
      (process.env.QA_EXPECT_ALLOW === "1" ? "allow" : "reject")
    )
      process.exit(2);
    send({ id: promptId, result: { stopReason: "end_turn" } });
  }
});

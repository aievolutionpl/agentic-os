import { createInterface } from "node:readline";
const send = (m) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
let authenticated = false,
  model = "provider:default",
  prompts = 0;
createInterface({ input: process.stdin }).on("line", (line) => {
  const m = JSON.parse(line),
    p = m.params ?? {};
  const reply = (result) => send({ id: m.id, result });
  if (m.method === "initialize")
    reply({
      protocolVersion: 1,
      authMethods: [{ id: "oauth-personal", name: "Google" }],
      agentCapabilities: { loadSession: true },
    });
  else if (m.method === "authenticate") {
    if (process.env.QA_AUTH_HANG === "1") return;
    if (p.methodId !== "oauth-personal")
      return send({
        id: m.id,
        error: { code: -32000, message: "Authentication required" },
      });
    authenticated = true;
    reply({});
  } else if (m.method === "session/new" || m.method === "session/load") {
    if (!authenticated)
      return send({
        id: m.id,
        error: { code: -32000, message: "Authentication required" },
      });
    reply({
      sessionId: "authenticated-fixture",
      modes: { availableModes: [{ id: "plan", name: "Plan" }] },
      models: {
        availableModels: [
          { modelId: "subscription:fixture", name: "Subscription fixture" },
        ],
      },
    });
  } else if (m.method === "session/set_mode") reply({});
  else if (m.method === "session/set_model") {
    model = p.modelId;
    reply({});
  } else if (m.method === "session/prompt") {
    prompts++;
    send({
      method: "session/update",
      params: {
        sessionId: "authenticated-fixture",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: `auth=${authenticated} model=${model} prompts=${prompts}`,
          },
        },
      },
    });
    reply({ stopReason: "end_turn" });
  }
});

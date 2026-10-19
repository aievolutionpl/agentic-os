import readline from "node:readline";
const reply = (id, result) =>
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
for await (const line of readline.createInterface({ input: process.stdin })) {
  const msg = JSON.parse(line);
  if (msg.id === undefined) continue;
  if (msg.method === "initialize")
    reply(msg.id, {
      protocolVersion: "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: { name: "local-test", version: "1" },
    });
  if (msg.method === "tools/list")
    reply(
      msg.id,
      msg.params.cursor
        ? {
            tools: [
              {
                name: "fail",
                description: "Return a tool error",
                inputSchema: { type: "object" },
              },
            ],
          }
        : {
            tools: [
              {
                name: "echo",
                description: "Local fixture only",
                inputSchema: {
                  type: "object",
                  properties: { text: { type: "string" } },
                },
              },
            ],
            nextCursor: "page2",
          },
    );
  if (msg.method === "tools/call")
    reply(msg.id, {
      isError: msg.params.name === "fail",
      content: [
        {
          type: "text",
          text:
            msg.params.name === "fail"
              ? "Fixture tool failure"
              : JSON.stringify(msg.params.arguments),
        },
      ],
    });
}

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  if (!input.includes("task") && !input.includes("test")) process.exit(2);
  if (process.argv.some((arg) => arg.includes("secret task"))) process.exit(3);
  if (process.env.QA_BEHAVIOR === "hang") {
    setInterval(() => {}, 1000);
    return;
  }
  if (process.env.QA_BEHAVIOR === "invalid") {
    process.stdout.write("not-json\n");
    return;
  }
  const result = {
    session_id: "fixture-native",
    conversation_id: "fixture-native",
    subtype: "success",
    status: "SUCCESS",
    result: "Completed",
    response: "Completed",
    usage: { input_tokens: 42, output_tokens: 10 },
    denied_actions: process.env.QA_BEHAVIOR === "denied" ? ["write"] : [],
  };
  if (process.env.QA_BEHAVIOR === "failed") result.is_error = true;
  process.stdout.write(
    JSON.stringify(
      process.env.QA_PROTOCOL === "antigravity-cli"
        ? { event: "result", result }
        : { type: "result", ...result },
    ) + "\n",
  );
});

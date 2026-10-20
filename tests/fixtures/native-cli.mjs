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
  if (process.env.QA_BEHAVIOR === "stream") {
    // Shapes taken from the providers' documented stream-json output.
    if (process.env.QA_PROTOCOL === "antigravity-cli") {
      const update = (u) =>
        process.stdout.write(
          JSON.stringify({ event: "step_update", step_update: u }) + "\n",
        );
      update({ step_index: 0, state: "DONE", step_type: "user_input" });
      update({
        step_index: 2,
        state: "ACTIVE",
        step_type: "agent_response",
        text_delta: "Part one, ",
      });
      update({
        step_index: 2,
        state: "DONE",
        step_type: "agent_response",
        text_delta: "part two.",
      });
      update({
        step_index: 3,
        state: "DONE",
        step_type: "tool",
        tool_name: "run_command",
      });
      result.usage = {
        input_tokens: 10418,
        output_tokens: 589,
        thinking_tokens: 551,
        cache_read_tokens: 8113,
        total_tokens: 11007,
      };
    } else
      process.stdout.write(
        JSON.stringify({
          type: "rate_limit_event",
          rate_limit_info: {
            status: "allowed_warning",
            resetsAt: 4102444800,
            rateLimitType: "five_hour",
            utilization: 0.82,
          },
        }) + "\n",
      );
  }
  process.stdout.write(
    JSON.stringify(
      process.env.QA_PROTOCOL === "antigravity-cli"
        ? { event: "result", result }
        : { type: "result", ...result },
    ) + "\n",
  );
});

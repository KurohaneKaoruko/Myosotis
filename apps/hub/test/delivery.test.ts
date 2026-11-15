import { API, MOCK_API, login, api, seedBasics, promptLog, resetLog, chatPrompt } from "./fixtures.ts";

// Verifies the message delivery lifecycle over the hub API:
//   user message persisted → echoed back immediately (not after the turn)
//   exactly one copy of the user message
//   assistant reply persisted



async function main() {
  const { cookie } = await login();
  if (!cookie) throw new Error("login failed");
  await seedBasics(cookie);

  const convo = await api(cookie, "/api/conversations", {
    method: "POST",
    body: JSON.stringify({ agentId: "ag1", title: "送达状态测试" }),
  });
  const clientUserMessageId = `msg_client_${Date.now().toString(36)}`;

  // watch the event order of one turn
  const order: string[] = [];
  let userEchoAt = 0;
  const t0 = Date.now();

  const chat = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ conversationId: convo.id, userMessageId: clientUserMessageId, text: "送达状态测试内容" }),
  });
  const reader = chat.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) {
          const ev = line.slice(7).trim();
          order.push(ev);
          if (ev === "user") userEchoAt = Date.now() - t0;
        }
      }
    }
  }

  const messages = await api(cookie, `/api/conversations/${convo.id}/messages`);
  const userMsgs = messages.filter((m: any) => m.role === "user");
  const aiMsgs = messages.filter((m: any) => m.role === "assistant");
  const duplicate = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ conversationId: convo.id, userMessageId: clientUserMessageId, text: "重复请求" }),
  });

  const checks: Array<[string, boolean, string]> = [
    ["user echoed before the turn finished", order.indexOf("user") < order.indexOf("message"), `order=${order.join(">")}`],
    ["exactly one user message", userMsgs.length === 1, `got ${userMsgs.length}`],
    ["exactly one assistant message", aiMsgs.length === 1, `got ${aiMsgs.length}`],
    ["user message content preserved", userMsgs[0]?.content === "送达状态测试内容", userMsgs[0]?.content],
    ["client message id is preserved end-to-end", userMsgs[0]?.id === clientUserMessageId, userMsgs[0]?.id],
    ["reusing a message id is rejected instead of duplicating a turn", duplicate.status === 409, `status=${duplicate.status}`],
    ["assistant message persisted", !!aiMsgs[0]?.content, "empty"],
  ];

  // A missing model must be a failed, retryable user message rather than
  // a successful-looking bubble that remains stuck after the error event.
  const noModelConvo = await api(cookie, "/api/conversations", {
    method: "POST",
    body: JSON.stringify({ agentId: "ag1", title: "无模型送达状态测试" }),
  });
  await api(cookie, "/api/data/models/m1", {
    method: "PUT",
    body: JSON.stringify({ id: "m1", name: "mock-chat", providerId: "p1", label: "Mock", roles: [] }),
  });
  await api(cookie, "/api/data/settings", {
    method: "PUT",
    body: JSON.stringify({ defaults: { chat: "missing-chat-model" } }),
  });
  const noModelRes = await fetch(`${API}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ conversationId: noModelConvo.id, text: "模型缺失消息" }),
  });
  const noModelStream = await noModelRes.text();
  const noModelMessages = await api(cookie, `/api/conversations/${noModelConvo.id}/messages`);
  const failedUser = noModelMessages.find((m: any) => m.role === "user");
  const userEventData = noModelStream.match(/event: user\ndata: (.+)/)?.[1];
  const userEvent = userEventData ? JSON.parse(userEventData) : null;
  const errorEventData = noModelStream.match(/event: error\ndata: (.+)/)?.[1];
  const errorEvent = errorEventData ? JSON.parse(errorEventData) : null;
  checks.push(
    ["no-model turn emits a failed user status", userEvent?.status === "error", `HTTP ${noModelRes.status} user=${userEventData ?? "missing"} stream=${noModelStream.slice(0, 240)}`],
    ["no-model user message is persisted as retryable", failedUser?.status === "error", JSON.stringify(failedUser)],
    ["no-model error identifies the failed user message", errorEvent?.userMessageId === failedUser?.id, errorEventData ?? noModelStream.slice(-180)],
  );
  await api(cookie, "/api/data/models/m1", {
    method: "PUT",
    body: JSON.stringify({ id: "m1", name: "mock-chat", providerId: "p1", label: "Mock", roles: ["chat", "vision", "embedding"] }),
  });
  await api(cookie, "/api/data/settings", {
    method: "PUT",
    body: JSON.stringify({ defaults: { chat: "m1", vision: "m1", embedding: "m1" } }),
  });

  for (const [name, ok, detail] of checks) console.log(`  ${ok ? "✅" : "❌"} ${name} (${detail})`);
  console.log(`  ℹ️ user echo arrived after ${userEchoAt}ms`);

  process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});

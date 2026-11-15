// Message pagination: ?limit / ?before on the messages endpoint.
import { API, login, api, seedBasics } from "./fixtures.ts";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

const { cookie } = await login();
await seedBasics(cookie);

// fresh conversation
const convo = await api(cookie, "/api/conversations", {
  method: "POST",
  body: JSON.stringify({ agentId: "ag1", title: "pager" }),
});
ok("conversation created", !!convo.id, JSON.stringify(convo).slice(0, 80));
const cid = convo.id as string;

// seed 30 messages (user bubbles, no chat round-trips)
let seeded = true;
for (let i = 0; i < 30; i++) {
  const put = await api(cookie, `/api/conversations/${cid}/messages`, {
    method: "POST",
    body: JSON.stringify({
      id: `m${String(i).padStart(2, "0")}`,
      conversationId: cid,
      role: "user",
      content: `msg-${i}`,
      createdAt: 1000 + i,
    }),
  });
  if (!put || put.error) seeded = false;
}
ok("seeded 30 messages", seeded);

const all = await api(cookie, `/api/conversations/${cid}/messages`);
ok("no params → all 30", all.length === 30, `got ${all.length}`);
ok("ascending order", all[0]?.content === "msg-0" && all[29]?.content === "msg-29");

const tail = await api(cookie, `/api/conversations/${cid}/messages?limit=10`);
ok("limit → 10 most recent", tail.length === 10, `got ${tail.length}`);
ok("limit window content", tail[0]?.content === "msg-20" && tail[9]?.content === "msg-29");

const page = await api(cookie, `/api/conversations/${cid}/messages?limit=10&before=1020`);
ok("limit+before page", page.length === 10, `got ${page.length}`);
ok("page window content", page[0]?.content === "msg-10" && page[9]?.content === "msg-19");

const older = await api(cookie, `/api/conversations/${cid}/messages?before=1005`);
ok("before-only → older only", older.length === 5 && older[0]?.content === "msg-0", `got ${older.length}`);

const big = await api(cookie, `/api/conversations/${cid}/messages?limit=500`);
ok("limit > history → all", big.length === 30, `got ${big.length}`);

await api(cookie, `/api/conversations/${cid}`, { method: "DELETE" });

console.log(`\npagination: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

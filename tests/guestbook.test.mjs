import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const sqlite = new DatabaseSync(":memory:");
const migration0 = await readFile("drizzle/0000_organic_gabe_jones.sql", "utf8");
const migration1 = await readFile("drizzle/0001_village_guestbook.sql", "utf8");
sqlite.exec(migration0);
sqlite.exec(migration1.replaceAll("--> statement-breakpoint", ""));

const db = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { return sqlite.prepare(sql).run(...args); },
    };
  },
  async batch(statements) {
    sqlite.exec("BEGIN");
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  },
};
globalThis.__guestbookTestEnv = { DB: db };

const source = (await readFile("app/api/guestbook/route.ts", "utf8"))
  .replace('import { env } from "cloudflare:workers";', "const env = globalThis.__guestbookTestEnv;");
const output = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { GET, POST, DELETE } = await import("data:text/javascript;base64," + Buffer.from(output).toString("base64"));

const player = () => ({ player: crypto.randomUUID(), secret: crypto.randomUUID() });
const a = player(), b = player();
const call = (method, data, query = "") => {
  const req = new Request("https://sigor.example/api/guestbook" + query,
    { method, ...(method === "GET" ? {} : { body: JSON.stringify(data) }) });
  return ({ GET, POST, DELETE })[method](req);
};
const post = (identity, body = "안녕하세요!", name = "시골 주민") =>
  call("POST", { action: "post", ...identity, name, body });
const like = (identity, id) => call("POST", { action: "like", ...identity, id });
const data = response => response.json();

assert.deepEqual((await data(await call("GET", null))).posts, []);
assert.equal((await post(a, "   ")).status, 400);
assert.equal((await post(a, "https://example.com")).status, 400);
assert.equal((await post(a, "가".repeat(201))).status, 400);
assert.equal((await post(a, "Hello", " ")).status, 400);
assert.equal((await post(a, "Hello")).status, 201);
assert.equal((await post(a, "too soon")).status, 429);
let result = await data(await call("GET", null, "?player=" + a.player));
assert.equal(result.posts.length, 1);
assert.equal(result.posts[0].body, "Hello");
assert.equal(result.posts[0].liked, false);
const id = result.posts[0].id;

assert.equal((await post({ ...a, secret: b.secret }, "forged")).status, 403);
assert.equal((await like(b, id)).status, 200);
assert.deepEqual(await data(await like(b, id)), { ok: true, liked: false, likes: 0 });
const liked = await data(await like(b, id));
assert.deepEqual(liked, { ok: true, liked: true, likes: 1 });
assert.equal((await data(await call("GET", null, "?player=" + b.player))).posts[0].liked, true);
assert.equal((await call("DELETE", { ...b, id })).status, 403);
assert.equal((await call("DELETE", { ...a, id })).status, 200);
assert.equal((await call("DELETE", { ...a, id })).status, 404);
assert.equal((await data(await call("GET", null))).posts.length, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM guestbook_likes").get().total, 0);
console.log("PASS: write validation, 30s cooldown, player ownership, one like per player, deleting own posts");

const ranked = player();
await db.prepare("INSERT INTO runs(id,player,secret,name,mode,taps,duration) VALUES(?,?,?,?,?,?,?)")
  .bind(crypto.randomUUID(), ranked.player, ranked.secret, "랭커", "20261106-01:speed", 77, 10).run();
assert.equal((await post({ ...ranked, secret: b.secret }, "가짜 랭커")).status, 403);
assert.equal((await post(ranked, "<script>텍스트</script>", "랭커")).status, 201);
const rankingPost = (await data(await call("GET", null))).posts[0];
assert.equal(rankingPost.body, "<script>텍스트</script>"); // Rendered escaped by client.
await like(b, rankingPost.id);
assert.equal((await call("DELETE", { ...ranked, scope: "account" })).status, 200);
assert.equal((await data(await call("GET", null))).posts.length, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS total FROM guestbook_likes").get().total, 0);
console.log("PASS: existing ranking credentials required and full account reset removes posts and reactions");

const clock = Date.now;
let fakeTime = clock() + 100_000;
Date.now = () => fakeTime;
try {
  const c = player();
  for (let i = 0; i < 20; i++) {
    assert.equal((await post(c, "연속 게시글 " + i, "작가")).status, 201);
    fakeTime += 31_000;
  }
  assert.equal((await post(c, "21번째 글")).status, 429);
  const first = await data(await call("GET", null));
  assert.equal(first.posts.length, 20);
  assert.equal(first.nextCursor, null);

  for (let i = 0; i < 5; i++) {
    assert.equal((await post(player(), "이웃 " + i)).status, 201);
  }
  const page1 = await data(await call("GET", null));
  assert.equal(page1.posts.length, 20);
  assert.ok(page1.nextCursor);
  const page2 = await data(await call("GET", null, "?before=" + page1.nextCursor));
  assert.equal(page2.posts.length, 5);
  assert.equal(page2.nextCursor, null);
  assert.ok(page1.posts[19].id > page2.posts[0].id);
  assert.equal((await call("GET", null, "?before=not-a-number")).status, 400);
  console.log("PASS: 20/day author limit and 20-row cursor pagination");
} finally {
  Date.now = clock;
  sqlite.close();
}

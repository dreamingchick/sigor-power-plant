import { env } from "cloudflare:workers";

const PAGE_SIZE = 20;
const COOLDOWN_MS = 30_000;
const MAX_POSTS_PER_DAY = 20;
const DAY_MS = 86_400_000;

type Identity = { player: string; secret: string };
type GuestbookDb = D1Database;

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function invalid(status: number, message: string): never {
  throw new RequestError(status, message);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > 4096) invalid(413, "요청이 너무 깁니다.");
  let data: unknown;
  try { data = JSON.parse(raw); } catch { invalid(400, "요청 형식을 확인해 주세요."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) invalid(400, "요청 형식을 확인해 주세요.");
  return data as Record<string, unknown>;
}

function identityOf(value: Record<string, unknown>): Identity {
  const { player, secret } = value;
  if (typeof player !== "string" || !/^[a-zA-Z0-9-]{20,80}$/.test(player) ||
      typeof secret !== "string" || secret.length < 20 || secret.length > 100 || /[\u0000-\u001f\u007f]/.test(secret)) {
    invalid(400, "선수 정보를 확인해 주세요.");
  }
  return { player, secret };
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") invalid(400, "선수 이름을 입력해 주세요.");
  const name = value.trim();
  if (!name || Array.from(name).length > 12 || /[\u0000-\u001f\u007f]/.test(name)) invalid(400, "선수 이름은 1~12자로 입력해 주세요.");
  return name;
}

function normalizeMessage(value: unknown) {
  if (typeof value !== "string") invalid(400, "내용을 입력해 주세요.");
  const body = value.replace(/\r\n?/g, "\n").trim();
  if (!body || Array.from(body).length > 200 || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(body)) {
    invalid(400, "방명록은 1~200자로 작성해 주세요.");
  }
  if (/(https?:\/\/|www\.|씨발|시발|병신|개새끼)/i.test(body)) invalid(400, "광고 링크나 부적절한 표현은 등록할 수 없습니다.");
  return body;
}

function postId(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid(400, "게시글 번호를 확인해 주세요.");
  return value as number;
}

async function digest(secret: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPlayer(db: GuestbookDb, id: Identity, claim = false) {
  const hash = await digest(id.secret);
  const actor = await db.prepare("SELECT secret_hash FROM guestbook_players WHERE player=?")
    .bind(id.player).first<{ secret_hash: string }>();
  if (actor) {
    if (actor.secret_hash !== hash) invalid(403, "선수 인증에 실패했습니다.");
    return;
  }

  // Reuse the existing ranking identity whenever that player has submitted runs.
  const ranked = await db.prepare("SELECT secret FROM runs WHERE player=? LIMIT 1")
    .bind(id.player).first<{ secret: string }>();
  if (ranked && ranked.secret !== id.secret) invalid(403, "선수 인증에 실패했습니다.");
  if (!claim) return;

  await db.prepare("INSERT OR IGNORE INTO guestbook_players(player,secret_hash,created_at) VALUES(?,?,?)")
    .bind(id.player, hash, Date.now()).run();
  const saved = await db.prepare("SELECT secret_hash FROM guestbook_players WHERE player=?")
    .bind(id.player).first<{ secret_hash: string }>();
  if (!saved || saved.secret_hash !== hash) invalid(403, "선수 인증에 실패했습니다.");
}

async function respond<T>(operation: () => Promise<T | Response>) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error("guestbook request failed", error);
    return json({ error: "마을 게시판 연결을 확인해 주세요." }, 503);
  }
}

export async function GET(req: Request) {
  return respond(async () => {
    const db = env.DB;
    if (!db) invalid(503, "마을 게시판 연결을 확인해 주세요.");
    const url = new URL(req.url);
    const player = url.searchParams.get("player") || "";
    const cursor = url.searchParams.get("before");
    const before = cursor === null ? Number.MAX_SAFE_INTEGER : Number(cursor);
    if (cursor !== null && (!Number.isSafeInteger(before) || before < 1)) invalid(400, "페이지 정보를 확인해 주세요.");
    const rows = await db.prepare(
      "SELECT p.id,p.player,p.name,p.body,p.created_at AS createdAt," +
      "(SELECT COUNT(*) FROM guestbook_likes l WHERE l.post_id=p.id AND l.reaction=1) AS likes," +
      "(SELECT COUNT(*) FROM guestbook_likes l WHERE l.post_id=p.id AND l.reaction=-1) AS dislikes," +
      "EXISTS(SELECT 1 FROM guestbook_likes l WHERE l.post_id=p.id AND l.player=? AND l.reaction=1) AS liked," +
      "EXISTS(SELECT 1 FROM guestbook_likes l WHERE l.post_id=p.id AND l.player=? AND l.reaction=-1) AS disliked " +
      "FROM guestbook_posts p WHERE p.id<? ORDER BY p.id DESC LIMIT ?"
    ).bind(player, player, before, PAGE_SIZE + 1).all<{
      id: number; player: string; name: string; body: string; createdAt: number; likes: number; dislikes: number; liked: number; disliked: number;
    }>();
    const more = rows.results.length > PAGE_SIZE;
    const posts = rows.results.slice(0, PAGE_SIZE).map(row => ({ ...row, liked: Boolean(row.liked), disliked: Boolean(row.disliked) }));
    return json({ posts, nextCursor: more ? posts[posts.length - 1].id : null });
  });
}

export async function POST(req: Request) {
  return respond(async () => {
    const db = env.DB;
    if (!db) invalid(503, "마을 게시판 연결을 확인해 주세요.");
    const data = await readBody(req);
    const id = identityOf(data);
    await verifyPlayer(db, id, true);

    if (data.action === "like" || data.action === "dislike") {
      const target = postId(data.id);
      const post = await db.prepare("SELECT id FROM guestbook_posts WHERE id=?").bind(target).first();
      if (!post) invalid(404, "이미 삭제된 게시글입니다.");
      const reaction = data.action === "like" ? 1 : -1;
      // One SQL statement toggles or switches the player's sole reaction atomically.
      await db.prepare(
        "INSERT INTO guestbook_likes(post_id,player,reaction) VALUES(?,?,?) " +
        "ON CONFLICT(post_id,player) DO UPDATE SET reaction=" +
        "CASE WHEN guestbook_likes.reaction=excluded.reaction THEN 0 ELSE excluded.reaction END"
      ).bind(target, id.player, reaction).run();
      const updated = await db.prepare(
        "SELECT COALESCE(SUM(reaction=1),0) AS likes,COALESCE(SUM(reaction=-1),0) AS dislikes," +
        "COALESCE(MAX(CASE WHEN player=? THEN reaction END),0) AS mine " +
        "FROM guestbook_likes WHERE post_id=?"
      ).bind(id.player,target).first<{ likes:number; dislikes:number; mine:number }>();
      return json({ ok: true, liked: updated?.mine === 1, disliked: updated?.mine === -1, likes: updated?.likes ?? 0, dislikes: updated?.dislikes ?? 0 });
    }

    if (data.action !== "post") invalid(400, "요청 기능을 확인해 주세요.");
    const name = normalizeName(data.name);
    const body = normalizeMessage(data.body);
    const now = Date.now();
    const total = await db.prepare("SELECT COUNT(*) AS count FROM guestbook_posts WHERE player=? AND created_at>=?")
      .bind(id.player, now - DAY_MS).first<{ count: number }>();
    if ((total?.count ?? 0) >= MAX_POSTS_PER_DAY) invalid(429, "하루 작성 한도에 도달했습니다. 내일 다시 작성해 주세요.");

    // Atomic per-player cooldown prevents overlapping requests from bypassing the interval.
    const slot = await db.prepare(
      "INSERT INTO guestbook_rate(player,last_post_at) VALUES(?,?) " +
      "ON CONFLICT(player) DO UPDATE SET last_post_at=excluded.last_post_at " +
      "WHERE guestbook_rate.last_post_at<=? RETURNING player"
    ).bind(id.player, now, now - COOLDOWN_MS).first();
    if (!slot) invalid(429, "30초 후 다시 작성할 수 있습니다.");

    await db.prepare("INSERT INTO guestbook_posts(player,name,body,created_at) VALUES(?,?,?,?)")
      .bind(id.player, name, body, now).run();
    await db.prepare("UPDATE guestbook_posts SET name=? WHERE player=?").bind(name, id.player).run();
    return json({ ok: true }, 201);
  });
}

export async function DELETE(req: Request) {
  return respond(async () => {
    const db = env.DB;
    if (!db) invalid(503, "마을 게시판 연결을 확인해 주세요.");
    const data = await readBody(req);
    const id = identityOf(data);
    await verifyPlayer(db, id);

    if (data.scope === "account") {
      // Run all mutations together so a full player reset leaves no orphaned likes/posts.
      await db.batch([
        db.prepare("DELETE FROM guestbook_likes WHERE player=? OR post_id IN (SELECT id FROM guestbook_posts WHERE player=?)").bind(id.player, id.player),
        db.prepare("DELETE FROM guestbook_posts WHERE player=?").bind(id.player),
        db.prepare("DELETE FROM guestbook_rate WHERE player=?").bind(id.player),
        db.prepare("DELETE FROM guestbook_players WHERE player=?").bind(id.player),
      ]);
      return json({ ok: true });
    }

    const target = postId(data.id);
    const post = await db.prepare("SELECT player FROM guestbook_posts WHERE id=?")
      .bind(target).first<{ player: string }>();
    if (!post) invalid(404, "이미 삭제된 게시글입니다.");
    if (post.player !== id.player) invalid(403, "본인이 작성한 글만 삭제할 수 있습니다.");
    await db.batch([
      db.prepare("DELETE FROM guestbook_likes WHERE post_id=?").bind(target),
      db.prepare("DELETE FROM guestbook_posts WHERE id=? AND player=?").bind(target, id.player),
    ]);
    return json({ ok: true });
  });
}


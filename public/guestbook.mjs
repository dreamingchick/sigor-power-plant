// Village guestbook UI. The ranking identity stays on-device; only signed actions
// send the per-device secret to the same-origin server.
let activeView;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function showDate(timestamp) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(timestamp));
}

async function request(method, payload, suffix = "") {
  const options = { method, cache: "no-store" };
  if (payload) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(payload);
  }
  const response = await fetch("/api/guestbook" + suffix, options);
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || "마을 게시판 연결을 확인해 주세요.");
  return data;
}

export function leaveGuestbook() {
  if (activeView) {
    activeView.dispose();
    activeView = null;
  }
}

export function renderGuestbook({ root, getIdentity, toast, registerName }) {
  leaveGuestbook();
  let disposed = false;
  let busy = false;
  let loading = false;
  let cursor = null;
  let posts = [];
  const current = { dispose() { disposed = true; clearInterval(timer); } };
  activeView = current;

  root.innerHTML = 
    '<div class="guestbook"><span class="eyebrow">SIGOR VILLAGE · COMMUNITY</span>' +
    '<h1>마을회관<br>소식 게시판.</h1>' +
    '<p class="sub">까마귀 이장 몰래, 이웃들에게 한마디 남겨보세요.<br>모든 마을에서 함께 읽는 게시판입니다.</p>' +
    '<section class="panel guestbook-write" id="gbWrite"></section>' +
    '<div class="topline guestbook-heading"><h3>이웃들의 이야기</h3>' +
    '<button class="secondary guestbook-refresh" id="gbRefresh" type="button">새로고침</button></div>' +
    '<p class="sub guestbook-error" id="gbError" role="status"></p>' +
    '<div id="gbPosts" aria-live="polite"><div class="empty">게시글을 불러오는 중입니다…</div></div>' +
    '<button class="secondary guestbook-more" id="gbMore" type="button" hidden>이전 글 더 보기</button>' +
    '<p class="tiny">게시글은 서버에 공유됩니다. 개인정보나 연락처는 적지 마세요.<br>' +
    '작성한 글은 본인이 삭제할 수 있으며, 신고가 필요한 글은 운영자에게 알려주세요.</p></div>';

  const frame = root.querySelector(".guestbook");
  const writeBox = frame.querySelector("#gbWrite");
  const feed = frame.querySelector("#gbPosts");
  const status = frame.querySelector("#gbError");
  const moreButton = frame.querySelector("#gbMore");
  const me = () => getIdentity();
  const identity = () => ({ player: me().player, secret: me().secret });
  const present = () => !disposed && root.contains(frame);

  function showForm() {
    const name = me().name;
    if (!name) {
      writeBox.innerHTML =
        '<h3>첫 방문이신가요?</h3><p class="sub">게시판에 글을 남기려면 먼저 선수 이름을 등록해 주세요.</p>' +
        '<button class="primary" type="button" id="gbRegister">선수 이름 등록하기</button>';
      writeBox.querySelector("#gbRegister").onclick = registerName;
      return;
    }
    writeBox.innerHTML =
      '<h3>마을에 한마디</h3><p class="sub">작성자 · <strong>' + escapeHtml(name) + '</strong></p>' +
      '<form id="gbForm"><label class="guestbook-label" for="gbBody">게시글</label>' +
      '<textarea id="gbBody" rows="3" maxlength="200" required placeholder="오늘 마을에 무슨 일이 있었나요?"></textarea>' +
      '<div class="topline guestbook-bottom"><small id="gbCount">0 / 200자</small>' +
      '<button class="primary" type="submit" id="gbSubmit">글 남기기</button></div></form>' +
      '<p class="tiny">30초마다 한 번 · 하루 최대 20건 · 링크 및 일부 부적절한 표현 제한</p>';
    const textarea = writeBox.querySelector("#gbBody");
    textarea.addEventListener("input", () => {
      writeBox.querySelector("#gbCount").textContent = Array.from(textarea.value).length + " / 200자";
    });
    writeBox.querySelector("#gbForm").addEventListener("submit", async event => {
      event.preventDefault();
      if (busy) return;
      const body = textarea.value.trim();
      if (!body || Array.from(body).length > 200) { toast("게시글은 1~200자로 작성해 주세요."); return; }
      busy = true;
      const button = writeBox.querySelector("#gbSubmit");
      button.disabled = true;
      try {
        await request("POST", { action: "post", ...identity(), name: me().name, body });
        textarea.value = "";
        writeBox.querySelector("#gbCount").textContent = "0 / 200자";
        toast("마을 게시판에 등록했습니다.");
        await load(false);
      } catch (error) { if (present()) toast(error.message); }
      finally {
        busy = false;
        if (present()) button.disabled = false;
      }
    });
  }

  function renderPosts() {
    if (!present()) return;
    feed.innerHTML = posts.length ? posts.map(post => {
      const mine = post.player === me().player;
      return '<article class="guestbook-post">' +
        '<div class="topline"><strong>' + escapeHtml(post.name) + (mine ? ' <span class="guestbook-me">· 나</span>' : '') + '</strong>' +
        '<time>' + escapeHtml(showDate(post.createdAt)) + '</time></div>' +
        '<p class="guestbook-body">' + escapeHtml(post.body) + '</p>' +
        '<div class="guestbook-actions"><button type="button" data-like="' + post.id + '"' +
        ' aria-pressed="' + Boolean(post.liked) + '" class="guestbook-like ' + (post.liked ? "on" : "") + '"' +
        (!me().name ? " disabled" : "") + '>♥ 좋아요 ' + Number(post.likes || 0) + '</button>' +
        (mine ? '<button type="button" class="guestbook-delete" data-delete="' + post.id + '">삭제</button>' : '') +
        '</div></article>';
    }).join("") : '<div class="empty">아직 남겨진 글이 없습니다.<br>마을의 첫 인사를 전해보세요!</div>';
    moreButton.hidden = cursor === null;
  }

  async function load(append = false, quiet = false) {
    if (loading || !present()) return;
    loading = true;
    if (!quiet) status.textContent = "";
    frame.querySelector("#gbRefresh").disabled = true;
    moreButton.disabled = true;
    if (!append && !quiet) feed.innerHTML = '<div class="empty">게시글을 불러오는 중입니다…</div>';
    try {
      const query = new URLSearchParams({ player: me().player });
      if (append && cursor !== null) query.set("before", String(cursor));
      const data = await request("GET", null, "?" + query.toString());
      if (!present()) return;
      posts = append ? [...posts, ...data.posts] : data.posts;
      cursor = data.nextCursor;
      renderPosts();
    } catch (error) {
      if (present()) {
        status.textContent = error.message;
        if (!append && !posts.length) feed.innerHTML = '<div class="empty">연결되면 마을 이야기를 확인할 수 있습니다.</div>';
      }
    } finally {
      loading = false;
      if (present()) {
        frame.querySelector("#gbRefresh").disabled = false;
        moreButton.disabled = false;
      }
    }
  }

  frame.querySelector("#gbRefresh").onclick = () => load();
  moreButton.onclick = () => { if (cursor !== null) load(true); };
  feed.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button || busy) return;
    const likeId = button.getAttribute("data-like");
    const deleteId = button.getAttribute("data-delete");
    if (!likeId && !deleteId) return;
    if (!me().name) { registerName(); return; }
    if (deleteId && !confirm("이 게시글을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.")) return;
    busy = true;
    button.disabled = true;
    try {
      const target = Number(likeId || deleteId);
      if (likeId) {
        const updated = await request("POST", { action: "like", ...identity(), id: target });
        const post = posts.find(post => post.id === target);
        if (post) { post.liked = updated.liked; post.likes = updated.likes; }
      } else {
        await request("DELETE", { ...identity(), id: target });
        posts = posts.filter(post => post.id !== target);
        toast("게시글을 삭제했습니다.");
      }
      renderPosts();
    } catch (error) { if (present()) toast(error.message); }
    finally {
      busy = false;
      if (present()) button.disabled = false;
    }
  });

  showForm();
  load();
  const timer = setInterval(() => {
    // Avoid overwriting a paginated feed or refreshing in the background.
    if (present() && document.visibilityState === "visible" && posts.length <= 20) load(false, true);
  }, 30_000);
}

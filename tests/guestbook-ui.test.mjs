import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the shipped UI module with a minimal DOM boundary and controlled network.
const source = readFileSync(new URL('../public/guestbook.mjs', import.meta.url), 'utf8').replaceAll('export function ', 'function ');
const post = { id: 1, player: 'author', name: '이웃', body: '안녕하세요', createdAt: Date.now(), likes: 0, dislikes: 0 };
function harness(name = '') {
  const nodes = new Map();
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, { innerHTML: '', disabled: false, addEventListener(type, handler) { this[type] = handler; }, querySelector: node });
    return nodes.get(key);
  };
  const frame = node('.guestbook');
  const root = { innerHTML: '', querySelector: node, contains: item => item === frame };
  const timeouts = new Set();
  let mutate = async () => ({ liked: true, disliked: false, likes: 1, dislikes: 0 });
  const context = vm.createContext({
    AbortController, URLSearchParams, Intl, Date, console,
    document: { visibilityState: 'visible' },
    setInterval: () => 1, clearInterval() {},
    setTimeout(callback) { timeouts.add(callback); return callback; },
    clearTimeout(callback) { timeouts.delete(callback); },
    fetch: async (_url, options) => { const data = options.method === 'GET' ? { posts: [{ ...post }], nextCursor: null } : await mutate(options); return { ok: true, json: async () => data }; },
  });
  vm.runInContext(source, context);
  let registrations = 0;
  const messages = [];
  context.renderGuestbook({ root, getIdentity: () => ({ player: 'reader', secret: 'secret', name }), toast: text => messages.push(text), registerName: () => registrations++ });
  const feed = node('#gbPosts');
  return { context, feed, timeouts, messages, registrations: () => registrations, setMutation: fn => { mutate = fn; },
    click: kind => feed.click({ target: { closest: () => ({ getAttribute: key => key === `data-${kind}` ? '1' : null }) } }) };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
for (const kind of ['like', 'dislike']) {
  const ui = harness(); await flush();
  assert.match(ui.feed.innerHTML, new RegExp(`data-${kind}="1"`));
  assert.doesNotMatch(ui.feed.innerHTML, / disabled/);
  await ui.click(kind);
  assert.equal(ui.registrations(), 1, 'unnamed reaction opens registration');
  ui.context.leaveGuestbook();
}
const ui = harness('선수'); await flush();
let reject;
ui.setMutation(() => new Promise((_resolve, fail) => { reject = fail; }));
const pending = ui.click('like'); await flush();
assert.match(ui.feed.innerHTML, / disabled/);
reject(new Error('연결 실패')); await pending;
assert.doesNotMatch(ui.feed.innerHTML, / disabled/, 'failed mutation unlocks current controls');
assert.equal(ui.messages.at(-1), '연결 실패');
ui.setMutation(async () => ({ liked: false, disliked: true, likes: 0, dislikes: 1 }));
await ui.click('dislike');
assert.match(ui.feed.innerHTML, /👎 싫어요 1/);
assert.doesNotMatch(ui.feed.innerHTML, / disabled/);
ui.context.leaveGuestbook();

// Stalled response body must also time out and clear its timer.
ui.context.fetch = async (_url, { signal }) => ({ ok: true, json: () => new Promise((_resolve, fail) => signal.addEventListener('abort', () => fail(new Error('aborted')))) });
const stalled = ui.context.request('GET'); await flush();
for (const timeout of [...ui.timeouts]) timeout();
await assert.rejects(stalled, /응답이 늦어지고/);
assert.equal(ui.timeouts.size, 0);
console.log('Guestbook UI: registration, pending lock, failure recovery, reaction retry and timeout passed.');

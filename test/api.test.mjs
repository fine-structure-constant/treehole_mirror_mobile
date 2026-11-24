import test from 'node:test';
import assert from 'node:assert/strict';
import { dateBounds, MirrorApi, normalizeSource, parseComment, parsePid, parsePost, parseTags, proxyUrl } from '../app/src/main/assets/web/api.mjs';
import { brief, loadSettings, remember, saveSettings, sourceLibrary } from '../app/src/main/assets/web/storage.mjs';
import { richText } from '../app/src/main/assets/web/views.mjs';

const base = 'https://example.test/archive';
const v3 = '/chapi/api/v3';
const empty = { keyword: '', kind: null, label: null, start: '', end: '' };
const ok = data => new Response(JSON.stringify({ data, code: 20000, success: true }));
function mock(handlers) {
  return new MirrorApi(base, async route => {
    const parsed = new URL(route, 'https://appassets.androidplatform.net').searchParams;
    assert.equal(parsed.get('source'), base);
    const handler = handlers[parsed.get('endpoint')];
    return handler ? handler(new URLSearchParams(parsed.get('query'))) : new Response(null, { status: 404 });
  });
}

test('normalizes mirror roots and protects query encoding', () => {
  assert.equal(normalizeSource('example.test/archive/ch/web/pc/index'), base);
  assert.equal(normalizeSource(`${base}/chapi/api/v3/`), base);
  assert.equal(normalizeSource('http://127.0.0.1:8081/help'), 'http://127.0.0.1:8081');
  for (const value of ['https://a:b@example.test', `${base}?token=1`, `${base}#test`, 'file:///etc/passwd', 'https://example.test:0']) {
    assert.throws(() => normalizeSource(value));
  }
  const query = new URL(proxyUrl(base, '/posts', { keyword: '猫 & 狗#1', kind: 0 }), base).searchParams.get('query');
  assert.equal(new URLSearchParams(query).get('keyword'), '猫 & 狗#1');
  assert.equal(new URLSearchParams(query).get('kind'), '0');
});

test('v3 detects capabilities and paginates server keyword, label and type results', async () => {
  const api = mock({
    [`${v3}/hole/list_comments`]: params => {
      if (params.get('limit') === '1') return ok({ list: [], total: 0 });
      assert.equal(params.get('page'), '2');
      assert.equal(params.get('keyword'), '保研 OR 考研');
      assert.equal(params.get('kind'), '1');
      assert.equal(params.get('label'), '5');
      return ok({ list: Array.from({ length: 20 }, (_, index) => ({ pid: 300 - index, kind: 0 })), total: 41 });
    },
    '/posts': () => ok([]),
    '/help': () => ok([{ route: '/posts?begin_time=&end_time=' }]),
  });
  const caps = await api.probe();
  assert.deepEqual(caps, { v3: true, rest: true, dates: true });
  const page = await api.posts(caps, { ...empty, keyword: '保研 OR 考研', kind: 1, label: 5 }, 2);
  assert.equal(page.next, 3);
  assert.equal(page.list[0].kind, 1);
});

test('REST-only dates and cursor pagination maintain the source prefix', async () => {
  const api = mock({
    '/posts': params => {
      if (params.get('limit') === '1') return ok([]);
      assert.equal(params.get('begin'), '300');
      assert.equal(Number(params.get('end_time')) - Number(params.get('begin_time')), 86399);
      return ok(Array.from({ length: 20 }, (_, index) => ({ id: 299 - index, follownum: 7, likenum: 2 })));
    },
    '/help': () => ok([{ route: '/posts?begin_time=&end_time=' }]),
  });
  const caps = await api.probe();
  assert.deepEqual(caps, { v3: false, rest: true, dates: true });
  const page = await api.posts(caps, { ...empty, start: '2026-11-24', end: '2026-11-24' }, 300);
  assert.equal(page.next, 280);
  assert.equal(page.list[0].praise, 2);
  assert.equal(page.list[0].follow, 7);
  const deployed = parsePost({ id: 300, likenum: 7, praise_num: 2 }, false);
  assert.equal(deployed.praise, 2);
  assert.equal(deployed.follow, 7);
  assert.throws(() => dateBounds('2026-11-25', '2026-11-24'));
});

test('detail handles comments, quotes, missing data and display flags', async () => {
  const api = mock({ [`${v3}/hole/one`]: params => params.get('pid') === '42'
    ? ok({ hole: { pid: 42, is_fold: 1, media_ids: '3,3,5', likenum: 4, praise_num: 1 }, list: [{ cid: 7, quote: [] }, { cid: 8, quote: { cid: 7, name_tag: '洞主' } }], total: 2 })
    : new Response(JSON.stringify({ success: false, code: 40400 })) });
  const detail = await api.post({ v3: true }, 42);
  assert.equal(detail.post.folded, true);
  assert.deepEqual(detail.post.media, [3, 5]);
  assert.equal(detail.list[1].quote.owner, true);
  assert.equal(detail.next, null);
  assert.equal(parseComment({ cid: 10, quote: null, comment_id: 19 }).quoteId, 19);
  assert.equal(parsePid('＃ 00123'), 123);
  assert.equal(parsePid('2147483648'), null);
  await assert.rejects(api.post({ v3: true }, 41), /不存在/);
});

test('tags, local libraries, and content escaping work with web data', () => {
  assert.deepEqual(parseTags({ list: [{ id: 2, name: '校园', children: [{ id: 5, tag_name: '生活' }, { id: 9, name: '旧', is_delete: 1 }] }] }), [{ id: 5, name: '生活', group: '校园' }]);
  const items = new Map();
  const storage = { getItem: items.get.bind(items), setItem: items.set.bind(items) };
  const settings = loadSettings(storage);
  const local = sourceLibrary(settings);
  const post = brief(parsePost({ pid: 1, hidden: 1, text: '不可见' }));
  assert.equal(post.text, '');
  local.saved = remember(local.saved, { post }, item => item.post.pid, 10);
  saveSettings(settings, storage);
  assert.equal(sourceLibrary(loadSettings(storage)).saved.length, 1);
  assert.equal(sourceLibrary(loadSettings(storage), base).saved.length, 0);
  const html = richText('<script> #42 食堂 https://example.test/?x=1&y=2', '食堂 OR 饭');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /data-value="42"/);
  assert.match(html, /<mark>食堂<\/mark>/);
  assert.match(html, /x=1&amp;y=2/);
});

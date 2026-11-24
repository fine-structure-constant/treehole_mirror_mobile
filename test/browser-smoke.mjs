import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const [browserPath, screenshotPath] = process.argv.slice(2);
if (!browserPath) throw new Error('Usage: node test/browser-smoke.mjs CHROME_PATH [SCREENSHOT_PATH]');
const tempRoot = resolve(tmpdir());
const profile = resolve(await mkdtemp(join(tempRoot, 'treehole-chrome-')));
const preview = spawn(process.execPath, ['tools/preview.mjs', '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
const browser = spawn(browserPath, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

async function eventually(check, name, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await delay(70);
  }
  throw new Error(`Timed out: ${name}`);
}

try {
  const [line] = await once(preview.stdout, 'data');
  const address = line.toString().match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  assert.ok(address, line.toString());
  const port = await eventually(async () => {
    try { return (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; } catch { return null; }
  }, 'Chromium starts');
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(pages.find(item => item.type === 'page').webSocketDebuggerUrl);
  const pending = new Map();
  const exceptions = [];
  const browserErrors = [];
  let serial = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push(message.params.entry.text);
    if (!pending.has(message.id)) return;
    const { accept, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else accept(message.result);
  });
  await once(socket, 'open');
  function cdp(method, params = {}) {
    return new Promise((accept, reject) => {
      const id = ++serial;
      pending.set(id, { accept, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || expression);
    return result.result.value;
  }
  const wait = (expression, name) => eventually(() => evaluate(expression), name);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const action = (name, value) => click(`[data-action="${name}"]${value == null ? '' : `[data-value="${value}"]`}`);
  const fill = (selector, value) => evaluate(`document.querySelector(${JSON.stringify(selector)}).value = ${JSON.stringify(value)}`);
  const has = text => `document.body.innerText.includes(${JSON.stringify(text)})`;

  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Log.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp('Page.navigate', { url: address });
  try {
    await wait(`document.querySelectorAll('.post-card:not(.skeleton)').length === 20 && ${has('校园起居')}`, 'v3 feed and tags');
  } catch (error) {
    console.error(await evaluate('document.body?.innerText.slice(0, 450)'), exceptions.map(item => item.exception?.description || item.text), browserErrors);
    throw error;
  }
  if (screenshotPath) {
    const image = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(screenshotPath, Buffer.from(image.data, 'base64'));
  }

  await evaluate("document.querySelector('#screen').scrollTop = 260");
  await action('post', '8621398');
  await wait("document.querySelectorAll('.comment').length === 20", 'first comment page');
  await action('quote');
  assert.equal(await evaluate("document.activeElement.id"), 'comment-258641940');
  await action('sort');
  await wait("document.querySelector('.comment')?.id === 'comment-258641963'", 'descending comments');
  await action('load-comments');
  await wait("document.querySelectorAll('.comment').length === 24", 'second comment page');
  await action('save', '8621398');
  await action('post-menu', '8621398');
  await action('post-group', '8621398');
  await fill('#groups-form input', '校园收藏');
  await click('#groups-form button[type=submit]');
  await wait(has('已更新关注分组'), 'assign group');
  await action('back');
  assert.equal(await evaluate("document.querySelector('#screen').scrollTop"), 260);
  await action('tab', 'saved');
  await action('saved-group', '校园收藏');
  assert.equal(await evaluate("document.querySelectorAll('.post-card').length"), 1);

  await action('tab', 'feed');
  await action('image', 'id:42');
  await wait(has('图片暂不可用'), 'missing image fallback');
  await action('close');
  await action('tags');
  await action('pick-tag', '2');
  await wait("document.querySelectorAll('.post-card:not(.skeleton)').length > 0 && [...document.querySelectorAll('.post-card')].every(card => card.innerText.includes('失物招领'))", 'label filter');

  await action('tab', 'search');
  await fill('#search-form input', '农园');
  await click('#search-form button[type=submit]');
  await wait("document.querySelector('mark')?.textContent === '农园'", 'keyword and highlights');
  await action('dates');
  await fill('#dates-form [name=end]', '2000-01-01');
  await click('#dates-form button[type=submit]');
  await wait(has('没有匹配的帖子'), 'date uses REST and empties results');
  await fill('#search-form input', '#8621392');
  await click('#search-form button[type=submit]');
  await wait("document.querySelector('.detail-card .post-id')?.textContent === '#8621392'", 'post ID lookup');
  await action('back');
  await action('tab', 'settings');
  await action('history');
  assert.equal(await evaluate("document.querySelectorAll('.history-item').length"), 2);
  await action('back');
  await action('theme');
  await action('set-theme', 'dark');
  assert.equal(await evaluate('document.documentElement.dataset.theme'), 'dark');

  await action('sources');
  await fill('#source-form [name=url]', 'https://unavailable.example.test');
  await click('#source-form button[value=test]');
  await wait(has('连接测试失败'), 'unavailable source validation');
  await fill('#source-form [name=url]', 'https://rest.example.test/archive');
  await click('#source-form button[value=test]');
  await wait(has('连接正常 · 镜像 REST API · 日期筛选'), 'REST source probe');
  await click('#source-form button[value=save]');
  await wait(`document.querySelectorAll('.post-card:not(.skeleton)').length === 20 && ${has('rest.example.test')}`, 'switch source');
  await action('tab', 'saved');
  assert.equal(await evaluate(has('还没有关注树洞')), true);
  await cdp('Page.reload');
  await wait(`document.documentElement.dataset.theme === 'dark' && ${has('rest.example.test')}`, 'persist source and theme');
  assert.deepEqual(exceptions, []);
  socket.close();
  console.log('Browser smoke passed: feed, tag, detail, quote, sort, pagination, missing image, groups, search, dates, source switch and persistence.');
} finally {
  preview.kill();
  browser.kill();
  await delay(200);
  if (dirname(profile) === tempRoot && basename(profile).startsWith('treehole-chrome-')) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

import { dateBounds, DEFAULT_SOURCE, MirrorApi, normalizeSource, parsePid } from './api.mjs';
import { navigation, renderScreen, themeNames, toolbar } from './screens.mjs';
import { brief, loadSettings, remember, saveSettings, sourceLibrary } from './storage.mjs';
import { button, chip, commentCard, esc, iconButton, panel, skeleton } from './views.mjs';

const screen = document.querySelector('#screen');
const header = document.querySelector('#toolbar');
const nav = document.querySelector('#navigation');
const sheet = document.querySelector('#sheet');
const toast = document.querySelector('#toast');
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const settings = loadSettings();
const emptyFilters = () => ({ keyword: '', kind: null, label: null, start: '', end: '' });
const newRoute = (type, extra = {}) => ({ type, filters: emptyFilters(), items: [], next: null, scroll: 0, ...extra });
const emptyCaps = { v3: false, rest: false, dates: false };

let tabs;
let route;
let stack = [];
let api;
let caps = emptyCaps;
let tags = new Map();
let connection = 'connecting';
let connectionError = '';
let connectionJob;
let sheetCleanup;
let toastTimer;
let savedTest;
let failedThumbnails = new Set();

function context() {
  const library = sourceLibrary(settings);
  const source = settings.sources.find(item => item.url === settings.active);
  return {
    api, caps, tags, source, settings, library, connection, connectionError, failedThumbnails,
    savedIds: new Set(library.saved.map(({ post }) => post.pid)),
    tagNames: new Map([...tags.values()].map(tag => [tag.name, tag])),
    mutes: text => settings.muted.some(word => text.toLocaleLowerCase().includes(word.toLocaleLowerCase())),
  };
}

function notify(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 2400);
}

function persist() {
  try { saveSettings(settings); } catch { notify('本机空间不足，设置暂未写入'); }
}

function applyTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && (window.MirrorDevice?.isSystemDark() ?? systemDark.matches));
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  window.MirrorDevice?.appearance(dark);
}

function render(restore = false) {
  const current = context();
  const top = restore ? route.scroll : screen.scrollTop;
  const focused = screen.contains(document.activeElement) && document.activeElement.name === 'keyword';
  const focusValue = focused ? document.activeElement.value : null;
  header.innerHTML = toolbar(route, current.source, connection, Boolean(stack.length), caps.v3);
  nav.innerHTML = navigation(route.type);
  nav.hidden = !nav.innerHTML;
  screen.innerHTML = renderScreen(route, current);
  screen.scrollTop = top;
  if (focused && !restore && !sheet.open) {
    const input = screen.querySelector('[name="keyword"]');
    if (input) {
      input.value = focusValue;
      input.focus({ preventScroll: true });
    }
  }
}

function show(next, push = false) {
  if (route === next) return;
  route.scroll = screen.scrollTop;
  if (push) stack.push(route);
  route = next;
  render(true);
  screen.focus({ preventScroll: true });
}

function back() {
  if (sheet.open) {
    closeSheet();
    return true;
  }
  if (stack.length) {
    show(stack.pop());
    return true;
  }
  if (route !== tabs.feed) {
    show(tabs.feed);
    ensureFeed();
    return true;
  }
  return false;
}

window.mirrorBack = back;
window.mirrorSystemTheme = applyTheme;
systemDark.addEventListener('change', applyTheme);

function switchTab(tab, focus = false) {
  stack = [];
  show(tabs[tab]);
  if (tab === 'feed') ensureFeed();
  if (focus) screen.querySelector('[name="keyword"]')?.focus();
}

function resetTabs() {
  tabs = Object.fromEntries(['feed', 'search', 'saved', 'settings'].map(type => [type, newRoute(type)]));
  stack = [];
  route = tabs.feed;
}

async function connect(knownCaps) {
  connectionJob?.abort();
  const job = new AbortController();
  connectionJob = job;
  api = new MirrorApi(settings.active);
  const candidate = api;
  caps = emptyCaps;
  tags = new Map();
  failedThumbnails = new Set();
  connection = 'connecting';
  connectionError = '';
  resetTabs();
  render(true);
  try {
    caps = knownCaps || await candidate.probe(job.signal);
    if (job.signal.aborted) return;
    connection = 'ready';
    ensureFeed();
    if (caps.v3) {
      candidate.tags(job.signal).then(list => {
        if (job.signal.aborted) return;
        tags = new Map(list.map(tag => [tag.id, tag]));
        render();
        if (sheet.open && sheet.dataset.kind === 'tags') openTags();
      }).catch(() => {});
    }
  } catch (error) {
    if (job.signal.aborted) return;
    connection = 'failed';
    connectionError = error.message;
    render();
  }
}

async function request(target, load, receive) {
  target.job?.abort();
  const job = new AbortController();
  target.job = job;
  const client = api;
  target.loading = true;
  target.error = '';
  if (target === route) render();
  try {
    const value = await load(client, job.signal);
    if (!job.signal.aborted && client === api) receive(value);
  } catch (error) {
    if (!job.signal.aborted && client === api) target.error = error.message;
  } finally {
    if (!job.signal.aborted && client === api) {
      target.loading = false;
      if (target === route) render();
    }
  }
}

function append(existing, entries, key) {
  const seen = new Set(existing.map(item => item[key]));
  return existing.concat(entries.filter(item => {
    if (seen.has(item[key])) return false;
    seen.add(item[key]);
    return true;
  }));
}

function ensureFeed() {
  const feed = tabs.feed;
  if (connection === 'ready' && !feed.started) loadPosts(feed, true);
}

function loadPosts(target, reset = false) {
  if (connection !== 'ready' || (!reset && target.loading) || (!reset && target.started && target.next == null && !target.error)) return;
  if (reset) {
    target.items = [];
    target.next = null;
    if (target === route) screen.scrollTop = 0;
  }
  target.started = true;
  const cursor = target.next;
  const filters = { ...target.filters };
  return request(target, (client, signal) => client.posts(caps, filters, cursor, signal), page => {
    target.items = append(target.items, page.list, 'pid');
    target.next = page.next;
  });
}

function submitSearch(keyword) {
  const target = tabs.search;
  const query = keyword.trim();
  target.draft = query;
  if (connection !== 'ready') return;
  const library = sourceLibrary(settings);
  if (query) {
    library.queries = remember(library.queries, query, item => item, 18);
    persist();
  }
  document.activeElement?.blur();
  const pid = parsePid(query);
  if (pid) {
    openPost(pid);
    return;
  }
  target.filters.keyword = query;
  target.searched = true;
  loadPosts(target, true);
}

function filterActive(changes) {
  const target = route.type === 'search' ? route : tabs.feed;
  Object.assign(target.filters, changes);
  if (target.type === 'search') {
    submitSearch(target.draft ?? target.filters.keyword);
  } else {
    if (route !== target) show(target, true);
    loadPosts(target, true);
  }
}

function openPost(pid) {
  if (sheet.open) closeSheet();
  if (connection !== 'ready' || !parsePid(pid) || (route.type === 'post' && route.pid === pid)) return;
  const target = newRoute('post', { pid, sort: 0, revealed: false, revealedComments: new Set() });
  target.loading = true;
  show(target, true);
  loadPost(target, true);
}

function loadPost(target, record = false) {
  return request(target, (client, signal) => client.post(caps, target.pid, signal), result => {
    Object.assign(target, { post: result.post, items: result.list, next: result.next, total: result.total, sort: 0 });
    const library = sourceLibrary(settings);
    if (record && settings.history) {
      library.history = remember(library.history, { post: brief(result.post), visited: Date.now() }, item => item.post.pid, 160);
      persist();
    }
    const saved = library.saved.find(item => item.post.pid === result.post.pid);
    if (saved) {
      saved.post = brief(result.post);
      persist();
    }
  });
}

function loadComments(target, reset = false) {
  if (reset) {
    target.items = [];
    target.next = null;
  } else if (target.loading || (target.next == null && !target.error)) return;
  return request(target, (client, signal) => client.comments(caps, target.pid, target.sort, target.next, signal), page => {
    target.items = append(target.items, page.list, 'cid');
    target.next = page.next;
    if (page.total != null) target.total = page.total;
  });
}

function loadMessages(target, reset = false) {
  if (reset) {
    target.items = [];
    target.next = null;
  } else if (target.loading || (target.next == null && !target.error)) return;
  return request(target, (client, signal) => client.messages(target.messageType, target.next || 1, signal), page => {
    target.items = [...target.items, ...page.list];
    target.next = page.next;
  });
}

function refresh() {
  if (connection === 'failed') return connect();
  if (connection !== 'ready') return;
  if (route.type === 'post') loadPost(route);
  if (route.type === 'feed' || (route.type === 'search' && route.searched)) loadPosts(route, true);
  if (route.type === 'messages') loadMessages(route, true);
}

function knownPost(pid) {
  if (route.post?.pid === pid) return route.post;
  return route.items.find(item => item.pid === pid) || sourceLibrary(settings).saved.find(item => item.post.pid === pid)?.post;
}

function toggleSaved(post) {
  if (!post) return;
  const library = sourceLibrary(settings);
  const exists = library.saved.some(item => item.post.pid === post.pid);
  if (exists) library.saved = library.saved.filter(item => item.post.pid !== post.pid);
  else library.saved.unshift({ post: brief(post), group: '', savedAt: Date.now() });
  persist();
  render();
  notify(exists ? '已取消本地关注' : '已添加到本地关注');
}

function closeSheet() {
  sheetCleanup?.();
  sheetCleanup = null;
  if (sheet.open) sheet.close();
}

function openSheet(title, body, kind = '') {
  const wasOpen = sheet.open;
  sheetCleanup?.();
  sheetCleanup = null;
  sheet.dataset.kind = kind;
  sheet.innerHTML = `<header class="sheet-heading"><h2 id="sheet-title">${esc(title)}</h2>${iconButton('close', '关闭', 'close')}</header><div class="sheet-content">${body}</div>`;
  sheet.scrollTop = 0;
  if (!wasOpen) sheet.showModal();
}

function formNote(form, message, error = false) {
  const note = form.querySelector('.sheet-note');
  if (note) {
    note.textContent = message;
    note.classList.toggle('error', error);
  }
}

function openSources(edit = '') {
  const item = settings.sources.find(source => source.url === edit);
  const list = settings.sources.map(source => `<div class="plain-row"><span class="grow"><strong>${esc(source.name)}</strong><br><small class="caption">${esc(source.url)}</small></span>
    ${source.url === settings.active ? '<span class="pill">当前</span>' : button('切换', 'select-source', { value: source.url, style: 'link-button' })}
    ${iconButton('settings', '编辑来源', 'edit-source', source.url)}
    ${source.url !== settings.active && source.url !== DEFAULT_SOURCE.url ? iconButton('close', '移除来源', 'remove-source', source.url) : ''}</div>`).join('');
  openSheet('镜像源', `<div class="plain-list">${list}</div><h3 class="sheet-subhead">${item ? '编辑来源' : '添加来源'}</h3>
    <form id="source-form" class="sheet-form" data-edit="${esc(edit)}">
      <label class="field-label">名称（可选）<input class="field" name="name" maxlength="32" value="${esc(item?.name)}" placeholder="例如 校内镜像"></label>
      <label class="field-label">API 基础地址<input class="field" name="url" type="text" inputmode="url" autocapitalize="none" spellcheck="false" maxlength="400" value="${esc(item?.url)}" placeholder="https://mirror.example.org" required></label>
      <p class="sheet-note" role="status"></p><div class="sheet-actions"><button type="submit" class="button" value="test">测试连接</button><button type="submit" class="button primary" value="save">保存并切换</button></div>
    </form>`, 'sources');
  savedTest = null;
}

async function sourceForm(form, operation) {
  let url;
  try { url = normalizeSource(form.elements.url.value); } catch (error) { formNote(form, error.message, true); return; }
  const edit = form.dataset.edit;
  const name = form.elements.name.value.trim() || new URL(url).host;
  if (operation === 'save' && settings.sources.some(source => source.url === url && source.url !== edit) && edit) {
    formNote(form, '此地址已在镜像源列表中', true);
    return;
  }
  const job = new AbortController();
  sheetCleanup = () => job.abort();
  for (const control of form.elements) control.disabled = true;
  formNote(form, '正在检查镜像接口…');
  try {
    const found = savedTest?.url === url ? savedTest.caps : await new MirrorApi(url).probe(job.signal);
    if (job.signal.aborted) return;
    savedTest = { url, caps: found };
    if (operation === 'test') {
      const features = [found.v3 && '网页兼容 API', found.rest && '镜像 REST API', found.dates && '日期筛选'].filter(Boolean);
      formNote(form, `连接正常 · ${features.join(' · ')}`);
      return;
    }
    const index = settings.sources.findIndex(source => source.url === (edit || url));
    const source = { name, url };
    if (settings.sources[index]?.url === DEFAULT_SOURCE.url && url !== DEFAULT_SOURCE.url) settings.sources.push(source);
    else if (index === -1) settings.sources.push(source);
    else settings.sources[index] = source;
    activateSource(url, found);
  } catch (error) {
    if (!job.signal.aborted) formNote(form, error.message, true);
  } finally {
    if (!job.signal.aborted) for (const control of form.elements) control.disabled = false;
  }
}

function activateSource(url, knownCaps) {
  closeSheet();
  settings.active = url;
  persist();
  connect(knownCaps);
}

function openTags() {
  const active = route.filters.label;
  const groups = new Map();
  for (const tag of tags.values()) {
    const name = tag.group || '标签';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(tag);
  }
  openSheet('全部标签', `${chip('不限标签', 'pick-tag', '', !active)}${[...groups].map(([title, list]) => `
    <h3 class="sheet-subhead">${esc(title)}</h3><div class="tag-group">${list.map(tag => chip(tag.name, 'pick-tag', tag.id, active === tag.id)).join('')}</div>`).join('')}
    ${!tags.size ? '<p class="caption">镜像暂未返回可用标签。</p>' : ''}`, 'tags');
}

function openDates() {
  const { start, end } = route.filters;
  openSheet('按日期检索', `<form id="dates-form" class="sheet-form">
    <div class="date-row"><label class="field-label">起始日期<input class="field" type="date" name="start" value="${esc(start)}"></label>
    <label class="field-label">结束日期<input class="field" type="date" name="end" value="${esc(end)}"></label></div>
    <p class="caption">按手机时区计算，包含起止当天。应用日期时会清除标签和悬赏筛选。</p><p class="sheet-note" role="status"></p>
    <div class="sheet-actions">${button('清除日期', 'clear-dates')}<button class="button primary" type="submit">应用日期</button></div>
    </form>`);
}

function openGroups(post) {
  const library = sourceLibrary(settings);
  const current = post && library.saved.find(item => item.post.pid === post.pid);
  const groups = library.groups.map(group => post ? chip(group, 'assign-group', group, current?.group === group) : `<div class="plain-row"><span class="grow">${esc(group)}</span>${button('移除', 'remove-group', { value: group, style: 'link-button' })}</div>`).join('');
  openSheet(post ? `#${post.pid} 的关注分组` : '关注分组', `
    <div class="${post ? 'tag-group' : 'plain-list'}">${post ? chip('未分组', 'assign-group', '', !current?.group) : ''}${groups}</div>
    <form class="sheet-form" id="groups-form" data-pid="${post?.pid || ''}"><label class="field-label">新建分组<input class="field" name="name" maxlength="24" required></label>
    <p class="sheet-note" role="status"></p><div class="sheet-actions"><button class="button primary" type="submit">新建</button></div></form>`);
}

function assignGroup(post, group) {
  const library = sourceLibrary(settings);
  const current = library.saved.find(item => item.post.pid === post.pid);
  if (current) current.group = group;
  else library.saved.unshift({ post: brief(post), group, savedAt: Date.now() });
  persist();
  closeSheet();
  render();
  notify('已更新关注分组');
}

function openPostMenu(post) {
  if (!post) return;
  openSheet(`#${post.pid}`, `<div class="more-list">
    ${button('复制洞号', 'copy-id', { glyph: 'copy', value: post.pid })}
    ${post.hidden || post.folded || context().mutes(post.text) ? '' : button('复制正文', 'copy-post', { glyph: 'copy', value: post.pid })}
    ${button('分享镜像链接', 'share', { glyph: 'share', value: post.pid })}
    ${button('保存到关注分组', 'post-group', { glyph: 'folder', value: post.pid })}
    </div>`);
}

async function copy(value) {
  try {
    if (window.MirrorDevice) window.MirrorDevice.copy(value);
    else await navigator.clipboard.writeText(value);
    closeSheet();
    notify('已复制');
  } catch { notify('复制失败'); }
}

function share(pid) {
  const path = caps.v3 ? `/chapi/api/v3/hole/one?pid=${pid}` : `/post/${pid}`;
  const text = `树洞 #${pid}\n${settings.active}${path}`;
  if (window.MirrorDevice) {
    closeSheet();
    window.MirrorDevice.share(text);
  } else if (navigator.share) navigator.share({ text }).catch(() => {});
  else copy(text);
}

function openImage(ref) {
  const [key, value] = ref.split(':');
  if (!['id', 'pid'].includes(key) || !parsePid(value)) return;
  openSheet('查看图片', `<div id="image-content" aria-live="polite">${skeleton(1)}</div>`, 'image');
  const target = sheet.querySelector('#image-content');
  const image = new Image();
  image.alt = '树洞图片';
  image.className = 'image-view';
  image.onload = () => target.replaceChildren(image);
  image.onerror = () => { target.innerHTML = panel('图片暂不可用', '镜像暂未提供这张图片。', 'image', button('重试', 'image', { value: ref })); };
  image.src = api.image(caps, { [key]: value }, true);
}

async function openQuote(cid) {
  const comment = route.items.find(item => item.cid === cid);
  if (!comment?.quoteId) return;
  const rendered = document.querySelector(`#comment-${comment.quoteId}`);
  if (rendered) {
    rendered.scrollIntoView({ block: 'center' });
    rendered.focus({ preventScroll: true });
    return;
  }
  if (comment.quote) {
    openSheet('引用评论', commentCard(comment.quote, context(), false, true));
    return;
  }
  openSheet('引用评论', caps.rest ? skeleton(1) : panel('镜像未返回原评论', `评论 #${comment.quoteId}`, 'comment'));
  if (!caps.rest) return;
  const job = new AbortController();
  sheetCleanup = () => job.abort();
  const target = sheet.querySelector('.sheet-content');
  try {
    const item = await api.comment(comment.quoteId, job.signal);
    if (!job.signal.aborted) target.innerHTML = commentCard(item, context(), false, true);
  } catch (error) {
    if (!job.signal.aborted) target.innerHTML = panel('无法读取原评论', error.message, 'comment');
  }
}

const actions = {
  tab: value => switchTab(value), back, close: closeSheet, refresh, reconnect: () => connect(),
  'search-focus': () => switchTab('search', true),
  'load-posts': () => loadPosts(route), 'load-comments': () => loadComments(route), 'load-messages': () => loadMessages(route),
  post: value => openPost(Number(value)), 'reveal-post': () => { route.revealed = true; render(); },
  'reveal-comment': value => { route.revealedComments.add(Number(value)); render(); },
  'jump-comments': () => document.querySelector('#comments-section')?.scrollIntoView(),
  sort: () => { route.sort = route.sort ? 0 : 1; loadComments(route, true); },
  save: value => toggleSaved(knownPost(Number(value))),
  'post-menu': value => openPostMenu(knownPost(Number(value))),
  'post-group': value => openGroups(knownPost(Number(value))),
  'copy-id': value => copy(`#${value}`), 'copy-post': value => copy(knownPost(Number(value))?.text || ''),
  share, image: openImage, quote: value => openQuote(Number(value)),
  tags: openTags,
  'pick-tag': value => { closeSheet(); filterActive({ label: Number(value) || null, start: '', end: '' }); },
  kind: value => filterActive({ kind: value ? Number(value) : null, start: '', end: '' }),
  dates: openDates,
  'clear-dates': () => { closeSheet(); filterActive({ start: '', end: '' }); },
  'past-query': value => submitSearch(value),
  'clear-queries': () => { sourceLibrary(settings).queries = []; persist(); render(); },
  'search-help': () => openSheet('检索语法', `<p class="caption">关键词由当前镜像处理。PKUHoleTUI 启用全文索引时支持以下语法。</p><ul class="caption"><li>空格连接关键词，如「保研 清华」</li><li>OR 或 | 匹配任一词</li><li>减号排除关键词，如「经验 -广告」</li><li>双引号匹配短语，括号组合条件</li><li>输入 #洞号，或单独输入数字，打开指定树洞</li></ul>`),
  sources: () => openSources(), 'edit-source': openSources, 'select-source': value => activateSource(value),
  'remove-source': value => { settings.sources = settings.sources.filter(source => source.url !== value); persist(); openSources(); },
  'toggle-setting': value => { settings[value] = !settings[value]; persist(); render(); },
  theme: () => openSheet('外观', `<div class="tag-group">${Object.entries(themeNames).map(([key, name]) => chip(name, 'set-theme', key, settings.theme === key)).join('')}</div>`),
  'set-theme': value => { settings.theme = value; persist(); applyTheme(); closeSheet(); render(); },
  mute: () => openSheet('屏蔽词', `<form id="mute-form" class="sheet-form"><label class="field-label">每行一个关键词<textarea class="field" maxlength="4000" name="words" placeholder="输入需要折叠的关键词">${esc(settings.muted.join('\n'))}</textarea></label><div class="sheet-actions"><button class="button primary" type="submit">保存屏蔽词</button></div></form>`),
  history: () => show(newRoute('history'), true),
  'clear-history': () => openSheet('清空浏览历史', `<p class="caption">清空当前镜像在本机的浏览记录。</p><div class="sheet-actions">${button('取消', 'close')}${button('清空', 'confirm-history', { style: 'button danger' })}</div>`),
  'confirm-history': () => { sourceLibrary(settings).history = []; persist(); closeSheet(); render(); },
  groups: () => openGroups(),
  'saved-group': value => { route.group = value; render(); },
  'assign-group': value => { const post = knownPost(Number(sheet.querySelector('#groups-form').dataset.pid)); if (post) assignGroup(post, value); },
  'remove-group': value => {
    const library = sourceLibrary(settings);
    library.groups = library.groups.filter(group => group !== value);
    library.saved.forEach(item => { if (item.group === value) item.group = ''; });
    if (route.group === value) route.group = '';
    persist(); render(); openGroups();
  },
  messages: () => { const next = newRoute('messages', { messageType: 'int_msg', loading: true }); show(next, true); loadMessages(next, true); },
  'message-type': value => { route.messageType = value; loadMessages(route, true); },
};

document.addEventListener('click', event => {
  if (event.target.closest('a[href]')) return;
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const selected = getSelection();
  if (target.tagName === 'P' && selected?.type === 'Range' && target.contains(selected.anchorNode)) return;
  actions[target.dataset.action]?.(target.dataset.value);
});

document.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  switch (form.id) {
    case 'source-form': sourceForm(form, event.submitter?.value || 'test'); break;
    case 'search-form': submitSearch(data.get('keyword')); break;
    case 'saved-form': route.query = data.get('keyword').trim(); document.activeElement?.blur(); render(); break;
    case 'dates-form': {
      const start = data.get('start');
      const end = data.get('end');
      try { dateBounds(start, end); } catch (error) { formNote(form, error.message, true); break; }
      closeSheet(); filterActive({ start, end, kind: null, label: null });
      break;
    }
    case 'mute-form':
      settings.muted = [...new Set(data.get('words').split(/\r?\n/).map(word => word.trim()).filter(Boolean))].slice(0, 100);
      persist(); closeSheet(); render(); break;
    case 'groups-form': {
      const name = data.get('name').trim();
      const post = knownPost(Number(form.dataset.pid));
      const library = sourceLibrary(settings);
      if (!name || library.groups.includes(name)) { formNote(form, '请输入新的分组名称', true); break; }
      library.groups.push(name);
      if (post) assignGroup(post, name);
      else { persist(); render(); openGroups(); }
      break;
    }
  }
});

document.addEventListener('input', event => {
  if (event.target.matches('#search-form input, #saved-form input')) route.draft = event.target.value;
});

screen.addEventListener('error', event => {
  const image = event.target;
  if (image instanceof HTMLImageElement && image.closest('.asset-preview')) {
    failedThumbnails.add(image.getAttribute('src'));
    image.parentElement.classList.add('unavailable');
    image.remove();
  }
}, true);

screen.addEventListener('scroll', () => {
  if (route.loading || screen.scrollTop < 100 || screen.scrollHeight - screen.scrollTop - screen.clientHeight > 90) return;
  const next = screen.querySelector('[data-page-next]');
  if (next) actions[next.dataset.action]?.();
}, { passive: true });

let pullStart;
screen.addEventListener('touchstart', event => {
  pullStart = screen.scrollTop === 0 && (route.type === 'feed' || route.type === 'post') ? event.changedTouches[0] : null;
}, { passive: true });
screen.addEventListener('touchend', event => {
  const touch = event.changedTouches[0];
  if (pullStart && screen.scrollTop === 0 && touch.clientY - pullStart.clientY > 74 && Math.abs(touch.clientX - pullStart.clientX) < 46 && !route.loading) refresh();
  pullStart = null;
}, { passive: true });
screen.addEventListener('touchcancel', () => { pullStart = null; }, { passive: true });
sheet.addEventListener('cancel', event => { event.preventDefault(); closeSheet(); });

applyTheme();
connect();

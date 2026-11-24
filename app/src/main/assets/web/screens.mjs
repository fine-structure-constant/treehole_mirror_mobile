import { button, chip, commentCard, esc, formatTime, heading, icon, iconButton, panel, postCard, searchForm, settingRow, skeleton } from './views.mjs';

export const themeNames = { auto: '跟随系统', light: '浅色', dark: '深色' };
export const titles = { feed: '最新', search: '检索', saved: '关注', settings: '设置', post: '树洞详情', history: '浏览历史', messages: '消息通知' };
const navItems = [['feed', 'home'], ['search', 'search'], ['saved', 'bookmark'], ['settings', 'settings']];

export function toolbar(route, source, connection, hasBack, supportsMessages) {
  if (!navItems.some(([id]) => id === route.type)) {
    const title = route.type === 'post' ? `#${route.pid}` : titles[route.type];
    return `<div class="bound toolbar-inner">${iconButton('back', '返回', 'back')}<h1 class="toolbar-title">${esc(title)}</h1><span class="spacer"></span>
       ${['post', 'messages'].includes(route.type) ? iconButton('refresh', '刷新', 'refresh') : ''}</div>`;
  }
  const status = connection === 'failed' ? '连接失败' : connection === 'ready' ? source.name : '正在连接';
  return `<div class="bound toolbar-inner"><div class="brand">
     <span class="brand-mark">${icon('logo')}</span><div><h1 class="toolbar-title">树洞镜像</h1>
     <div class="toolbar-subtitle"><span class="indicator${connection === 'failed' ? ' offline' : ''}"></span>${esc(status)} · 只读</div></div></div>
     <span class="spacer"></span>${hasBack ? iconButton('back', '返回', 'back') : ''}
     ${supportsMessages ? iconButton('bell', '消息通知', 'messages') : ''}${iconButton('server', '切换镜像源', 'sources')}</div>`;
}

export function navigation(screen) {
  if (!navItems.some(([id]) => id === screen)) return '';
  return `<div class="bound nav-inner">${navItems.map(([id, glyph]) =>
    `<button class="nav-button" type="button" data-action="tab" data-value="${id}" ${screen === id ? 'aria-current="page"' : ''}><span>${icon(glyph)}</span><span>${titles[id]}</span></button>`).join('')}</div>`;
}

function filtersBar(route, context) {
  const { filters } = route;
  const dates = filters.start || filters.end;
  const label = context.tags.get(filters.label)?.name || (filters.label ? `标签 ${filters.label}` : '全部标签');
  return `<div class="${route.type === 'feed' ? 'feed-tools' : 'search-options'}" aria-label="筛选条件">
    ${context.caps.v3 ? `${chip('全部', 'kind', '', filters.kind == null && !dates)}${chip('悬赏', 'kind', '1', filters.kind === 1, 'heart')}
    ${chip(label, 'tags', '', Boolean(filters.label), 'tag')}` : ''}
    ${route.type === 'search' && context.caps.dates ? chip(dates ? `${filters.start || '不限'} ~ ${filters.end || '不限'}` : '日期', 'dates', '', Boolean(dates), 'calendar') : ''}
    ${route.type === 'search' ? iconButton('alert', '检索语法', 'search-help') : ''}</div>`;
}

function loadFooter(route, action, label = '加载更多') {
  if (route.loading) return '<div class="footer" role="status">正在加载…</div>';
  if (route.error) return `<div class="footer">${button('加载失败，重试', action, { glyph: 'refresh' })}</div>`;
  if (route.next != null) return `<div class="footer">${button(label, action, { glyph: 'down', attrs: 'data-page-next="true"' })}</div>`;
  return '<div class="footer">已到末尾</div>';
}

function postResults(route, context, action, label) {
  if (!route.items.length && route.loading) return skeleton();
  if (!route.items.length && route.error) {
    return panel('加载失败', route.error, 'alert', button('重试', action, { glyph: 'refresh' }), true);
  }
  if (!route.items.length) return panel(label, '可调整检索词或筛选条件。');
  return `<div class="posts">${route.items.map(post => postCard(post, context, { keyword: route.filters.keyword })).join('')}</div>${loadFooter(route, action)}`;
}

function connectionState(context) {
  if (context.connection === 'connecting') return skeleton();
  return panel('无法连接镜像', context.connectionError, 'server', `${button('重试连接', 'reconnect', { glyph: 'refresh' })} ${button('切换镜像源', 'sources', { glyph: 'server' })}`, true);
}

function feed(route, context) {
  return `${heading('最新树洞', '', iconButton('refresh', '刷新列表', 'refresh'))}
    ${button('搜索关键词或洞号', 'search-focus', { glyph: 'search', style: 'search-jump' }).replace('</button>', '<span class="key" aria-hidden="true">#</span></button>')}
    ${filtersBar(route, context)}${context.connection === 'ready' ? postResults(route, context, 'load-posts', '当前筛选下没有帖子') : connectionState(context)}`;
}

function search(route, context) {
  const { queries } = context.library;
  const initial = !route.searched;
  return `${heading('检索树洞')}${searchForm('search-form', route.draft ?? route.filters.keyword, '关键词或 #洞号')}${filtersBar(route, context)}
    ${context.connection !== 'ready' ? connectionState(context) : initial ? `
      ${queries.length ? `<div class="header-block"><h3 class="section-title">最近检索</h3>${button('清除', 'clear-queries', { style: 'link-button' })}</div>
      <div class="recent">${queries.map(query => chip(query, 'past-query', query)).join('')}</div>` : ''}
      ${panel('搜索镜像中的帖子', '输入正文关键词，或用 # 加洞号直接打开树洞。', 'search')}
    ` : `<h3 class="section-title results-head">搜索结果</h3>${postResults(route, context, 'load-posts', '没有匹配的帖子')}`}`;
}

function saved(route, context) {
  const { saved: posts, groups } = context.library;
  const keyword = route.query?.toLocaleLowerCase() || '';
  const items = posts.filter(item => (!route.group || item.group === route.group) &&
    (!keyword || item.post.text.toLocaleLowerCase().includes(keyword) || `#${item.post.pid}`.includes(keyword)));
  return `${heading('本地关注', context.source.name, iconButton('folder', '关注分组管理', 'groups'))}
    ${searchForm('saved-form', route.draft ?? route.query ?? '', '搜索关注', '搜索')}
    <div class="feed-tools">${chip('全部', 'saved-group', '', !route.group)}${groups.map(group => chip(group, 'saved-group', group, route.group === group)).join('')}</div>
    ${items.length ? `<div class="posts">${items.map(({ post }) => postCard(post, context, { keyword })).join('')}</div>`
      : panel(posts.length ? '没有匹配的关注' : '还没有关注树洞', posts.length ? '可切换分组或调整关键词。' : '点树洞下方的书签，在这里快速找到它。', 'bookmark')}`;
}

function settings(context) {
  const prefs = context.settings;
  return `${heading('设置')}
    <div class="settings-group">${settingRow('server', '镜像源', context.source.url, 'sources')}${settingRow('clock', '浏览历史', prefs.history ? '已开启' : '已暂停记录', 'history')}</div>
    <div class="settings-group">
      ${settingRow('moon', '外观', themeNames[prefs.theme], 'theme')}
      ${settingRow('image', '自动加载图片', prefs.images ? '已开启' : '点按查看原图', 'toggle-setting', 'images')}
      ${settingRow('comment', '列表评论预览', prefs.previews ? '已开启' : '已关闭', 'toggle-setting', 'previews')}
      ${settingRow('filter', '屏蔽词', prefs.muted.length ? `${prefs.muted.length} 个关键词` : '尚未设置', 'mute')}
    </div><p class="caption">树洞镜像 0.1.0 · Android<br>浏览和检索通过当前镜像 API。关注、分组、屏蔽词及历史保存在本机。</p>`;
}

function post(route, context) {
  if (!route.post && route.loading) return skeleton(2);
  if (!route.post) return panel('无法打开树洞', route.error || '镜像暂未返回内容。', 'alert', button('重试', 'refresh', { glyph: 'refresh' }), true);
  const items = route.post.hidden ? [] : route.items;
  const total = route.total ?? route.post.reply;
  return `${postCard(route.post, context, { detail: true, revealed: route.revealed })}
    <section id="comments-section" aria-label="树洞评论">
    <div class="comments-head"><h2>评论 <span>${total}</span></h2>
    ${chip(route.sort === 1 ? '最新优先' : '最早优先', 'sort', '', false, 'sort')}</div>
    ${items.length ? `<div class="comments">${items.map(item => commentCard(item, context, route.revealedComments.has(item.cid))).join('')}</div>${loadFooter(route, 'load-comments', '更多评论')}`
      : route.loading ? skeleton(1)
        : route.error ? panel('评论加载失败', route.error, 'alert', button('重试', 'load-comments', { glyph: 'refresh' }), true)
          : panel('暂无可见评论', '', 'comment')}
    </section>`;
}

function history(context) {
  return `${heading('浏览历史', context.source.name, button(context.settings.history ? '暂停记录' : '恢复记录', 'toggle-setting', { value: 'history', style: 'link-button' }))}
    ${context.library.history.length ? `<div class="plain-list">${context.library.history.map(({ post, visited }) =>
      `<button type="button" class="history-item" data-action="post" data-value="${post.pid}"><b class="post-id">#${post.pid}</b><time class="post-time"> · ${esc(formatTime(visited, true))}</time>
       <span>${esc(post.hidden ? '此树洞内容不可见' : post.folded || context.mutes(post.text) ? '内容已折叠' : post.text || '图片树洞')}</span></button>`).join('')}</div>
      <div class="footer">${button('清空当前镜像的浏览历史', 'clear-history', { style: 'button danger' })}</div>` : panel('没有浏览记录', '', 'clock')}`;
}

function messages(route) {
  return `${heading('消息通知')}<div class="feed-tools">${chip('互动消息', 'message-type', 'int_msg', route.messageType === 'int_msg')}${chip('系统消息', 'message-type', 'sys_msg', route.messageType === 'sys_msg')}</div>
    ${route.items.length ? `<div class="plain-list">${route.items.map(item => {
      const pid = Number(item.pid);
      const body = `<strong>${esc(item.title || '通知')}</strong><p class="caption">${esc(item.content || item.text || '')}</p>`;
      return pid ? `<button class="history-item" type="button" data-action="post" data-value="${pid}">${body}</button>` : `<div class="history-item">${body}</div>`;
    }).join('')}</div>${loadFooter(route, 'load-messages')}` : route.loading ? skeleton(1)
      : route.error ? panel('消息加载失败', route.error, 'alert', button('重试', 'load-messages'), true)
        : panel('暂无消息', '该镜像只提供可公开读取的消息。', 'bell')}`;
}

const screens = { feed, search, saved, settings: (_route, context) => settings(context), post, history: (_route, context) => history(context), messages };

export function renderScreen(route, context) {
  return `<div class="bound content">${screens[route.type](route, context)}</div>`;
}

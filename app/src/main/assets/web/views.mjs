import { parsePid } from './api.mjs';

const paths = {
  logo: '<path d="M12 3a8 8 0 0 0-6.1 13.2l-1.2 4.3 4.3-2A8 8 0 1 0 12 3Z"/><circle cx="12" cy="11" r="3"/>',
  home: '<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-6h6v6"/>',
  search: '<circle cx="10.7" cy="10.7" r="6.2"/><path d="m15.3 15.3 4.5 4.5"/>',
  bookmark: '<path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-4-6 4Z"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5" fill="var(--surface)"/><circle cx="15" cy="17" r="2.5" fill="var(--surface)"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2 6m2-12v6h-6"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  tag: '<path d="M3 5a2 2 0 0 1 2-2h6l10 10-8 8L3 11Z"/><circle cx="7.5" cy="7.5" r="1"/>',
  comment: '<path d="M3 5h18v12h-9l-4 4v-4H3Z"/>',
  heart: '<path d="m12 20-8.1-8.1a4.7 4.7 0 0 1 6.6-6.6L12 6.8l1.5-1.5a4.7 4.7 0 0 1 6.6 6.6Z"/>',
  follow: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m3 16 4-3 4 3 4-5 6 6"/>',
  calendar: '<rect x="4" y="6" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v6m8-6v6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6h4"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4a8.5 8.5 0 1 0 11.5 11.5Z"/>',
  filter: '<path d="M3 5h18l-7 8v5l-4 2v-7Z"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5m0 4h.01"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  share: '<path d="M12 16V3m-5 5 5-5 5 5M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  sort: '<path d="M6 4v16m-3-3 3 3 3-3m9 3V4m-3 3 3-3 3 3"/>',
};

export function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

export function button(label, action, { glyph, style = 'button', value = '', attrs = '' } = {}) {
  return `<button type="button" class="${style}" data-action="${action}" data-value="${esc(value)}" ${attrs}>${glyph ? icon(glyph) : ''}${esc(label)}</button>`;
}

export function iconButton(glyph, label, action, value = '') {
  return button('', action, { glyph, style: 'icon-button', value, attrs: `aria-label="${esc(label)}" title="${esc(label)}"` });
}

export function chip(label, action, value, active = false, glyph) {
  return `<button type="button" class="chip${active ? ' active' : ''}" data-action="${action}" data-value="${esc(value)}" aria-pressed="${active}">${glyph ? icon(glyph) : ''}<span class="chip-text">${esc(label)}</span></button>`;
}

export function heading(title, subtitle = '', actions = '') {
  return `<div class="header-block"><div><h2 class="heading">${esc(title)}</h2>${subtitle ? `<p class="eyebrow">${esc(subtitle)}</p>` : ''}</div>${actions}</div>`;
}

export function panel(label, message, glyph = 'search', actions = '', error = false) {
  return `<div class="state${error ? ' error' : ''}" ${error ? 'role="alert"' : ''}>${icon(glyph)}<b>${esc(label)}</b>${message ? `<p>${esc(message)}</p>` : ''}${actions}</div>`;
}

export function skeleton(count = 3) {
  return `<div class="posts" role="status" aria-label="正在加载">${'<div class="post-card skeleton" aria-hidden="true"><span></span><span></span><span></span></div>'.repeat(count)}</div>`;
}

export function formatTime(timestamp, long = false) {
  if (!timestamp) return '';
  const date = new Date(timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  const today = new Date();
  if (!long && date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }
  return new Intl.DateTimeFormat('zh-CN', {
    ...(long || date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
    month: '2-digit', day: '2-digit', ...(long ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(date);
}

function highlights(value, keyword) {
  const terms = [...new Set(keyword.split(/[\s"“”()|]+/).filter(term => term && !/^or$|^and$|^-|^#/i.test(term)))];
  if (!terms.length) return esc(value);
  const pattern = new RegExp(terms.sort((a, b) => b.length - a.length)
    .map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'giu');
  let result = '';
  let from = 0;
  for (const match of value.matchAll(pattern)) {
    result += `${esc(value.slice(from, match.index))}<mark>${esc(match[0])}</mark>`;
    from = match.index + match[0].length;
  }
  return result + esc(value.slice(from));
}

export function richText(value, keyword = '') {
  const pattern = /https?:\/\/[^\s<>"'，。！？、；（）]+|[#＃]\d{1,10}(?!\d)/giu;
  let result = '';
  let from = 0;
  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    result += highlights(value.slice(from, match.index), keyword);
    const pid = parsePid(token);
    if (pid) {
      result += button(token, 'post', { value: pid, style: 'text-link' });
    } else if (/^https?:\/\//i.test(token)) {
      const url = token.replace(/[).,!?:;]+$/, '');
      result += `<a href="${esc(url)}" rel="noreferrer noopener">${esc(url)}</a>${esc(token.slice(url.length))}`;
    } else {
      result += esc(token);
    }
    from = match.index + token.length;
  }
  return result + highlights(value.slice(from), keyword);
}

export function assets(item, context) {
  const refs = item.media.map(id => `id:${id}`);
  if (!refs.length && item.type === 'image') refs.push(`pid:${item.pid}`);
  if (!refs.length) return '';
  return `<div class="asset-row">${refs.map((ref, index) => {
    const [key, value] = ref.split(':');
    const src = context.api.image(context.caps, { [key]: value }, false);
    const missing = context.failedThumbnails.has(src);
    const image = context.settings.images && !missing ? `<img loading="lazy" alt="" src="${esc(src)}">` : '';
    return `<button class="asset-preview${missing ? ' unavailable' : ''}" type="button" data-action="image" data-value="${ref}" aria-label="查看图片 ${index + 1}">${icon('image')}${image}</button>`;
  }).join('')}</div>`;
}

export function postCard(post, context, { detail = false, keyword = '', revealed = false } = {}) {
  const saved = context.savedIds.has(post.pid);
  const folded = (post.folded || context.mutes(post.text)) && !revealed;
  const tags = new Map(post.tags.map(name => [name, context.tagNames.get(name)]));
  for (const id of post.tagIds) {
    const tag = context.tags.get(id);
    if (tag) tags.set(tag.name, tag);
  }
  if (post.label && context.tags.has(post.label)) tags.set(context.tags.get(post.label).name, context.tags.get(post.label));
  const tagRow = [...tags].slice(0, detail ? 30 : 5).map(([name, tag]) => tag
    ? button(name, 'pick-tag', { value: tag.id, style: 'pill' }) : `<span class="pill">${esc(name)}</span>`).join('');
  const title = detail ? `<span class="post-id static">#${post.pid}</span>` : button(`#${post.pid}`, 'post', { value: post.pid, style: 'post-id' });
  let body;
  if (post.hidden) {
    body = '<p class="post-body folded-note">此树洞内容不可见</p>';
  } else if (folded) {
    body = `<div class="folded-note">${context.mutes(post.text) ? '包含屏蔽词' : '已折叠'} ${button(detail ? '查看原文' : '查看详情', detail ? 'reveal-post' : 'post', { value: post.pid, style: 'link-button' })}</div>`;
  } else {
    const bodyText = richText(post.text, keyword);
    body = `${bodyText ? `<p class="post-body${detail ? '' : ' preview'}" ${detail ? '' : `data-action="post" data-value="${post.pid}"`}>${bodyText}</p>` : ''}${assets(post, context)}`;
    if (!detail && context.settings.previews) {
      const previews = post.comments.filter(comment => !comment.hidden && !context.mutes(comment.text)).slice(0, 2);
      if (previews.length) {
        body += `<button class="excerpt" type="button" data-action="post" data-value="${post.pid}" aria-label="查看树洞与评论">${previews.map(comment => `<span><b>${esc(comment.author)}</b>　${esc(comment.text || '图片')}</span>`).join('')}</button>`;
      }
    }
  }
  return `<article class="post-card${detail ? ' detail-card' : ''}">
    <div class="post-head">${title}${post.top ? '<span class="pill">置顶</span>' : ''}${post.kind === 1 ? `<span class="pill reward">悬赏${post.reward ? ` ${post.reward}` : ''}</span>` : ''}
    <time class="post-time">${esc(formatTime(post.timestamp, detail))}</time></div>
    ${tagRow ? `<div class="tag-row">${tagRow}</div>` : ''}${body}
    <footer class="post-actions">
      ${button(String(post.reply), detail ? 'jump-comments' : 'post', { glyph: 'comment', value: post.pid, style: 'post-action', attrs: `aria-label="${post.reply} 条评论"` })}
      <span class="post-action quiet" aria-label="${post.praise} 个赞" title="点赞数">${icon('heart')}${post.praise}</span>
      <span class="post-action quiet" aria-label="${post.follow} 人关注" title="镜像关注数">${icon('follow')}${post.follow}</span>
      <span class="spacer"></span>
      ${button('', 'save', { glyph: 'bookmark', value: post.pid, style: `post-action${saved ? ' active' : ''}`, attrs: `aria-pressed="${saved}" aria-label="${saved ? '取消本地关注' : '本地关注'}"` })}
      ${button('', 'post-menu', { glyph: 'more', value: post.pid, style: 'post-action', attrs: 'aria-label="树洞操作"' })}
    </footer></article>`;
}

export function commentCard(item, context, revealed, inQuote = false) {
  const folded = context.mutes(item.text) && !revealed;
  const quoteLabel = item.quote && !item.quote.hidden && !context.mutes(item.quote.text)
    ? `${item.quote.author}　${item.quote.text || '图片'}` : `引用评论 #${item.quoteId}`;
  return `<article class="comment" ${inQuote ? '' : `id="comment-${item.cid}"`} tabindex="-1">
    <span class="avatar${item.owner ? ' owner' : ''}" aria-hidden="true">${esc(item.owner ? '主' : [...item.author].slice(0, 2).join(''))}</span>
    <div class="comment-content"><div class="comment-head">${esc(item.author)}${item.highlighted ? '<span class="pill reward">获赏</span>' : ''}<time class="post-time">${esc(formatTime(item.timestamp))}</time></div>
    ${item.hidden ? '<p class="post-body folded-note">评论内容不可见</p>' : folded
      ? `<div class="folded-note">包含屏蔽词 ${inQuote ? '' : button('查看原文', 'reveal-comment', { value: item.cid, style: 'link-button' })}</div>`
      : `${item.quoteId && !inQuote ? button(quoteLabel, 'quote', { value: item.cid, style: 'quote' }) : ''}<p class="post-body">${richText(item.text)}</p>${assets(item, context)}`}</div>
  </article>`;
}

export function searchForm(id, value, placeholder, submit = '检索') {
  return `<form id="${id}" class="search-form"><label class="search-field">${icon('search')}<input aria-label="${esc(placeholder)}" name="keyword" type="search" maxlength="300" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="search"></label><button class="button primary" type="submit">${esc(submit)}</button></form>`;
}

export function settingRow(glyph, title, subtitle, action, value = '') {
  return `<button type="button" class="setting-row" data-action="${action}" data-value="${esc(value)}">${icon(glyph)}<span><strong>${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span><span class="spacer"></span>${icon('next')}</button>`;
}

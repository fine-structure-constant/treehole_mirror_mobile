const V3 = '/chapi/api/v3';
export const PAGE_SIZE = 20;
export const DEFAULT_SOURCE = { url: 'https://treehole.pkuphysu.cn', name: '预设镜像' };

export function normalizeSource(input) {
  const value = input.trim();
  if (!value) throw new Error('请填写镜像地址');
  let url;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw new Error('请输入有效的镜像地址');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
      url.hostname === 'appassets.androidplatform.net' || url.port === '0') {
    throw new Error('请输入 HTTP(S) 地址，地址中请勿包含账号、查询参数或片段');
  }
  const path = url.pathname.replace(/\/+$/, '')
    .replace(/\/(?:help|health|ch\/web\/(?:pc\/index|mobile\/index)|chapi\/api\/v3(?:\/hole\/list_comments)?)$/, '');
  return `${url.origin}${path}`;
}

export function proxyUrl(source, endpoint, params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value != null));
  return `/mirror?${new URLSearchParams({ source, endpoint, query: query.toString() })}`;
}

export function parsePid(query) {
  const match = String(query).trim().match(/^[#＃]?\s*(\d+)$/);
  const pid = Number(match?.[1]);
  return Number.isInteger(pid) && pid > 0 && pid <= 2147483647 ? pid : null;
}

function bool(value) {
  return value === true || value === 'true' || Number(value) > 0;
}

function text(value) {
  return typeof value === 'string' ? value : '';
}

function numeric(value) {
  return Math.max(0, Number(value) || 0);
}

function mediaIds(value) {
  return [...new Set((Array.isArray(value) ? value : String(value ?? '').split(','))
    .map(item => Number(item?.id ?? item)).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 30);
}

function tagName(tag) {
  return typeof tag === 'string' ? tag : text(tag?.name || tag?.tag_name || tag?.tag || tag?.title || tag?.label);
}

export function parsePost(raw = {}, v3 = true) {
  const pid = Number(raw.pid ?? raw.id);
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('镜像返回了无效洞号');
  const separatePraise = v3 || raw.praise_num != null || raw.praise_num_show != null;
  return {
    pid,
    text: text(raw.text),
    timestamp: numeric(raw.timestamp),
    reply: numeric(raw.comment_total ?? raw.reply),
    follow: numeric(raw.follownum ?? (separatePraise ? raw.likenum : 0)),
    praise: numeric(separatePraise ? raw.praise_num_show ?? raw.praise_num : raw.likenum),
    label: numeric(raw.label),
    kind: numeric(raw.kind),
    reward: numeric(raw.reward_cost),
    top: bool(raw.is_top),
    folded: bool(raw.is_fold) || bool(raw.fold),
    hidden: bool(raw.hidden),
    type: text(raw.type),
    media: mediaIds(raw.media_ids),
    tags: [...new Set([...([raw.tags, raw.tags_list, raw.tags_info].filter(Array.isArray).flat()), raw.tag]
      .map(tagName).filter(Boolean))],
    tagIds: mediaIds(raw.tags_ids),
    comments: Array.isArray(raw.comment_list) ? raw.comment_list.map(item => parseComment(item)) : [],
  };
}

export function parseComment(raw = {}, depth = 0) {
  const cid = Number(raw.cid);
  if (!Number.isSafeInteger(cid) || cid < 1) throw new Error('镜像返回了无效评论编号');
  return {
    cid,
    pid: numeric(raw.pid),
    text: text(raw.text),
    timestamp: numeric(raw.timestamp),
    author: text(raw.name_tag || raw.username) || '匿名',
    owner: bool(raw.is_lz) || raw.name_tag === '洞主' || raw.username === '洞主',
    highlighted: bool(raw.reward_good),
    hidden: bool(raw.hidden),
    media: mediaIds(raw.media_ids),
    quoteId: numeric(raw.comment_id ?? raw.quote?.cid),
    quote: depth < 2 && raw.quote?.cid ? parseComment(raw.quote, depth + 1) : null,
  };
}

export function parseTags(data) {
  const result = new Map();
  function visit(items, group = '') {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (bool(item?.is_delete || item?.is_del) || item?.enabled === 0) continue;
      const id = numeric(item?.id ?? item?.tag_id ?? item?.value);
      const name = tagName(item);
      const children = item?.children || item?.list || item?.tags;
      if (children?.length) visit(children, name || group);
      else if (id && name) result.set(id, { id, name, group });
    }
  }
  visit(Array.isArray(data) ? data : data?.list || data?.tree || data?.tags);
  return [...result.values()];
}

function listEnvelope(data) {
  const list = Array.isArray(data) ? data : data?.list;
  if (!Array.isArray(list)) throw new Error('镜像返回的列表格式不受支持');
  return list;
}

function moreV3(data, length, page, size) {
  return length >= size && (data.total == null || Number(data.total) > page * size);
}

export function dateBounds(start, end) {
  const time = (value, suffix) => Math.floor(new Date(`${value}T${suffix}`).getTime() / 1000);
  const begin = start ? time(start, '00:00:00') : undefined;
  const finish = end ? time(end, '23:59:59') : undefined;
  if ([begin, finish].some(value => value !== undefined && !Number.isFinite(value))) throw new Error('日期格式无效');
  if (begin !== undefined && finish !== undefined && begin > finish) throw new Error('开始日期应早于或等于结束日期');
  return { begin_time: begin, end_time: finish };
}

export class MirrorApi {
  constructor(source, fetcher = globalThis.fetch.bind(globalThis)) {
    this.source = normalizeSource(source);
    this.fetcher = fetcher;
  }

  async read(endpoint, params, signal) {
    let response;
    try {
      response = await this.fetcher(proxyUrl(this.source, endpoint, params), { signal, cache: 'no-store' });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('无法连接镜像，请检查网络和镜像地址');
    }
    if (!response.ok) {
      if (response.status === 404) throw new Error('镜像上没有这条内容或接口');
      throw new Error(response.status === 504 ? '连接镜像超时' : `镜像请求失败（HTTP ${response.status}）`);
    }
    let result;
    try {
      result = await response.json();
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('此地址未返回镜像 API 的 JSON 数据');
    }
    if (result?.success === false || (result?.code != null && Number(result.code) !== 20000) ||
        (result?.status != null && Number(result.status) !== 200)) {
      throw new Error(Number(result.code) === 40400 ? '这个树洞在镜像中不存在' : '镜像未能完成查询');
    }
    if (!result || !Object.prototype.hasOwnProperty.call(result, 'data')) throw new Error('此地址的响应与镜像 API 不兼容');
    return result.data;
  }

  async probe(signal) {
    const [v3, rest, help] = await Promise.allSettled([
      this.read(`${V3}/hole/list_comments`, { page: 1, limit: 1, comment_limit: 1 }, signal).then(listEnvelope),
      this.read('/posts', { limit: 1 }, signal).then(listEnvelope),
      this.read('/help', {}, signal),
    ]);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const v3Works = v3.status === 'fulfilled';
    const restWorks = rest.status === 'fulfilled';
    if (!v3Works && !restWorks) {
      throw new Error(`连接测试失败。${v3.reason?.message || rest.reason?.message || '请检查镜像地址'}`);
    }
    const routes = Array.isArray(help.value) ? help.value.map(item => item.route || '').join(' ') : '';
    return {
      v3: v3Works,
      rest: restWorks,
      dates: restWorks && routes.includes('begin_time=') && routes.includes('end_time='),
    };
  }

  async posts(capabilities, filters, cursor, signal) {
    const { keyword, kind, label, start, end } = filters;
    if (capabilities.v3 && !start && !end) {
      const page = cursor || 1;
      const data = await this.read(`${V3}/hole/list_comments`, {
        page, limit: PAGE_SIZE, comment_limit: 2, keyword, kind, label, comment_stream: 1,
      }, signal);
      const list = listEnvelope(data).map(item => parsePost(kind === 1 ? { ...item, kind } : item));
      return { list, next: moreV3(data, list.length, page, PAGE_SIZE) ? page + 1 : null };
    }
    const data = await this.read('/posts', { begin: cursor || 0, limit: PAGE_SIZE, keyword, ...dateBounds(start, end) }, signal);
    const list = listEnvelope(data).map(item => parsePost(item, false));
    const last = list.at(-1)?.pid;
    return { list, next: list.length === PAGE_SIZE && last !== cursor ? last : null };
  }

  async post(capabilities, pid, signal) {
    if (capabilities.v3) {
      const data = await this.read(`${V3}/hole/one`, { pid, comment_limit: PAGE_SIZE, comment_stream: 1 }, signal);
      const post = parsePost(data?.hole);
      const comments = listEnvelope(data).map(item => parseComment(item));
      return { post, list: comments, total: numeric(data.total), next: moreV3(data, comments.length, 1, PAGE_SIZE) ? 2 : null };
    }
    const [raw, comments] = await Promise.all([
      this.read(`/post/${pid}`, {}, signal), this.comments(capabilities, pid, 0, null, signal),
    ]);
    return { ...comments, post: parsePost(raw, false) };
  }

  async comments(capabilities, pid, sort, cursor, signal) {
    if (capabilities.v3) {
      const page = cursor || 1;
      const data = await this.read(`${V3}/comment/list`, { pid, sort, page, limit: PAGE_SIZE, comment_stream: 1 }, signal);
      const list = listEnvelope(data).map(item => parseComment(item));
      return { list, total: numeric(data.total), next: moreV3(data, list.length, page, PAGE_SIZE) ? page + 1 : null };
    }
    const data = await this.read(`/comments/${pid}`, { begin: cursor || 0, sort, limit: PAGE_SIZE }, signal);
    const list = listEnvelope(data).map(item => parseComment(item));
    const last = list.at(-1)?.cid;
    return { list, next: list.length === PAGE_SIZE && last !== cursor ? last : null };
  }

  async comment(cid, signal) {
    return parseComment(await this.read('/comment', { cid }, signal));
  }

  async tags(signal) {
    return parseTags(await this.read(`${V3}/tags/tree`, {}, signal));
  }

  async messages(type, page, signal) {
    const data = await this.read(`${V3}/message/index`, { message_type: type, page, limit: PAGE_SIZE }, signal);
    const list = listEnvelope(data);
    return { list, next: moreV3(data, list.length, page, PAGE_SIZE) ? page + 1 : null };
  }

  image(capabilities, ref, full) {
    const endpoint = capabilities.v3 ? `${V3}/media/${full ? 'getImageBinary' : 'getThumbnail'}` : '/media/image';
    return proxyUrl(this.source, endpoint, ref);
  }
}

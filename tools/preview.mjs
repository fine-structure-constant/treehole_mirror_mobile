import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../app/src/main/assets/web/', import.meta.url));
const port = Number(process.argv[2] || 4173);
const reference = new Date();
const now = Math.floor(reference.getTime() / 1000);
const prompts = [
  '这几天图书馆一楼靠窗的位置能看到银杏，下午有太阳的时候很适合坐一会。\n有人知道闭馆前还会开放多久吗？',
  '农园晚上哪一层开得晚一点？准备下完课去吃饭，想提前确认一下。',
  '整理了一份周末的讲座清单，下午有两场在理教，欢迎补充。\n相关讨论见 #8621390。',
  '二教附近捡到了一张校园卡，已经交到一楼值班处。',
  '这周有没有一起复习统计物理的同学？想找个时间互相对一下题。',
];
const posts = Array.from({ length: 46 }, (_, index) => ({
  pid: 8621398 - index,
  text: prompts[index % prompts.length],
  timestamp: now - 540 - index * 1300,
  reply: index === 0 ? 24 : index % 7,
  likenum: 3 + index % 9,
  praise_num: (index + 1) % 6,
  label: [197, 197, 203, 2, 1][index % 5],
  kind: Number(index % 5 === 4),
  reward_cost: index % 5 === 4 ? 2 : 0,
  type: index === 1 ? 'image' : 'text',
  media_ids: index === 1 ? '42' : '',
}));

function comments(post) {
  const list = Array.from({ length: post.reply }, (_, index) => ({
    pid: post.pid, cid: post.pid * 30 + index, timestamp: post.timestamp + index * 131,
    name_tag: ['Alice', 'Bob', '洞主', 'Carol'][index % 4], is_lz: Number(index % 4 === 2),
    text: ['上周是晚上十点半关门，可以再看一下门口公告。', '谢谢，正好也在找这个！', '补充一下，周日的时间有调整。', '我记下了。'][index % 4],
  }));
  if (list.length > 1) list[1].quote = list[0];
  return list;
}

const tags = [{ id: 22, name: '校园生活', children: [
  { id: 197, tag_name: '校园起居' }, { id: 2, tag_name: '失物招领' }, { id: 203, tag_name: '校园演映' },
] }, { id: 17, name: '课程学业', children: [{ id: 1, tag_name: '课程心得' }] }];

function fixture(source, endpoint, query) {
  const restOnly = source === 'https://rest.example.test/archive';
  if ((!['https://treehole.pkuphysu.cn', 'https://second.example.test', 'https://rest.example.test/archive'].includes(source)) ||
      (restOnly && endpoint.startsWith('/chapi/'))) return [404, null];
  const isV3 = endpoint.startsWith('/chapi/api/v3/');
  const pid = Number(query.get('pid') || endpoint.split('/').at(-1));
  const post = posts.find(item => item.pid === pid);
  const count = Number(query.get('limit') || 20);
  const page = Number(query.get('page') || 1);
  const keyword = query.get('keyword') || '';
  const begin = Number(query.get('begin') || 0);
  const sorted = list => query.get('sort') === '1' ? [...list].reverse() : list;
  const restPost = item => ({ ...item, id: item.pid });
  let data;
  if (endpoint === '/help') data = [{ route: '/posts?begin_time=&end_time=' }];
  else if (endpoint === '/posts' || endpoint.endsWith('/hole/list_comments')) {
    const values = posts.filter(item => (!keyword || item.text.includes(keyword)) &&
        (!query.has('label') || item.label === Number(query.get('label'))) &&
        (!query.has('kind') || item.kind === Number(query.get('kind'))) &&
        (!query.has('begin_time') || item.timestamp >= Number(query.get('begin_time'))) &&
        (!query.has('end_time') || item.timestamp <= Number(query.get('end_time'))));
    data = isV3 ? { list: values.slice((page - 1) * count, page * count).map(item => ({ ...item, comment_list: comments(item).slice(0, Number(query.get('comment_limit'))) })), total: values.length }
      : values.filter(item => !begin || item.pid < begin).slice(0, count).map(restPost);
  } else if (endpoint.endsWith('/hole/one') && post) {
    data = { hole: post, list: comments(post).slice(0, Number(query.get('comment_limit') || count)), total: post.reply };
  } else if (endpoint.endsWith('/comment/list') && post) {
    data = { list: sorted(comments(post)).slice((page - 1) * count, page * count), total: post.reply };
  } else if (endpoint === `/post/${pid}` && post) data = restPost(post);
  else if (endpoint === `/comments/${pid}` && post) {
    const descending = query.get('sort') === '1';
    data = sorted(comments(post)).filter(item => !begin || (descending ? item.cid < begin : item.cid > begin)).slice(0, count);
  } else if (endpoint.endsWith('/tags/tree')) data = { list: tags, total: tags.length };
  else if (endpoint.endsWith('/message/index')) data = { list: [], total: 0 };
  else return isV3 && endpoint.endsWith('/hole/one') ? [200, { code: 40400, success: false, data: null }] : [404, null];
  return [200, isV3 ? { code: 20000, success: true, data } : { status: 200, data }];
}

const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method !== 'GET') return response.writeHead(405).end();
  if (url.pathname === '/mirror') {
    const [code, body] = fixture(url.searchParams.get('source'), url.searchParams.get('endpoint'), new URLSearchParams(url.searchParams.get('query')));
    return response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
  }
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^[a-z-]+\.(mjs|css|html)$/.test(name)) return response.writeHead(404).end();
  try {
    const data = await readFile(resolve(root, name));
    response.writeHead(200, { 'Content-Type': `${types[extname(name)]}; charset=utf-8` }).end(data);
  } catch { response.writeHead(404).end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`使用演示数据的移动端预览 http://127.0.0.1:${server.address().port}`));

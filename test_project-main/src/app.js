import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { categories, createTasks } from './tasks.js';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw Object.assign(new Error('JSON 형식으로 요청해 주세요.'), { status: 415 });
  }
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 8192) throw Object.assign(new Error('요청이 너무 큽니다.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error('올바른 JSON 객체가 필요합니다.'), { status: 400 });
  }
}

export function createApp(config) {
  let tasks = createTasks();
  const startedAt = new Date().toISOString();
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && pathname === '/healthz') {
        return json(res, 200, { status: 'ok', app: 'iris-demo-web', startedAt });
      }
      if (req.method === 'GET' && pathname === '/api/tasks') {
        return json(res, 200, { title: config.title, tasks });
      }
      if (req.method === 'POST' && pathname === '/api/tasks') {
        const body = await readJson(req);
        if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 100) {
          return json(res, 400, { error: '할 일은 1~100자로 입력해 주세요.' });
        }
        if (!categories.includes(body.category)) return json(res, 400, { error: '분류를 확인해 주세요.' });
        if (tasks.length >= 100) return json(res, 409, { error: '최대 100개까지 저장할 수 있어요.' });
        const task = { id: randomUUID(), title: body.title.trim(), category: body.category, done: false };
        tasks.unshift(task);
        return json(res, 201, { task });
      }
      const taskRoute = pathname.match(/^\/api\/tasks\/([a-z0-9-]+)$/);
      if (taskRoute && ['PATCH', 'DELETE'].includes(req.method)) {
        const task = tasks.find(item => item.id === taskRoute[1]);
        if (!task) return json(res, 404, { error: '할 일을 찾을 수 없어요.' });
        if (req.method === 'DELETE') {
          tasks = tasks.filter(item => item.id !== task.id);
          res.writeHead(204);
          return res.end();
        }
        const body = await readJson(req);
        if (typeof body.done !== 'boolean') return json(res, 400, { error: '완료 상태는 boolean이어야 합니다.' });
        task.done = body.done;
        return json(res, 200, { task });
      }
      if (req.method === 'GET' && assets.has(pathname)) {
        const [file, type] = assets.get(pathname);
        const content = await readFile(new URL('../public/' + file, import.meta.url));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        return res.end(content);
      }
      json(res, 404, { error: '페이지를 찾을 수 없어요.' });
    } catch (error) {
      if (!error.status) console.error('[request-error]', error.stack);
      if (!res.headersSent && !res.destroyed) json(res, error.status || 500, { error: error.status ? error.message : '서버에서 오류가 발생했어요.' });
    }
  });
  server.requestTimeout = 10000;
  return server;
}

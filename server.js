import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as provider from './providers/naver.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

// 같은 요청이 짧은 시간에 반복되면 네이버에 다시 묻지 않도록 하는 간단한 캐시
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + ttlMs });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function handleApi(url, res) {
  const p = url.pathname;

  if (p === '/api/quotes') {
    const codes = (url.searchParams.get('codes') ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter((c) => /^\d{6}$/.test(c))
      .slice(0, 50);
    const key = `q:${[...codes].sort().join(',')}`;
    return sendJson(res, 200, await cached(key, 2000, () => provider.getQuotes(codes)));
  }

  if (p === '/api/indices') {
    return sendJson(res, 200, await cached('indices', 2000, () => provider.getIndices()));
  }

  if (p === '/api/search') {
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 30);
    if (!q) return sendJson(res, 200, []);
    return sendJson(res, 200, await cached(`s:${q}`, 60_000, () => provider.search(q)));
  }

  const chart = p.match(/^\/api\/chart\/(\d{6})$/);
  if (chart) {
    const range = ['1d', '3m', '1y'].includes(url.searchParams.get('range'))
      ? url.searchParams.get('range')
      : '1d';
    const ttl = range === '1d' ? 30_000 : 10 * 60_000;
    return sendJson(
      res,
      200,
      await cached(`c:${chart[1]}:${range}`, ttl, () => provider.getChart(chart[1], range)),
    );
  }

  sendJson(res, 404, { error: 'not found' });
}

async function handleStatic(url, res) {
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(url, res);
    else await handleStatic(url, res);
  } catch (err) {
    console.error(err);
    sendJson(res, 502, { error: '시세 정보를 가져오지 못했습니다.' });
  }
});

server.listen(PORT, () => {
  console.log(`주식 보드 실행 중: http://localhost:${PORT}`);
});

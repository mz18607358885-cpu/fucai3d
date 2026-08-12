// fetch-3d.js — Netlify Function: 抓 17500.cn 3D 数据 + 直接返回
// 不写 GitHub,function 永远直接 return + Cache-Control 5 分钟
const https = require('https');
const http = require('http');

function httpGet(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('too many redirects'));
    const isHttps = url.startsWith('https://');
    const lib = isHttps ? https : http;
    const req = lib.get(url, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const next = res.headers.location;
        if (!next) return reject(new Error('redirect without location'));
        const nextUrl = next.startsWith('http') ? next : new URL(next, url).toString();
        return httpGet(nextUrl, redirectCount + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error('http ' + res.statusCode));
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseLastN(txt, n) {
  const lines = txt.trim().split('\n').filter(Boolean);
  const items = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const p = parts[0];
    const d = parts[1];
    const a = parseInt(parts[2], 10);
    const b = parseInt(parts[3], 10);
    const c = parseInt(parts[4], 10);
    if (isNaN(a) || isNaN(b) || isNaN(c)) continue;
    if (a < 0 || a > 9 || b < 0 || b > 9 || c < 0 || c > 9) continue;
    const sum = a + b + c;
    const span = Math.max(a, b, c) - Math.min(a, b, c);
    const type = (a === b || b === c || a === c) ? '组三' : '组六';
    items.push({ p, d, a, b, c, sum, span, type });
  }
  items.sort((x, y) => Number(y.p) - Number(x.p));
  return items.slice(0, n);
}

exports.handler = async (event) => {
  const start = Date.now();
  try {
    const txt = await httpGet('https://www.17500.cn/getData/3d.TXT');
    const items = parseLastN(txt, 5);
    if (items.length === 0) throw new Error('parse failed');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        fetchedAt: new Date().toISOString(),
        source: 'netlify-function-17500',
        count: items.length,
        data: items
      }, null, 2),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ ok: false, error: e.message }, null, 2),
    };
  }
};

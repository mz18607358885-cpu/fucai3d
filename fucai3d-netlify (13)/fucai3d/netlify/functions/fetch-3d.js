// fetch-3d.js — Netlify Function: 抓 17500.cn 3D 数据 + 多源 fallback
// v5.8.11:多源 + 短超时 + 无 cache
const https = require('https');
const http = require('http');

function httpGet(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) return reject(new Error('too many redirects'));
    const isHttps = url.startsWith('https://');
    const lib = isHttps ? https : http;
    const req = lib.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
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

// 多源(按优先级)
const SOURCES = [
  'https://www.17500.cn/getData/3d.TXT',
  'https://17500.cn/getData/3d.TXT',
  'http://www.17500.cn/getData/3d.TXT',
  'http://17500.cn/getData/3d.TXT'
];

async function fetchFrom17500() {
  for (const url of SOURCES) {
    try {
      const txt = await httpGet(url);
      if (txt && txt.length > 100) return { txt, source: '17500-' + (url.includes('https') ? 'https' : 'http') };
    } catch (e) {
      console.log('17500 try failed:', url, e.message);
    }
  }
  return null;
}

async function fetchFromGithub() {
  try {
    const txt = await httpGet('https://raw.githubusercontent.com/mz18607358885-cpu/fucai3d/main/fucai3d-netlify%20(13)/fucai3d/latest.json');
    const data = JSON.parse(txt);
    if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
      return { data: data.data, source: 'github-actions' };
    }
  } catch (e) {
    console.log('GitHub try failed:', e.message);
  }
  return null;
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
    if (p.length !== 7) continue;
    const sum = a + b + c;
    const span = Math.max(a, b, c) - Math.min(a, b, c);
    const type = (a === b || b === c || a === c) ? '组三' : '组六';
    items.push({ p, d, a, b, c, sum, span, type });
  }
  items.sort((x, y) => Number(y.p) - Number(x.p));
  return items.slice(0, n);
}

exports.handler = async (event) => {
  // v5.8.11:1. 优先直接抓 17500(多源,8s timeout) — 最新数据
  try {
    const r = await fetchFrom17500();
    if (r) {
      const items = parseLastN(r.txt, 5);
      if (items.length > 0) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60, must-revalidate',  // 1 分钟 cache
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            fetchedAt: new Date().toISOString(),
            source: r.source,
            count: items.length,
            data: items
          }, null, 2),
        };
      }
    }
  } catch (e) {
    console.warn('17500 all failed:', e.message);
  }

  // 2. Fallback: 读 GitHub Actions 抓的 latest.json
  try {
    const r = await fetchFromGithub();
    if (r) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          fetchedAt: new Date().toISOString(),
          source: r.source,
          count: r.data.length,
          data: r.data
        }, null, 2),
      };
    }
  } catch (e) {
    console.warn('GitHub fallback failed:', e.message);
  }

  // 3. 全部失败 — 返回错误
  return {
    statusCode: 500,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=30, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ ok: false, error: 'all sources failed' }, null, 2),
  };
};

// fetch-3d.js — Netlify Function: 优先读 GitHub Actions 抓的 latest.json + fallback 抓 17500.cn
// v5.8.11:Netlify AWS IP 抓不到 17500,改读 GitHub latest.json(国内抓的)
const https = require('https');
const http = require('http');

function httpGet(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error('too many redirects'));
    const isHttps = url.startsWith('https://');
    const lib = isHttps ? https : http;
    const req = lib.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
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
  // 1. 优先读 GitHub Actions 抓的 latest.json(GitHub Actions 跑在中国时区,能抓 17500)
  try {
    const rawUrl = 'https://raw.githubusercontent.com/mz18607358885-cpu/fucai3d/main/fucai3d-netlify%20(13)/fucai3d/latest.json';
    const txt = await httpGet(rawUrl);
    const data = JSON.parse(txt);
    if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=0, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          fetchedAt: new Date().toISOString(),
          source: 'github-actions-raw',
          count: data.data.length,
          data: data.data
        }, null, 2),
      };
    }
  } catch (e) {
    // GitHub 失败,fallback 抓 17500
    console.warn('GitHub fallback failed:', e.message);
  }

  // 2. Fallback: 直接抓 17500.cn(本地 OK,Netlify 可能超时)
  try {
    const txt = await httpGet('https://www.17500.cn/getData/3d.TXT');
    const items = parseLastN(txt, 5);
    if (items.length === 0) throw new Error('parse failed');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=0, must-revalidate',
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

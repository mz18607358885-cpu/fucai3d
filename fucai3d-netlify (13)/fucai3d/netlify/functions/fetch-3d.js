// fetch-3d.js — Netlify Function: 抓 17500.cn 3D 数据 + 推 GitHub
// 由 cron-job.org 每天 21:30 触发(或 workflow_dispatch 手动测试)
const https = require('https');
const http = require('http');

const GH_OWNER = process.env.GH_OWNER || 'mz18607358885-cpu';
const GH_REPO  = process.env.GH_REPO  || 'fucai3d';
const GH_TOKEN = process.env.GH_TOKEN;
const GH_BRANCH = 'main';
const GH_FILE = 'fucai3d-netlify (13)/fucai3d/latest.json';

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
      if (res.statusCode !== 200) {
        return reject(new Error('http ' + res.statusCode));
      }
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
  // 按期号降序
  items.sort((x, y) => Number(y.p) - Number(x.p));
  return items.slice(0, n);
}

function ghRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'User-Agent': 'netlify-function',
        'Authorization': `token ${GH_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
    };
    if (data) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request(opts, (res) => {
      let buf = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(buf);
          resolve({ status: res.statusCode, body: j });
        } catch (e) {
          resolve({ status: res.statusCode, body: buf });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function pushLatest(items) {
  if (!GH_TOKEN) throw new Error('GH_TOKEN env not set (len=' + (process.env.GH_TOKEN || '').length + ')');
  // 取文件 sha (if exists)
  let sha;
  const getRes = await ghRequest('GET', `/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(GH_FILE)}?ref=${GH_BRANCH}`);
  if (getRes.status === 200) sha = getRes.body.sha;
  console.log('[push] GET status=' + getRes.status + ' sha=' + (sha || 'none'));

  const content = {
    fetchedAt: new Date().toISOString(),
    source: 'netlify-function-17500',
    count: items.length,
    data: items,
  };
  const body = {
    message: 'auto: fetch-3d ' + new Date().toISOString(),
    content: Buffer.from(JSON.stringify(content, null, 2), 'utf-8').toString('base64'),
    branch: GH_BRANCH,
  };
  if (sha) body.sha = sha;
  console.log('[push] PUT body keys=' + Object.keys(body).join(','));
  const putRes = await ghRequest('PUT', `/repos/${GH_OWNER}/${GH_REPO}/contents/${encodeURIComponent(GH_FILE)}`, body);
  console.log('[push] PUT status=' + putRes.status);
  if (putRes.status >= 200 && putRes.status < 300) {
    const commitSha = (putRes.body && putRes.body.commit && putRes.body.commit.sha) || (typeof putRes.body === 'string' ? 'raw:' + putRes.body.slice(0,100) : 'no-commit');
    return { ok: true, commit: commitSha };
  }
  throw new Error('GitHub PUT failed: ' + putRes.status + ' ' + JSON.stringify(putRes.body).slice(0, 500));
}

exports.handler = async (event) => {
  const start = Date.now();
  const log = [];
  try {
    log.push(`[fetch-3d] start at ${new Date().toISOString()}`);

    // 1. 抓 17500
    const txt = await httpGet('https://www.17500.cn/getData/3d.TXT');
    log.push(`[fetch-3d] raw size: ${txt.length}`);

    // 2. 解析最后 5 期
    const items = parseLastN(txt, 5);
    if (items.length === 0) throw new Error('parse failed, no items');
    log.push(`[fetch-3d] parsed ${items.length} periods, latest ${items[0].p} = ${items[0].a} ${items[0].b} ${items[0].c}`);

    // 3. push GitHub
    const pushResult = await pushLatest(items);
    log.push(`[fetch-3d] push ok: ${pushResult.commit}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        duration_ms: Date.now() - start,
        latest: items[0],
        count: items.length,
        commit: pushResult.commit,
        log,
      }, null, 2),
    };
  } catch (e) {
    log.push(`[fetch-3d] ERROR: ${e.message}`);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        duration_ms: Date.now() - start,
        error: e.message,
        log,
      }, null, 2),
    };
  }
};

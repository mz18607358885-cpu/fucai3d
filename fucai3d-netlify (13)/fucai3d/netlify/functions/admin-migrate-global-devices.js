// Netlify Function:一次性回填 — 把所有 token 内部 devices 加到 globalDevices
// v5.8.7: 用于修复 v5.8.6 部署前的历史数据
// POST(无参)或 GET
// 返回: { ok, added: [...fp], skipped: [...fp] }
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const GH_TOKEN = process.env.GH_TOKEN;
  const GH_OWNER = process.env.GH_OWNER;
  const GH_REPO = process.env.GH_REPO;
  const GH_BRANCH = process.env.GH_BRANCH || 'main';
  const GH_PATH = process.env.GH_PATH || 'fucai3d-tokens.json';
  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, reason: '环境变量未配置' }) };
  }

  const apiBase = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`;
  const ref = `?ref=${encodeURIComponent(GH_BRANCH)}`;

  const getResp = await fetch(apiBase + ref, {
    headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json' }
  });
  if (!getResp.ok) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: `GitHub 读失败: ${getResp.status}` }) };
  }
  const data = await getResp.json();
  const sha = data.sha;
  const db = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  if (!db.globalDevices) db.globalDevices = {};
  if (!db.tokens) db.tokens = {};

  const added = [];
  const skipped = [];
  const now = new Date().toISOString();

  // 遍历所有 token,把所有 devices 里的 fp 加到 globalDevices
  Object.values(db.tokens).forEach(t => {
    if (!Array.isArray(t.devices)) return;
    t.devices.forEach(d => {
      if (!d.id) return;
      if (db.globalDevices[d.id]) {
        skipped.push(d.id);
        return;
      }
      db.globalDevices[d.id] = {
        first: d.first || now,
        last: d.last || now,
        role: 'sub'
      };
      added.push(d.id);
    });
  });

  if (added.length === 0) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, added: [], skipped, total: Object.keys(db.globalDevices).length, message: '没有需要回填的' }) };
  }

  // 写回
  const content = Buffer.from(JSON.stringify(db, null, 2), 'utf-8').toString('base64');
  const putBody = {
    message: `[fucai3d migrate] globalDevices 回填 ${added.length} 个 fp`,
    content,
    branch: GH_BRANCH,
    sha
  };
  const putResp = await fetch(apiBase, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(putBody)
  });
  if (!putResp.ok) {
    const txt = await putResp.text();
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: `GitHub 写失败: ${putResp.status} ${txt.substring(0, 100)}` }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, added, skipped, total: Object.keys(db.globalDevices).length }) };
};

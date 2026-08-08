// Netlify Function:删除 token
// POST { id: "vip-xxx" }
// 返回: { ok }
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, reason: '需要 POST' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
  const { id } = body;
  if (!id) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, reason: '参数错(需要 id)' }) };
  }

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
  if (getResp.status === 404) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, already: true }) };
  }
  if (!getResp.ok) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: `GitHub 读失败: ${getResp.status}` }) };
  }
  const data = await getResp.json();
  const sha = data.sha;
  const db = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  if (db.tokens && db.tokens[id]) {
    delete db.tokens[id];
  }
  const content = Buffer.from(JSON.stringify(db, null, 2), 'utf-8').toString('base64');
  const putBody = { message: `[fucai3d delete] ${id}`, content, branch: GH_BRANCH, sha };
  const putResp = await fetch(apiBase, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(putBody)
  });
  if (!putResp.ok) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: `GitHub 写失败: ${putResp.status}` }) };
  }
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};

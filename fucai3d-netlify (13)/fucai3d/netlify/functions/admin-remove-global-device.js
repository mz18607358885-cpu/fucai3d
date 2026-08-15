// Netlify Function:删除全局设备
// v5.8.6: 跨 token 共享的全局设备删除
// POST { fp: "fp_xxx" }
// 返回: { ok, removed }
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
  const { fp } = body;
  if (!fp) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, reason: '参数错(需要 fp)' }) };
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
  if (!getResp.ok) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: `GitHub 读失败: ${getResp.status}` }) };
  }
  const data = await getResp.json();
  const sha = data.sha;
  const db = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  if (!db.globalDevices) db.globalDevices = {};

  if (!db.globalDevices[fp]) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: '全局设备未找到' }) };
  }
  delete db.globalDevices[fp];

  // 同时也清掉所有 token 里这个 fp(避免数据冗余)
  let tokensCleaned = 0;
  if (db.tokens) {
    Object.values(db.tokens).forEach(t => {
      if (Array.isArray(t.devices)) {
        const before = t.devices.length;
        t.devices = t.devices.filter(d => d.id !== fp);
        if (t.devices.length < before) tokensCleaned++;
      }
    });
  }

  const content = Buffer.from(JSON.stringify(db, null, 2), 'utf-8').toString('base64');
  const putBody = {
    message: `[fucai3d remove-global-device] ${fp.slice(0, 12)} (清理 ${tokensCleaned} 个 token)`,
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
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, removed: fp, tokensCleaned }) };
};

// Netlify Function:一键清空 globalDevices(紧急用)
// v5.8.7: 当 fp 数量超限或数据不一致时清空
// POST 或 GET
// 返回: { ok, cleared: N }
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

  const cleared = Object.keys(db.globalDevices || {}).length;
  db.globalDevices = {};  // 清空 globalDevices
  // v5.8.7:同时清空所有 token 内部 devices 数组(避免回填逻辑把它们加回来)
  let tokensCleaned = 0;
  if (db.tokens) {
    Object.values(db.tokens).forEach(t => {
      if (Array.isArray(t.devices) && t.devices.length > 0) {
        tokensCleaned += t.devices.length;
        t.devices = [];
      }
    });
  }

  const content = Buffer.from(JSON.stringify(db, null, 2), 'utf-8').toString('base64');
  const putBody = {
    message: `[fucai3d clear-all] 清空 globalDevices(${cleared}) + token 内部(${tokensCleaned})`,
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
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, cleared, tokensCleaned }) };
};

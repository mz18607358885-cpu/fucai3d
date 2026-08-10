// Netlify Function:副链接验证
// POST { token: "vip-xxx", fp: "fp_xxx" }
// 返回: { ok, reason?, devices, maxDevices, isNewDevice }
exports.handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, reason: '需要 POST' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { body = {}; }
  const { token, fp } = body;
  if (!token || !fp) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, reason: '参数错(需要 token 和 fp)' }) };
  }
  if (!token.startsWith('vip-')) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'token 格式错' }) };
  }

  const GH_TOKEN = process.env.GH_TOKEN;
  const GH_OWNER = process.env.GH_OWNER;
  const GH_REPO = process.env.GH_REPO;
  const GH_BRANCH = process.env.GH_BRANCH || 'main';
  const GH_PATH = process.env.GH_PATH || 'fucai3d-tokens.json';

  if (!GH_TOKEN || !GH_OWNER || !GH_REPO) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, reason: 'Netlify 环境变量未配置 GH_TOKEN/GH_OWNER/GH_REPO' }) };
  }

  const apiBase = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`;
  const ref = `?ref=${encodeURIComponent(GH_BRANCH)}`;

  // GET
  const getResp = await fetch(apiBase + ref, {
    headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json' }
  });
  let db = { tokens: {} };
  let sha = null;
  if (getResp.status === 200) {
    const data = await getResp.json();
    sha = data.sha;
    db = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  } else if (getResp.status !== 404) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: `GitHub 读失败: ${getResp.status}` }) };
  }

  const t = (db.tokens || {})[token];
  if (!t) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'token 不存在或已被主链接删除' }) };
  }
  if (!Array.isArray(t.devices)) t.devices = [];

  // 设备检查
  const existing = t.devices.find(d => d.id === fp);
  let isNewDevice = false;
  if (existing) {
    existing.last = new Date().toISOString();
    existing.visits = (existing.visits || 0) + 1;
  } else {
    if (t.devices.length >= 3) {
      return { statusCode: 200, headers, body: JSON.stringify({
        ok: false, reason: `已达 3 台设备上限,无法在第 ${t.devices.length + 1} 台设备使用`,
        devices: t.devices.length, maxDevices: 3
      }) };
    }
    isNewDevice = true;
    t.devices.push({
      id: fp,
      first: new Date().toISOString(),
      last: new Date().toISOString(),
      visits: 1,
      ua: (event.headers['user-agent'] || '').substring(0, 80)
    });
  }

  // PUT 写回
  const newContent = Buffer.from(JSON.stringify(db, null, 2), 'utf-8').toString('base64');
  const putBody = { message: `[fucai3d verify] ${isNewDevice ? 'new device' : 'update'} ${fp.slice(0, 12)}`, content: newContent, branch: GH_BRANCH };
  if (sha) putBody.sha = sha;

  const putResp = await fetch(apiBase, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(putBody)
  });
  if (!putResp.ok) {
    const txt = await putResp.text();
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: `GitHub 写失败: ${putResp.status} ${txt.substring(0, 100)}` }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({
    ok: true,
    devices: t.devices.length,
    maxDevices: 3,
    isNewDevice,
    expires: '永久'
  }) };
};

// Netlify Function:副链接验证
// v5.8.6: 改为全局 fp 配额(1 浏览器 = 1 设备,不管开几个副链接)
// POST { token: "vip-xxx", fp: "fp_xxx" }
// 返回: { ok, reason?, devices, maxDevices, isNewDevice, globalDevices, globalMax }
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
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, reason: '环境变量未配置' }) };
  }

  const apiBase = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`;
  const ref = `?ref=${encodeURIComponent(GH_BRANCH)}`;

  // GET
  const getResp = await fetch(apiBase + ref, {
    headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json' }
  });
  let db = { tokens: {}, globalDevices: {} };  // v5.8.6:加 globalDevices
  let sha = null;
  if (getResp.status === 200) {
    const data = await getResp.json();
    sha = data.sha;
    db = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
    if (!db.globalDevices) db.globalDevices = {};  // 旧数据兼容
    if (!db.tokens) db.tokens = {};
  } else if (getResp.status !== 404) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: `GitHub 读失败: ${getResp.status}` }) };
  }

  const t = (db.tokens || {})[token];
  if (!t) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'token 不存在或已被主链接删除' }) };
  }
  if (!Array.isArray(t.devices)) t.devices = [];

  // ════════════════════════════════════════════════
  // v5.8.10:每个副链接独立 5 台(每 token 5 设备,不再共享)
  //   - 1 个 token 看自己 t.devices.length >= 5 → 拒绝
  //   - globalDevices 只用于显示/统计,不限流
  // ════════════════════════════════════════════════
  const GLOBAL_MAX = 5;
  const fpInGlobal = !!db.globalDevices[fp];
  const globalCount = Object.keys(db.globalDevices).length;

  // 设备检查(本 token 独立)
  const existing = t.devices.find(d => d.id === fp);
  let isNewDevice = false;
  if (existing) {
    existing.last = now;
    existing.visits = (existing.visits || 0) + 1;
  } else {
    if (t.devices.length >= GLOBAL_MAX) {
      return { statusCode: 200, headers, body: JSON.stringify({
        ok: false,
        reason: `本副链接已达 ${GLOBAL_MAX} 台设备上限(每个副链接独立),无法在第 ${t.devices.length + 1} 台设备使用`,
        devices: t.devices.length, maxDevices: GLOBAL_MAX,
        globalDevices: globalCount, globalMax: GLOBAL_MAX
      }) };
    }
    isNewDevice = true;
    t.devices.push({
      id: fp,
      first: now,
      last: now,
      visits: 1,
      ua: (event.headers['user-agent'] || '').substring(0, 80)
    });
  }

  // 全局表加/更新 fp
  const now = new Date().toISOString();
  if (!db.globalDevices[fp]) {
    db.globalDevices[fp] = { first: now, last: now, role: 'sub' };
  } else {
    db.globalDevices[fp].last = now;
  }
  // v5.8.7:自动回填 — 如果 fp 在 token 内部 devices 数组里(老数据)
  //   但不在 globalDevices,自动加(避免误算新设备)
  if (!db.globalDevices[fp] && t.devices.some(d => d.id === fp)) {
    // 找一个最早访问时间作为 first
    const oldDev = t.devices.find(d => d.id === fp);
    db.globalDevices[fp] = {
      first: oldDev && oldDev.first ? oldDev.first : now,
      last: now,
      role: 'sub'
    };
  }
  // v5.8.6:加完后再算全局设备数(避免 race condition)
  const finalGlobalCount = Object.keys(db.globalDevices).length;

  // 写回
  const newContent = Buffer.from(JSON.stringify(db, null, 2), 'utf-8').toString('base64');
  const putBody = { message: `[fucai3d verify] ${isNewDevice ? 'new global device' : 'update'} ${fp.slice(0, 12)}`, content: newContent, branch: GH_BRANCH };
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
    devices: t.devices.length,       // v5.8.10:本 token 设备数
    maxDevices: GLOBAL_MAX,         // 本 token 上限
    isNewDevice,                    // 对本 token 是否新设备
    globalDevices: finalGlobalCount,
    globalMax: GLOBAL_MAX,
    tokenDevices: t.devices.length,
    expires: '永久'
  }) };
};

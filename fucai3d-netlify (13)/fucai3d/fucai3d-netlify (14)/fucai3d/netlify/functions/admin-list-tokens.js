// Netlify Function:列出所有 token
// GET
// 返回: { tokens: { [id]: { id, created, devices: [...] } } }
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}?ref=${encodeURIComponent(GH_BRANCH)}`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json' } });
  if (resp.status === 404) {
    return { statusCode: 200, headers, body: JSON.stringify({ tokens: {}, _empty: true }) };
  }
  if (!resp.ok) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: `GitHub 读失败: ${resp.status}` }) };
  }
  const data = await resp.json();
  const db = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8'));
  return { statusCode: 200, headers, body: JSON.stringify(db) };
};

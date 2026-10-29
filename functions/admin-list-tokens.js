// functions/admin-list-tokens.js — 主链接列出所有副链接
// GET /functions/admin-list-tokens
//   返: { ok: true, tokens: { id1: {id, created, devices: [...]}, id2: ... } }

export async function onRequestGet(context) {
  const { env } = context;
  const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };

  if (!env.FC3D_TOKENS) {
    return new Response(JSON.stringify({ ok: false, reason: 'KV 未配置' }), { status: 500, headers: CORS });
  }

  // KV list 需要 prefix
  const tokens = {};
  try {
    const list = await env.FC3D_TOKENS.list({ prefix: 'token:' });
    for (const k of list.keys) {
      const data = await env.FC3D_TOKENS.get(k.name, { type: 'json' });
      if (data && data.id) {
        tokens[data.id] = data;
      }
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: 'KV 读取失败: ' + (e.message || e) }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ ok: true, tokens }), { headers: CORS });
}

export async function onRequest() {
  return new Response(JSON.stringify({ ok: false, reason: '需要 GET 请求' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
}

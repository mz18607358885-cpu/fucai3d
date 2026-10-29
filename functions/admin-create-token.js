// functions/admin-create-token.js — 主链接创建新副链接
// POST /functions/admin-create-token
//   body: {} (无参)
//   返: { ok: true, token: { id, created, devices: [] } }

export async function onRequestPost(context) {
  const { env } = context;
  const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };

  if (!env.FC3D_TOKENS) {
    return new Response(JSON.stringify({ ok: false, reason: 'KV 未配置' }), { status: 500, headers: CORS });
  }

  // 生成 token ID
  const id = 'vip-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const data = { id, created: new Date().toISOString(), devices: [] };

  try {
    await env.FC3D_TOKENS.put('token:' + id, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 90 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: 'KV 写入失败: ' + (e.message || e) }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ ok: true, token: data }), { headers: CORS });
}

export async function onRequest() {
  return new Response(JSON.stringify({ ok: false, reason: '需要 POST 请求' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
}

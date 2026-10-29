// functions/admin-delete-token.js — 主链接删除副链接
// POST /functions/admin-delete-token
//   body: { id: "vip-xxx" }
//   返: { ok: true } 或 { ok: false, reason }

export async function onRequestPost(context) {
  const { request, env } = context;
  const CORS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  };

  let body;
  try { body = await request.json(); } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: '请求体不是 JSON' }), { status: 400, headers: CORS });
  }

  const { id } = body || {};
  if (!id || !id.startsWith('vip-')) {
    return new Response(JSON.stringify({ ok: false, reason: '参数错(需要 vip- 开头的 id)' }), { status: 400, headers: CORS });
  }

  if (!env.FC3D_TOKENS) {
    return new Response(JSON.stringify({ ok: false, reason: 'KV 未配置' }), { status: 500, headers: CORS });
  }

  try {
    await env.FC3D_TOKENS.delete('token:' + id);
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: 'KV 删除失败: ' + (e.message || e) }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: CORS });
}

export async function onRequest() {
  return new Response(JSON.stringify({ ok: false, reason: '需要 POST 请求' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
}

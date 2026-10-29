// functions/admin-remove-device.js — 主链接删除 token 下的某个设备(让该设备能重新访问)
// POST /functions/admin-remove-device
//   body: { id: "vip-xxx", fp: "fp_xxx" }
//   返: { ok: true, removed: 1, remaining }

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

  const { id, fp } = body || {};
  if (!id || !id.startsWith('vip-') || !fp) {
    return new Response(JSON.stringify({ ok: false, reason: '参数错(需要 id 和 fp)' }), { status: 400, headers: CORS });
  }

  if (!env.FC3D_TOKENS) {
    return new Response(JSON.stringify({ ok: false, reason: 'KV 未配置' }), { status: 500, headers: CORS });
  }

  const kvKey = 'token:' + id;
  let data = null;
  try { data = await env.FC3D_TOKENS.get(kvKey, { type: 'json' }); } catch (e) {}
  if (!data) {
    return new Response(JSON.stringify({ ok: false, reason: 'token 不存在' }), { status: 404, headers: CORS });
  }

  const before = (data.devices || []).length;
  data.devices = (data.devices || []).filter(d => d && d.id !== fp);
  const removed = before - data.devices.length;

  try {
    await env.FC3D_TOKENS.put(kvKey, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 90 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: 'KV 写入失败: ' + (e.message || e) }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ ok: true, removed, remaining: data.devices.length }), { headers: CORS });
}

export async function onRequest() {
  return new Response(JSON.stringify({ ok: false, reason: '需要 POST 请求' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
}

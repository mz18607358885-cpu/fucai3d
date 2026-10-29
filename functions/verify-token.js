// functions/verify-token.js — Cloudflare Pages Function
// 真正 5 台设备/token 限制(用 Cloudflare KV 存 token 的 fp 列表)
// POST /functions/verify-token
//   body: { token: "vip-xxx", fp: "fp_xxx" }
//   返: { ok: true, devices, maxDevices:5, isNewDevice, expires } 或 { ok: false, reason }

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

  const { token, fp } = body || {};
  if (!token || !fp) {
    return new Response(JSON.stringify({ ok: false, reason: '参数错(需要 token 和 fp)' }), { status: 400, headers: CORS });
  }
  if (!token.startsWith('vip-')) {
    return new Response(JSON.stringify({ ok: false, reason: 'token 格式错(应以 vip- 开头)' }), { status: 400, headers: CORS });
  }

  if (!env.FC3D_TOKENS) {
    return new Response(JSON.stringify({ ok: false, reason: 'KV 未配置(管理员需要绑定 FC3D_TOKENS namespace)' }), { status: 500, headers: CORS });
  }

  const kvKey = 'token:' + token;
  let data = null;
  try { data = await env.FC3D_TOKENS.get(kvKey, { type: 'json' }); } catch (e) {}

  if (!data) {
    return new Response(JSON.stringify({ ok: false, reason: '副链接不存在或已被删除' }), { status: 404, headers: CORS });
  }

  const MAX = 5;
  const devices = Array.isArray(data.devices) ? data.devices : [];
  const idx = devices.findIndex(d => d && d.id === fp);
  const ua = request.headers.get('User-Agent') || '';
  const now = new Date().toISOString();

  if (idx >= 0) {
    // 已认识这台设备 — 更新 last/visits
    devices[idx].last = now;
    devices[idx].visits = (devices[idx].visits || 1) + 1;
  } else {
    // 新设备 — 检查上限
    if (devices.length >= MAX) {
      return new Response(JSON.stringify({
        ok: false,
        reason: '此副链接已达 ' + MAX + ' 台设备上限(请联系主链接所有者重置)',
        devices: devices.length,
        maxDevices: MAX
      }), { status: 403, headers: CORS });
    }
    devices.push({ id: fp, first: now, last: now, visits: 1, ua: ua.substring(0, 120) });
  }

  // 写回 KV(90 天过期 — 90 天没访问的 token 自动清理)
  data.devices = devices;
  try {
    await env.FC3D_TOKENS.put(kvKey, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 90 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, reason: 'KV 写入失败: ' + (e.message || e) }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({
    ok: true,
    devices: devices.length,
    maxDevices: MAX,
    isNewDevice: idx < 0,
    expires: '90 天(无访问则自动清理)'
  }), { headers: CORS });
}

export async function onRequest() {
  return new Response(JSON.stringify({ ok: false, reason: '需要 POST 请求' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
}

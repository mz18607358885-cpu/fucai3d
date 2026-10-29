// v5.7.7:Netlify Functions 后端
// 通过调用 Netlify Functions 操作 GitHub,PAT 存在 Netlify 环境变量,不暴露前端
window.FucaiNetlifyBackend = (function () {
  // Netlify Functions 路径(部署后自动可用)
  // 也可以通过自定义域名
  function getBase() {
    // v5.8.20:Cloudflare Pages 部署用根路径(Pages Functions 直接挂载,如 /verify-token)
    //         Netlify 用 /.netlify/functions
    const host = (window.location && window.location.hostname) || '';
    if (/\.pages\.dev$/i.test(host) || /\.workers\.dev$/i.test(host) || /\.cloudflarepages\.com$/i.test(host)) {
      return window.location.origin;
    }
    return window.location.origin + '/.netlify/functions';
  }
  async function call(name, method, body) {
    const url = getBase() + '/' + name;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    // 8s 超时 — Netlify Function 不可用时不会无限 hang
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    opts.signal = ctrl.signal;
    let resp;
    try {
      resp = await fetch(url, opts);
    } catch (e) {
      clearTimeout(timer);
      throw new Error('Netlify 函数 ' + name + ' 调用失败: ' + (e.message || e));
    }
    clearTimeout(timer);
    // HTTP 错误状态 → 抛错(让 tokenAuth 回退到本地)
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error('Netlify 函数 ' + name + ' HTTP ' + resp.status + ' (后端不可用): ' + text.substring(0, 100));
    }
    const text = await resp.text();
    try { return JSON.parse(text); }
    catch (e) { throw new Error('Netlify 函数 ' + name + ' 响应解析失败: ' + text.substring(0, 100)); }
  }

  // 副链接验证(POST)
  async function verifyToken(tokenId, deviceFp) {
    return await call('verify-token', 'POST', { token: tokenId, fp: deviceFp });
  }

  // 主链接:列出(GET)
  async function listTokens() {
    const db = await call('admin-list-tokens', 'GET');
    const list = Object.values(db.tokens || {});
    list.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    return list;
  }

  // 主链接:创建(POST)
  async function createToken() {
    const r = await call('admin-create-token', 'POST', {});
    return r.ok ? r.token : null;
  }

  // 主链接:删除(POST)
  async function deleteToken(id) {
    return await call('admin-delete-token', 'POST', { id });
  }

  // v5.8.4:删除 token 下的某个设备
  async function removeDevice(id, fp) {
    return await call('admin-remove-device', 'POST', { id, fp });
  }

  // v5.8.4:清空 token 下所有设备
  async function clearAllDevices(id) {
    const list = await listTokens();
    const t = list.find(x => x.id === id);
    if (!t || !t.devices) return { ok: false, reason: 'token 不存在' };
    const fps = t.devices.map(d => d.id);
    let removed = 0;
    for (const fp of fps) {
      const r = await call('admin-remove-device', 'POST', { id, fp });
      if (r.ok) removed++;
    }
    return { ok: true, removed, remaining: 0 };
  }

  // v5.8.6:获取全局设备列表(跨 token 共享)
  async function listGlobalDevices() {
    const r = await call('admin-list-global-devices', 'GET');
    return r.globalDevices || {};
  }

  // v5.8.6:删除全局设备(同时清所有 token 里的对应记录)
  async function removeGlobalDevice(fp) {
    return await call('admin-remove-global-device', 'POST', { fp });
  }

  // 检测后端是否可用(测试调一次 list)
  async function testConnection() {
    try {
      const db = await call('admin-list-tokens', 'GET');
      if (db && db.tokens) return { ok: true, count: Object.keys(db.tokens).length };
      if (db && db.ok === false) return { ok: false, reason: db.reason || '未知错误' };
      return { ok: true, count: 0 };
    } catch (e) {
      return { ok: false, reason: '网络错误: ' + e.message };
    }
  }

  return { verifyToken, listTokens, createToken, deleteToken, testConnection, getBase, removeDevice, clearAllDevices, listGlobalDevices, removeGlobalDevice };
})();

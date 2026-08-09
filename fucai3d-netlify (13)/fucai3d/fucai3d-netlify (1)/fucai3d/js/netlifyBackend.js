// v5.7.7:Netlify Functions 后端
// 通过调用 Netlify Functions 操作 GitHub,PAT 存在 Netlify 环境变量,不暴露前端
window.FucaiNetlifyBackend = (function () {
  // Netlify Functions 路径(部署后自动可用)
  // 也可以通过自定义域名
  function getBase() {
    // 默认使用当前 origin + .netlify/functions
    return window.location.origin + '/.netlify/functions';
  }
  async function call(name, method, body) {
    const url = getBase() + '/' + name;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    const text = await resp.text();
    try { return JSON.parse(text); }
    catch (e) { return { ok: false, reason: '响应解析失败: ' + text.substring(0, 200) }; }
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

  return { verifyToken, listTokens, createToken, deleteToken, testConnection, getBase };
})();

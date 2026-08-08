// v5.7.7:副链接授权管理(Netlify Functions 版)
// 通过 Netlify Functions 操作 GitHub,PAT 不暴露前端
// Fallback:无 Netlify Functions 时用 localStorage(单浏览器模式)
window.FucaiTokenAuth = (function () {
  const FP_KEY = 'fucai3d_my_fingerprint';
  const TOKEN_PREFIX = 'vip-';
  const MAX_DEVICES = 5;
  const BACKEND_KEY = 'fucai3d_backend_mode';  // 'netlify' | 'local'

  // 设备指纹
  function getDeviceFingerprint() {
    const stored = localStorage.getItem(FP_KEY);
    if (stored) return stored;
    const data = [
      navigator.userAgent || '',
      navigator.language || '',
      (screen.width || 0) + 'x' + (screen.height || 0) + 'x' + (screen.colorDepth || 0),
      new Date().getTimezoneOffset() || 0,
      navigator.hardwareConcurrency || 0,
      navigator.deviceMemory || 0,
      navigator.platform || '',
      navigator.vendor || ''
    ].join('|');
    let hash = 5381;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) + hash) + data.charCodeAt(i);
      hash |= 0;
    }
    const fp = 'fp_' + Math.abs(hash).toString(36) + Math.random().toString(36).slice(2, 6);
    try { localStorage.setItem(FP_KEY, fp); } catch (e) {}
    return fp;
  }

  // 后端模式
  function getMode() { return localStorage.getItem(BACKEND_KEY) || 'auto'; }
  function setMode(m) { localStorage.setItem(BACKEND_KEY, m); }
  function useNetlify() {
    const m = getMode();
    if (m === 'netlify') return true;
    if (m === 'local') return false;
    return !!(window.FucaiNetlifyBackend);
  }

  // 同步本地 fallback
  function _localGetAll() { try { return JSON.parse(localStorage.getItem('fucai3d_tokens') || '{}'); } catch (e) { return {}; } }
  function _localSaveAll(t) { try { localStorage.setItem('fucai3d_tokens', JSON.stringify(t)); } catch (e) {} }
  function _localCreate() {
    const id = TOKEN_PREFIX + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const tokens = _localGetAll();
    tokens[id] = { id, created: new Date().toISOString(), devices: [] };
    _localSaveAll(tokens);
    return tokens[id];
  }
  function _localDelete(id) { const t = _localGetAll(); delete t[id]; _localSaveAll(t); return true; }
  function _localList() { return Object.values(_localGetAll()).sort((a, b) => (b.created || '').localeCompare(a.created || '')); }
  function _localFind(q) {
    const all = _localList();
    if (!q) return all;
    return all.filter(t => (t.id || '').toLowerCase().includes(q.toLowerCase()));
  }
  function _localVerify(tokenId) {
    if (!tokenId || !tokenId.startsWith(TOKEN_PREFIX)) {
      return Promise.resolve({ ok: false, reason: 'token 格式错' });
    }
    const LOCAL_KEY = 'fucai3d_visited_tokens_local';
    let visited = {};
    try { visited = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch (e) {}
    if (visited[tokenId]) {
      visited[tokenId].last = new Date().toISOString();
      visited[tokenId].visits = (visited[tokenId].visits || 1) + 1;
    } else {
      const known = Object.keys(visited).length;
      if (known >= MAX_DEVICES) {
        return Promise.resolve({ ok: false, reason: '本浏览器已访问 ' + known + ' 个不同副链接,达到 5 个上限(清浏览器缓存可重置)', devices: known, maxDevices: MAX_DEVICES });
      }
      visited[tokenId] = { id: tokenId, first: new Date().toISOString(), last: new Date().toISOString(), visits: 1, ua: (navigator.userAgent || '').substring(0, 80) };
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(visited));
    return Promise.resolve({ ok: true, devices: Object.keys(visited).length, maxDevices: MAX_DEVICES, isNewDevice: visited[tokenId].visits === 1, expires: '永久' });
  }

  // 同步 API(主链接用,本地优先 + 异步刷 Netlify)
  function listTokens() {
    if (useNetlify()) {
      window.FucaiNetlifyBackend.listTokens().then(list => {
        const obj = {};
        list.forEach(t => { obj[t.id] = t; });
        _localSaveAll(obj);
      }).catch(e => console.warn('Netlify listTokens 失败,用本地', e));
    }
    return _localList();
  }
  function findTokens(q) {
    if (useNetlify()) {
      window.FucaiNetlifyBackend.listTokens().then(list => {
        const filtered = q ? list.filter(t => (t.id || '').toLowerCase().includes(q.toLowerCase())) : list;
        const obj = {};
        filtered.forEach(t => { obj[t.id] = t; });
        _localSaveAll(obj);
      }).catch(() => {});
    }
    return _localFind(q);
  }
  function createToken() {
    const t = _localCreate();
    if (useNetlify()) {
      window.FucaiNetlifyBackend.createToken().then(remoteT => {
        if (remoteT) {
          const all = _localGetAll();
          all[remoteT.id] = remoteT;
          _localSaveAll(all);
        }
      }).catch(e => console.warn('Netlify createToken 失败', e));
    }
    return t;
  }
  function deleteToken(id) {
    _localDelete(id);
    if (useNetlify()) {
      window.FucaiNetlifyBackend.deleteToken(id).catch(e => console.warn('Netlify deleteToken 失败', e));
    }
    return true;
  }
  function verifyToken(tokenId) { return _localVerify(tokenId); }

  // 异步 API(强制走 Netlify → 真跨用户)
  async function verifyTokenAsync(tokenId) {
    if (useNetlify() && window.FucaiNetlifyBackend) {
      const fp = getDeviceFingerprint();
      return await window.FucaiNetlifyBackend.verifyToken(tokenId, fp);
    }
    return _localVerify(tokenId);
  }
  async function listTokensAsync() {
    if (useNetlify() && window.FucaiNetlifyBackend) {
      const list = await window.FucaiNetlifyBackend.listTokens();
      const obj = {};
      list.forEach(t => { obj[t.id] = t; });
      _localSaveAll(obj);
      return list;
    }
    return _localList();
  }
  async function createTokenAsync() {
    if (useNetlify() && window.FucaiNetlifyBackend) {
      const t = await window.FucaiNetlifyBackend.createToken();
      if (t) {
        const all = _localGetAll();
        all[t.id] = t;
        _localSaveAll(all);
        return t;
      }
    }
    return _localCreate();
  }
  async function deleteTokenAsync(id) {
    if (useNetlify() && window.FucaiNetlifyBackend) {
      await window.FucaiNetlifyBackend.deleteToken(id);
    }
    _localDelete(id);
    return true;
  }
  async function findTokensAsync(q) {
    if (useNetlify() && window.FucaiNetlifyBackend) {
      return await window.FucaiNetlifyBackend.listTokens().then(list => q ? list.filter(t => (t.id || '').toLowerCase().includes(q.toLowerCase())) : list);
    }
    return _localFind(q);
  }
  async function testBackend() {
    if (!window.FucaiNetlifyBackend) return { ok: false, reason: 'NetlifyBackend 模块未加载' };
    return await window.FucaiNetlifyBackend.testConnection();
  }

  // 副链接 URL
  function makeSubUrl(tokenId) {
    const u = new URL(window.location.href);
    let p = u.pathname.replace(/\/index\.html?$/i, '');
    if (!p.endsWith('/')) p += '/';
    u.pathname = p + 'sub.html';
    u.search = '?token=' + encodeURIComponent(tokenId);
    return u.toString();
  }
  function getTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  }

  return {
    getDeviceFingerprint,
    createToken, deleteToken, listTokens, findTokens, verifyToken,
    createTokenAsync, deleteTokenAsync, listTokensAsync, findTokensAsync, verifyTokenAsync,
    testBackend,
    getMode, setMode, useNetlify,
    getTokenFromUrl, makeSubUrl,
    MAX_DEVICES, TOKEN_PREFIX
  };
})();

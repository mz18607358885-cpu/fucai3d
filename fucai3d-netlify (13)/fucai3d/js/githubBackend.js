// v5.7.6:GitHub 后端
// 把副链接 token 数据存到 GitHub repo,实现真"跨用户"管理
// 关键:副链接 URL 里嵌入 PAT(朋友浏览器可写 GitHub),真 5台 + 真删除
// ⚠️ 安全风险:PAT 暴露给副链接用户,只用专用 repo
window.FucaiGithubBackend = (function () {
  const CONFIG_KEY = 'fucai3d_gh_config';
  const DEFAULT_PATH = 'fucai3d-tokens.json';
  const DEFAULT_BRANCH = 'main';

  function getConfig() {
    try {
      const s = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      return {
        token: s.token || '',
        owner: s.owner || '',
        repo: s.repo || '',
        branch: s.branch || DEFAULT_BRANCH,
        path: s.path || DEFAULT_PATH
      };
    } catch (e) { return { token: '', owner: '', repo: '', branch: DEFAULT_BRANCH, path: DEFAULT_PATH }; }
  }
  function setConfig(cfg) { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); }
  function isConfigured() {
    const c = getConfig();
    return !!(c.token && c.owner && c.repo);
  }
  function clearConfig() { localStorage.removeItem(CONFIG_KEY); }

  // 用指定 cfg 调用 GitHub API
  async function apiWith(cfg, method, body) {
    if (!cfg.token || !cfg.owner || !cfg.repo) throw new Error('未配置 GitHub 后端');
    const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}`;
    const opts = {
      method,
      headers: {
        'Authorization': `Bearer ${cfg.token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      }
    };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`GitHub API ${resp.status}: ${txt.substring(0, 200)}`);
    }
    return await resp.json();
  }

  // 用本地配置调用
  async function api(method, body) {
    return await apiWith(getConfig(), method, body);
  }

  // 公开读(无需 PAT)
  async function publicReadWith(cfg) {
    if (!cfg.owner || !cfg.repo) throw new Error('未配置 owner/repo');
    const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cfg.path}?ref=${encodeURIComponent(cfg.branch)}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
    if (resp.status === 404) return { tokens: {}, _sha: null, _empty: true };
    if (!resp.ok) throw new Error(`GitHub read ${resp.status}`);
    const data = await resp.json();
    const content = atob(data.content.replace(/\n/g, ''));
    const parsed = JSON.parse(content);
    parsed._sha = data.sha;
    return parsed;
  }

  async function readTokensWith(cfg) {
    try {
      return await publicReadWith(cfg);
    } catch (e) {
      if (String(e.message).includes('404')) {
        return { tokens: {}, _sha: null, _empty: true };
      }
      throw e;
    }
  }

  async function writeTokensWith(db, cfg) {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(db, null, 2))));
    const body = {
      message: `[fucai3d] update tokens (${new Date().toISOString()})`,
      content,
      branch: cfg.branch
    };
    if (db._sha) body.sha = db._sha;
    return await apiWith(cfg, 'PUT', body);
  }

  async function readTokens() { return await readTokensWith(getConfig()); }
  async function writeTokens(db) { return await writeTokensWith(db, getConfig()); }
  async function publicRead() { return await publicReadWith(getConfig()); }

  async function testConnection() {
    const cfg = getConfig();
    if (!cfg.token) throw new Error('请先填 Token');
    if (!cfg.owner) throw new Error('请填 owner(用户名)');
    if (!cfg.repo) throw new Error('请填 repo 名');
    const userResp = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' }
    });
    if (!userResp.ok) {
      const txt = await userResp.text();
      throw new Error(`Token 无效: ${userResp.status} ${txt.substring(0, 100)}`);
    }
    const user = await userResp.json();
    const repoResp = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, {
      headers: { 'Authorization': `Bearer ${cfg.token}`, 'Accept': 'application/vnd.github+json' }
    });
    if (!repoResp.ok) throw new Error(`无法访问 repo ${cfg.owner}/${cfg.repo}: ${repoResp.status}`);
    const repo = await repoResp.json();
    return { user: user.login, repo: repo.full_name, defaultBranch: repo.default_branch };
  }

  async function createToken() {
    const id = 'vip-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const db = await readTokens();
    if (!db.tokens) db.tokens = {};
    db.tokens[id] = { id, created: new Date().toISOString(), devices: [] };
    await writeTokens(db);
    return db.tokens[id];
  }

  async function deleteToken(tokenId) {
    const db = await readTokens();
    if (db.tokens && db.tokens[tokenId]) {
      delete db.tokens[tokenId];
      await writeTokens(db);
    }
    return true;
  }

  async function listTokens() {
    const db = await readTokens();
    const list = Object.values(db.tokens || {});
    list.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    return list;
  }
  async function findTokens(query) {
    const list = await listTokens();
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(t => (t.id || '').toLowerCase().includes(q));
  }

  // ─── 核心:副链接验证(用 URL 里嵌入的 PAT 写 GitHub)───
  // 真 5台设备 + 真删除立即失效
  async function verifyWithGhToken(tokenId, deviceFp, cfg) {
    if (!tokenId || !tokenId.startsWith('vip-')) {
      return { ok: false, reason: 'token 格式错' };
    }
    if (!cfg || !cfg.token || !cfg.owner || !cfg.repo) {
      return { ok: false, reason: 'GitHub 后端未配置(URL 缺 gh 参数)' };
    }
    // 读
    let db;
    try { db = await readTokensWith(cfg); }
    catch (e) { return { ok: false, reason: 'GitHub 读取失败: ' + e.message }; }

    const t = (db.tokens || {})[tokenId];
    if (!t) {
      return { ok: false, reason: 'token 不存在或已被主链接删除' };
    }
    if (!Array.isArray(t.devices)) t.devices = [];

    // 设备检查
    const existing = t.devices.find(d => d.id === deviceFp);
    let isNewDevice = false;
    if (existing) {
      existing.last = new Date().toISOString();
      existing.visits = (existing.visits || 0) + 1;
    } else {
      if (t.devices.length >= 5) {
        return {
          ok: false,
          reason: `已达 5 台设备上限,无法在第 ${t.devices.length + 1} 台设备使用`,
          devices: t.devices.length,
          maxDevices: 5
        };
      }
      isNewDevice = true;
      t.devices.push({
        id: deviceFp,
        first: new Date().toISOString(),
        last: new Date().toISOString(),
        visits: 1,
        ua: (navigator.userAgent || '').substring(0, 80)
      });
    }
    // 写回(只有设备数变了才写)
    try {
      await writeTokensWith(db, cfg);
    } catch (e) {
      return { ok: false, reason: 'GitHub 写入失败: ' + e.message };
    }
    return {
      ok: true,
      devices: t.devices.length,
      maxDevices: 5,
      isNewDevice,
      expires: '永久'
    };
  }

  // 默认 verifyToken(读 only,per-browser)— 保留给没嵌 PAT 的旧链接
  async function verifyToken(tokenId, deviceFp) {
    if (!tokenId || !tokenId.startsWith('vip-')) {
      return { ok: false, reason: 'token 格式错' };
    }
    const cfg = getConfig();
    if (!cfg.owner || !cfg.repo) {
      return { ok: false, reason: '主链接未配置 GitHub 后端' };
    }
    let db;
    try { db = await publicReadWith(cfg); }
    catch (e) { return { ok: false, reason: 'GitHub 后端读取失败: ' + e.message }; }
    const t = (db.tokens || {})[tokenId];
    if (!t) return { ok: false, reason: 'token 不存在或已被主链接删除' };
    const knownDevices = Array.isArray(t.devices) ? t.devices.length : 0;
    // per-browser fallback
    const LOCAL_KEY = 'fucai3d_visited_tokens_gh';
    let visited = {};
    try { visited = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch (e) {}
    if (visited[tokenId]) {
      visited[tokenId].last = new Date().toISOString();
      visited[tokenId].visits = (visited[tokenId].visits || 1) + 1;
    } else {
      const known = Object.keys(visited).length;
      if (known >= 5) {
        return { ok: false, reason: `本浏览器已访问 ${known} 个不同副链接,达到 5 个上限(清浏览器缓存可重置)`, devices: known, maxDevices: 5 };
      }
      visited[tokenId] = { id: tokenId, first: new Date().toISOString(), last: new Date().toISOString(), visits: 1, ua: (navigator.userAgent || '').substring(0, 80) };
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(visited));
    return { ok: true, devices: Object.keys(visited).length, maxDevices: 5, isNewDevice: visited[tokenId].visits === 1, expires: '永久', remoteDevices: knownDevices };
  }

  return {
    getConfig, setConfig, isConfigured, clearConfig,
    testConnection, readTokens, writeTokens,
    createToken, deleteToken, listTokens, findTokens,
    verifyToken, verifyWithGhToken,
    publicRead
  };
})();

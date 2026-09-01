/**
 * 渲染主逻辑 - v3 多策略 + 多主题 + 定位复式
 *  Tab 1: 🗑 杀号池
 *  Tab 2: 💎 胆码池
 *  Tab 3: 🧠 智能选号(多策略 + 多约束 + 定位复式)
 *  详情区(折叠): 全部公式明细
 */
window.FucaiMain = (function () {
  const role = window.FUcaiPageRole || 'main';
  const data = window.FucaiData;

  let _result = null;
  let _killPool = null;
  let _danPool = null;
  let _heatMap = null;
  let _learnStats = null;  // v5.8 自学习结果
  let _pairMap = null;
  let _activeTab = 'kill';
  let _historyRange = 30; // 历史数据 Tab 显示的期数
  let _btMinRate = 30;    // 高置信度角标门槛(30=基准,35/40/45/50)
  let _shareQuery = '';   // v5.7.1:副链接查询关键词
  let _pickState = {
    type: 'zu6',       // v5.8.15:默认只要组六(号码不重复),更符合用户预期
    count: 5,
    strategies: ['A', 'B'],
    oddEven: 'mixed',  // 不限
    bigSmall: 'mixed', // 不限
    spanMin: 0,
    spanMax: 9,
    loose: false,      // 严格
    highConfOnly: false,  // v5.7.16:用全部公式
    killContain: [],   // v5.8+:杀组选(0-9 多选,含此数的全部排除)
    last: null
  };
  // 定位复式
  let _fushiState = {
    bai: '1,3',
    shi: '2,4',
    ge:  '5,7',
    last: null
  };
  // 主题
  let _theme = localStorage.getItem('fucai3d_theme') || 'gold';

  // v5.7:用户手动杀号(localStorage 持久化,跨刷新保留)
  function getUserKills() {
    try {
      const v = localStorage.getItem('fucai3d_user_kills');
      return v ? JSON.parse(v) : [];
    } catch (e) { return []; }
  }
  function addUserKill(code) {
    const arr = getUserKills();
    if (!arr.includes(code)) { arr.push(code); localStorage.setItem('fucai3d_user_kills', JSON.stringify(arr)); }
  }
  function removeUserKill(code) {
    const arr = getUserKills().filter(x => x !== code);
    localStorage.setItem('fucai3d_user_kills', JSON.stringify(arr));
  }
  function clearUserKills() { localStorage.setItem('fucai3d_user_kills', JSON.stringify([])); }

  // v5.7.14:用户反对系统杀(系统杀的真排除,用户可以否决 → 恢复成候选)
  function getUserAntiKills() {
    try { return JSON.parse(localStorage.getItem('fucai3d_user_anti_kills') || '[]'); }
    catch (e) { return []; }
  }
  function addUserAntiKill(code) {
    const arr = getUserAntiKills();
    if (!arr.includes(code)) { arr.push(code); localStorage.setItem('fucai3d_user_anti_kills', JSON.stringify(arr)); }
  }
  function removeUserAntiKill(code) {
    const arr = getUserAntiKills().filter(x => x !== code);
    localStorage.setItem('fucai3d_user_anti_kills', JSON.stringify(arr));
  }
  function clearUserAntiKills() { localStorage.setItem('fucai3d_user_anti_kills', JSON.stringify([])); }

  // v5.7:选号收藏(localStorage 持久化)
  // v5.8.6:加载全局设备列表(主链接管理界面用)
  async function loadGlobalDevices() {
    const box = $('globalDevicesList');
    const summary = $('globalDeviceSummary');
    if (!box) return;
    box.textContent = '加载中...';
    try {
      if (!window.FucaiNetlifyBackend) {
        box.innerHTML = '<div style="color:var(--text-3);">⚠️ Netlify 后端不可用</div>';
        if (summary) summary.textContent = '⚠️ 后端不可用';
        return;
      }
      const map = await window.FucaiNetlifyBackend.listGlobalDevices();
      window.__globalDevicesMap = map;  // v5.8.6:存全局,token 列表用
      const list = Object.entries(map).sort((a, b) => (b[1].last || b[1].first).localeCompare(a[1].last || a[1].first));
      // 顶部摘要(v5.8.10:每 token 独立 5 台,这里只显示统计供参考)
      if (summary) {
        const count = list.length;
        summary.innerHTML = `🌐 全局 <b style="color:#f3c969;">${count}</b> 个设备已登入(每 token 独立 5 台)`;
      }
      if (list.length === 0) {
        box.innerHTML = '<div style="color:var(--text-3);">还没有任何设备登入(等人开副链接就显示)</div>';
        return;
      }
      box.innerHTML = `
        <div style="font-size:12px;color:var(--text-2);margin-bottom:8px;">
          📊 全局 <b style="color:#f3c969;">${list.length}</b> 台设备(1 浏览器 = 1 设备,仅参考用 · v5.8.10 每 token 独立 5 台)
        </div>
        <div style="max-height:200px;overflow-y:auto;">
          ${list.map(([fp, info]) => {
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:rgba(0,0,0,.2);border-radius:4px;margin-bottom:4px;font-size:11px;">
              <div style="flex:1;">
                <div style="color:var(--text-3);font-family:monospace;">${fp}</div>
                <div style="color:var(--text-3);margin-top:2px;">首次: ${new Date(info.first).toLocaleString('zh-CN')} · 最近: ${new Date(info.last || info.first).toLocaleString('zh-CN')}</div>
              </div>
              <button class="opt-btn xs" data-gd-rm="${fp}" style="background:rgba(255,80,96,.15);color:#ff5060;padding:3px 8px;" title="删除此全局设备(同时清所有 token 里的对应记录)">🗑</button>
            </div>`;
          }).join('')}
        </div>
      `;
      // 绑定删除按钮
      document.querySelectorAll('[data-gd-rm]').forEach(b => {
        b.addEventListener('click', async () => {
          const fp = b.dataset.gdRm;
          if (!confirm(`删除全局设备 ${fp}?\n该设备开任何副链接都需要重新登入(消耗 1 个新设备名额)。`)) return;
          try {
            const r = await window.FucaiNetlifyBackend.removeGlobalDevice(fp);
            if (r.ok) {
              toast(`🗑 全局设备已删除(清理了 ${r.tokensCleaned} 个 token)`);
              loadGlobalDevices();
            } else {
              toast('❌ 删除失败: ' + (r.reason || '未知'));
            }
          } catch (e) {
            toast('❌ 网络错误: ' + (e.message || e));
          }
        });
      });
      // v5.8.6:重新渲染 token 列表(让状态/计数同步)
      const tokenList = $('tokenList');
      if (tokenList && typeof renderShareBox === 'function') {
        // 用最新的 token 数据 + 全局 map 重渲染
        const newList = window.FucaiTokenAuth.listTokens() || [];
        const listHTML = newList.map(t => {
          const subURL = window.FucaiTokenAuth.makeSubUrl(t.id);
          const tokenDeviceCount = t.devices.length;
          const globalMap = window.__globalDevicesMap || {};
          const globalCount = Object.keys(globalMap).length;
          const globalMax = 5;
          const activeFpInToken = (t.devices || []).filter(d => globalMap[d.id]).length;
          const orphanFpInToken = tokenDeviceCount - activeFpInToken;
          // v5.8.11 修:状态基于本 token 设备数(v5.8.10 每 token 独立 5 台)
          const status = tokenDeviceCount >= 5 ? 'full' : (tokenDeviceCount >= 3 ? 'warn' : 'ok');
          const statusEmoji = { ok: '🟢', warn: '🟡', full: '🔴' }[status];
          const statusColor = { ok: '#6ef09e', warn: '#f3c969', full: '#ff5060' }[status];
          const usageClass = status === 'full' ? 'rgba(255,80,96,.2)' : (status === 'warn' ? 'rgba(243,201,105,.2)' : 'rgba(110,240,158,.15)');
          // 简版:只刷 row 头部(状态 + 计数)
          const row = document.querySelector(`[data-tid="${t.id}"] > div:first-child`);
          if (row) {
            row.innerHTML = `
              <span title="状态: ${status === 'ok' ? '正常' : (status === 'warn' ? '快满' : '已满')}" style="font-size:14px;">${statusEmoji}</span>
              <span style="font-family:monospace;font-size:13px;color:#6ef09e;font-weight:bold;">${t.id}</span>
              <span style="font-size:11px;background:rgba(110,240,158,.3);color:#6ef09e;padding:2px 6px;border-radius:4px;">永久</span>
              <span style="font-size:11px;color:var(--text-3);">${new Date(t.created).toLocaleDateString()}</span>
              <span title="本 token ${tokenDeviceCount}/5 · 全局 ${globalCount}/${globalMax}" style="font-size:12px;background:${usageClass};color:${statusColor};padding:3px 8px;border-radius:4px;margin-left:auto;font-weight:bold;">📱 ${tokenDeviceCount}/5</span>
              <button class="opt-btn xs" data-tok-expand="${t.id}">展开</button>
              <button class="opt-btn xs" data-tok-copy="${subURL}">📋</button>
              <button class="opt-btn xs" data-tok-del="${t.id}" style="background:rgba(255,80,96,.2);color:#ff5060;">🗑</button>
            `;
            // 重新绑定 row 里的按钮
            row.querySelectorAll('[data-tok-expand],[data-tok-copy],[data-tok-del]').forEach(btn => {
              if (btn.dataset.bound) return;
              btn.dataset.bound = '1';
              if (btn.dataset.tokExpand) {
                btn.addEventListener('click', () => {
                  const detail = document.querySelector(`[data-tok-detail="${btn.dataset.tokExpand}"]`);
                  if (detail) {
                    const isOpen = detail.style.display !== 'none';
                    detail.style.display = isOpen ? 'none' : 'block';
                    btn.textContent = isOpen ? '展开' : '收起';
                  }
                });
              }
              if (btn.dataset.tokCopy) {
                btn.addEventListener('click', () => {
                  navigator.clipboard.writeText(btn.dataset.tokCopy).then(() => toast('📋 已复制'));
                });
              }
              if (btn.dataset.tokDel) {
                btn.addEventListener('click', () => {
                  const tid = btn.dataset.tokDel;
                  if (confirm(`确认删除副链接 ${tid} ?\n删除后,持有该链接的人将无法访问系统。`)) {
                    window.FucaiTokenAuth.deleteToken(tid);
                    toast('🗑 副链接已删除');
                    render();
                  }
                });
              }
            });
          }
        }).filter(Boolean).join('');
      }
    } catch (e) {
      box.innerHTML = '<div style="color:#ff5060;">❌ 加载失败: ' + (e.message || e) + '</div>';
    }
  }

  function getFavorites() {
    try { return JSON.parse(localStorage.getItem('fucai3d_favorites') || '[]'); }
    catch (e) { return []; }
  }
  function addFavorite(item) {
    const arr = getFavorites();
    item.id = Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    item.time = new Date().toISOString();
    arr.unshift(item);
    localStorage.setItem('fucai3d_favorites', JSON.stringify(arr));
    return item;
  }
  function removeFavorite(id) {
    const arr = getFavorites().filter(f => f.id !== id);
    localStorage.setItem('fucai3d_favorites', JSON.stringify(arr));
  }
  function clearFavorites() { localStorage.setItem('fucai3d_favorites', JSON.stringify([])); }

  function $(id) { return document.getElementById(id); }
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function toast(msg, duration) {
    const t = el(`<div class="toast">${msg}</div>`);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), duration || 1800);
  }

  // v5.8.9 统一复制到剪贴板(clipboard API + fallback),**返回 Promise 以兼容 .then()**
  function copyToClipboard(text, successMsg) {
    successMsg = successMsg || '📋 已复制';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        () => { toast(successMsg); return true; },
        () => fallbackCopy(text, successMsg)
      );
    }
    return Promise.resolve(fallbackCopy(text, successMsg));
  }
  function fallbackCopy(text, successMsg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast(successMsg);
    } catch (e) {
      toast('❌ 复制失败,请手动选择');
    }
    ta.remove();
  }

  // ─── 主题应用 ───
  function applyTheme(name) {
    _theme = name;
    document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();
    document.body.classList.add('theme-' + name);
    localStorage.setItem('fucai3d_theme', name);
  }

  // v5.7.3:实时同步状态指示器
  function updateLiveStatus() {
    const el = $('liveStatus');
    if (!el) return;
    if (!window.FucaiAutoUpdater) { el.textContent = '🔴 模块未加载'; el.style.color = '#ff5060'; return; }
    const last = window.FucaiAutoUpdater.lastSuccess();
    if (!last) {
      el.textContent = '🟡 等待数据';
      el.style.background = 'rgba(243,201,105,.15)';
      el.style.color = '#f3c969';
      el.style.borderColor = 'rgba(243,201,105,.3)';
      return;
    }
    const sec = Math.floor((Date.now() - last) / 1000);
    let timeText;
    if (sec < 60) timeText = `${sec}秒前`;
    else if (sec < 3600) timeText = `${Math.floor(sec / 60)}分前`;
    else timeText = `${Math.floor(sec / 3600)}小时前`;
    el.textContent = `🟢 已同步 · ${timeText}`;
    el.style.background = 'rgba(110,240,158,.15)';
    el.style.color = '#6ef09e';
    el.style.borderColor = 'rgba(110,240,158,.3)';
  }

  // ─── 头部(带主题切换器) ───
  function renderHeader() {
    const subInfo = role === 'main' ? '<span class="tag">完整版</span>' : '';
    const themes = [
      { id: 'gold',   name: '烫金', color: '#f3c969' },
      { id: 'blue',   name: '蓝白', color: '#5fa8ff' },
      { id: 'red',    name: '红金', color: '#ff5060' },
      { id: 'purple', name: '紫黑', color: '#b070ff' },
      { id: 'green',  name: '绿金', color: '#50d090' }
    ];
    return `
      <div class="topbar">
        <div>
          <span class="brand">🎯 福彩3D 智能杀号专业版系统</span>
          ${subInfo}
        </div>
        <div class="topbar-right">
          <span class="tag live-status" id="liveStatus" style="background:rgba(110,240,158,.15);color:#6ef09e;border-color:rgba(110,240,158,.3);">🟢 实时同步</span>
          <span class="tag" id="dataCount">载入中</span>
          <div class="theme-switch" title="切换主题">
            ${themes.map(t => `
              <button class="theme-dot ${_theme === t.id ? 'active' : ''}"
                      data-theme="${t.id}" style="--dot:${t.color};" title="${t.name}"></button>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function bindTheme() {
    document.querySelectorAll('.theme-dot').forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });
    // 启动时应用已保存主题
    applyTheme(_theme);
  }

  // ─── Hero / 倒计时 / 数据条 ───
  function renderHero() {
    const last = data.history[0];
    const lastSum = last.a + last.b + last.c;
    const lastSpan = Math.max(last.a, last.b, last.c) - Math.min(last.a, last.b, last.c);
    return `
      <div class="hero">
        <div class="hero-row1">
          <div class="hero-period">已开最新期 <strong>${last.p}</strong> · ${last.d}</div>
          <div class="hero-period">下一期待开 <strong>${data.next.period}</strong> · ${data.next.drawTime.slice(0, 10)}</div>
        </div>
        <div class="balls">
          <div class="ball">${last.a}</div>
          <div class="ball">${last.b}</div>
          <div class="ball">${last.c}</div>
        </div>
        <div class="hero-stats">
          <span>和值<strong>${lastSum}</strong></span>
          <span>跨度<strong>${lastSpan}</strong></span>
          <span>百位<strong>${last.a}</strong></span>
          <span>十位<strong>${last.b}</strong></span>
          <span>个位<strong>${last.c}</strong></span>
        </div>
      </div>
    `;
  }

  function renderCountdown() {
    return `
      <div class="countdown" id="countdownBox">
        <div class="countdown-text">⏱ 距 <strong style="color:var(--accent)">${data.next.period}</strong> 期开奖</div>
        <div class="countdown-time" id="cdTime">-- 时 -- 分 -- 秒</div>
      </div>
    `;
  }

  function renderDataBar() {
    return `
      <div class="block data-bar">
        <div class="data-bar-inner">
          <div class="data-bar-text">
            ✅ 数据已实时同步 · 共 <strong>${data.history.length}</strong> 期历史 · 下一期 <strong>${data.next.period}</strong> 倒计时中
          </div>
          <button class="share-btn" id="refreshBtn" style="background:linear-gradient(135deg,#6ef09e,#2dba6d);">
            🔄 手动刷新数据
          </button>
        </div>
      </div>
    `;
  }

  function renderTabBar() {
    const tabs = [
      { id: 'kill', icon: '🎯', label: '选号池', sub: '按百/十/个汇总' },
      { id: 'dan',  icon: '💎', label: '胆码池', sub: '按百/十/个汇总' },
      { id: 'pick', icon: '🧠', label: '智能选号', sub: '多策略 + 复式' },
      { id: 'hist', icon: '📊', label: '历史数据', sub: '走势 + 统计' }
    ];
    return `
      <div class="tab-bar tab-bar-4">
        ${tabs.map(t => `
          <div class="tab-btn ${_activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">
            <div class="tab-icon">${t.icon}</div>
            <div class="tab-label">${t.label}</div>
            <div class="tab-sub">${t.sub}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ─── 杀号池 ───
  function renderKillPool() {
    const kp = _killPool;
    const col = (title, list, all, high, bestFormula) => {
      // v5.8.11 按位回测:rate 越高,chip 越"高置信"
      const codes = list.map(x => {
        const cls = x.rate >= 92 ? 'hot' : (x.rate >= 90 ? 'mid' : '');
        const sup = `<sup>${x.rate.toFixed(1)}%</sup>`;
        return `<span class="kill-code ${cls}" title="${x.names.join(', ')}">${x.code}${sup}</span>`;
      }).join('');
      return `
        <div class="pool-col">
          <h4><span class="dot"></span>${title} <span class="pool-meta">公式 ${list.length} 项</span></h4>
          ${bestFormula ? `<div style="font-size:11px;color:#6ef09e;margin-bottom:6px;font-weight:bold;">⭐ 推荐关注: ${bestFormula.name} (${bestFormula.rate.toFixed(2)}%)</div>` : ''}
          <div class="pool-row">
            <span class="pool-label">本位杀:</span>
            <div class="pool-codes">${codes || '<span class="empty-tag">无</span>'}</div>
          </div>
          ${high.length ? `<div class="pool-highlight">🔥 该位高置信度(≥92%): ${high.map(x => `${x.code}(${x.rate.toFixed(1)}%)`).join('、')}</div>` : ''}
        </div>
      `;
    };

    // v5.8.11 找每位最佳公式
    function findBestFormula(pos) {
      const rateKey = pos + 'Rate';
      let best = null;
      Object.entries(FucaiFormula.BACKTEST).forEach(([name, bt]) => {
        if (bt[rateKey] == null) return;
        // 只看主杀号公式(权重 ≥ 1.0)
        if ((bt.weight || 0) < 1.0) return;
        if (!best || bt[rateKey] > best.rate) {
          best = { name, rate: bt[rateKey] };
        }
      });
      return best;
    }
    const bestBai = findBestFormula('bai');
    const bestShi = findBestFormula('shi');
    const bestGe  = findBestFormula('ge');

    return `
      <div class="block">
        <div class="block-title">🎯 选号池 <span class="badge">v5.8.11 · 220 期按位回测</span></div>
        <div style="background:linear-gradient(135deg,rgba(110,240,158,.08),rgba(255,141,141,.08));border:1px solid rgba(110,240,158,.3);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:12px;color:var(--text-2);line-height:1.8;">
          <div style="color:#6ef09e;font-weight:bold;font-size:13px;margin-bottom:6px;">🎯 220 期真实回测 · 定位杀才是真准!</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">
            <div style="background:rgba(0,0,0,.2);padding:6px 8px;border-radius:6px;">
              <b style="color:#6ef09e;">选百位</b> · 最佳 ${bestBai ? `<span style="color:#ff8d8d;font-weight:bold;">${bestBai.rate.toFixed(2)}%</span> ${bestBai.name}` : '—'}<br>
              <span style="font-size:10px;color:#888;">理论随机 90%</span>
            </div>
            <div style="background:rgba(0,0,0,.2);padding:6px 8px;border-radius:6px;">
              <b style="color:#6ef09e;">选十位</b> · 最佳 ${bestShi ? `<span style="color:#ff8d8d;font-weight:bold;">${bestShi.rate.toFixed(2)}%</span> ${bestShi.name}` : '—'}<br>
              <span style="font-size:10px;color:#888;">理论随机 90%</span>
            </div>
            <div style="background:rgba(0,0,0,.2);padding:6px 8px;border-radius:6px;border:1px solid rgba(255,141,141,.5);">
              <b style="color:#ff8d8d;">⭐ 选个位</b> · 最佳 ${bestGe ? `<span style="color:#6ef09e;font-weight:bold;font-size:13px;">${bestGe.rate.toFixed(2)}%</span> ${bestGe.name}` : '—'}<br>
              <span style="font-size:10px;color:#888;">理论随机 90% · 最高!</span>
            </div>
          </div>
          <div style="font-size:11px;color:#888;border-top:1px dashed rgba(110,240,158,.2);padding-top:6px;">
            📌 <b style="color:#ff8d8d;">chip 上 %</b> = 该号在该位的 220 期回测杀对率(单公式 200 期数据,理论 90%)<br>
            <span style="color:#ff8d8d;font-weight:bold;">⭐ = 强发光</span> ≥92%(强推荐) · <span style="color:#f3c969;font-weight:bold;">● = 中等</span> 90-92% · 无标记 = 90% 附近<br>
            ⚠️ <b>不是 100%</b>:3D 1000 注本质 ≈ 随机,定位杀只是 <b>减少 30-50% 注数</b>,不是稳定盈利
          </div>
        </div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:14px;">
          📐 <strong>方案 C 流程</strong>:<br>
          ① <strong style="color:#ff5060;">杀(排除)</strong>:十位轴 3 数(单号杀对率 82.31% ≈ 随机,3数全杀对率 57.14% 略高)+ 杀和尾 + 选对率<25% 的杀号公式 → 排除 ~3-5 个号<br>
          ② <strong style="color:#6ef09e;">选(加权)</strong>:在剩余 ~5-7 个号里,按"高置信度选号 ×1.5 / 中置信度 ×1.0 / 胆码 ×1.5 / 热号 ×1.2"加权<br>
          📊 49 期回测:<strong>整注命中 0.45%</strong>(v5.0 的 0% → v5.3 的 0.45%,首次出现)
        </div>
        <div class="pool-grid">
          ${col('选 百 位', kp.bai, kp.global, kp.baiHigh, bestBai)}
          ${col('选 十 位', kp.shi, kp.global, kp.shiHigh, bestShi)}
          ${col('⭐ 选 个 位', kp.ge,  kp.global, kp.geHigh, bestGe)}
        </div>
        ${renderExcludeBlock(_result)}
        ${renderAxisBlock(_result)}
        <div class="pool-extra">
          <div class="extra-col">
            <div class="extra-label">🎯 选和尾(×5)</div>
            <div class="tag-list">${(kp.killHeWei || []).map(c => `<div class="code-tag" style="background:rgba(110,240,158,.15);color:#6ef09e;">${(c+5)%10}</div>`).join('')}</div>
          </div>
          <div class="extra-col">
            <div class="extra-label">📐 跨度参考</div>
            <div class="tag-list">${(kp.killKuaDu || []).map(c => `<div class="code-tag gray">${c}</div>`).join('')}</div>
          </div>
        </div>
      </div>
    `;
  }

  // ─── 排除集合(方案 C 杀号部分)区块 ───
  function renderExcludeBlock(result) {
    const { axis, sumSpan, ctx, kills } = result;
    if (!axis || !ctx) return '';
    // ①十位轴 axisNumbers
    const axisNums = axis.axisNumbers || [];
    // ②杀和尾
    const killHeWei = sumSpan.killHeWei || [];
    // ③选对率 < 25% 的全局通杀公式输出
    const lowSelectCodes = (kills || []).filter(k => {
      const bt = FucaiFormula.BACKTEST[k.name];
      return bt && bt.level === 'low' && bt.base === 30;
    });
    // 合并去重
    const allEx = [...new Set([...axisNums, ...killHeWei, ...lowSelectCodes.map(k => k.code)])];
    return `
      <div class="block" style="background:rgba(255,80,96,.05);border:1px solid rgba(255,80,96,.2);margin-top:14px;">
        <div class="block-title">🚫 排除集合<span class="badge">方案 C 杀号部分 · 这些号 0% 概率被选</span></div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.8;">
          📐 <strong>排除逻辑</strong>:根据 49 期真实回测,把"真准杀号"的输出排除(避开真不常出的号)<br>
          <div style="margin-top:8px;">
            <span style="color:#ff5060;font-weight:600;">①十位轴 axisNumbers:</span>
            ${axisNums.map(n => `<span class="code-tag" style="background:rgba(255,80,96,.15);color:#ff5060;margin:2px;">${n}</span>`).join('')}
            <span style="font-size:11px;color:var(--text-3);">(单号杀对率 82.31% ≈ 80% 随机 · 3数全杀对率 57.14% 略高基准 46.67% · 实际意义有限)</span>
          </div>
          <div style="margin-top:6px;">
            <span style="color:#ff5060;font-weight:600;">②杀和尾(原始):</span>
            ${killHeWei.map(n => `<span class="code-tag" style="background:rgba(255,80,96,.15);color:#ff5060;margin:2px;">${n}</span>`).join('')}
            <span style="font-size:11px;color:var(--text-3);">(3 个,按"杀"语义)</span>
          </div>
          ${lowSelectCodes.length ? `
            <div style="margin-top:6px;">
              <span style="color:#ff5060;font-weight:600;">③选对率<25% 杀号公式输出(LOW 级别,真准):</span>
              ${lowSelectCodes.map(k => `<span class="code-tag" style="background:rgba(255,80,96,.1);color:#ff5060;margin:2px;">${k.code}<sup style="font-size:9px;">${k.name.slice(0,4)}</sup></span>`).join('')}
              <span style="font-size:11px;color:var(--text-3);">(${lowSelectCodes.length} 个)</span>
            </div>
          ` : ''}
          <div style="margin-top:10px;padding:8px;background:rgba(255,80,96,.05);border-radius:6px;">
            <strong style="color:#ff5060;">合计排除 ${allEx.length} 个号:</strong>
            ${allEx.sort((a,b)=>a-b).map(n => `<span class="code-tag" style="background:rgba(255,80,96,.2);color:#ff5060;border:1px solid rgba(255,80,96,.4);margin:2px;font-weight:bold;">${n}</span>`).join('')}
            <span style="font-size:11px;color:var(--text-3);margin-left:8px;">→ 剩余 ${10 - allEx.length} 个号进入"加权"阶段</span>
          </div>
        </div>
      </div>
    `;
  }

  // ─── 十位轴选 + 杀两码 双显示区块 ───
  function renderAxisBlock(result) {
    const { axis, ctx } = result;
    if (!axis || !ctx) return '';
    const axisNums = axis.axisNumbers || [];
    const killPairs = axis.killPairs || [];
    return `
      <div class="block" style="background:linear-gradient(135deg,rgba(243,201,105,.05),rgba(255,80,96,.05));border:1px solid rgba(243,201,105,.2);margin-top:14px;">
        <div class="block-title">🔥 十位轴 · 双显示<span class="badge">49 期回测真准 · 上期十位 B = ${ctx.B}</span></div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.8;margin-bottom:12px;">
          <strong style="color:#f3c969;">📐 公式</strong>:基于上期十位 B,算 (B-1, B+1, B+2) = 3 个数,组成 3 对("十位+个位"组合)
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <!-- 杀对子 -->
          <div style="background:rgba(255,80,96,.08);padding:12px;border-radius:8px;border:1px solid rgba(255,80,96,.2);">
            <div style="font-size:13px;font-weight:600;color:#ff5060;margin-bottom:6px;">
              🚫 杀两码(避开这 3 对)
              <span style="font-size:11px;background:rgba(255,80,96,.2);padding:2px 6px;border-radius:4px;margin-left:4px;">杀对率 96.60%</span>
            </div>
            <div style="font-size:14px;font-weight:bold;color:#ff5060;">
              ${killPairs.map(p => `<span class="code-tag" style="background:rgba(255,80,96,.15);color:#ff5060;border:1px solid rgba(255,80,96,.3);margin:2px;">${p}</span>`).join('')}
            </div>
            <div style="font-size:11px;color:var(--text-3);margin-top:6px;">
              ⚠️ 49 期里这 3 对实际只出现 3.40%(理论 6.67%),避开了 50%<br>
              ✅ 选号时避开这 3 对,组六可选范围从 120 → 117
            </div>
          </div>
          <!-- 选单号 -->
          <div style="background:rgba(110,240,158,.08);padding:12px;border-radius:8px;border:1px solid rgba(110,240,158,.2);">
            <div style="font-size:13px;font-weight:600;color:#6ef09e;margin-bottom:6px;">
              🎯 选 axisNumbers(十位/个位候选)
              <span style="font-size:11px;background:rgba(110,240,158,.2);padding:2px 6px;border-radius:4px;margin-left:4px;">选对率 17.69%</span>
            </div>
            <div style="font-size:18px;font-weight:bold;color:#6ef09e;">
              ${axisNums.map(n => `<span class="code-tag" style="background:rgba(110,240,158,.15);color:#6ef09e;border:1px solid rgba(110,240,158,.3);margin:2px;font-size:16px;">${n}</span>`).join('')}
            </div>
            <div style="font-size:11px;color:var(--text-3);margin-top:6px;">
              ⚠️ 49 期里 axisNumbers 3 数中,平均 <strong style="color:#6ef09e;">0.53 个</strong> 出现在下期十/个位<br>
              ❌ 选对率 17.69% < 20% 随机基准 → 不建议单纯用作"选号"
            </div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-3);margin-top:10px;text-align:center;">
          💡 <strong>建议</strong>:3 对杀号(对子杀对率 96.60%)优先用,axisNumbers 单号杀对率 82.31% ≈ 随机,谨慎用
        </div>
      </div>
    `;
  }

  // ─── 胆码池 ───
  function renderDanPool() {
    const dp = _danPool;
    // v5.8.15:从定位杀取 92%+ 数字,该位与胆码冲突的标红
    const kp = _killPool;
    const posKillMap = { bai: new Set(), shi: new Set(), ge: new Set() };
    if (kp) {
      ['bai', 'shi', 'ge'].forEach(pos => {
        (kp[pos] || []).forEach(x => { if (x.rate >= 92) posKillMap[pos].add(x.code); });
      });
    }
    const posName = { bai: '百位', shi: '十位', ge: '个位' };
    const posKey = { bai: 'bai', shi: 'shi', ge: 'ge' };
    const col = (title, list, posKeyName) => {
      const items = list.map(x => {
        const conflicted = posKillMap[posKeyName].has(x.code);
        // 冲突号:用整块红色背景 + 强 ⛔ 图标(替代 chip 上的小角标,更清晰)
        if (conflicted) {
          return `<div class="dan-pool-item" style="border:2px solid #ff5060;background:rgba(255,80,96,.15);border-radius:6px;padding:5px 8px;margin-bottom:4px;display:flex;align-items:center;gap:8px;">
            <span style="background:#ff5060;color:#fff;width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;flex-shrink:0;">${x.code}</span>
            <span style="font-size:11px;color:var(--text-2);flex:1;">${x.src.join(' / ')}</span>
            <span title="定位杀 ≥92% 也杀这个号 → 选号时自动剔除" style="background:#ff5060;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:bold;flex-shrink:0;">⛔ 杀</span>
          </div>`;
        }
        // 正常号:原 chip 样式
        return `<div class="dan-pool-item">
          <span class="dan-pool-ball">${x.code}</span>
          <span class="dan-pool-src">${x.src.join(' / ')}</span>
        </div>`;
      }).join('');
      // 统计冲突
      const conflictCount = list.filter(x => posKillMap[posKeyName].has(x.code)).length;
      const conflictHint = conflictCount > 0 ? `<span style="font-size:11px;color:#ff5060;font-weight:bold;margin-left:8px;background:rgba(255,80,96,.15);padding:2px 8px;border-radius:4px;">⛔ ${conflictCount} 个被定位杀剔除</span>` : '';
      return `
        <div class="pool-col">
          <h4><span class="dot"></span>${title}${conflictHint}</h4>
          <div class="dan-pool-list">${items || '<span class="empty-tag">无候选</span>'}</div>
        </div>
      `;
    };
    // 总冲突汇总
    const allDanCodes = new Set([...dp.bai, ...dp.shi, ...dp.ge].map(x => x.code));
    const conflictSummary = [];
    for (const [pos, killSet] of Object.entries(posKillMap)) {
      const c = [...allDanCodes].filter(n => killSet.has(n));
      if (c.length > 0) conflictSummary.push({ pos: posName[pos], codes: c });
    }
    return `
      <div class="block">
        <div class="block-title">💎 胆码池 <span class="badge">按 百 / 十 / 个 三位汇总</span></div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:14px;">
          智能选号会<strong style="color:var(--dan);">优先</strong>从下方号码里挑选。<span style="color:#ff8d8d;">⛔ 红框 = 被定位杀 ≥92% 剔除(不会作为胆码)</span>
        </div>
        ${conflictSummary.length > 0 ? `<div style="margin-bottom:10px;padding:10px 14px;background:linear-gradient(90deg,rgba(255,80,96,.15),rgba(255,80,96,.05));border:2px solid #ff5060;border-radius:8px;font-size:13px;color:#ff8d8d;display:flex;align-items:center;gap:10px;">
          <span style="background:#ff5060;color:#fff;width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">⛔</span>
          <div style="flex:1;">
            <div style="font-weight:bold;margin-bottom:2px;">${conflictSummary.length} 位与定位杀冲突</div>
            <div style="font-size:11px;color:#ccc;">${conflictSummary.map(c => `<b style="color:#fff;">${c.pos}</b> 剔除 ${c.codes.join('、')}`).join(' · ')} · 系统已自动剔除(不影响选号)</div>
          </div>
        </div>` : ''}
        <div class="pool-grid">
          ${col('百位胆码', dp.bai, 'bai')}
          ${col('十位胆码', dp.shi, 'shi')}
          ${col('个位胆码', dp.ge, 'ge')}
        </div>
        <div class="pool-highlight" style="background:rgba(110,240,158,.1);border-color:rgba(110,240,158,.3);color:var(--dan);">
          🎯 主胆 = <strong>${dp.mainDan}</strong>(来自 2 个保留独胆公式)
          &nbsp;·&nbsp; 全部独立胆码 = ${[...new Set(dp.all)].join('、')}
        </div>
      </div>
    `;
  }

  // ─── 智能选号(多策略 + 多约束 + 定位复式) ───
  function renderSmartPick() {
    const kp = _killPool;
    // v5.7 方案 B:候选 = 0-9 - 真排除集 - 用户手动杀号
    //   真排除集 = axisNumbers(3) + 上期十位直接杀(1)
    //   用户手动杀号 = 候选号点击加入(可点回恢复)
    //   候选 = 剩下的号
    //   加权在候选内区分:胆码/HIGH 1.5,默认 1.0,冷号 0.5
    const axisNums = (kp.axis && kp.axis.axisNumbers) || [];
    const shiqiweiKill = (kp.kills || [])
      .filter(k => k.name === '上期十位直接杀')
      .map(k => k.code);
    const realExclude = new Set([...axisNums, ...shiqiweiKill]);
    const userKills = new Set(getUserKills());  // 用户手动杀号
    const userAntiKills = new Set(getUserAntiKills());  // v5.7.14:用户反对系统杀
    // v5.7.19:反对 ≠ 恢复成候选,反对 = 标记"我反对这个号被杀",但**选号时不选**
    //   候选 = 0-9 - 真正的排除(系统杀,含反对标记的) - 用户手动杀
    //   反对的号 显示在"反对区"(虚线橙黄),不进绿色候选
    const allExclude = new Set([...realExclude, ...userKills]);
    const candidates = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => !allExclude.has(n));
    const restBai = [...candidates];
    const restShi = [...candidates];
    const restGe  = [...candidates];
    // 反对的号(从 realExclude 反对的,或额外的)— 仍属于"被杀"(算法继续杀),只换样式
    const antiRestored = new Set([...realExclude].filter(n => userAntiKills.has(n)));
    // 剩余系统杀(未被反对的)
    const realExcludeRemaining = new Set([...realExclude].filter(n => !userAntiKills.has(n)));

    // exBai/exShi/exGe 保留(供"被杀"展示,跟 fushi 兼容)
    const exBai = new Set([
      ...(kp.baiAll || []).map(x => x.code),
      ...(kp.killHeWei || []),
      ...(kp.killKuaDu || [])
    ]);
    const exShi = new Set([
      ...(kp.shiAll || []).map(x => x.code),
      ...(kp.killHeWei || []),
      ...(kp.killKuaDu || [])
    ]);
    const exGe = new Set([
      ...(kp.geAll || []).map(x => x.code),
      ...(kp.killHeWei || []),
      ...(kp.killKuaDu || [])
    ]);

    // 提示标签
    const excludeInfo = `排除集:axis[${axisNums.join(',')}] + 上期十位[${shiqiweiKill.join(',')}]`;

    // v5.8.15:候选/被杀 chip 视觉强化(加图标 + 显眼配色)
    const candSpan = (n) => `<span class="opt-code" data-uk-add="${n}" title="✓ 候选号 · 点击 → 加入我的杀号(会排除)" style="cursor:pointer;background:rgba(110,240,158,.15);border:2px solid #6ef09e;color:#6ef09e;font-weight:bold;padding:2px 8px;display:inline-flex;align-items:center;gap:2px;"><span style="font-size:9px;opacity:.7;">✓</span>${n}</span>`;
    const myKillSpan = (n) => `<span class="opt-code killed" data-uk-rm="${n}" title="🗑 我的杀号 · 点击 → 恢复候选" style="cursor:pointer;background:rgba(255,80,96,.2);border:2px solid #ff5060;color:#ff5060;font-weight:bold;padding:2px 8px;display:inline-flex;align-items:center;gap:2px;text-decoration:line-through;"><span style="font-size:9px;">🗑</span>${n}</span>`;
    const realKillSpan = (n) => `<span class="opt-code killed" data-anti-rm="${n}" title="🚫 系统杀 · 点击 → 我反对(恢复成候选)" style="cursor:pointer;background:rgba(255,80,96,.12);border:2px dashed #ff5060;color:#ff5060;font-weight:bold;padding:2px 8px;display:inline-flex;align-items:center;gap:2px;"><span style="font-size:9px;">🚫</span>${n}</span>`;
    // v5.8.15:已反对/已恢复 → 绿虚线 + 白字(操作反馈:已表态)
    const antiSpan = (n) => `<span class="opt-code anti-recovered" data-anti-rm="${n}" title="✅ 已反对系统杀 · 点击 → 取消反对" style="cursor:pointer;background:rgba(110,240,158,.25);border:2px dashed #6ef09e;color:#fff;font-weight:bold;padding:2px 8px;display:inline-flex;align-items:center;gap:2px;box-shadow:0 0 6px rgba(110,240,158,.4);"><span style="font-size:9px;color:#6ef09e;">✅</span>${n}</span>`;
    const restoredSpan = (n) => `<span class="opt-code anti-recovered" data-uk-rm="${n}" title="✅ 已恢复候选 · 点击 → 重新加入我的杀号" style="cursor:pointer;background:rgba(110,240,158,.25);border:2px dashed #6ef09e;color:#fff;font-weight:bold;padding:2px 8px;display:inline-flex;align-items:center;gap:2px;box-shadow:0 0 6px rgba(110,240,158,.4);"><span style="font-size:9px;color:#6ef09e;">✅</span>${n}</span>`;
    const codeList = (arr) => arr.map(candSpan).join('') || '<span class="empty-tag">无</span>';
    const killList = (set, useMineSpan) => Array.from(set).sort().map(n => useMineSpan(n)).join('');
    const isLow = restBai.length <= 3 || restShi.length <= 3 || restGe.length <= 3;

    // ─── 多策略多选 ───
    const strat = (id, label, hint) => {
      const checked = _pickState.strategies.includes(id) ? 'checked' : '';
      return `
        <label class="check-card ${checked ? 'on' : ''}">
          <input type="checkbox" data-strategy="${id}" ${checked}>
          <span class="check-mark"></span>
          <span class="check-info">
            <span class="check-id">${id}</span>
            <span class="check-label">${label}</span>
            <span class="check-hint">${hint}</span>
          </span>
        </label>
      `;
    };

    // ─── 形态单选 ───
    const typeBtn = (val, label) => `<button class="opt-btn ${_pickState.type === val ? 'active' : ''}" data-pick-type="${val}">${label}</button>`;
    const countBtn = (val) => `<button class="opt-btn ${_pickState.count === val ? 'active' : ''}" data-pick-count="${val}">${val} 注</button>`;

    // ─── 奇偶/大小单选 ───
    const oeBtn = (val, label) => `<button class="opt-btn small ${_pickState.oddEven === val ? 'active' : ''}" data-oe="${val}">${label}</button>`;
    const bsBtn = (val, label) => `<button class="opt-btn small ${_pickState.bigSmall === val ? 'active' : ''}" data-bs="${val}">${label}</button>`;

    // 跨度选择
    const spanBtns = [];
    for (let i = 0; i <= 9; i++) {
      const on = (i >= _pickState.spanMin && i <= _pickState.spanMax);
      spanBtns.push(`<button class="opt-btn xs ${on ? 'on' : ''}" data-span="${i}">${i}</button>`);
    }

    // ─── 上一轮结果 ───
    let lastHTML = '';
    if (_pickState.last && _pickState.last.picks.length) {
      const p = _pickState.last;
      const allPicksText = p.picks.map(x => `${x.a}${x.b}${x.c}`).join(' ');
      lastHTML = `
        <div class="pick-result">
          <div class="pick-result-title">
            <span>🎯 已生成 ${p.actual} 注 · 策略 ${(p.strategies || ['随机']).join('+')}</span>
            <span style="display:flex;gap:6px;">
              <button class="opt-btn small" data-copy-all="${allPicksText}" title="复制全部 5 注(空格分隔)">📋 复制</button>
              <button class="opt-btn small" data-fav-all='${JSON.stringify(p.picks).replace(/'/g, "&apos;")}' title="收藏全部 5 注到收藏夹">⭐ 收藏</button>
              <button class="opt-btn small" id="regenBtn">↻ 重新生成</button>
            </span>
          </div>
          <div class="pick-list">
            ${p.picks.map((x, i) => `
              <div class="pick-row" title="复制 ${x.a}${x.b}${x.c}">
                <span class="pick-idx">#${String(i + 1).padStart(2, '0')}</span>
                <span class="pick-ball">${x.a}</span>
                <span class="pick-ball">${x.b}</span>
                <span class="pick-ball">${x.c}</span>
                <span class="pick-reason">${x.reason}</span>
                <button class="opt-btn xs" data-copy-one="${x.a}${x.b}${x.c}" title="复制 ${x.a}${x.b}${x.c}" style="padding:2px 6px;font-size:11px;">📋</button>
                <button class="opt-btn xs" data-fav-one='${JSON.stringify([x]).replace(/'/g, "&apos;")}' title="收藏 ${x.a}${x.b}${x.c}" style="padding:2px 6px;font-size:11px;">⭐</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (_pickState.last && _pickState.last.picks.length === 0) {
      lastHTML = `
        <div class="pick-result warn">
          <div class="pick-result-title">⚠️ 候选过少,无法生成符合所有约束的号码</div>
          <div style="font-size:12px;color:var(--text-2);">建议:取消某些策略勾选、放松奇偶/大小限制、放宽跨度范围。</div>
        </div>
      `;
    }

    // ─── 定位复式 ───
    // 自动计算笛卡尔积大小
    const parse = s => (s || '').split(/[,，\s]+/).map(x => x.trim()).filter(x => /^[0-9]$/.test(x)).map(Number);
    const fBai = parse(_fushiState.bai);
    const fShi = parse(_fushiState.shi);
    const fGe  = parse(_fushiState.ge);
    const fCount = fBai.length * fShi.length * fGe.length;

    let fushiHTML = '';
    if (_fushiState.last && _fushiState.last.picks.length) {
      fushiHTML = `
        <div class="pick-result" style="margin-top:12px;">
          <div class="pick-result-title">
            <span>📦 定位复式 已生成 ${_fushiState.last.picks.length} 注</span>
            <button class="opt-btn small" id="fushiRegenBtn">↻ 重新展开</button>
          </div>
          <div class="pick-list">
            ${_fushiState.last.picks.slice(0, 100).map((x, i) => `
              <div class="pick-row">
                <span class="pick-idx">#${String(i + 1).padStart(3, '0')}</span>
                <span class="pick-ball">${x.a}</span>
                <span class="pick-ball">${x.b}</span>
                <span class="pick-ball">${x.c}</span>
                <span class="pick-reason">${x.reason}</span>
              </div>
            `).join('')}
            ${_fushiState.last.picks.length > 100 ? `<div style="font-size:12px;color:var(--text-2);text-align:center;padding:8px;">仅展示前 100 注,共 ${_fushiState.last.picks.length} 注</div>` : ''}
          </div>
        </div>
      `;
    }

    return `
      <div class="block">
        <div class="block-title">🧠 智能选号 <span class="badge">系统自动选</span></div>
        ${_result && _result.typePredict && _result.typePredict.triggers && _result.typePredict.triggers.length > 0 ? (() => {
          const tp = _result.typePredict;
          const recMap = { zu3: '组三', zu6: '组六', mixed: '不限', baozi: '豹子' };
          const recEmoji = { zu3: '🎯', zu6: '🎯', mixed: '✨', baozi: '🐆' };
          const recColor = { zu3: '#f3c969', zu6: '#6ef09e', mixed: '#888', baozi: '#a78bfa' };
          const recText = tp.recommend || 'mixed';
          const bestTrig = tp.triggers.reduce((best, t) => (!best || t.rate > best.rate) ? t : best, null);
          return `<div style="background:linear-gradient(135deg,rgba(110,240,158,.12),rgba(243,201,105,.06));border:1px solid rgba(110,240,158,.35);border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="font-size:24px;">${recEmoji[recText]}</div>
            <div style="flex:1;min-width:200px;">
              <div style="font-size:12px;color:var(--text-3);margin-bottom:2px;">🔮 v5.8.13 预测下期形态(220 期回测)</div>
              <div style="font-size:16px;font-weight:bold;color:${recColor[recText]};">
                预测开 <span style="font-size:19px;">${recMap[recText]}</span>
                ${recText === 'zu3' ? '<span style="font-size:11px;color:#888;font-weight:normal;">(3 数有重复,270 注)</span>' : ''}
                ${recText === 'zu6' ? '<span style="font-size:11px;color:#888;font-weight:normal;">(3 数各不相同,720 注)</span>' : ''}
              </div>
              ${bestTrig ? `<div style="font-size:11px;color:var(--text-2);margin-top:3px;">主要依据: <b style="color:${bestTrig.lift >= 10 ? '#6ef09e' : '#f3c969'};">${bestTrig.name}</b> <span style="color:#888;">(${bestTrig.rate.toFixed(2)}% · +${bestTrig.lift.toFixed(2)})</span></div>` : ''}
            </div>
            <details style="font-size:11px;color:var(--text-3);cursor:pointer;">
              <summary style="color:#f3c969;list-style:none;padding:4px 8px;background:rgba(0,0,0,.2);border-radius:4px;">展开 ${tp.triggers.length} 条 ▼</summary>
              <div style="margin-top:6px;max-width:340px;">
                ${tp.triggers.map(t => `<div style="padding:4px 6px;background:rgba(0,0,0,.2);border-radius:4px;margin-bottom:3px;display:flex;justify-content:space-between;gap:8px;">
                  <span>${t.name}</span>
                  <span><b style="color:${t.lift >= 10 ? '#6ef09e' : (t.lift >= 5 ? '#f3c969' : '#c8b890')};">${t.rate.toFixed(2)}%</b> <span style="color:#888;font-size:10px;">+${t.lift.toFixed(2)}</span></span>
                </div>`).join('')}
              </div>
            </details>
          </div>`;
        })() : ''}
        <div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:14px;">
          勾选策略(可多选),系统会基于最近 30 期历史自动选<strong>形态/奇偶/大小/跨度</strong>。生成结果仅供娱乐参考。
        </div>

        <!-- 候选数提示 -->
        <div class="mode-row">
          ${isLow ? `
            <div class="candidate-warn" style="background:rgba(255,80,96,.1);border:1px solid rgba(255,80,96,.3);">
              <strong style="color:#ff5060;">⚠️ 候选不足</strong><br>
              百 ${restBai.length} / 十 ${restShi.length} / 个 ${restGe.length} — 系统可选号码较少<br>
              <span style="font-size:11px;color:var(--text-3);">建议:减少策略 / 取消杀号</span>
            </div>
          ` : `
            <div class="candidate-ok">
              ✅ 候选充足 (百${restBai.length}/十${restShi.length}/个${restGe.length})
            </div>
          `}
        </div>

        <!-- 策略多选(v5.7.17:已删,直接用备选号随机选) -->

        <!-- v5.7.21:形态/奇偶/大小/跨度(直接显示,美化) -->
        <div class="block pick-constraints" style="margin-top:12px;background:linear-gradient(135deg,rgba(110,240,158,.04),rgba(243,201,105,.04));border:1px solid rgba(110,240,158,.15);border-radius:10px;padding:14px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.06);">
            <span style="font-size:14px;font-weight:600;color:var(--accent);">🎛️ 选号约束</span>
            <span style="font-size:11px;color:var(--text-3);margin-left:auto;">不选 = 不限</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:14px;">
            <div>
              <div class="opt-mini-label" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">📐 形态</div>
              <div class="opt-row" style="flex-wrap:wrap;gap:6px;">
                ${typeBtn('zu6', '组六')}
                ${typeBtn('zu3', '组三')}
                ${typeBtn('dan', '单选')}
                ${typeBtn('mixed', '混合')}
              </div>
            </div>
            <div>
              <div class="opt-mini-label" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">🔢 奇偶(百·十·个)</div>
              <div class="opt-row" style="flex-wrap:wrap;gap:6px;">
                ${oeBtn('ooo', '奇奇奇')}
                ${oeBtn('eee', '偶偶偶')}
                ${oeBtn('ooe', '奇奇偶')}
                ${oeBtn('eeo', '偶偶奇')}
                ${oeBtn('mixed', '不限')}
              </div>
            </div>
            <div>
              <div class="opt-mini-label" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">📏 大小(大=5-9 · 小=0-4)</div>
              <div class="opt-row" style="flex-wrap:wrap;gap:6px;">
                ${bsBtn('bbb', '大大大')}
                ${bsBtn('sss', '小小小')}
                ${bsBtn('bbs', '大大小')}
                ${bsBtn('ssb', '小小大')}
                ${bsBtn('mixed', '不限')}
              </div>
            </div>
            <div>
              <div class="opt-mini-label" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span>📊 跨度(0-9)</span>
                <span style="font-size:11px;color:var(--text-3);font-weight:normal;">· 当前 <strong style="color:var(--dan);">${_pickState.spanMin} ~ ${_pickState.spanMax}</strong> · 点 = 选范围</span>
              </div>
              <div class="opt-row" style="flex-wrap:wrap;gap:4px;">
                ${spanBtns.join('')}
              </div>
            </div>
            <div style="border-top:1px dashed rgba(255,255,255,.1);padding-top:12px;">
              <div class="opt-mini-label" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span>🚫 杀组选(0-9,多选)</span>
                <span style="font-size:11px;color:var(--text-3);font-weight:normal;">· 含此数的<strong>全部组三/组六</strong>都排除</span>
              </div>
              <div class="opt-row" style="flex-wrap:wrap;gap:4px;">
                ${(() => {
                  // v5.8.15:从定位杀推荐取前 4(按 rate 降序)高亮显示
                  const kp = _killPool;
                  const posHot = new Set();
                  if (kp) {
                    // 收集所有 92%+ 数字
                    const all = [];
                    ['bai', 'shi', 'ge'].forEach(pos => {
                      (kp[pos] || []).forEach(x => {
                        if (x.rate >= 92) all.push({ code: x.code, rate: x.rate });
                      });
                    });
                    // 按 rate 降序 + code 升序,去重取前 4
                    all.sort((a, b) => b.rate - a.rate || a.code - b.code);
                    const seen = new Set();
                    for (const item of all) {
                      if (seen.size >= 4) break;
                      if (seen.has(item.code)) continue;
                      seen.add(item.code);
                      posHot.add(item.code);
                    }
                  }
                  return [0,1,2,3,4,5,6,7,8,9].map(n => {
                    const checked = (_pickState.killContain || []).includes(n);
                    const isHot = posHot.has(n);
                    const hotBadge = isHot ? '⭐' : '';
                    return `<button class="opt-btn xs ${checked ? 'on' : ''} ${isHot ? 'pos-hot' : ''}" data-kc="${n}" style="${checked ? 'background:linear-gradient(135deg,#ff5060,#ef4444);color:#fff;font-weight:700;border-color:#ff5060;box-shadow:0 0 8px rgba(255,80,96,.35);' : isHot ? 'border:1.5px solid #ff8d8d;background:rgba(255,141,141,.18);color:#ff8d8d;font-weight:800;box-shadow:0 0 6px rgba(255,141,141,.4);' : ''}" title="${isHot ? '⭐ 定位杀推荐(前4准的)' : ''}">${hotBadge}${n}</button>`;
                  }).join('');
                })()}
              </div>
              <div style="font-size:11px;color:var(--text-3);margin-top:4px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
                💡 杀 1 个数:1000 → 702 注(-30%) · 杀 2 个:-54% · 杀 3 个:-73%<br>
                ${(_pickState.killContain && _pickState.killContain.length > 0) ? `<strong style="color:#ff5060;">已选: ${_pickState.killContain.sort((a,b)=>a-b).join('、')}(共 ${_pickState.killContain.length} 个)</strong>` : '点击数字 = 加入杀组选(再次点击 = 取消)'}
                ${(() => {
                  // v5.8.15:一键加定位杀 92%+
                  const kp = _killPool;
                  if (!kp) return '';
                  const posHot = new Set();
                  ['bai', 'shi', 'ge'].forEach(pos => {
                    const list = (kp[pos] || []);
                    list.forEach(x => { if (x.rate >= 92) posHot.add(x.code); });
                  });
                  if (posHot.size === 0) return '';
                  return `<button class="opt-btn xs" data-kc-add-pos style="background:linear-gradient(135deg,#6ef09e,#2dd4bf);color:#0a0e1a;font-weight:700;padding:3px 8px;margin-left:auto;" title="一键加定位杀 92%+ 数字到杀组选">⭐ 定位杀 92%+ (${posHot.size}个)</button>`;
                })()}
              </div>
              ${(() => {
                // v5.8.15:杀组选 + 排除集合 冲突检测
                const kcSet = new Set(_pickState.killContain || []);
                const axisNums = (_killPool && _killPool.axis && _killPool.axis.axisNumbers) || [];
                const shiqiweiKill = (_killPool && _killPool.kills || []).filter(k => k.name === '上期十位直接杀').map(k => k.code);
                const axisSet = new Set([...axisNums, ...shiqiweiKill]);
                const overlap = [...kcSet].filter(n => axisSet.has(n));
                const totalUnique = new Set([...kcSet, ...axisSet]).size;
                if (kcSet.size === 0 && axisSet.size === 0) return '';
                return `<div style="margin-top:8px;padding:6px 10px;background:rgba(110,240,158,.06);border:1px solid rgba(110,240,158,.2);border-radius:6px;font-size:11px;color:var(--text-2);">
                  📊 <b>杀号汇总</b>:杀组选 <b style="color:#ff5060;">${kcSet.size}</b> 个 + 排除集合(十位轴) <b style="color:#f3c969;">${axisSet.size}</b> 个 = <b style="color:#6ef09e;">${totalUnique}</b> 个不重复
                  ${overlap.length > 0 ? `<br>⚠️ <b style="color:#f3c969;">冲突 ${overlap.length} 个</b>:${overlap.sort((a,b)=>a-b).join('、')} <span style="color:#888;">(杀组选已全位覆盖,排除集合只加其他位的)</span>` : '<br>✅ 无冲突(两个杀的位不重叠)'}
                </div>`;
              })()}
              ${(() => {
                // v5.8+ 推荐(根据当前期,优先定位杀 92%+)
                const suggests = FucaiFormula.suggestKillContain(_result.ctx, _killPool);
                const curPeriod = (window.FucaiData && window.FucaiData.latest) ? window.FucaiData.latest.p : '?';
                const isPos = suggests.length > 0 && suggests[0].source === 'pos';
                return `<div style="margin-top:8px;padding:8px;background:${isPos ? 'rgba(255,141,141,.08)' : 'rgba(167,139,250,.08)'};border:1px solid ${isPos ? 'rgba(255,141,141,.3)' : 'rgba(167,139,250,.2)'};border-radius:6px;">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                    <span style="font-size:11px;color:${isPos ? '#ff8d8d' : '#a78bfa'};font-weight:600;">${isPos ? '🎯 定位杀推荐(220 期回测 · 92%+ · 基于 ' : '🧠 系统推荐(200 期回测 · 基于 '}${curPeriod} 期)</span>
                    <button class="opt-btn xs" data-refresh-suggest style="font-size:10px;padding:2px 8px;">🔄 刷新</button>
                  </div>
                  ${suggests.map(s => `<button class="opt-btn xs" data-kc-add="${s.num}" style="margin:2px;font-family:monospace;${s.source === 'pos' ? 'border:1.5px solid #ff8d8d;background:rgba(255,141,141,.15);' : ''}">
                    🚫 杀 <strong style="color:#ff5060;">${s.num}</strong> · <span style="color:${s.source === 'pos' ? '#ff8d8d' : '#a78bfa'};">${s.rate.toFixed(2)}%</span>${s.source === 'pos' ? ' ⭐' : ''}
                  </button>`).join('')}
                  <div style="font-size:10px;color:var(--text-3);margin-top:4px;">${isPos ? '⭐ 定位杀 92%+ (强推荐) · 杀对率 92-95%' : '点推荐 = 自动加入杀组选(可叠加) · 下期开奖后自动重算'}</div>
                </div>`;
              })()}
            </div>
          </div>
        </div>

        <!-- 注数 + 生成 -->
        <div class="sub-section">
          <div class="opt-row">
            <span class="opt-mini-label">注数:</span>
            ${countBtn(1)}${countBtn(3)}${countBtn(5)}${countBtn(10)}${countBtn(20)}${countBtn(50)}
          </div>
          <div class="opt-row">
            <button class="share-btn big" id="genBtn" style="background:linear-gradient(135deg,var(--accent),var(--accent-2));color:var(--bg-2);">
              ⚡ 立即生成号码
            </button>
          </div>
          <div style="font-size:11px;color:var(--text-3);margin-top:6px;line-height:1.5;">
            💡 大数据加权(200期热号×1.5/对码×1.1/冷号×0.4) + 自学习(上期选过→降权60%避重)
          </div>
        </div>

        <!-- 候选预览 -->
        <div class="candidate-box">
          <div style="font-size:11px;color:var(--text-3);margin-bottom:8px;line-height:1.5;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div>
              <div style="margin-bottom:4px;">${excludeInfo}</div>
              <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:10px;">
                <span style="background:rgba(110,240,158,.15);border:1.5px solid #6ef09e;color:#6ef09e;padding:2px 6px;border-radius:4px;font-weight:bold;">✓ 候选 = 点击 → 加杀</span>
                <span style="background:rgba(255,80,96,.2);border:1.5px solid #ff5060;color:#ff5060;padding:2px 6px;border-radius:4px;font-weight:bold;text-decoration:line-through;">🗑 我的杀 = 点击恢复</span>
                <span style="background:rgba(255,80,96,.12);border:1.5px dashed #ff5060;color:#ff5060;padding:2px 6px;border-radius:4px;font-weight:bold;">🚫 系统杀 = 点击反对</span>
                <span style="background:rgba(243,201,105,.1);border:1.5px dotted #a07a3a;color:#a07a3a;padding:2px 6px;border-radius:4px;font-weight:bold;text-decoration:line-through;">⚠️ 反对 = 取消反对</span>
              </div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
              ${userKills.size > 0 ? `<button class="opt-btn xs" data-uk-clear>↻ 清除我杀 ${userKills.size}</button>` : ''}
              ${userAntiKills.size > 0 ? `<button class="opt-btn xs" data-anti-clear>↻ 清除反对 ${userAntiKills.size}</button>` : ''}
            </div>
          </div>
          <div class="cand-col">
            <div class="cand-label">
              百位 <span style="color:var(--dan);">${restBai.length}</span> 候选
              <span style="color:var(--text-3);"> / ${10 - restBai.length} 被杀</span>
              ${userKills.size > 0 ? `<span style="color:#ff5060;font-size:11px;"> (含我杀 ${userKills.size})</span>` : ''}
            </div>
            <div class="cand-list">
              ${codeList(restBai)}
              ${antiRestored.size > 0 ? Array.from(antiRestored).sort().map(antiSpan).join('') : ''}
              ${realExcludeRemaining.size > 0 ? Array.from(realExcludeRemaining).sort().map(realKillSpan).join('') : ''}
              ${userKills.size > 0 ? Array.from(userKills).sort().map(myKillSpan).join('') : ''}
            </div>
          </div>
          <div class="cand-col">
            <div class="cand-label">
              十位 <span style="color:var(--dan);">${restShi.length}</span> 候选
              <span style="color:var(--text-3);"> / ${10 - restShi.length} 被杀</span>
            </div>
            <div class="cand-list">
              ${codeList(restShi)}
              ${antiRestored.size > 0 ? Array.from(antiRestored).sort().map(antiSpan).join('') : ''}
              ${realExcludeRemaining.size > 0 ? Array.from(realExcludeRemaining).sort().map(realKillSpan).join('') : ''}
              ${userKills.size > 0 ? Array.from(userKills).sort().map(myKillSpan).join('') : ''}
            </div>
          </div>
          <div class="cand-col">
            <div class="cand-label">
              个位 <span style="color:var(--dan);">${restGe.length}</span> 候选
              <span style="color:var(--text-3);"> / ${10 - restGe.length} 被杀</span>
            </div>
            <div class="cand-list">
              ${codeList(restGe)}
              ${antiRestored.size > 0 ? Array.from(antiRestored).sort().map(antiSpan).join('') : ''}
              ${realExcludeRemaining.size > 0 ? Array.from(realExcludeRemaining).sort().map(realKillSpan).join('') : ''}
              ${userKills.size > 0 ? Array.from(userKills).sort().map(myKillSpan).join('') : ''}
            </div>
          </div>
        </div>

        ${renderFavorites()}

        ${lastHTML}

        <!-- 定位复式(高级) -->
        <details class="block fushi-block" style="margin-top:14px;background:rgba(0,0,0,.2);">
          <summary>📦 定位复式(高级 · 展开)</summary>
          <div style="padding:14px;">
            <div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:12px;">
              给定 <strong>百 / 十 / 个</strong> 各位的多个候选号,自动<strong>笛卡尔积</strong>展开。
              适合用户已经有具体方向时使用。数字之间用<strong>逗号或空格</strong>分隔。
            </div>
            <div class="fushi-inputs">
              <div class="fushi-col">
                <div class="fushi-label">百位候选</div>
                <input class="fushi-input" id="fBai" type="text" value="${_fushiState.bai}" placeholder="如 1,3,5">
              </div>
              <div class="fushi-col">
                <div class="fushi-label">十位候选</div>
                <input class="fushi-input" id="fShi" type="text" value="${_fushiState.shi}" placeholder="如 2,4">
              </div>
              <div class="fushi-col">
                <div class="fushi-label">个位候选</div>
                <input class="fushi-input" id="fGe" type="text" value="${_fushiState.ge}" placeholder="如 7,8,9">
              </div>
            </div>
            <div class="fushi-summary">
              将生成 <strong style="color:var(--accent);">${fCount}</strong> 注
              <span style="color:var(--text-2);">(${fBai.length} × ${fShi.length} × ${fGe.length})</span>
            </div>
            <div class="opt-row" style="margin-top:10px;">
              <button class="share-btn" id="fushiGenBtn" style="background:linear-gradient(135deg,var(--accent),var(--accent-2));color:var(--bg-2);">
                📦 展开定位复式
              </button>
              <button class="opt-btn" id="fushiClearBtn">清空</button>
            </div>
            ${fushiHTML}
          </div>
        </details>
      </div>
      ${renderMyBets(data.history)}
    `;
  }

  // ─── 收藏夹(智能选号收藏)───
  function renderFavorites() {
    const favs = getFavorites();
    return `
      <div class="block" style="background:rgba(243,201,105,.04);border:1px solid rgba(243,201,105,.2);margin-top:14px;">
        <div class="block-title">⭐ 收藏夹 <span class="badge">${favs.length} 组 · 可复制 / 跟投</span>
          ${favs.length > 0 ? '<button class="opt-btn xs" data-fav-clear style="margin-left:auto;background:rgba(255,80,96,.15);">↻ 清空</button>' : ''}
        </div>
        ${favs.length ? `<div style="font-size:12px;color:var(--text-2);line-height:1.7;margin-bottom:8px;">点击 ⭐ 删除某组 / 点击 📋 复制这组号码(空格分隔)</div>` : ''}
        ${favs.slice(0, 30).map((f, idx) => {
          const txt = f.picks.map(x => `${x.a}${x.b}${x.c}`).join(' ');
          const label = f.label || (f.picks.length + ' 注');
          return `
            <div class="fav-row" style="display:flex;align-items:center;gap:8px;padding:8px;background:rgba(0,0,0,.2);border-radius:6px;margin-bottom:6px;flex-wrap:wrap;">
              <span style="font-size:12px;color:var(--text-3);min-width:24px;">#${idx + 1}</span>
              <div style="flex:1;min-width:200px;">
                <div style="font-size:13px;color:var(--text-1);font-weight:bold;font-family:monospace;letter-spacing:2px;">${txt}</div>
                <div style="font-size:11px;color:var(--text-3);margin-top:2px;">${label} · ${new Date(f.time).toLocaleString('zh-CN')}</div>
              </div>
              <button class="opt-btn xs" data-fav-copy="${txt}">📋 复制</button>
              <button class="opt-btn xs" data-fav-del="${f.id}" style="background:rgba(255,80,96,.15);">⭐</button>
            </div>
          `;
        }).join('')}
        ${favs.length === 0 ? '<div style="text-align:center;color:var(--text-3);font-size:12px;padding:14px 0;">还没收藏 · 在已生成区块点击"⭐ 收藏"按钮</div>' : ''}
      </div>
    `;
  }

  // ─── 我的投注(自选号 + 智能选号 自动统计)───
  function renderMyBets(history) {
    const list = FucaiMyBets.load();
    const stats = FucaiMyBets.summary(history);
    return `
      <div class="block" style="background:rgba(110,240,158,.04);border:1px solid rgba(110,240,158,.2);margin-top:14px;">
        <div class="block-title">📝 我的投注 <span class="badge">自动与历史开奖对比</span></div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:12px;">
          📊 投注统计:<b style="color:#6ef09e;">${stats.total}</b> 注 · 投入 <b>${stats.invested}</b> 元 · 中奖 <b style="color:#f3c969;">${stats.prize}</b> 元 · 收益率 <b style="color:${stats.roi >= 100 ? '#6ef09e' : (stats.roi >= 50 ? '#f3c969' : '#ff5060')};">${stats.roi}%</b>
          &nbsp;|&nbsp; 3位中:<b style="color:#6ef09e;">${stats.hit3}</b> · 2位中:<b>${stats.hit2}</b> · 1位中:${stats.hit1} · 0位中:${stats.hit0} · 待开:${stats.pending}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;align-items:center;">
          <span style="font-size:12px;color:var(--text-2);">添加自选号:</span>
          <input id="mb_period" type="text" placeholder="期号(2026208)" value="${data.next.period}" style="width:120px;padding:4px 8px;background:rgba(0,0,0,.3);border:1px solid var(--text-3);border-radius:4px;color:var(--text-1);font-size:12px;" maxlength="7" />
          <input id="mb_a" type="number" min="0" max="9" placeholder="百" style="width:50px;padding:4px 8px;background:rgba(0,0,0,.3);border:1px solid var(--text-3);border-radius:4px;color:var(--text-1);" />
          <input id="mb_b" type="number" min="0" max="9" placeholder="十" style="width:50px;padding:4px 8px;background:rgba(0,0,0,.3);border:1px solid var(--text-3);border-radius:4px;color:var(--text-1);" />
          <input id="mb_c" type="number" min="0" max="9" placeholder="个" style="width:50px;padding:4px 8px;background:rgba(0,0,0,.3);border:1px solid var(--text-3);border-radius:4px;color:var(--text-1);" />
          <button class="opt-btn small" id="mb_add">+ 添加自选</button>
          <button class="opt-btn small" id="mb_import_sys" style="background:rgba(110,240,158,.15);">⚡ 导入智能选号</button>
          <span style="color:var(--text-3);font-size:11px;">(自选后开奖自动对比)</span>
        </div>
        ${list.length ? `
          <div style="font-size:12px;color:var(--text-2);">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead style="color:var(--text-3);">
                <tr>
                  <th style="text-align:left;padding:4px 8px;">期号</th>
                  <th style="text-align:left;padding:4px 8px;">号码</th>
                  <th style="text-align:left;padding:4px 8px;">来源</th>
                  <th style="text-align:left;padding:4px 8px;">结果</th>
                  <th style="text-align:right;padding:4px 8px;">奖金</th>
                  <th style="padding:4px 8px;">操作</th>
                </tr>
              </thead>
              <tbody>
                ${list.slice(0, 20).map(b => {
                  const r = FucaiMyBets.checkResult(b, history);
                  const hitColor = r.hit === 3 ? '#6ef09e' : (r.hit === 2 ? '#f3c969' : (r.hit === 1 ? '#ffb84a' : 'var(--text-3)'));
                  const hitText = r.status === 'pending' ? '⏳ 待开' : `${r.hit}位中`;
                  const srcText = b.source === 'system' ? '🤖 智能' : (b.source === 'self' ? '👤 自选' : (b.source || '👤 自选'));
                  return `<tr style="border-top:1px solid rgba(255,255,255,.05);">
                    <td style="padding:6px 8px;">${b.period}</td>
                    <td style="padding:6px 8px;font-weight:bold;">${b.a} ${b.b} ${b.c}</td>
                    <td style="padding:6px 8px;">${srcText}</td>
                    <td style="padding:6px 8px;color:${hitColor};">${hitText}</td>
                    <td style="padding:6px 8px;text-align:right;">${r.prize || 0}元</td>
                    <td style="padding:6px 8px;text-align:center;"><button class="opt-btn xs" data-mb-del="${b.id}">删除</button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
            ${list.length > 20 ? `<div style="text-align:center;color:var(--text-3);font-size:11px;margin-top:6px;">仅显示前 20 条,共 ${list.length} 条</div>` : ''}
          </div>
        ` : `<div style="text-align:center;color:var(--text-3);font-size:12px;padding:14px 0;">还没投注记录,添加你的第 1 注试试 ↑</div>`}
      </div>
    `;
  }

  // ─── 历史数据 Tab(独立板块) ───
  function renderHistoryTab() {
    const range = _historyRange;
    const list = data.history.slice(0, range);

    // 统计
    const sumDist = {};        // 和值分布
    const spanDist = {};       // 跨度分布
    const posDist = { a: {}, b: {}, c: {} };  // 各位分布
    let zu3 = 0, zu6 = 0, bao = 0;
    list.forEach(h => {
      sumDist[h.sum] = (sumDist[h.sum] || 0) + 1;
      spanDist[h.span] = (spanDist[h.span] || 0) + 1;
      [posDist.a, posDist.b, posDist.c].forEach((o, i) => {
        const d = [h.a, h.b, h.c][i];
        o[d] = (o[d] || 0) + 1;
      });
      if (h.type === '组三') zu3++;
      else if (h.type === '组六') zu6++;
      else bao++;
    });
    const total = list.length;
    // 各位 0-9 计数
    const posTotal = (pos, max) => {
      return Array.from({ length: 10 }, (_, i) => {
        const cnt = pos[i] || 0;
        return { code: i, cnt, pct: Math.round(cnt / total * 100), max };
      });
    };
    const aArr = posTotal(posDist.a);
    const bArr = posTotal(posDist.b);
    const cArr = posTotal(posDist.c);

    // 和值频次最高 3 个
    const sumTop = Object.entries(sumDist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([s, c]) => ({ val: +s, cnt: c }));
    // 跨度频次最高
    const spanTop = Object.entries(spanDist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([s, c]) => ({ val: +s, cnt: c }));

    // 期数切换按钮
    const rangeBtn = (n, label) => `<button class="opt-btn small ${_historyRange === n ? 'active' : ''}" data-range="${n}">${label}</button>`;

    // 表格
    const rows = list.map((h, i) => {
      const sumBar = Math.round((sumDist[h.sum] / total) * 100);
      return `
        <tr class="${i === 0 ? 'row-latest' : ''}">
          <td>${h.p}</td>
          <td>${h.d}</td>
          <td>
            <span class="mini-ball">${h.a}</span>
            <span class="mini-ball">${h.b}</span>
            <span class="mini-ball">${h.c}</span>
          </td>
          <td>
            ${h.sum}
            <span class="mini-bar"><span class="mini-bar-fill" style="width:${sumBar}%"></span></span>
          </td>
          <td>${h.span}</td>
          <td class="${h.type === '组三' ? 'badge-zu3' : 'badge-zu6'}">${h.type}</td>
        </tr>
      `;
    }).join('');

    // 分布小条
    const distBar = (dist, max) => {
      return Object.entries(dist)
        .sort((a, b) => +a[0] - +b[0])
        .map(([k, v]) => {
          const pct = Math.round(v / total * 100);
          const w = (v / max) * 100;
          return `
            <div class="dist-row">
              <span class="dist-key">${k}</span>
              <div class="dist-bar">
                <div class="dist-bar-fill" style="width:${w}%"></div>
                <span class="dist-bar-text">${v} 次 (${pct}%)</span>
              </div>
            </div>
          `;
        }).join('');
    };
    const spanMax = Math.max(...Object.values(spanDist));
    const sumMax = Math.max(...Object.values(sumDist));

    // 各位频次条
    const posRow = (title, arr) => {
      const max = Math.max(...arr.map(x => x.cnt));
      return `
        <div class="pos-dist">
          <div class="pos-dist-title">${title}</div>
          <div class="pos-dist-bars">
            ${arr.map(x => `
              <div class="pd-cell">
                <div class="pd-num">${x.code}</div>
                <div class="pd-bar-track">
                  <div class="pd-bar-fill" style="height:${(x.cnt / max) * 100}%"></div>
                </div>
                <div class="pd-cnt">${x.cnt}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    };

    return `
      <div class="block">
        <div class="block-title">
          📊 历史数据 <span class="badge">走势 + 统计</span>
        </div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:14px;">
          共载入 <strong style="color:var(--accent);">${data.history.length}</strong> 期历史,以下展示最近 <strong>${range}</strong> 期。
          统计所有和值、跨度、形态、位置分布。
        </div>

        <!-- 期数切换 -->
        <div class="opt-row" style="margin-bottom:14px;">
          <span class="opt-mini-label">显示:</span>
          ${rangeBtn(10, '近 10 期')}
          ${rangeBtn(20, '近 20 期')}
          ${rangeBtn(30, '近 30 期')}
          ${rangeBtn(50, '近 50 期')}
          ${rangeBtn(0, '全部')}
        </div>

        <!-- 表格 -->
        <div class="history-wrap">
          <table class="history">
            <thead>
              <tr>
                <th>期号</th>
                <th>日期</th>
                <th>开奖号</th>
                <th>和值 <span class="th-hint">条形=频次</span></th>
                <th>跨度</th>
                <th>形态</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <!-- 统计 -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-title">📈 形态分布</div>
            <div class="stat-row">
              <span class="stat-label">组六:</span>
              <div class="stat-bar">
                <div class="stat-bar-fill zu6" style="width:${(zu6 / total) * 100}%"></div>
                <span class="stat-bar-text">${zu6} 次 (${Math.round(zu6/total*100)}%)</span>
              </div>
            </div>
            <div class="stat-row">
              <span class="stat-label">组三:</span>
              <div class="stat-bar">
                <div class="stat-bar-fill zu3" style="width:${(zu3 / total) * 100}%"></div>
                <span class="stat-bar-text">${zu3} 次 (${Math.round(zu3/total*100)}%)</span>
              </div>
            </div>
            <div class="stat-row">
              <span class="stat-label">豹子:</span>
              <div class="stat-bar">
                <div class="stat-bar-fill bao" style="width:${(bao / total) * 100}%"></div>
                <span class="stat-bar-text">${bao} 次 (${Math.round(bao/total*100)}%)</span>
              </div>
            </div>
            <div class="stat-hint">热门:组六 ${Math.round(zu6/total*100)}% 占比${zu6 > zu3 ? '偏高' : '偏低'}</div>
          </div>

          <div class="stat-card">
            <div class="stat-title">🎯 跨度分布(0-9)</div>
            ${distBar(spanDist, spanMax)}
            <div class="stat-hint">最热跨度: ${spanTop.map(x => x.val + `(${x.cnt}次)`).join(' / ')}</div>
          </div>

          <div class="stat-card">
            <div class="stat-title">➕ 和值频次 Top 3</div>
            <div class="sum-top">
              ${sumTop.map((x, i) => `
                <div class="sum-top-item">
                  <span class="sum-top-rank">#${i+1}</span>
                  <span class="sum-top-val">和值 ${x.val}</span>
                  <span class="sum-top-cnt">${x.cnt} 次</span>
                </div>
              `).join('')}
            </div>
            <div class="stat-hint">和值范围 0-27,理论平均 13.5</div>
          </div>
        </div>

        <!-- 各位频次条 -->
        <div class="pos-dist-grid">
          ${posRow('百位频次', aArr)}
          ${posRow('十位频次', bArr)}
          ${posRow('个位频次', cArr)}
        </div>
      </div>
    `;
  }

  // ─── 详情(折叠区) ───
  function renderDetails() {
    return `
      <details class="block details-block" id="btDetails" ${window.__btOpen ? 'open' : ''}>
        <summary>📚 查看全部公式明细(展开)</summary>
        <div class="bt-selector">
          <span class="bt-sel-label">🎯 高置信度门槛(49 期回测命中率 ≥ 多少算 ✓):</span>
          ${[30, 35, 40, 45, 50].map(v => `
            <button class="opt-btn xs ${_btMinRate === v ? 'active' : ''}" data-bt="${v}">${v}%</button>
          `).join('')}
          <span class="bt-sel-hint" id="btHint">${getBtHint()}</span>
        </div>
        <div class="details-inner" id="btDetailsInner">
          ${renderAxis()}${renderKillOne()}${renderPos()}${renderDan()}${renderTwoCode()}${renderZuxuan()}
        </div>
      </details>
    `;
  }

  function getBtHint() {
    // 统计当前门槛下的 high 公式数
    const cnt = { high: 0, mid: 0, low: 0 };
    Object.values(FucaiFormula.BACKTEST).forEach(bt => {
      if (bt.rate >= _btMinRate) cnt.high++;
      else if (bt.rate >= bt.base) cnt.mid++;
      else cnt.low++;
    });
    return `当前 ${cnt.high} 个 ✓ / ${cnt.mid} 个 · / ${cnt.low} 个 ✗`;
  }

  function refreshBtDetails() {
    const inner = $('btDetailsInner');
    if (!inner) return;
    window.__btOpen = true; // 切档时保持展开
    inner.innerHTML = renderAxis() + renderKillOne() + renderPos() + renderDan() + renderTwoCode() + renderZuxuan();
    const hint = $('btHint');
    if (hint) hint.innerHTML = getBtHint();
    // 更新按钮 active 状态
    document.querySelectorAll('[data-bt]').forEach(b => {
      b.classList.toggle('active', +b.dataset.bt === _btMinRate);
    });
  }
  function renderAxis() {
    const { axis, ctx, zuxuanKill } = _result;
    // v5.8.13 预测形态块已挪到智能选号顶部(避免重复)
    let typePredictHTML = '';

    // v5.8 杀组选 UI
    let zuxuanHTML = '';
    if (zuxuanKill) {
      const status = [];
      if (zuxuanKill.killZu3) status.push('<span class="zx-tag zx-kill">🚫 杀组三</span>');
      if (zuxuanKill.killZu6) status.push('<span class="zx-tag zx-kill">🚫 杀组六</span>');
      if (zuxuanKill.killBZ) status.push('<span class="zx-tag zx-kill">🚫 杀豹子</span>');
      if (status.length === 0) status.push('<span class="zx-tag zx-none">✨ 无杀组选规则触发</span>');
      const recommendMap = { zu3: '组三', zu6: '组六', mixed: '不限', dan: '单选' };
      const recColor = { zu3: '#f3c969', zu6: '#6ef09e', mixed: '#888', dan: '#a78bfa' };
      const recText = zuxuanKill.recommend || 'mixed';
      const triggersHTML = (zuxuanKill.triggers || []).map(t => {
        const color = t.rate >= 75 ? '#6ef09e' : (t.rate >= 50 ? '#f3c969' : '#ff5060');
        return `<div class="zx-trigger">
          <span class="zx-trigger-name">${t.name}</span>
          <span class="zx-trigger-rate" style="color:${color};">${t.rate.toFixed(2)}%</span>
          <span class="zx-trigger-weight">×${t.weight}</span>
        </div>`;
      }).join('');
      zuxuanHTML = `<div class="v58-zuxuan">
        <div class="v58-zuxuan-title">🚫 v5.8 杀组选(反向,200 期回测)</div>
        <div class="v58-zuxuan-status">${status.join(' ')}</div>
        <div class="v58-zuxuan-recommend">
          💡 建议杀: <strong style="color:${recColor[recText]};">${recommendMap[recText]}</strong>
          ${recText === 'zu6' ? '(杀组三后,720 → 720 注组六)' : ''}
          ${recText === 'zu3' ? '(杀组六后,720 → 270 注组三)' : ''}
        </div>
        ${triggersHTML ? `<div class="v58-zuxuan-triggers">${triggersHTML}</div>` : ''}
      </div>`;
    }
    return `<div class="sub-block">
      <div class="sub-title">🔥 十位轴杀两码</div>
      <div style="font-size:13px;color:var(--text-2);">B=${ctx.B} → 杀掉 [${axis.axisNumbers.join(', ')}] = ${axis.killPairs.join(' / ')}</div>
      ${typePredictHTML}
      ${zuxuanHTML}
    </div>`;
  }
  function renderKillOne() {
    // v5.8:加权投票 + 共识杀号
    const votes = _killPool.votes || [];
    const consensus = _killPool.consensus || [];
    const learnWeights = (_learnStats && _learnStats.weights) || {};
    const learnStats = (_learnStats && _learnStats.stats) || {};

    // 按权重排序(从高到低)
    const sortedVotes = [...votes].sort((a, b) => b.weight - a.weight || a.code - b.code);

    // 共识杀号块(高亮)
    const consensusHTML = consensus.length > 0
      ? `<div class="v58-consensus">
          <div class="v58-consensus-title">🎯 v5.8 共识杀号(权重 ≥ 3.0,共 ${consensus.length} 个)</div>
          <div class="v58-consensus-list">
            ${consensus.map(v => {
              const arrow = v.weight >= 4 ? '⭐⭐⭐' : v.weight >= 3.5 ? '⭐⭐' : '⭐';
              return `<div class="v58-consensus-item">
                <span class="v58-consensus-code">${v.code}</span>
                <span class="v58-consensus-weight">权重 ${v.weight.toFixed(1)}</span>
                <span class="v58-consensus-stars">${arrow}</span>
              </div>`;
            }).join('')}
          </div>
          <div style="font-size:11px;color:var(--text-3);margin-top:6px;">
            💡 被 ≥3 个公式"加权共识"杀的号,杀对率 ≈72-79%(200 期回测)
          </div>
        </div>`
      : '<div style="color:var(--text-3);font-size:12px;">本期待开奖,共识杀号暂未生成</div>';

    // TOP 5 高准公式(按 killRate 排序)
    const allBT = (window.FucaiFormula && window.FucaiFormula.BACKTEST) || {};
    const top5 = Object.entries(allBT)
      .filter(([n, b]) => b.killRate)
      .sort((a, b) => b[1].killRate - a[1].killRate)
      .slice(0, 5);

    // 自学习(近 30 期)
    const learnHTML = Object.keys(learnStats).length > 0
      ? `<div class="v58-learn">
          <div class="v58-consensus-title">🧠 自学习(近 30 期 · 自动调权重)</div>
          <div class="v58-learn-list">
            ${Object.entries(learnStats).slice(0, 5).map(([name, st]) => {
              const bt = allBT[name] || {};
              const newW = learnWeights[name] || 1.0;
              const oldW = bt.weight || 1.0;
              const arrow = newW > oldW ? '↑' : newW < oldW ? '↓' : '·';
              const arrowColor = newW > oldW ? '#6ef09e' : newW < oldW ? '#ff5060' : '#888';
              return `<div class="v58-learn-item">
                <span class="v58-learn-name">${name}</span>
                <span class="v58-learn-rate" style="color:${st.rate > (bt.killBase||72.9) ? '#6ef09e' : '#ff5060'};">${st.rate.toFixed(1)}%</span>
                <span class="v58-learn-weight" style="color:${arrowColor};">${oldW}→${newW} ${arrow}</span>
              </div>`;
            }).join('')}
          </div>
        </div>`
      : '';

    return `<div class="sub-block">
      <div class="sub-title">🎯 v5.8 加权投票杀号<span class="bt-legend">15 公式 · 200 期回测 · 加权共识</span></div>
      ${consensusHTML}
      ${learnHTML}
      <div style="margin-top:14px;font-size:12px;color:var(--text-2);font-weight:600;display:flex;justify-content:space-between;align-items:center;">
        <span>📊 15 个公式的"加权投票"明细</span>
        <span style="font-size:11px;color:var(--text-3);">基准 72.9% · 200 期回测</span>
      </div>
      <div class="kill-grid">${sortedVotes.map(v => {
        const allKillNames = v.names.join('+');
        return `<div class="kill-item" style="${v.weight >= 3 ? 'border-color:rgba(110,240,158,.4);background:rgba(110,240,158,.08);' : ''}">
          <span class="formula-name" title="${allKillNames}">${v.names[0]}${v.names.length > 1 ? ` +${v.names.length - 1}` : ''}</span>
          <span class="code-badge" style="${v.weight >= 3 ? 'background:linear-gradient(135deg,#6ef09e,#2dd4bf);color:#0a0e1a;font-weight:700;' : ''}">${v.code}</span>
          <span class="kill-weight" style="font-size:10px;color:${v.weight >= 3 ? '#6ef09e' : 'var(--text-3)'};">×${v.weight.toFixed(1)}</span>
        </div>`;
      }).join('')}</div>
      <details class="block" style="margin-top:10px;background:rgba(0,0,0,.15);">
        <summary>🏆 TOP 5 高准公式(按 200 期杀对率)</summary>
        <div style="padding:10px;font-size:12px;">
          ${top5.map(([n, b], i) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed rgba(255,255,255,.06);">
            <span><b style="color:var(--accent);">#${i+1}</b> ${n}</span>
            <span><b style="color:#6ef09e;">${b.killRate}%</b> · 基准 ${b.killBase}% · ×${b.weight}</span>
          </div>`).join('')}
        </div>
      </details>
    </div>`;
  }
  function renderPos() {
    // 49 期回测后全部剔除,UI 不再展示该板块
    return '';
  }
  function renderDan() {
    const { dan } = _result;
    return `<div class="sub-block"><div class="sub-title">💎 定胆码公式明细<span class="bt-legend">基准 30% · 49 期回测 · 保留 2 个</span></div>
      <div class="kill-grid">${dan.dandu.map(d => `<div class="kill-item"><span class="formula-name">${d.name}${FucaiFormula.getBacktestBadge(d.name, _btMinRate)}</span><span class="code-badge" style="background:rgba(110,240,158,.18);color:var(--dan);">${d.code}</span></div>`).join('')}</div>
      <div style="font-size:12px;color:var(--text-2);margin-top:8px;">
        双胆: <b>已剔除</b>(和尾+3 / 和尾-3 / 主胆+5 在 49 期里命中率 22-43%,均低于 51% 基准)<br>
        三胆(147-258-369): ${dan.sandan.join(' ')}<br>
        对码胆码: ${dan.duima.join(' ')}
      </div></div>`;
  }
  function renderTwoCode() {
    const { sumSpan } = _result;
    return `<div class="sub-block"><div class="sub-title">🚫 杀和尾 / 杀跨度</div>
      <div style="font-size:13px;color:var(--text-2);line-height:1.8;">杀和尾: ${sumSpan.killHeWei.join(' ')}<br>杀跨度: ${sumSpan.killKuaDu.join(' ')}</div></div>`;
  }
  function renderZuxuan() {
    const { zuxuan, adv } = _result;
    return `<div class="sub-block"><div class="sub-title">🎲 组选参考 + 进阶</div>
      <div style="font-size:13px;line-height:1.8;">
        提示: ${zuxuan.refs.join(' / ') || '无'}<br>
        热号: ${zuxuan.hot.join(' ')} · 冷号: ${zuxuan.cold.join(' ')}<br>
        π 算法: ${adv.piDigits.join(' ')} · 隔期杀号: ${adv.skipKill} · 主用路径: ${adv.path.join('')}
      </div></div>`;
  }
  function renderHistory() {
    const rows = data.history.slice(0, 30).map(h => `
      <tr>
        <td>${h.p}</td><td>${h.d}</td>
        <td><span class="mini-ball">${h.a}</span><span class="mini-ball">${h.b}</span><span class="mini-ball">${h.c}</span></td>
        <td>${h.sum}</td><td>${h.span}</td>
        <td class="${h.type === '组三' ? 'badge-zu3' : 'badge-zu6'}">${h.type}</td>
      </tr>`).join('');
    return `<div class="sub-block"><div class="sub-title">📊 近 30 期历史</div>
      <div class="history-wrap"><table class="history">
        <thead><tr><th>期号</th><th>日期</th><th>开奖号</th><th>和值</th><th>跨度</th><th>形态</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
  }

  // v5.7.7:副链接授权管理 — Netlify Functions 后端
  function renderShareBox() {
    if (role !== 'main') return '';
    const allTokens = window.FucaiTokenAuth.listTokens();
    const q = _shareQuery || '';
    const queryResult = q.trim() ? window.FucaiTokenAuth.findTokens(q.trim()) : null;
    const mode = window.FucaiTokenAuth.getMode();
    const netlifyAvailable = !!(window.FucaiNetlifyBackend);
    return `
      <div class="block">
        <div class="block-title">🔗 副链接授权管理 <span class="badge">v5.7.7 · ${netlifyAvailable ? 'Netlify Functions 后端' : '纯本地方案'}</span></div>
        <div style="font-size:13px;color:var(--text-2);line-height:1.7;margin-bottom:14px;">
          副链接<strong style="color:var(--accent);">永久有效</strong>。<strong style="color:var(--accent);">5 台设备全局限制</strong>(所有用户浏览器总和),<strong style="color:var(--accent);">删除立即全员失效</strong>。
        </div>

        <!-- 0️⃣ 后端状态 -->
        <div style="background:${netlifyAvailable ? 'rgba(110,240,158,.08)' : 'rgba(243,201,105,.08)'};border:1px solid ${netlifyAvailable ? 'rgba(110,240,158,.3)' : 'rgba(243,201,105,.3)'};border-radius:8px;padding:14px;margin-bottom:14px;">
          <div style="font-size:13px;color:${netlifyAvailable ? '#6ef09e' : '#f3c969'};font-weight:bold;margin-bottom:8px;">
            ${netlifyAvailable ? '✅ Netlify Functions 后端可用(跨用户 + 真 5 台 + 真删除)' : '⚠️ Netlify Functions 不可用(用纯本地方案)'}
          </div>
          <div style="font-size:12px;color:var(--text-2);line-height:1.6;margin-bottom:10px;">
            当前模式: <code style="background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px;">${mode === 'local' ? '纯本地' : (netlifyAvailable ? 'Netlify' : '自动')}</code>
            · Function URL: <code style="background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px;">${netlifyAvailable ? window.FucaiNetlifyBackend.getBase() : 'N/A'}</code>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="opt-btn" id="testNetlifyBtn">🧪 测试 Netlify Function</button>
            <button class="opt-btn" id="syncNetlifyBtn">🔄 同步本地 → Netlify</button>
            <button class="opt-btn" id="switchModeBtn">${mode === 'local' ? '→ 切到 Netlify' : '→ 切到纯本地'}</button>
          </div>
          <details style="margin-top:10px;">
            <summary style="cursor:pointer;color:var(--accent);font-size:12px;padding:4px 0;">📖 Netlify 环境变量怎么配?</summary>
            <ol style="font-size:12px;color:var(--text-2);line-height:1.7;padding-left:20px;margin:8px 0;">
              <li>GitHub 创建一个新 repo(可私有),比如 <code style="background:rgba(0,0,0,.3);padding:1px 4px;border-radius:3px;">fucai3d-tokens</code></li>
              <li>创建 <strong>Fine-grained PAT</strong>:
                <br>• Repository access: <strong>Only select repositories</strong> → 选刚创建的 repo
                <br>• Permissions → Contents: <strong>Read and write</strong>
                <br>• 复制 <code style="background:rgba(0,0,0,.3);padding:1px 4px;border-radius:3px;">github_pat_xxx...</code>
              </li>
              <li>登录 https://app.netlify.com → 选你的 site → <strong>Site settings</strong> → <strong>Environment variables</strong> → 添加:
                <br>• <code style="background:rgba(0,0,0,.3);padding:1px 4px;border-radius:3px;">GH_TOKEN</code> = 你的 PAT
                <br>• <code style="background:rgba(0,0,0,.3);padding:1px 4px;border-radius:3px;">GH_OWNER</code> = 你的 GitHub 用户名
                <br>• <code style="background:rgba(0,0,0,.3);padding:1px 4px;border-radius:3px;">GH_REPO</code> = fucai3d-tokens
                <br>• (可选) <code style="background:rgba(0,0,0,.3);padding:1px 4px;border-radius:3px;">GH_BRANCH</code> = main
              </li>
              <li><strong>重新部署一次</strong>(让 Netlify 重新打包,functions 才生效)</li>
              <li>点"🧪 测试 Netlify Function" 验证</li>
            </ol>
          </details>
        </div>

        <!-- ① 生成区 -->
        <div style="background:rgba(0,0,0,.2);border-radius:8px;padding:14px;margin-bottom:14px;">
          <div style="font-size:13px;color:var(--text-1);font-weight:bold;margin-bottom:10px;">① 生成新副链接</div>
          <button class="share-btn" id="genTokenBtn" style="background:linear-gradient(135deg,#6ef09e,#2dba6d);color:var(--bg-2);">+ 生成新副链接(永久有效)</button>
          <div id="newTokenBox" style="display:none;background:rgba(110,240,158,.08);border:1px solid rgba(110,240,158,.3);border-radius:8px;padding:12px;margin-top:10px;">
            <div style="font-size:13px;color:#6ef09e;margin-bottom:6px;">✅ 副链接已生成,<strong>只显示一次,记得复制</strong>:</div>
            <div style="display:flex;gap:6px;align-items:stretch;flex-wrap:wrap;">
              <div id="newTokenUrl" style="flex:1;min-width:200px;font-family:monospace;background:rgba(0,0,0,.4);padding:8px 10px;border-radius:4px;word-break:break-all;font-size:12px;color:#6ef09e;user-select:all;cursor:text;" title="点击全选"></div>
              <button class="opt-btn small" id="copyNewToken" style="background:linear-gradient(135deg,#6ef09e,#2dd4bf);color:#0a0e1a;font-weight:700;padding:8px 14px;font-size:13px;">📋 复制</button>
            </div>
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center;">
              <button class="opt-btn xs" id="openNewToken" style="background:rgba(110,240,158,.15);color:#6ef09e;">🚀 直接打开</button>
              <button class="opt-btn xs" id="qrNewToken" style="background:rgba(110,240,158,.15);color:#6ef09e;">📱 二维码</button>
              <button class="opt-btn xs" id="wechatNewToken" style="background:rgba(110,240,158,.15);color:#6ef09e;">💬 分享微信</button>
              <button class="opt-btn xs" id="selectNewToken" style="background:rgba(110,240,158,.15);color:#6ef09e;">✋ 全选文本</button>
              <span style="font-size:11px;color:var(--text-3);margin-left:auto;">提示:点击 URL = 全选 · 复制 = 一键</span>
            </div>
            <div id="qrBox" style="display:none;margin-top:10px;text-align:center;padding:10px;background:#fff;border-radius:6px;"></div>
          </div>
        </div>

        <!-- v5.8.5:本浏览器已记忆设备 -->
        <div style="background:rgba(167,139,250,.06);border:1px solid rgba(167,139,250,.2);border-radius:8px;padding:12px;margin-bottom:14px;">
          <div style="font-size:13px;color:#a78bfa;font-weight:bold;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
            <span>🔐 本浏览器设备记忆</span>
            <span style="font-size:11px;color:var(--text-3);font-weight:normal;">v5.8.5 · 登入过免登录</span>
          </div>
          ${(() => {
            const known = (window.FucaiAuth && window.FucaiAuth.listKnownDevices) ? window.FucaiAuth.listKnownDevices() : {};
            const list = Object.entries(known);
            const myFp = (window.FucaiAuth && window.FucaiAuth.getMyFingerprint) ? window.FucaiAuth.getMyFingerprint() : '';
            if (list.length === 0) {
              return '<div style="font-size:12px;color:var(--text-3);">还没记忆任何设备(登入后自动记忆)</div>';
            }
            return `
              <div style="font-size:12px;color:var(--text-2);margin-bottom:8px;">
                当前浏览器已记忆 <b style="color:#a78bfa;">${list.length}</b> 个设备(任意一个开页面都自动登入)
              </div>
              <div style="max-height:160px;overflow-y:auto;">
                ${list.map(([fp, info]) => {
                  const isMe = fp === myFp;
                  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;background:rgba(0,0,0,.2);border-radius:4px;margin-bottom:4px;font-size:11px;${isMe ? 'border:1px solid rgba(110,240,158,.3);' : ''}">
                    <div style="flex:1;">
                      <span style="color:var(--text-3);font-family:monospace;">${fp.length > 16 ? fp.slice(0,16) + '...' : fp}</span>
                      ${isMe ? '<span style="color:#6ef09e;margin-left:6px;font-weight:bold;">← 当前</span>' : ''}
                      <div style="color:var(--text-3);margin-top:2px;">${info.role === 'main' ? '主链接' : '副链接'} · 首次: ${new Date(info.first).toLocaleDateString('zh-CN')} · 最近: ${new Date(info.last || info.first).toLocaleDateString('zh-CN')}</div>
                    </div>
                    <button class="opt-btn xs" data-fp-rm="${fp}" style="background:rgba(255,80,96,.15);color:#ff5060;padding:3px 8px;">🗑</button>
                  </div>`;
                }).join('')}
              </div>
              <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
                <button class="opt-btn xs" id="clearAllKnown" style="background:rgba(255,80,96,.1);color:#ff5060;">🗑 清除所有设备记忆</button>
              </div>
            `;
          })()}
        </div>

        <!-- v5.8.6:全局设备(跨 token 共享) -->
        <div id="globalDevicesBox" style="background:rgba(243,201,105,.06);border:1px solid rgba(243,201,105,.2);border-radius:8px;padding:12px;margin-bottom:14px;">
          <div style="font-size:13px;color:#f3c969;font-weight:bold;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
            <span>🌐 全局设备(1 浏览器 = 1 设备 · 跨所有副链接)</span>
            <button class="opt-btn xs" id="refreshGlobalDevices" style="font-size:10px;padding:2px 8px;">🔄 刷新</button>
          </div>
          <div id="globalDevicesList" style="font-size:12px;color:var(--text-3);">加载中...</div>
        </div>

        <!-- ② 查询区(独立) -->
        <div style="background:rgba(0,0,0,.2);border-radius:8px;padding:14px;margin-bottom:14px;">
          <div style="font-size:13px;color:var(--text-1);font-weight:bold;margin-bottom:10px;">② 查询副链接(输入 token 查询)</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:${queryResult ? '10px' : '0'};">
            <input id="tokenSearch" type="text" placeholder="输入完整 token 或片段,例: vip-msk0o5com7qtnf3" value="${q.replace(/"/g, '&quot;')}" style="flex:1;min-width:200px;padding:8px 12px;background:rgba(0,0,0,.3);border:1px solid var(--text-3);border-radius:6px;color:var(--text-1);font-family:monospace;font-size:13px;" />
            <button class="opt-btn" id="doSearchBtn" style="background:linear-gradient(135deg,#6ea0f0,#3a7bd5);color:#fff;">🔍 查询</button>
            ${q ? '<button class="opt-btn" id="clearSearch">清除</button>' : ''}
          </div>
          ${queryResult !== null ? renderQueryResult(queryResult, q) : ''}
        </div>

        <!-- ③ 列表区(所有 token) -->
        <div style="font-size:13px;color:var(--text-1);font-weight:bold;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <span>③ 所有副链接(${allTokens.length} 个)</span>
          <span id="globalDeviceSummary" style="font-size:11px;color:var(--text-3);font-weight:normal;">🌐 加载中...</span>
        </div>
        ${allTokens.length === 0 ? '<div style="text-align:center;color:var(--text-3);font-size:12px;padding:14px;">还没生成副链接 ↑</div>' : ''}
        <div id="tokenList">
          ${allTokens.map(t => {
            const subURL = window.FucaiTokenAuth.makeSubUrl(t.id);
            const tokenDeviceCount = t.devices.length;  // 本 token 设备数
            // v5.8.10:每 token 独立 5 台(状态基于本 token 设备数)
            const tokenMax = 5;
            const globalMap = window.__globalDevicesMap || {};
            const globalCount = Object.keys(globalMap).length;
            const globalMax = 5;
            const activeFpInToken = (t.devices || []).filter(d => globalMap[d.id]).length;
            const orphanFpInToken = tokenDeviceCount - activeFpInToken;
            // 状态:🟢绿 正常(<3)/ 🟡黄 3-4/ 🔴红 满(5)
            const status = tokenDeviceCount >= 5 ? 'full' : (tokenDeviceCount >= 3 ? 'warn' : 'ok');
            const statusEmoji = { ok: '🟢', warn: '🟡', full: '🔴' }[status];
            const statusColor = { ok: '#6ef09e', warn: '#f3c969', full: '#ff5060' }[status];
            const usageClass = status === 'full' ? 'rgba(255,80,96,.2)' : (status === 'warn' ? 'rgba(243,201,105,.2)' : 'rgba(110,240,158,.15)');
            return `
              <div class="token-row" data-tid="${t.id}" style="background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.05);border-radius:8px;padding:10px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <span title="本 token 状态: ${status === 'ok' ? '正常' : (status === 'warn' ? '快满' : '已满')}" style="font-size:14px;">${statusEmoji}</span>
                  <span style="font-family:monospace;font-size:13px;color:#6ef09e;font-weight:bold;">${t.id}</span>
                  <span style="font-size:11px;background:rgba(110,240,158,.3);color:#6ef09e;padding:2px 6px;border-radius:4px;">永久</span>
                  <span style="font-size:11px;color:var(--text-3);">${new Date(t.created).toLocaleDateString()}</span>
                  <span title="本 token 设备 ${tokenDeviceCount}/${tokenMax} · 全局设备 ${globalCount}/${globalMax}(仅显示)" style="font-size:12px;background:${usageClass};color:${statusColor};padding:3px 8px;border-radius:4px;margin-left:auto;font-weight:bold;">📱 ${tokenDeviceCount}/${tokenMax}</span>
                  <button class="opt-btn xs" data-tok-expand="${t.id}">展开</button>
                  <button class="opt-btn xs" data-tok-copy="${subURL}">📋</button>
                  <button class="opt-btn xs" data-tok-del="${t.id}" style="background:rgba(255,80,96,.2);color:#ff5060;">🗑</button>
                </div>
                <div data-tok-detail="${t.id}" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.05);font-size:12px;">
                  <div style="margin-bottom:6px;color:var(--text-2);word-break:break-all;">链接:<span style="font-family:monospace;background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px;">${subURL}</span></div>
                  <div data-detail-summary="${t.id}" style="color:var(--text-2);margin-bottom:6px;">
                    ${(() => {
                      // v5.8.10:每 token 独立 5 台 — 显示本 token 状态
                      const tm = 5;
                      if (tokenDeviceCount === 0) {
                        return '<span style="color:#888;">⚪ 从未有人登入</span> · 本 token <b style="color:#6ef09e;">0/' + tm + '</b>';
                      }
                      const m = window.__globalDevicesMap || {};
                      const afi = (t.devices || []).filter(d => m[d.id]).length;
                      const ofi = tokenDeviceCount - afi;
                      let s = '';
                      if (afi > 0) {
                        const lv = Math.max(...(t.devices || []).map(d => new Date(d.last).getTime()));
                        s = '<span style="color:#6ef09e;">🟢 有人在用</span> · 最近: <span style="color:#f3c969;">' + formatAgo(new Date(lv)) + '</span>';
                      } else {
                        s = '<span style="color:#ff5060;">🔴 已被全局清掉(失效)</span>';
                      }
                      return '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;"><div>' + s + '</div><div>本 token 设备(<b style="color:#6ef09e;">活跃 ' + afi + '</b>' + (ofi > 0 ? ' · <span style="color:#ff5060;">失效 ' + ofi + '</span>' : '') + ') · <b>' + tokenDeviceCount + '/' + tm + '</b></div></div>';
                    })()}
                  </div>
                  <div class="detail-devices" data-detail-devices="${t.id}">
                    ${t.devices.length === 0 ? '<div style="color:var(--text-3);font-size:11px;">还没设备使用过</div>' : ''}
                    ${t.devices.length > 0 ? `<div style="margin-bottom:8px;text-align:right;">
                      <button class="opt-btn xs" data-tok-clear-devices="${t.id}" style="background:rgba(255,80,96,.15);color:#ff5060;">🗑 清空 token 设备记录(${t.devices.length})</button>
                    </div>` : ''}
                    ${t.devices.map(d => `<div style="padding:6px;background:rgba(0,0,0,.2);border-radius:4px;margin-bottom:4px;font-size:11px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                      <div style="flex:1;">
                        <div style="color:var(--text-3);font-family:monospace;">${d.id}</div>
                        <div style="color:var(--text-2);margin-top:2px;">📱 ${d.ua || ''}</div>
                        <div style="color:var(--text-3);">首次: ${new Date(d.first).toLocaleString('zh-CN')}</div>
                        <div style="color:var(--text-3);">最近: ${new Date(d.last).toLocaleString('zh-CN')} · 访问 ${d.visits || 1} 次</div>
                      </div>
                      <button class="opt-btn xs" data-tok-rm-dev="${t.id}|${d.id}" style="background:rgba(255,80,96,.2);color:#ff5060;flex-shrink:0;padding:4px 8px;" title="删除此设备">🗑</button>
                    </div>`).join('')}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // v5.8.9:展开 token 时实时更新 detail summary(从 globalMap 重算)
  async function refreshTokenDetailSummary(tid) {
    const summary = document.querySelector(`[data-detail-summary="${tid}"]`);
    if (!summary) return;
    // v5.8.9 fix:如果 globalMap 还没加载,主动加载(不阻塞)
    if (!window.__globalDevicesMap && window.FucaiNetlifyBackend) {
      try {
        window.__globalDevicesMap = await window.FucaiNetlifyBackend.listGlobalDevices();
      } catch (e) {
        summary.innerHTML = '<span style="color:#ff5060;">❌ 加载全局设备失败</span>';
        return;
      }
    }
    const globalMap = window.__globalDevicesMap || {};
    const globalCount = Object.keys(globalMap).length;
    const globalMax = 5;
    // 找 token 设备
    const allTokens = window.FucaiTokenAuth.listTokens() || [];
    const t = allTokens.find(x => x.id === tid);
    if (!t) return;
    const tokenDeviceCount = t.devices.length;
    // v5.8.11 修:状态基于本 token 设备数(v5.8.10 每 token 独立 5 台)
    const statusColor = tokenDeviceCount >= 5 ? '#ff5060' : (tokenDeviceCount >= 3 ? '#f3c969' : '#6ef09e');
    const activeFpInToken = (t.devices || []).filter(d => globalMap[d.id]).length;
    const orphanFpInToken = tokenDeviceCount - activeFpInToken;
    // v5.8.9:加"真实状态"显示
    let status = '';
    if (tokenDeviceCount === 0) {
      status = '<span style="color:#888;">⚪ 从未有人登入</span>';
    } else if (activeFpInToken > 0) {
      const lastVisit = Math.max(...(t.devices || []).map(d => new Date(d.last).getTime()));
      const ago = formatAgo(new Date(lastVisit));
      status = `<span style="color:#6ef09e;">🟢 有人在用</span> · 最近: <span style="color:#f3c969;">${ago}</span>`;
    } else {
      status = '<span style="color:#ff5060;">🔴 已被全局清掉(失效)</span>';
    }
    summary.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
        <div>${status}</div>
        <div>本 token 设备(<b style="color:#6ef09e;">活跃 ${activeFpInToken}</b>${orphanFpInToken > 0 ? ` · <span style="color:#ff5060;">失效 ${orphanFpInToken}</span>` : ''}) · 全局 <b style="color:${statusColor};">${globalCount}/${globalMax}</b></div>
      </div>
    `;
  }
  // 辅助:把时间转"X 分钟前"
  function formatAgo(d) {
    const ms = Date.now() - d.getTime();
    if (ms < 60000) return '刚刚';
    if (ms < 3600000) return Math.floor(ms / 60000) + ' 分钟前';
    if (ms < 86400000) return Math.floor(ms / 3600000) + ' 小时前';
    return Math.floor(ms / 86400000) + ' 天前';
  }

  // v5.7.2:查询结果渲染(独立查询区)
  function renderQueryResult(results, query) {
    if (results.length === 0) {
      return `
        <div style="background:rgba(255,80,96,.1);border:1px solid rgba(255,80,96,.3);border-radius:8px;padding:12px;color:#ff5060;font-size:13px;">
          ❌ 没找到 token 包含 "<strong>${query.replace(/</g, '&lt;')}</strong>"
        </div>
      `;
    }
    return `
      <div style="background:rgba(110,240,158,.08);border:1px solid rgba(110,240,158,.3);border-radius:8px;padding:12px;">
        <div style="font-size:13px;color:#6ef09e;margin-bottom:10px;">✅ 找到 ${results.length} 个匹配的 token:</div>
        ${results.map(t => {
          const subURL = window.FucaiTokenAuth.makeSubUrl(t.id);
          const deviceCount = t.devices.length;
          const usageClass = deviceCount >= 5 ? 'rgba(255,80,96,.2)' : (deviceCount >= 3 ? 'rgba(243,201,105,.2)' : 'rgba(110,240,158,.15)');
          return `
            <div style="background:rgba(0,0,0,.3);border-radius:6px;padding:10px;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                <span style="font-family:monospace;font-size:14px;color:#6ef09e;font-weight:bold;">${t.id}</span>
                <span style="font-size:11px;background:rgba(110,240,158,.3);color:#6ef09e;padding:2px 6px;border-radius:4px;">永久有效</span>
                <span style="font-size:11px;color:var(--text-3);">${new Date(t.created).toLocaleDateString()}</span>
                <span style="font-size:12px;background:${usageClass};color:var(--text-1);padding:3px 8px;border-radius:4px;margin-left:auto;">📱 ${deviceCount} / 5</span>
              </div>
              <div style="font-size:12px;color:var(--text-2);margin-bottom:6px;word-break:break-all;">
                链接:<span style="font-family:monospace;background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px;">${subURL}</span>
              </div>
              <div style="font-size:12px;color:var(--text-2);margin-bottom:6px;">已注册设备(${deviceCount}/5):</div>
              ${t.devices.length === 0 ? '<div style="color:var(--text-3);font-size:11px;">还没设备使用过</div>' : ''}
              ${t.devices.length > 0 ? `<div style="margin-bottom:8px;text-align:right;">
                <button class="opt-btn xs" data-tok-clear-devices="${t.id}" style="background:rgba(255,80,96,.15);color:#ff5060;">🗑 清空所有设备(${t.devices.length})</button>
              </div>` : ''}
              ${t.devices.map(d => `<div style="padding:5px;background:rgba(0,0,0,.2);border-radius:4px;margin-bottom:4px;font-size:11px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <div style="flex:1;">
                  <div style="color:var(--text-3);font-family:monospace;">${d.id}</div>
                  <div style="color:var(--text-2);">📱 ${d.ua || ''}</div>
                  <div style="color:var(--text-3);">首次: ${new Date(d.first).toLocaleString('zh-CN')}</div>
                  <div style="color:var(--text-3);">最近: ${new Date(d.last).toLocaleString('zh-CN')} · 访问 ${d.visits || 1} 次</div>
                </div>
                <button class="opt-btn xs" data-tok-rm-dev="${t.id}|${d.id}" style="background:rgba(255,80,96,.2);color:#ff5060;flex-shrink:0;padding:4px 8px;" title="删除此设备">🗑</button>
              </div>`).join('')}
              <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                <button class="opt-btn" data-tok-copy="${subURL}">📋 复制链接</button>
                <button class="opt-btn" data-tok-del="${t.id}" style="background:rgba(255,80,96,.2);color:#ff5060;">🗑 删除此副链接</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // v5.7.2:查询结果渲染(独立查询区)
  function renderQueryResult(results, query) {
    if (results.length === 0) {
      return `
        <div style="background:rgba(255,80,96,.1);border:1px solid rgba(255,80,96,.3);border-radius:8px;padding:12px;color:#ff5060;font-size:13px;">
          ❌ 没找到 token 包含 "<strong>${query.replace(/</g, '&lt;')}</strong>"
        </div>
      `;
    }
    return `
      <div style="background:rgba(110,240,158,.08);border:1px solid rgba(110,240,158,.3);border-radius:8px;padding:12px;">
        <div style="font-size:13px;color:#6ef09e;margin-bottom:10px;">✅ 找到 ${results.length} 个匹配的 token:</div>
        ${results.map(t => {
          const subURL = window.FucaiTokenAuth.makeSubUrl(t.id);
          const deviceCount = t.devices.length;
          const usageClass = deviceCount >= 5 ? 'rgba(255,80,96,.2)' : (deviceCount >= 3 ? 'rgba(243,201,105,.2)' : 'rgba(110,240,158,.15)');
          return `
            <div style="background:rgba(0,0,0,.3);border-radius:6px;padding:10px;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
                <span style="font-family:monospace;font-size:14px;color:#6ef09e;font-weight:bold;">${t.id}</span>
                <span style="font-size:11px;background:rgba(110,240,158,.3);color:#6ef09e;padding:2px 6px;border-radius:4px;">永久有效</span>
                <span style="font-size:11px;color:var(--text-3);">${new Date(t.created).toLocaleDateString()}</span>
                <span style="font-size:12px;background:${usageClass};color:var(--text-1);padding:3px 8px;border-radius:4px;margin-left:auto;">📱 ${deviceCount} / 5</span>
              </div>
              <div style="font-size:12px;color:var(--text-2);margin-bottom:6px;word-break:break-all;">
                链接:<span style="font-family:monospace;background:rgba(0,0,0,.3);padding:2px 6px;border-radius:4px;">${subURL}</span>
              </div>
              <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                <button class="opt-btn" data-tok-copy="${subURL}">📋 复制链接</button>
                <button class="opt-btn" data-tok-del="${t.id}" style="background:rgba(255,80,96,.2);color:#ff5060;">🗑 删除此副链接</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderDisclaimer() {
    return `
      <div class="disclaimer">
        <strong>⚠️ 免责声明:</strong>
        本站所有"杀号""胆码""组选"公式均基于<strong>历史数据的统计规律</strong>。
        福彩3D 每期开奖都是<strong>独立随机事件</strong>,过去的数据不能影响未来结果。
        本系统输出<strong>仅供娱乐参考</strong>,<strong>不构成任何投资建议</strong>。
        请理性购彩,量力而行,未满 18 周岁不得购买。
      </div>
    `;
  }

  // ─── Tab 切换 ───
  function switchTab(id) {
    _activeTab = id;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === id));
    const slot = $('tabSlot');
    if (id === 'kill') slot.innerHTML = renderKillPool();
    else if (id === 'dan') slot.innerHTML = renderDanPool();
    else if (id === 'pick') {
      slot.innerHTML = renderSmartPick();
      bindPickOptions();
    } else if (id === 'hist') {
      slot.innerHTML = renderHistoryTab();
      bindHistoryRange();
    }
  }

  function bindHistoryRange() {
    document.querySelectorAll('[data-range]').forEach(b => {
      b.addEventListener('click', () => {
        const v = +b.dataset.range;
        _historyRange = v || data.history.length;
        switchTab('hist');
      });
    });
  }

  function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function bindBtSelector() {
    document.querySelectorAll('[data-bt]').forEach(b => {
      b.addEventListener('click', () => {
        _btMinRate = +b.dataset.bt;
        refreshBtDetails();
      });
    });
  }

  // ─── 智能选号交互 ───
  function bindPickOptions() {
    // 策略多选
    document.querySelectorAll('[data-strategy]').forEach(inp => {
      inp.addEventListener('change', () => {
        const id = inp.dataset.strategy;
        if (inp.checked) {
          if (!_pickState.strategies.includes(id)) _pickState.strategies.push(id);
        } else {
          _pickState.strategies = _pickState.strategies.filter(x => x !== id);
        }
        // 至少保留一个
        if (!_pickState.strategies.length) {
          _pickState.strategies.push(id);
          inp.checked = true;
        }
        switchTab('pick');
      });
    });
    // 形态
    document.querySelectorAll('[data-pick-type]').forEach(b => {
      b.addEventListener('click', () => { _pickState.type = b.dataset.pickType; switchTab('pick'); });
    });
    // 注数
    document.querySelectorAll('[data-pick-count]').forEach(b => {
      b.addEventListener('click', () => { _pickState.count = +b.dataset.pickCount; switchTab('pick'); });
    });
    // 奇偶
    document.querySelectorAll('[data-oe]').forEach(b => {
      b.addEventListener('click', () => { _pickState.oddEven = b.dataset.oe; switchTab('pick'); });
    });
    // 大小
    document.querySelectorAll('[data-bs]').forEach(b => {
      b.addEventListener('click', () => { _pickState.bigSmall = b.dataset.bs; switchTab('pick'); });
    });
    // 跨度
    document.querySelectorAll('[data-span]').forEach(b => {
      b.addEventListener('click', () => {
        const v = +b.dataset.span;
        if (v < _pickState.spanMin) _pickState.spanMin = v;
        else if (v > _pickState.spanMax) _pickState.spanMax = v;
        else if (v === _pickState.spanMin && _pickState.spanMin < _pickState.spanMax) _pickState.spanMin = v + 1;
        else if (v === _pickState.spanMax && _pickState.spanMax > _pickState.spanMin) _pickState.spanMax = v - 1;
        if (_pickState.spanMin > _pickState.spanMax) {
          const t = _pickState.spanMin; _pickState.spanMin = _pickState.spanMax; _pickState.spanMax = t;
        }
        switchTab('pick');
      });
    });
    // 宽松模式
    document.querySelectorAll('[data-loose]').forEach(b => {
      b.addEventListener('click', () => {
        _pickState.loose = b.dataset.loose === '1';
        switchTab('pick');
      });
    });
    // 高置信度杀号开关
    document.querySelectorAll('[data-hconf]').forEach(b => {
      b.addEventListener('click', () => {
        _pickState.highConfOnly = b.dataset.hconf === '1';
        switchTab('pick');
      });
    });
    // v5.8+ 杀组选 0-9(多选)
    document.querySelectorAll('[data-kc]').forEach(b => {
      b.addEventListener('click', () => {
        const n = +b.dataset.kc;
        if (!_pickState.killContain) _pickState.killContain = [];
        const idx = _pickState.killContain.indexOf(n);
        if (idx >= 0) {
          _pickState.killContain.splice(idx, 1);  // 取消
        } else {
          _pickState.killContain.push(n);  // 加入
        }
        switchTab('pick');
      });
    });
    // v5.8+ 点推荐 = 加入杀组选
    document.querySelectorAll('[data-kc-add]').forEach(b => {
      b.addEventListener('click', () => {
        const n = +b.dataset.kcAdd;
        if (!_pickState.killContain) _pickState.killContain = [];
        if (!_pickState.killContain.includes(n)) {
          _pickState.killContain.push(n);
        }
        switchTab('pick');
      });
    });
    // v5.8.15:一键加定位杀 92%+
    document.querySelectorAll('[data-kc-add-pos]').forEach(b => {
      b.addEventListener('click', () => {
        if (!_killPool) return;
        if (!_pickState.killContain) _pickState.killContain = [];
        const posHot = new Set();
        ['bai', 'shi', 'ge'].forEach(pos => {
          (_killPool[pos] || []).forEach(x => { if (x.rate >= 92) posHot.add(x.code); });
        });
        let added = 0;
        posHot.forEach(n => {
          if (!_pickState.killContain.includes(n)) {
            _pickState.killContain.push(n);
            added++;
          }
        });
        if (added > 0) {
          toast(`⭐ 已加 ${added} 个定位杀 92%+ 数字到杀组选`);
        } else {
          toast('已全部加入(或 0 个 92%+ 数字)');
        }
        switchTab('pick');
      });
    });
    // v5.8+ 手动刷新推荐(重新算 suggestKillContain)
    document.querySelectorAll('[data-refresh-suggest]').forEach(b => {
      b.addEventListener('click', () => {
        if (!_result) return;
        // 强制重算 ctx(从 data.history)
        const fresh = FucaiFormula.run(data.history, parseInt(String(data.next.period).slice(-1), 10));
        _result = fresh;
        window.__lastResult = fresh;
        toast('🔄 推荐已刷新(基于 ' + (data.latest ? data.latest.p : '当前期') + ')');
        switchTab('pick');
      });
    });
    // 生成
    const gen = $('genBtn');
    if (gen) gen.addEventListener('click', doGenerate);
    const regen = $('regenBtn');
    if (regen) regen.addEventListener('click', doGenerate);

    // v5.7:候选号点击 → 加入我的杀号
    document.querySelectorAll('[data-uk-add]').forEach(b => {
      b.addEventListener('click', () => {
        const code = +b.dataset.ukAdd;
        addUserKill(code);
        toast(`🚫 ${code} 已加入"我的杀号"(点击恢复)`);
        switchTab('pick');
      });
    });
    // v5.8.15:我的杀号点击 → 1.5 秒动画反馈(绿虚+白字"已恢复"),然后变绿实候选
    document.querySelectorAll('[data-uk-rm]').forEach(b => {
      b.addEventListener('click', () => {
        const code = +b.dataset.ukRm;
        // 立刻显示 ✅ 绿虚+白 反馈(1.5 秒)
        b.style.cssText = 'background:rgba(110,240,158,.25);border:2px dashed #6ef09e;color:#fff;font-weight:bold;padding:2px 8px;display:inline-flex;align-items:center;gap:2px;box-shadow:0 0 6px rgba(110,240,158,.4);';
        b.innerHTML = `<span style="font-size:9px;color:#6ef09e;">✅</span>${code}`;
        b.title = '✅ 已恢复 · 1.5 秒后变成绿实候选';
        setTimeout(() => {
          removeUserKill(code);
          toast(`✅ ${code} 已恢复为候选`);
          switchTab('pick');
        }, 800);
      });
    });
    // v5.8.15:系统杀点击 → 立刻显示 ✅ 反对(绿虚+白 持久)
    document.querySelectorAll('[data-anti-rm]').forEach(b => {
      b.addEventListener('click', () => {
        const code = +b.dataset.antiRm;
        addUserAntiKill(code);
        toast(`✋ ${code} 已反对(恢复为候选)`);
        switchTab('pick');
      });
    });
    // 清除所有我的杀号
    const ukClear = document.querySelector('[data-uk-clear]');
    if (ukClear) {
      ukClear.addEventListener('click', () => {
        clearUserKills();
        toast('↺ 已清除所有我的杀号');
        switchTab('pick');
      });
    }
    // v5.7.14:清除所有"我反对系统杀"
    const antiClear = document.querySelector('[data-anti-clear]');
    if (antiClear) {
      antiClear.addEventListener('click', () => {
        clearUserAntiKills();
        toast('↺ 已清除所有反对');
        switchTab('pick');
      });
    }

    // v5.7:选号收藏 / 复制
    // 复制单注
    document.querySelectorAll('[data-copy-one]').forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.copyOne;
        copyToClipboard(t).then(ok => toast(ok ? `📋 已复制 ${t}` : '❌ 复制失败'));
      });
    });
    // 复制全部
    document.querySelectorAll('[data-copy-all]').forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.copyAll;
        copyToClipboard(t).then(ok => toast(ok ? `📋 已复制 ${t}` : '❌ 复制失败'));
      });
    });
    // 收藏单注
    document.querySelectorAll('[data-fav-one]').forEach(b => {
      b.addEventListener('click', () => {
        const picks = JSON.parse(b.dataset.favOne.replace(/&apos;/g, "'"));
        const period = data.next.period;
        addFavorite({ period, picks, strategies: _pickState.strategies, label: `单注 ${picks[0].a}${picks[0].b}${picks[0].c}` });
        toast(`⭐ 已收藏 ${picks[0].a}${picks[0].b}${picks[0].c}`);
        switchTab('pick');
      });
    });
    // 收藏全部
    document.querySelectorAll('[data-fav-all]').forEach(b => {
      b.addEventListener('click', () => {
        const picks = JSON.parse(b.dataset.favAll.replace(/&apos;/g, "'"));
        const period = data.next.period;
        addFavorite({ period, picks, strategies: _pickState.strategies, label: `${picks.length} 注 ${picks.map(x => x.a+''+x.b+''+x.c).slice(0,3).join(' ')}${picks.length>3?'…':''}` });
        toast(`⭐ 已收藏 ${picks.length} 注到收藏夹`);
        switchTab('pick');
      });
    });
    // 收藏夹 - 复制
    document.querySelectorAll('[data-fav-copy]').forEach(b => {
      b.addEventListener('click', () => {
        const t = b.dataset.favCopy;
        copyToClipboard(t).then(ok => toast(ok ? `📋 已复制 ${t}` : '❌ 复制失败'));
      });
    });
    // 收藏夹 - 删除
    document.querySelectorAll('[data-fav-del]').forEach(b => {
      b.addEventListener('click', () => {
        removeFavorite(b.dataset.favDel);
        toast('⭐ 已删除该收藏组');
        switchTab('pick');
      });
    });
    // 收藏夹 - 清空
    const favClear = document.querySelector('[data-fav-clear]');
    if (favClear) {
      favClear.addEventListener('click', () => {
        clearFavorites();
        toast('↺ 已清空收藏夹');
        switchTab('pick');
      });
    }

    // 我的投注 - 添加自选
    const mbAdd = $('mb_add');
    if (mbAdd) {
      mbAdd.addEventListener('click', () => {
        const period = ($('mb_period') || {}).value || '';
        const a = +($('mb_a') || {}).value;
        const b = +($('mb_b') || {}).value;
        const c = +($('mb_c') || {}).value;
        if (!period.match(/^20\d{5}$/)) { toast('⚠ 期号格式错(例 2026208)'); return; }
        if (isNaN(a) || isNaN(b) || isNaN(c) || a<0 || a>9 || b<0 || b>9 || c<0 || c>9) {
          toast('⚠ 号码必须是 0-9'); return;
        }
        FucaiMyBets.add({ period, a, b, c, source: 'self' });
        toast(`✅ ${period} ${a}-${b}-${c} 已添加`);
        // 清空输入
        const ia = $('mb_a'); if (ia) ia.value = '';
        const ib = $('mb_b'); if (ib) ib.value = '';
        const ic = $('mb_c'); if (ic) ic.value = '';
        switchTab('pick');
      });
    }
    // 我的投注 - 删除
    document.querySelectorAll('[data-mb-del]').forEach(b => {
      b.addEventListener('click', () => {
        FucaiMyBets.remove(b.dataset.mbDel);
        switchTab('pick');
      });
    });
    // 一键导入智能选号结果到我的投注
    const mbImportSys = $('mb_import_sys');
    if (mbImportSys) {
      mbImportSys.addEventListener('click', () => {
        if (!_pickState.last || !_pickState.last.picks.length) {
          toast('⚠ 请先生成智能选号');
          return;
        }
        const period = data.next.period;
        _pickState.last.picks.forEach(p => {
          FucaiMyBets.add({ period, a: p.a, b: p.b, c: p.c, source: 'system' });
        });
        toast(`✅ 已导入 ${_pickState.last.picks.length} 注到"${period}"`);
        switchTab('pick');
      });
    }

    // 定位复式
    const fBai = $('fBai'), fShi = $('fShi'), fGe = $('fGe');
    if (fBai) fBai.addEventListener('input', () => { _fushiState.bai = fBai.value; updateFushiCount(); });
    if (fShi) fShi.addEventListener('input', () => { _fushiState.shi = fShi.value; updateFushiCount(); });
    if (fGe)  fGe.addEventListener('input',  () => { _fushiState.ge  = fGe.value;  updateFushiCount(); });
    const fGen = $('fushiGenBtn');
    if (fGen) fGen.addEventListener('click', doFushi);
    const fClear = $('fushiClearBtn');
    if (fClear) fClear.addEventListener('click', () => {
      _fushiState = { bai: '', shi: '', ge: '', last: null };
      switchTab('pick');
    });
    const fRegen = $('fushiRegenBtn');
    if (fRegen) fRegen.addEventListener('click', doFushi);
  }

  function updateFushiCount() {
    const parse = s => (s || '').split(/[,，\s]+/).map(x => x.trim()).filter(x => /^[0-9]$/.test(x)).map(Number);
    const fBai = parse(_fushiState.bai);
    const fShi = parse(_fushiState.shi);
    const fGe  = parse(_fushiState.ge);
    const cnt = fBai.length * fShi.length * fGe.length;
    const summary = document.querySelector('.fushi-summary strong');
    if (summary) summary.textContent = cnt;
  }

  function doGenerate() {
    // v5.8+:选号 — 加权 + 学习 + 去重 + 杀组选
    //   1. 候选 = 0-9 - 真排除(系统杀 - 用户反对) - 用户杀 - 杀组选数
    //   2. 加权 = 热号 ∩ 候选 + 对码 ∩ 候选 + 默认 + 上期降权(自学习)
    //   3. 100% 唯一组合(去重),不够时用 duplicate-fill
    if (!_result || !_killPool) {
      toast('⚠️ 数据未加载,稍后再试');
      return;
    }
    const kp = _killPool;
    const axisNums = new Set((kp.axis && kp.axis.axisNumbers) || []);
    const shiqiweiKill = new Set(
      (kp.kills || []).filter(k => k.name === '上期十位直接杀').map(k => k.code)
    );
    const realExclude = new Set([...axisNums, ...shiqiweiKill]);
    const userKills = new Set(getUserKills());
    const userAntiKills = new Set(getUserAntiKills());
    const effectiveExclude = new Set([...realExclude].filter(n => !userAntiKills.has(n)));
    // v5.8+:用户杀组选(0-9 多选)→ 含此数的所有号都排除
    const killContainSet = new Set(_pickState.killContain || []);
    const allExclude = new Set([...effectiveExclude, ...userKills, ...killContainSet]);

    // 候选 = 0-9 - allExclude
    const restBai = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(n => !allExclude.has(n));
    const restShi = [...restBai];
    const restGe  = [...restBai];

    // v5.8+:杀组选影响:含此数 → 选号必含 → 候选 0 个 = 选不到
    if (killContainSet.size > 0) {
      console.log(`[杀组选] 用户排除含数: ${[...killContainSet].sort().join(',')}(共 ${killContainSet.size} 个)`);
    }

    if (!restBai.length || !restShi.length || !restGe.length) {
      toast('⚠️ 候选为空,无法生成');
      return;
    }

    // ─── 大数据加权 ───
    const heat = _heatMap || { hot4: [], hot30: [], hotBoth: [], hot: [], warm: [], cold: [] };
    const hotBoth = new Set(heat.hotBoth && heat.hotBoth.length ? heat.hotBoth : (heat.hot || []));
    const hot4Only = new Set((heat.hot4 || []).filter(x => !hotBoth.has(x)));
    const hot30 = new Set(heat.hot30 || []);
    const warm = new Set(heat.warm || []);
    const cold = new Set(heat.cold || []);
    // 对码(从 ctx.A/B/C 算)
    const ctx = _result.ctx;
    const pairBai = new Set(FucaiFormula.pairCodes([ctx.A]));
    const pairShi = new Set(FucaiFormula.pairCodes([ctx.B]));
    const pairGe  = new Set(FucaiFormula.pairCodes([ctx.C]));

    // ─── 自学习:上期选过的号 + 上上期 ───
    // 选过 1 期前 = 降权 0.4(避免完全重复)
    // 选过 2 期前 = 降权 0.7(还热,但降)
    let historyPicks = [];
    try {
      historyPicks = JSON.parse(localStorage.getItem('fucai3d_last_picks') || '[]');
    } catch (e) {}
    const last1 = new Set(historyPicks.slice(-1).flat().map(x => +x));
    const last2 = new Set(historyPicks.slice(-2, -1).flat().map(x => +x));

    function buildWeight(rest, pairSet) {
      // 给每个候选号算权重
      const weighted = [];
      for (const n of rest) {
        let w = 1.0;
        if (hotBoth.has(n)) w = Math.max(w, 1.5);   // 短期 ∩ 中期 = 真热
        else if (hot4Only.has(n)) w = Math.max(w, 1.2);  // 短期热
        else if (hot30.has(n)) w = Math.max(w, 1.0);  // 中期热
        if (warm.has(n)) w = Math.max(w, 0.8);
        if (cold.has(n)) w = Math.max(w, 0.4);
        if (pairSet.has(n)) w = Math.max(w, 1.1);
        // 自学习:上期选过 → 降权(避免连续重复)
        if (last1.has(n)) w *= 0.4;
        else if (last2.has(n)) w *= 0.7;
        weighted.push({ code: n, weight: w });
      }
      return weighted;
    }

    const wBai = buildWeight(restBai, pairBai);
    const wShi = buildWeight(restShi, pairShi);
    const wGe  = buildWeight(restGe,  pairGe);

    // 加权随机选(用 cumulative distribution)
    function pickWeighted(weighted) {
      const total = weighted.reduce((s, x) => s + x.weight, 0);
      let r = Math.random() * total;
      for (const x of weighted) {
        r -= x.weight;
        if (r <= 0) return x.code;
      }
      return weighted[weighted.length - 1].code;
    }

    // v5.7.20:4 个约束检查(形态/奇偶/大小/跨度)
    function checkConstraints(a, b, c) {
      // 形态
      const isZu3 = (a === b || b === c || a === c);
      if (_pickState.type === 'zu6' && isZu3) return false;
      if (_pickState.type === 'zu3' && !isZu3) return false;
      // 'dan' 和 'mixed' 不限制
      // 奇偶
      if (_pickState.oddEven !== 'mixed') {
        const map = { o: n => n % 2 === 1, e: n => n % 2 === 0 };
        const want = _pickState.oddEven;  // 'ooo' / 'eee' / 'ooe' / 'eeo'
        const [w1, w2, w3] = want.split('');
        if (!map[w1](a) || !map[w2](b) || !map[w3](c)) return false;
      }
      // 大小
      if (_pickState.bigSmall !== 'mixed') {
        const map = { b: n => n >= 5, s: n => n <= 4 };
        const want = _pickState.bigSmall;  // 'bbb' / 'sss' / 'bbs' / 'ssb'
        const [w1, w2, w3] = want.split('');
        if (!map[w1](a) || !map[w2](b) || !map[w3](c)) return false;
      }
      // 跨度
      const span = Math.max(a, b, c) - Math.min(a, b, c);
      if (span < _pickState.spanMin || span > _pickState.spanMax) return false;
      return true;
    }
    function getTypeText(a, b, c) {
      return (a === b || b === c || a === c) ? '组三' : '组六';
    }

    const n = _pickState.count;
    const totalCombos = restBai.length * restShi.length * restGe.length;
    const actualN = Math.min(n, totalCombos);

    const picks = [];
    const seen = new Set();
    let safety = 0;
    let skipByConstraint = 0;
    // v5.8.15:提前算"实际可生成组六数"(避开约束太严的 toast 误导)
    const candLen = restBai.length;
    // 算 组六可生成数(restBai 选 3 不同) = C(n, 3)
    const nCr3 = candLen >= 3 ? candLen * (candLen-1) * (candLen-2) / 6 : 0;
    if (_pickState.type === 'zu6' && nCr3 < _pickState.count) {
      toast(`⚠️ 约束太严:候选 ${candLen} 个号 → 只能生成 ${Math.floor(nCr3)} 注组六,但要 ${_pickState.count} 注。\n请减少杀号数量(当前 ${killContainSet.size} 个组选 + ${axisNums.length + shiqiweiKill.size} 个排除) 或改"组三/混合"`);
      return;
    }
    while (picks.length < actualN && seen.size < totalCombos && safety < 50000) {
      safety++;
      let a, b, c, key;
      // 防呆:如果前 100 次都没成功,且 seen 已经接近 totalCombos,改用纯 random
      if (picks.length === 0 && safety > 50 && seen.size > 0) {
        a = restBai[Math.floor(Math.random() * restBai.length)];
        b = restShi[Math.floor(Math.random() * restShi.length)];
        c = restGe[Math.floor(Math.random() * restGe.length)];
      } else {
        a = pickWeighted(wBai);
        b = pickWeighted(wShi);
        c = pickWeighted(wGe);
      }
      key = `${a}${b}${c}`;
      if (seen.has(key)) continue;
      // 检查 4 个约束
      if (!checkConstraints(a, b, c)) {
        skipByConstraint++;
        // 限制太多直接放弃
        if (skipByConstraint > 2000 && picks.length === 0) {
          toast(`⚠️ 约束太严:跳过 ${skipByConstraint} 次仍无符合约束的组合。请减少"组六/奇偶/大小"限制或减少杀号数量`);
          return;
        }
        continue;
      }
      seen.add(key);
      const type = getTypeText(a, b, c);
      // 描述(为什么选这注)
      const desc = [];
      if (hotBoth.has(a) || hot4Only.has(a)) desc.push(`百${a}热`);
      if (hotBoth.has(b) || hot4Only.has(b)) desc.push(`十${b}热`);
      if (hotBoth.has(c) || hot4Only.has(c)) desc.push(`个${c}热`);
      if (pairBai.has(a)) desc.push(`百${a}对码`);
      if (pairShi.has(b)) desc.push(`十${b}对码`);
      if (pairGe.has(c))  desc.push(`个${c}对码`);
      if (last1.has(a) || last1.has(b) || last1.has(c)) desc.push('含上期号');
      const reason = desc.length ? desc.join('·') : '常规加权';
      picks.push({
        a, b, c, type, reason,
        period: window.FucaiData.next ? window.FucaiData.next.period : '?',
        source: 'weighted-v5.7.20'
      });
    }

    // 不够 N 注时(组合数不足),补重复(标 duplicate)
    while (picks.length < n && picks.length > 0) {
      const t = picks[Math.floor(Math.random() * picks.length)];
      picks.push({ ...t, reason: t.reason + '·(复用)', source: 'duplicate-fill' });
    }
    // v5.8.15:最后去重(确保 50 注里**没有完全相同**的注)
    const dedupedMap = new Map();
    picks.forEach(p => {
      const key = `${p.a}${p.b}${p.c}`;
      if (!dedupedMap.has(key)) dedupedMap.set(key, p);
    });
    if (dedupedMap.size < picks.length) {
      console.log(`[doGenerate] 去重 ${picks.length} → ${dedupedMap.size}`);
      picks.length = 0;
      picks.push(...dedupedMap.values());
    }

    // ─── 自学习:保存这一期选的号 ───
    try {
      const newHist = [...historyPicks, picks.map(x => `${x.a}${x.b}${x.c}`)];
      // 只留最近 5 期
      while (newHist.length > 5) newHist.shift();
      localStorage.setItem('fucai3d_last_picks', JSON.stringify(newHist));
    } catch (e) {}

    _pickState.last = {
      picks,
      actual: picks.length,
      before: 0,
      after: 0,
      newItems: picks,
      source: 'weighted-v5.7.20',
      strategies: ['加权+约束'],
      latest: window.FucaiData && window.FucaiData.latest ? window.FucaiData.latest : null,
      next: window.FucaiData && window.FucaiData.next ? window.FucaiData.next : null
    };

    const usedHot = picks.filter(x =>
      hotBoth.has(x.a) || hotBoth.has(x.b) || hotBoth.has(x.c) ||
      hot4Only.has(x.a) || hot4Only.has(x.b) || hot4Only.has(x.c)
    ).length;
    toast(`✅ 已从候选(百${restBai.length})加权选 ${picks.length} 注 · ${usedHot} 注含热号 · 已自学习`);
    switchTab('pick');
  }

  function doFushi() {
    const parse = s => (s || '').split(/[,，\s]+/).map(x => x.trim()).filter(x => /^[0-9]$/.test(x)).map(Number);
    const fBai = parse(_fushiState.bai);
    const fShi = parse(_fushiState.shi);
    const fGe  = parse(_fushiState.ge);
    if (!fBai.length || !fShi.length || !fGe.length) {
      toast('⚠️ 三位都要至少 1 个候选号');
      return;
    }
    const kp = _killPool;
    const exBai = new Set([...kp.baiAll.map(x => x.code), ...kp.killHeWei]);
    const exShi = new Set([...kp.shiAll.map(x => x.code), ...kp.killHeWei]);
    const exGe  = new Set([...kp.geAll.map(x => x.code),  ...kp.killHeWei]);
    const picks = [];
    fBai.forEach(a => {
      if (exBai.has(a)) return;
      fShi.forEach(b => {
        if (exShi.has(b)) return;
        fGe.forEach(c => {
          if (exGe.has(c)) return;
          const triple = [a, b, c];
          const uniq = new Set(triple);
          const sp = Math.max(...triple) - Math.min(...triple);
          const sm = triple[0] + triple[1] + triple[2];
          let reason = '复式展开';
          if (uniq.size === 3) reason += ' · 组六';
          else if (uniq.size === 2) reason += ' · 组三';
          else reason += ' · 豹子';
          reason += ` · 跨度=${sp} · 和值=${sm}`;
          picks.push({ a, b, c, reason });
        });
      });
    });
    if (!picks.length) {
      toast('⚠️ 所有候选都被杀号池覆盖,无注可出');
    } else {
      toast(`✅ 复式展开 ${picks.length} 注`);
    }
    _fushiState.last = { picks };
    switchTab('pick');
  }

  // ─── 总渲染入口 ───
  function render() {
    const periodTail = parseInt(String(data.next.period).slice(-1), 10);
    _result = FucaiFormula.run(data.history, periodTail);
    _killPool = FucaiFormula.buildKillPool(_result);
    _danPool = FucaiFormula.buildDanPool(_result, _result.ctx);
    _heatMap = FucaiFormula.buildHeatMap(data.history, 30);
    _pairMap = {
      bai: FucaiFormula.pairCodes([_result.ctx.A]),
      shi: FucaiFormula.pairCodes([_result.ctx.B]),
      ge:  FucaiFormula.pairCodes([_result.ctx.C])
    };
    // v5.8:自学习 — 调权重(根据近 30 期表现)
    _learnStats = FucaiFormula.autoLearnWeights(data.history, 30);
    window.__lastResult = _result;

    const app = $('app');
    app.innerHTML = `
      ${renderHeader()}
      <div class="container">
        ${renderHero()}
        ${renderCountdown()}
        ${renderDataBar()}
        ${renderTabBar()}
        <div id="tabSlot"></div>
        ${renderDetails()}
        ${renderShareBox()}
        ${renderDisclaimer()}
      </div>
    `;

    $('dataCount').textContent = `已载入 ${data.history.length} 期`;
    updateLiveStatus();
    bindTheme();
    bindTabs();
    bindBtSelector();

    // v5.8.6:加载全局设备列表(跨 token 共享)
    loadGlobalDevices();
    switchTab(_activeTab);

    FucaiCountdown.start(info => {
      const box = $('cdTime');
      const wrap = $('countdownBox');
      // 防止 re-render 后旧 DOM 引用失效
      if (!box || !wrap) return;
      // v5.7.7.4:用 data.next.drawTime 实际判断(不用 isAfterDrawToday,那判断"今天 21:15"是错的)
      const nextDrawDate = data.next.drawTime && data.next.drawTime.length >= 10 ? new Date(data.next.drawTime.replace(/-/g, '/')) : null;
      const isNextDrawn = nextDrawDate && nextDrawDate < new Date();
      if (isNextDrawn) {
        wrap.classList.add('drawn');
        box.textContent = `${data.next.period} 期已开奖 · 自动刷新中...`;
        if (!window.__drawHinted) {
          window.__drawHinted = true;
          toast(`🎉 ${data.next.period} 期开奖后,点击"手动刷新数据"获取最新一期`);
        }
      } else {
        wrap.classList.remove('drawn');
        box.textContent = info.text;
      }
    });

    // v5.7:旧版"复制只读链接"按钮已废弃(token 方式替代)
    const copyBtn = $('copyShare');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => toast('⚠ 请使用下方"生成新副链接"功能'));
    }

    // v5.7.1:副链接 token 管理(无时间限制)
    const genBtn = $('genTokenBtn');
    if (genBtn) {
      genBtn.addEventListener('click', async () => {
        genBtn.disabled = true;
        genBtn.textContent = '⏳ 生成中...';
        try {
          // 关键:用 async 版本,等 Netlify Function 返回真实的 GitHub token
          const t = await window.FucaiTokenAuth.createTokenAsync();
          if (!t) {
            toast('❌ 生成失败,请检查 Netlify Function 配置');
            return;
          }
          const url = window.FucaiTokenAuth.makeSubUrl(t.id);
          const box = $('newTokenBox');
          const urlEl = $('newTokenUrl');
          if (urlEl) urlEl.textContent = url;
          if (box) box.style.display = 'block';
          toast(`✅ 副链接已生成(永久有效),写到 GitHub 成功`);
        } catch (e) {
          toast('❌ 错误: ' + (e.message || e));
        } finally {
          genBtn.disabled = false;
          genBtn.textContent = '+ 生成新副链接(永久有效)';
        }
      });
    }
    // v5.7.2:查询副链接(独立查询区)
    const searchInput = $('tokenSearch');
    const doSearch = () => {
      _shareQuery = (searchInput ? searchInput.value : '').trim();
      render();
    };
    if (searchInput) {
      searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    }
    const doSearchBtn = $('doSearchBtn');
    if (doSearchBtn) {
      doSearchBtn.addEventListener('click', doSearch);
    }
    const clearBtn = $('clearSearch');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        _shareQuery = '';
        render();
      });
    }

    // v5.7.7:Netlify Functions 后端
    const testNetlify = $('testNetlifyBtn');
    if (testNetlify) {
      testNetlify.addEventListener('click', async () => {
        toast('🧪 正在测试 Netlify Function...');
        try {
          const r = await window.FucaiNetlifyBackend.testConnection();
          if (r.ok) {
            toast(`✅ Netlify Function 正常,共 ${r.count} 个 token`);
          } else {
            toast('❌ 失败: ' + (r.reason || '未知'));
          }
        } catch (e) {
          toast('❌ 异常: ' + e.message);
        }
      });
    }
    const syncNetlify = $('syncNetlifyBtn');
    if (syncNetlify) {
      syncNetlify.addEventListener('click', async () => {
        toast('🔄 正在同步...');
        try {
          const list = await window.FucaiNetlifyBackend.listTokens();
          const obj = {};
          list.forEach(t => { obj[t.id] = t; });
          localStorage.setItem('fucai3d_tokens', JSON.stringify(obj));
          toast(`✅ 同步完成,共 ${list.length} 个 token`);
          render();
        } catch (e) {
          toast('❌ 同步失败: ' + e.message);
        }
      });
    }
    const switchMode = $('switchModeBtn');
    if (switchMode) {
      switchMode.addEventListener('click', () => {
        const cur = window.FucaiTokenAuth.getMode();
        const next = cur === 'local' ? 'netlify' : 'local';
        window.FucaiTokenAuth.setMode(next);
        toast(`🔄 切换到 ${next === 'netlify' ? 'Netlify Functions 模式' : '纯本地方案'}`);
        render();
      });
    }
    const copyNew = $('copyNewToken');
    if (copyNew) {
      copyNew.addEventListener('click', () => {
        const url = $('newTokenUrl').textContent.trim();
        copyToClipboard(url, '📋 副链接已复制到剪贴板');
      });
    }
    // v5.8.9:新链接区 — 直接打开
    const openNew = $('openNewToken');
    if (openNew) {
      openNew.addEventListener('click', () => {
        const url = $('newTokenUrl').textContent.trim();
        if (url) window.open(url, '_blank');
      });
    }
    // v5.8.9:二维码(用 Google Chart API,免依赖)
    const qrNew = $('qrNewToken');
    if (qrNew) {
      qrNew.addEventListener('click', () => {
        const box = $('qrBox');
        const url = $('newTokenUrl').textContent.trim();
        if (!url || !box) return;
        if (box.style.display !== 'none') {
          box.style.display = 'none';
          return;
        }
        // 用纯本地 QR 生成(避免 Google Chart 依赖)
        const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(url)}`;
        box.innerHTML = `
          <img src="${qrImg}" alt="QR" style="width:160px;height:160px;border-radius:4px;" onerror="this.parentNode.innerHTML='<div style=color:red;>二维码生成失败,请直接复制链接</div>'" />
          <div style="font-size:11px;color:#666;margin-top:6px;">扫码即可打开副链接</div>
        `;
        box.style.display = 'block';
      });
    }
    // v5.8.9:分享微信(打开微信 Web 分享/或复制引导)
    const wechatNew = $('wechatNewToken');
    if (wechatNew) {
      wechatNew.addEventListener('click', () => {
        const url = $('newTokenUrl').textContent.trim();
        copyToClipboard(url, '💬 链接已复制,打开微信粘贴发送');
        toast('💬 打开微信,粘贴发给好友即可', 3000);
      });
    }
    // v5.8.9:全选文本(用户可以 Ctrl+C)
    const selectNew = $('selectNewToken');
    if (selectNew) {
      selectNew.addEventListener('click', () => {
        const urlEl = $('newTokenUrl');
        if (!urlEl) return;
        const range = document.createRange();
        range.selectNodeContents(urlEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        toast('✋ 文本已全选,按 Ctrl+C 复制');
      });
    }
    // v5.8.9:URL 本身点击 = 全选
    const newTokenUrl = $('newTokenUrl');
    if (newTokenUrl && !newTokenUrl.dataset.clickBound) {
      newTokenUrl.dataset.clickBound = '1';
      newTokenUrl.addEventListener('click', () => {
        const range = document.createRange();
        range.selectNodeContents(newTokenUrl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
    }
    // 复制已有 token
    document.querySelectorAll('[data-tok-copy]').forEach(b => {
      b.addEventListener('click', () => {
        const url = b.dataset.tokCopy;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(() => toast('📋 副链接已复制'));
        } else {
          const ta = document.createElement('textarea');
          ta.value = url; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); ta.remove();
          toast('📋 副链接已复制');
        }
      });
    });
    // 删除 token
    document.querySelectorAll('[data-tok-del]').forEach(b => {
      b.addEventListener('click', () => {
        const tid = b.dataset.tokDel;
        if (confirm(`确认删除副链接 ${tid} ?\n删除后,持有该链接的人将无法访问系统。`)) {
          window.FucaiTokenAuth.deleteToken(tid);
          toast('🗑 副链接已删除');
          render();
        }
      });
    });
    // 展开/收起 token 详情
    document.querySelectorAll('[data-tok-expand]').forEach(b => {
      b.addEventListener('click', () => {
        const tid = b.dataset.tokExpand;
        const detail = document.querySelector(`[data-tok-detail="${tid}"]`);
        if (detail) {
          const isOpen = detail.style.display !== 'none';
          detail.style.display = isOpen ? 'none' : 'block';
          b.textContent = isOpen ? '展开' : '收起';
          if (!isOpen) {
            // v5.8.9:展开时实时从 globalDevicesMap 算 summary
            refreshTokenDetailSummary(tid);
          }
        }
      });
    });
    // v5.8.4:删除单个设备
    document.querySelectorAll('[data-tok-rm-dev]').forEach(b => {
      b.addEventListener('click', async () => {
        const data = b.dataset.tokRmDev;
        if (!data) return;
        const [tid, fp] = data.split('|');
        const short = fp.length > 16 ? fp.slice(0, 16) + '...' : fp;
        if (!confirm(`确认删除设备 ${short} ?\n该设备再次打开副链接会被视为新设备(消耗 1 个设备名额)。`)) return;
        try {
          if (!window.FucaiNetlifyBackend) {
            toast('⚠️ Netlify 后端不可用');
            return;
          }
          const r = await window.FucaiNetlifyBackend.removeDevice(tid, fp);
          if (r.ok) {
            toast(`🗑 设备已删除(剩余 ${r.remaining})`);
            render();
          } else {
            toast('❌ 删除失败: ' + (r.reason || '未知'));
          }
        } catch (e) {
          toast('❌ 网络错误: ' + (e.message || e));
        }
      });
    });
    // v5.8.4:清空所有设备
    document.querySelectorAll('[data-tok-clear-devices]').forEach(b => {
      b.addEventListener('click', async () => {
        const tid = b.dataset.tokClearDevices;
        if (!confirm(`确认清空副链接 ${tid} 下的所有设备?\n所有设备都需要重新验证(共消耗 N 个名额)。`)) return;
        try {
          if (!window.FucaiNetlifyBackend) {
            toast('⚠️ Netlify 后端不可用');
            return;
          }
          const r = await window.FucaiNetlifyBackend.clearAllDevices(tid);
          if (r.ok) {
            toast(`🗑 已清空 ${r.removed} 个设备`);
            render();
          } else {
            toast('❌ 清空失败: ' + (r.reason || '未知'));
          }
        } catch (e) {
          toast('❌ 网络错误: ' + (e.message || e));
        }
      });
    });
    // v5.8.5:删除单个设备记忆
    document.querySelectorAll('[data-fp-rm]').forEach(b => {
      b.addEventListener('click', () => {
        const fp = b.dataset.fpRm;
        if (!confirm(`删除设备 ${fp.slice(0,16)}... 的记忆?\n该设备下次打开需要重新输入密码。`)) return;
        if (window.FucaiAuth && window.FucaiAuth.clearKnownDevice) {
          window.FucaiAuth.clearKnownDevice(fp);
          toast('🗑 设备记忆已删除');
          render();
        }
      });
    });
    // v5.8.5:清除所有设备记忆
    const clearAllKnownBtn = document.getElementById('clearAllKnown');
    if (clearAllKnownBtn) {
      clearAllKnownBtn.addEventListener('click', () => {
        if (!confirm('确定清除本浏览器所有设备记忆?\n所有设备需要重新输入密码才能使用。')) return;
        if (window.FucaiAuth && window.FucaiAuth.clearAllKnownDevices) {
          window.FucaiAuth.clearAllKnownDevices();
          localStorage.removeItem('fucai3d_auth');
          toast('✅ 已清除所有设备记忆,刷新后需要重新登入');
          setTimeout(() => render(), 500);
        }
      });
    }
    // v5.8.6:刷新全局设备列表
    const refreshGlobalBtn = document.getElementById('refreshGlobalDevices');
    if (refreshGlobalBtn) {
      refreshGlobalBtn.addEventListener('click', () => {
        loadGlobalDevices();
        toast('🔄 已刷新');
      });
    }

    const refreshBtn = $('refreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => doFetchData());
    }
  }

  // v5.7:从 cwl.gov.cn 实时抓取最新开奖数据
  async function doFetchData(silent) {
    if (!window.FucaiFetcher) { if (!silent) toast('⚠ 数据抓取模块未加载'); return null; }
    if (!silent) toast('🔄 正在从 cwl.gov.cn 抓取最新数据...');
    try {
      const result = await window.FucaiFetcher.fetchAndApply();
      // 重置所有缓存(只在新数据时)
      if (result.after > result.before) {
        _pickState.last = null;
        _fushiState.last = null;
        clearUserKills();  // 清掉手动杀号(因为候选集变了)
        render();
        const ni = result.newItems.slice(0, 3).map(x => `${x.period} ${x.code.join('')}`).join(', ');
        const more = result.newItems.length > 3 ? ` ... +${result.newItems.length - 3}` : '';
        toast(`✅ 新增 ${result.fetched} 期: ${ni}${more}`);
      }
      return result;
    } catch (e) {
      // 用 warn 而非 error:避免触发全局 console.error 劫持弹窗
      console.warn('[v5.7.8] fetch failed:', e && e.message);
      if (!silent) toast('❌ 抓取失败:' + (e && e.message) + ' · 多试几次或稍后再试');
      return null;
    }
  }

  async function boot() {
    // v5.7.8:优先加载 GitHub Actions 抓的最新数据(每日 21:18 自动更新)
    // 必须 await,否则 render 会用 data.js 的旧数据(2026209),而不是 latest.json 的 2026211
    if (window.FucaiLatestLoader && window.FucaiLatestLoader.init) {
      try {
        await window.FucaiLatestLoader.init();
      } catch (e) {
        console.warn('[v5.7.8 boot] latest loader fail:', e && e.message);
      }
    }

    // v5.8+:每 5 分钟自动检查新期(确保推荐是最新)
    //   - 检测 data.latest.p 变了 → 重新 render → 推荐/共识/自学习 都更新
    if (window.__autoRefreshInterval) clearInterval(window.__autoRefreshInterval);
    window.__autoRefreshInterval = setInterval(async () => {
      try {
        const beforeP = window.FucaiData && window.FucaiData.latest ? window.FucaiData.latest.p : null;
        if (window.FucaiLatestLoader && window.FucaiLatestLoader.reload) {
          await window.FucaiLatestLoader.reload();
        }
        const afterP = window.FucaiData && window.FucaiData.latest ? window.FucaiData.latest.p : null;
        if (beforeP && afterP && beforeP !== afterP) {
          // 新期了,重新 render
          if (typeof render === 'function') render();
          toast(`🔔 新期 ${afterP} 已出,推荐已自动更新`);
        }
      } catch (e) {
        // 静默失败
      }
    }, 5 * 60 * 1000);  // 5 分钟

    const existing = FucaiAuth.check();
    if (existing && existing.role === role) {
      render();
    } else {
      const app = $('app');
      app.insertAdjacentHTML('beforeend', FucaiAuth.makeLoginScreen(role));
      FucaiAuth.bindLogin(role, () => render());
    }

    // v5.7.3:启动全自动数据更新(登录后或登录界面)
    if (window.FucaiAutoUpdater) {
      window.FucaiAutoUpdater.start({
        onUpdate: function(info) {
          // 静默更新:抓到新数据时重置状态 + 重渲染
          if (info.newCount > 0) {
            _pickState.last = null;
            _fushiState.last = null;
            clearUserKills();
            render();
            console.log(`[v5.7.3 自动更新] 新增 ${info.newCount} 期,最新 ${info.latest.p} ${info.latest.a}${info.latest.b}${info.latest.c},下一期 ${info.next.period}`);
            // 顶部小提示(只在登录后的页面,不在登录界面)
            if (existing || true) {
              const tip = document.createElement('div');
              tip.style.cssText = 'position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#6ef09e,#2dba6d);color:#0a0e1a;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:bold;z-index:99999;box-shadow:0 4px 16px rgba(110,240,158,.4);animation:slideIn .3s ease-out;';
              tip.innerHTML = `🔄 新增 ${info.newCount} 期数据,最新 ${info.latest.p} 期 ${info.latest.a}${info.latest.b}${info.latest.c}<br><span style="font-size:11px;font-weight:normal;">系统已自动重算所有公式</span>`;
              document.body.appendChild(tip);
              setTimeout(() => { tip.style.opacity = '0'; tip.style.transition = 'opacity .3s'; setTimeout(() => tip.remove(), 300); }, 5000);
            }
          }
        }
      });
    }
  }

  return { render, boot };
})();

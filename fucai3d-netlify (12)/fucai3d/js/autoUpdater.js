// v5.7.4:全自动数据更新(多源 + 多 tab 去重 + 智能降级 + 持久化)
window.FucaiAutoUpdater = (function () {
  let timer = null;
  let isRunning = false;
  let lastCheck = 0;
  let lastSuccess = 0;
  let lastError = 0;
  let consecutiveErrors = 0;
  const STORAGE_KEY = 'fucai3d_autoupdater_state';
  const CHANNEL_NAME = 'fucai3d_autoupdater';
  const listeners = [];
  let bc = null;  // BroadcastChannel
  const tabId = 'tab_' + Math.random().toString(36).slice(2, 10);

  // ─── 工具 ───
  function now() { return new Date(); }
  function minutesOfDay(d) { return d.getHours() * 60 + d.getMinutes(); }
  function secondsToDraw() {
    const d = now();
    const draw = new Date(d);
    draw.setHours(21, 15, 0, 0);
    return Math.floor((draw.getTime() - d.getTime()) / 1000);
  }
  function isPostDrawWindow() {
    const m = minutesOfDay(now());
    return m >= (21 * 60 + 18) && m < (21 * 60 + 30);
  }
  function drawTimeText() {
    const sec = secondsToDraw();
    if (sec > 0) {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `开奖倒计时 ${m}分${s}秒`;
    } else {
      const secAgo = -sec;
      return `开奖后 ${Math.floor(secAgo / 60)}分${secAgo % 60}秒`;
    }
  }
  // 持久化状态
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ lastSuccess, lastCheck, lastError, tabId, ts: Date.now() }));
    } catch (e) {}
  }
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (s.lastSuccess) lastSuccess = s.lastSuccess;
    } catch (e) {}
  }
  // 广播给其他 tab
  function broadcast(type, data) {
    if (bc) {
      try { bc.postMessage({ type, from: tabId, ts: Date.now(), data }); } catch (e) {}
    }
  }

  // ─── 核心:抓取并合并 ───
  async function tick(reason) {
    if (isRunning) {
      console.log('[autoUpdater] 已在抓取中,跳过');
      return null;
    }
    isRunning = true;
    lastCheck = Date.now();
    const status = reason || 'scheduled';
    console.log(`[autoUpdater] 抓取开始 (${status}) ${now().toLocaleString()}`);
    broadcast('start', { reason: status });
    try {
      const result = await window.FucaiFetcher.fetchAndApply();
      if (result && result.after > result.before) {
        lastSuccess = Date.now();
        consecutiveErrors = 0;
        saveState();
        const newCount = result.after - result.before;
        console.log(`[autoUpdater] ✅ 新增 ${newCount} 期,最新期 ${result.latest.p} (源: ${result.source})`);
        broadcast('success', { newCount, latest: result.latest });
        listeners.forEach(fn => {
          try { fn({ type: 'newData', newCount, latest: result.latest, next: result.next, source: result.source, result }); }
          catch (e) { console.error('[autoUpdater] 监听器错误', e); }
        });
        return result;
      } else {
        console.log('[autoUpdater] 数据已是最新');
        lastSuccess = Date.now();
        saveState();
        return null;
      }
    } catch (e) {
      lastError = Date.now();
      consecutiveErrors++;
      saveState();
      console.warn(`[autoUpdater] 抓取失败 (连续 ${consecutiveErrors} 次): ${e.message || e}`);
      broadcast('error', { msg: e.message, consecutive: consecutiveErrors });
      return null;
    } finally {
      isRunning = false;
    }
  }

  // ─── 调度 ───
  function schedule() {
    if (timer) clearTimeout(timer);
    let nextDelay = 5 * 60 * 1000;

    if (consecutiveErrors > 0) {
      // 错误降频:连续失败 → 拉长间隔(最多 15 分钟)
      nextDelay = Math.min(5 * 60 * 1000 * Math.pow(2, consecutiveErrors - 1), 15 * 60 * 1000);
      console.log(`[autoUpdater] 错误降频,等待 ${Math.floor(nextDelay / 1000)} 秒后重试`);
    } else if (isPostDrawWindow()) {
      // 开奖窗口期:1 分钟抓
      nextDelay = 60 * 1000;
    } else {
      const sec = secondsToDraw();
      if (sec > 0 && sec < 30 * 60) {
        nextDelay = 60 * 1000;  // 距离开奖 < 30 分钟:1 分钟一次
      } else if (sec < 0 && sec > -60 * 60) {
        nextDelay = 3 * 60 * 1000;  // 开奖后 1 小时内:3 分钟一次
      } else {
        nextDelay = 5 * 60 * 1000;  // 其他:5 分钟一次
      }
    }

    console.log(`[autoUpdater] 下次检查 ${Math.floor(nextDelay / 1000)} 秒后 (${drawTimeText()})`);
    timer = setTimeout(() => tick().then(schedule), nextDelay);
  }

  // ─── 启动 ───
  function start(opts) {
    opts = opts || {};
    if (opts.onUpdate) listeners.push(opts.onUpdate);

    loadState();

    // BroadcastChannel:跨 tab 去重 + 状态共享
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        bc = new BroadcastChannel(CHANNEL_NAME);
        bc.onmessage = (e) => {
          const msg = e.data || {};
          if (msg.type === 'success' && msg.data && msg.data.latest) {
            // 其他 tab 抓到新数据 → 直接同步(不重新抓)
            const data = window.FucaiData;
            if (data) {
              const before = data.history.length;
              data.history = window.FucaiFetcher.mergeNew(data.history, [msg.data.latest].filter(x => x && x.p && x.a !== undefined).map(x => ({
                period: x.p, date: x.d, code: [x.a, x.b, x.c]
              })));
              if (data.history.length > before) {
                console.log(`[autoUpdater] 📡 收到其他 tab 广播,同步 ${data.history.length - before} 期`);
                lastSuccess = Date.now();
                saveState();
                listeners.forEach(fn => {
                  try { fn({ type: 'newData', newCount: data.history.length - before, latest: msg.data.latest }); } catch (_) {}
                });
              }
            }
          }
        };
        console.log('[autoUpdater] BroadcastChannel 已启用,跨 tab 同步');
      } catch (e) {
        console.warn('[autoUpdater] BroadcastChannel 初始化失败', e);
      }
    }

    // 页面打开 2 秒后立即抓一次
    setTimeout(() => {
      tick('page-load').then(() => {
        schedule();
      });
    }, 2000);

    // 标签页切回前台立即抓(用户可能离开后数据已出)
    let lastVisibilityTrigger = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > 30000 && Date.now() - lastVisibilityTrigger > 10000) {
        lastVisibilityTrigger = Date.now();
        console.log('[autoUpdater] 标签页可见,触发抓取');
        tick('visibility').then(schedule);
      }
    });
  }

  function stop() {
    if (timer) clearTimeout(timer);
    if (bc) { try { bc.close(); } catch (e) {} bc = null; }
    timer = null;
  }

  return { start, stop, tick, isPostDrawWindow, secondsToDraw, drawTimeText, lastCheck: () => lastCheck, lastSuccess: () => lastSuccess, lastError: () => lastError, consecutiveErrors: () => consecutiveErrors };
})();

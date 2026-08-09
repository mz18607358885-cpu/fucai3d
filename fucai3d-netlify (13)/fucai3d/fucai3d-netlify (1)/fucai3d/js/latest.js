// v5.7.8:GitHub Actions 抓的数据加载器
// 启动时优先 fetch latest.json(GitHub Actions 每日 21:18 自动更新)
// 失败 fallback 用 data.js(初始数据)
window.FucaiLatestLoader = (function () {
  const LATEST_URL = 'https://raw.githubusercontent.com/mz18607358885-cpu/fucai3d/main/latest.json?v=' + Date.now();

  async function loadLatest() {
    try {
      const resp = await fetch(LATEST_URL, { cache: 'no-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      if (!data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error('数据为空');
      }
      console.log(`[latest.js] 加载 GitHub 最新数据 ${data.count} 期,fetchedAt: ${data.fetchedAt}`);
      return data;
    } catch (e) {
      console.warn('[latest.js] GitHub 数据加载失败,fallback 用内置 data.js:', e.message);
      return null;
    }
  }

  // 把 latest.json 的数据 merge 到 FucaiData
  function mergeToFucaiData(latestData) {
    if (!window.FucaiData || !latestData || !latestData.data) return false;
    const data = window.FucaiData;
    const existing = new Set(data.history.map(x => x.p));
    let added = 0;
    for (const it of latestData.data) {
      if (existing.has(it.p)) continue;
      data.history.unshift(it);
      added++;
    }
    if (added > 0) {
      // 按期号升序,然后倒序(最新在上)
      data.history.sort((a, b) => a.p.localeCompare(b.p));
      data.history.reverse();
      // 更新 next
      const latestP = data.history[0].p;
      const nextNum = (parseInt(latestP, 10) + 1).toString();
      data.next = { period: nextNum, drawTime: '' };
      console.log(`[latest.js] merge ${added} 期,最新 ${latestP},下一期 ${nextNum}`);
      return true;
    }
    return false;
  }

  async function init() {
    const latest = await loadLatest();
    if (latest) {
      const merged = mergeToFucaiData(latest);
      if (merged && window.FucaiMain) {
        // 触发重渲染
        try { window.FucaiMain.render(); } catch (e) { console.warn('render 失败', e); }
      }
    }
  }

  return { init, loadLatest, mergeToFucaiData };
})();

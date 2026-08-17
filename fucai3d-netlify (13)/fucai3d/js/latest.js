// latest.js — v5.7.8w:直接调 Netlify Function 拿数据,不写 GitHub
// function 加了 5 分钟 cache,5 分钟内 17500 只抓 1 次
(function() {
  'use strict';

  // 优先级:Netlify Function(5分钟 cache + cron 保活) > GitHub raw(老 fallback)
  const LATEST_URLS = [
    'https://fc3dsh.netlify.app/.netlify/functions/fetch-3d',
    'https://raw.githubusercontent.com/mz18607358885-cpu/fucai3d/main/fucai3d-netlify%20(13)/fucai3d/latest.json'
  ];

  async function fetchLatestJson() {
    // v5.8.11:加 cache buster 绕 Netlify Edge cache
    const cb = Date.now();
    for (const url of LATEST_URLS) {
      try {
        const urlWithCb = url + (url.includes('?') ? '&' : '?') + 'cb=' + cb;
        const res = await fetch(urlWithCb, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
            return data;
          }
        }
      } catch (e) { /* 继续试下一个 */ }
    }
    return null;
  }

  function mergeLatest(latest) {
    if (!window.FucaiData || !window.FucaiData.history) {
      console.warn('[latest.js] FucaiData 不存在,跳过 merge');
      return 0;
    }
    let merged = 0;
    const histMap = new Map();
    window.FucaiData.history.forEach(h => histMap.set(String(h.p), h));
    for (const item of latest.data) {
      const p = String(item.p);
      if (!histMap.has(p)) {
        const newItem = {
          p: p,
          d: item.d,
          a: item.a,
          b: item.b,
          c: item.c,
          sum: item.sum || (item.a + item.b + item.c),
          span: item.span || Math.max(item.a, item.b, item.c) - Math.min(item.a, item.b, item.c),
          type: item.type || '组六',
          next_p: null,
          next_d: null,
          next_draw: null
        };
        window.FucaiData.history.unshift(newItem);
        histMap.set(p, newItem);
        merged++;
      }
    }
    window.FucaiData.history.sort((x, y) => Number(y.p) - Number(x.p));
    if (window.FucaiData.history.length > 0) {
      const newest = window.FucaiData.history[0];
      window.FucaiData.latest = {
        p: newest.p,
        a: newest.a, b: newest.b, c: newest.c,
        d: newest.d, sum: newest.sum, span: newest.span, type: newest.type
      };
    }
    if (window.FucaiData.next && window.FucaiData.latest) {
      const nextP = String(Number(window.FucaiData.latest.p) + 1);
      window.FucaiData.next.p = nextP;
      // v5.8.8:同时更新 next.drawTime(基于最新期日期 +1 天 21:15)
      //   3D 每天 21:15 开奖(中国福利彩票)
      //   北京时间(UTC+8)
      try {
        const lastDate = window.FucaiData.latest.d;  // 形如 "2026-08-14"
        if (lastDate && /^\d{4}-\d{2}-\d{2}$/.test(lastDate)) {
          const [y, m, d] = lastDate.split('-').map(Number);
          const next = new Date(Date.UTC(y, m - 1, d + 1, 13, 15, 0));  // UTC 13:15 = 北京 21:15
          const pad = n => String(n).padStart(2, '0');
          const nextDraw = next.getUTCFullYear() + '-' +
                           pad(next.getUTCMonth() + 1) + '-' +
                           pad(next.getUTCDate()) + ' 21:15:00';
          window.FucaiData.next.drawTime = nextDraw;
          window.FucaiData.next.drawDate = lastDate;
        }
      } catch (e) {
        console.warn('[latest.js] 更新 drawTime 失败:', e);
      }
    }
    return merged;
  }

  async function init() {
    console.log('[latest.js] 开始加载 Netlify Function 最新数据...');
    const latest = await fetchLatestJson();
    if (!latest) {
      console.log('[latest.js] function 不可用,使用 data.js 内嵌数据');
      return;
    }
    console.log(`[latest.js] 加载 ${latest.count} 期,fetchedAt: ${latest.fetchedAt}`);
    const merged = mergeLatest(latest);
    if (merged > 0) {
      console.log(`[latest.js] merge ${merged} 期,最新 ${window.FucaiData.latest.p}`);
    } else {
      console.log(`[latest.js] 已是最新,无新增`);
    }
  }

  async function reload() {
    // v5.8+:轻量 reload(只 merge,不重 render)
    // 供 setInterval 5 分钟检查新期用
    return await init();
  }

  window.FucaiLatestLoader = { init: init, reload: reload };
})();

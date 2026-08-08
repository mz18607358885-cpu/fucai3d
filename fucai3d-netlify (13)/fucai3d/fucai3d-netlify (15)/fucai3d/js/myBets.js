// 我的投注记录与统计
// 数据存 localStorage,跨刷新保留
window.FucaiMyBets = (function () {
  const STORE_KEY = 'fucai3d_my_bets_v1';

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function save(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  // 添加一条投注
  // bet: { period, a, b, c, source }
  // source: 'self'(自选) / 'system'(智能选号)
  function add(bet) {
    const list = load();
    bet.id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    bet.time = bet.time || new Date().toISOString();
    list.unshift(bet);
    save(list);
    return bet;
  }

  // 批量添加
  function addMany(bets) {
    const list = load();
    bets.forEach(b => {
      b.id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      b.time = b.time || new Date().toISOString();
      list.unshift(b);
    });
    save(list);
    return list;
  }

  // 删除
  function remove(id) {
    const list = load().filter(b => b.id !== id);
    save(list);
    return list;
  }

  // 清空
  function clear() { save([]); return []; }

  // 与历史开奖对比
  // history: FUcaiData.history
  function checkResult(bet, history) {
    const actual = history.find(h => h.p === bet.period);
    if (!actual) return { status: 'pending', actual: null };
    const m = (bet.a === actual.a) + (bet.b === actual.b) + (bet.c === actual.c);
    let prize = 0, type = 'miss';
    if (m === 3) {
      type = 'hit3';
      prize = 1040;
    } else if (m === 2) {
      // 任 2 位中 = 组三
      type = 'hit2';
      prize = 346;
    } else if (m === 1) {
      // 1 位中 = 没奖金
      type = 'hit1';
      prize = 0;
    } else {
      type = 'hit0';
      prize = 0;
    }
    return { status: 'checked', actual, hit: m, type, prize };
  }

  // 综合统计
  function summary(history) {
    const list = load();
    const stats = {
      total: list.length,
      hit3: 0, hit2: 0, hit1: 0, hit0: 0, pending: 0,
      invested: 0, prize: 0,
      byPeriod: {}
    };
    list.forEach(b => {
      stats.invested += 2;  // 每注 2 元
      const r = checkResult(b, history);
      if (r.status === 'pending') {
        stats.pending++;
      } else {
        stats[r.type]++;
        stats.prize += r.prize;
        if (!stats.byPeriod[b.period]) stats.byPeriod[b.period] = { hit: 0, prize: 0 };
        stats.byPeriod[b.period].hit += r.hit;
        stats.byPeriod[b.period].prize += r.prize;
      }
    });
    stats.roi = stats.invested > 0 ? (stats.prize / stats.invested * 100).toFixed(1) : '0';
    return stats;
  }

  return { load, save, add, addMany, remove, clear, checkResult, summary };
})();

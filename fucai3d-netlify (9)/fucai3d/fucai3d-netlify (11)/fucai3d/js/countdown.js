/**
 * 倒计时 + 开奖后自动刷新
 * 福彩3D 每天 21:15 开奖
 */
window.FucaiCountdown = (function () {
  const DRAW_HOUR = 21;
  const DRAW_MIN  = 15;
  let onTickCb = null;
  let timer = null;

  /** 下一期开奖时间(本地时区) */
  function nextDrawTime() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DRAW_HOUR, DRAW_MIN, 0);
    if (now >= today) {
      // 今天的已过,跳到明天
      today.setDate(today.getDate() + 1);
    }
    return today;
  }

  function fmt(ms) {
    if (ms <= 0) return '已开奖 · 即将刷新';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(h)} 时 ${pad(m)} 分 ${pad(s)} 秒`;
  }

  function start(onTick) {
    onTickCb = onTick;
    tick();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 1000);
  }

  function tick() {
    const target = nextDrawTime();
    const now = new Date();
    const remain = target - now;
    const passed = (DRAW_HOUR * 60 + DRAW_MIN) * 60 * 1000 - remain - 1; // 1ms 内已开
    const isAfterDrawToday = now.getHours() === DRAW_HOUR && now.getMinutes() >= DRAW_MIN;
    const justDrawn = isAfterDrawToday;
    onTickCb && onTickCb({
      remain,
      target,
      isAfterDrawToday: justDrawn,
      text: fmt(remain)
    });
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, nextDrawTime, fmt };
})();

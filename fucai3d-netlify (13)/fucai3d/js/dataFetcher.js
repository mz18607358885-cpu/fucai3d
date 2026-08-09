// v5.7.4:实时数据抓取(多源 + 智能降级)
window.FucaiFetcher = (function () {
  // 数据源(目标 URL)
  const TARGETS = {
    '500': 'https://m.500.com/index.php?c=kaijiang&a=ajaxLoadMoreExpect&lot=sd&page=1&pagesize=10',
    'cwl': 'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=3d&pageNo=1&pageSize=10',
    '500w': 'https://m.500.com/kaijiang/sd',  // 备用路径
    'cwl-mobile': 'https://m.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=3d&pageNo=1&pageSize=10'
  };
  // CORS proxy 列表(7 个,按稳定性)
  const PROXY_HOSTS = [
    { name: 'allorigins', wrap: u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
    { name: 'corsproxy',  wrap: u => `https://corsproxy.com/?${encodeURIComponent(u)}` },
    { name: 'codetabs',   wrap: u => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}` },
    { name: 'thingproxy', wrap: u => `https://thingproxy.freeboard.io/fetch/${u}` },
    { name: 'cors-anywhere', wrap: u => `https://cors-anywhere.herokuapp.com/${u}` },
    { name: 'cors.sh',    wrap: u => `https://cors.sh/${u}` },
    { name: 'direct',     wrap: u => u }  // 直接抓(可能 CORS 失败,但偶尔能通)
  ];
  // 全部 proxy × 全部 target 组合(优先 500.com 走最稳的 proxy)
  const PROXY_ORDER = [
    // 1) 500.com + allorigins  (已验证 ✅)
    ['500', 'allorigins'],
    // 2) cwl + allorigins      (已验证 ✅)
    ['cwl', 'allorigins'],
    // 3) 500.com + corsproxy   (备用)
    ['500', 'corsproxy'],
    // 4) cwl + corsproxy
    ['cwl', 'corsproxy'],
    // 5) 500.com + codetabs
    ['500', 'codetabs'],
    // 6) cwl + thingproxy
    ['cwl', 'thingproxy'],
    // 7) 500.com + cors.sh
    ['500', 'cors.sh'],
    // 8) cwl mobile
    ['cwl-mobile', 'allorigins'],
    // 9) 500w
    ['500w', 'allorigins'],
    // 10) direct (兜底)
    ['500', 'direct']
  ];

  // 单次 fetch 尝试(带超时)
  async function fetchViaProxy(url, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json, text/plain, */*' }, signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.text();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // 解析 500.com 响应
  function parse500(text) {
    if (!text || text.length < 50) return null;
    if (!text.trim().startsWith('{')) return null;
    try {
      const data = JSON.parse(text);
      if (data && data.code === '100' && data.data && data.data.result) {
        const result = data.data.result;
        const pattern = /kaij-tit[^>]*>(\d+)期<em>([\d\-]+).*?red-(?:ball|txt)"[^>]*>(\d+)<\/li>\s*<li class="red-(?:ball|txt)"[^>]*>(\d+)<\/li>\s*<li class="red-(?:ball|txt)"[^>]*>(\d+)<\/li>/g;
        const items = [];
        let m;
        while ((m = pattern.exec(result)) !== null) {
          items.push({
            period: m[1],
            date: m[2],
            code: [+m[3], +m[4], +m[5]]
          });
        }
        if (items.length) return items;
      }
    } catch (e) {}
    return null;
  }

  // 解析 cwl.gov.cn 响应
  function parseCwl(text) {
    if (!text || text.length < 50) return null;
    if (!text.trim().startsWith('{')) return null;
    try {
      const data = JSON.parse(text);
      if (data && data.state === 0 && Array.isArray(data.result)) {
        return data.result.map(r => {
          const d = r.date.match(/(\d{4}-\d{2}-\d{2})/);
          return {
            period: r.code,
            date: d ? d[1] : r.date,
            code: r.red.split(',').map(Number)
          };
        }).filter(x => x.code.length === 3 && x.code.every(n => n >= 0 && n <= 9));
      }
    } catch (e) {}
    return null;
  }

  // 抓取最新数据(顺序尝试多个源)
  async function fetchLatest(onProgress) {
    const tried = [];
    for (let i = 0; i < PROXY_ORDER.length; i++) {
      const [targetKey, proxyKey] = PROXY_ORDER[i];
      const target = TARGETS[targetKey];
      const proxy = PROXY_HOSTS.find(p => p.name === proxyKey);
      if (!target || !proxy) continue;
      const url = proxy.wrap(target);
      const label = `${proxyKey}→${targetKey}`;
      tried.push(label);
      if (onProgress) onProgress({ i, total: PROXY_ORDER.length, label });
      try {
        const text = await fetchViaProxy(url, 6000);
        // 试 500.com 格式
        let items = parse500(text);
        if (items && items.length) return { items, source: label, tried };
        // 试 cwl 格式
        items = parseCwl(text);
        if (items && items.length) return { items, source: label, tried };
      } catch (e) {
        console.log(`[dataFetcher] ${label} 失败: ${e.message || e}`);
        continue;
      }
    }
    console.warn('[dataFetcher] 所有数据源都失败 (已尝试 ' + tried.length + ' 个),已尝试: ' + tried.slice(0, 5).join(', '));
    return { items: [], source: null, tried };
  }

  // 合并新数据到现有 data(去重 + 排序)
  function mergeNew(existing, newItems) {
    const seen = new Set(existing.map(x => x.p));
    const merged = [...existing];
    for (const item of newItems) {
      if (seen.has(item.period)) continue;
      seen.add(item.period);
      const a = item.code[0], b = item.code[1], c = item.code[2];
      merged.push({
        p: item.period, d: item.date, a, b, c,
        sum: a + b + c,
        span: Math.max(a, b, c) - Math.min(a, b, c),
        type: (a === b || b === c || a === c) ? '组三' : '组六'
      });
    }
    merged.sort((x, y) => x.p.localeCompare(y.p));
    return merged;
  }

  // 计算 next 期号
  function nextPeriod(latestPeriod) {
    return (parseInt(latestPeriod, 10) + 1).toString();
  }

  // 抓取并应用
  async function fetchAndApply() {
    const data = window.FucaiData;
    if (!data) return { before: 0, after: 0, newItems: [], source: null, latest: null, next: null };
    const result = await fetchLatest();
    if (!result.items.length) {
      console.log('[dataFetcher] 没拿到新数据,跳过 merge');
      const before = data.history.length;
      return { before, after: before, newItems: [], source: null, latest: data.latest, next: data.next };
    }
    const before = data.history.length;
    data.history = mergeNew(data.history, result.items);
    data.history.sort((a, b) => b.p.localeCompare(a.p));
    const latestP = data.history[0].p;
    data.next = { period: nextPeriod(latestP), drawTime: '' };
    return {
      fetched: result.items.length,
      before,
      after: data.history.length,
      newItems: result.items,
      source: result.source,
      tried: result.tried,
      latest: data.history[0],
      next: data.next
    };
  }

  return { fetchLatest, fetchAndApply, mergeNew, nextPeriod, TARGETS, PROXY_HOSTS, PROXY_ORDER };
})();

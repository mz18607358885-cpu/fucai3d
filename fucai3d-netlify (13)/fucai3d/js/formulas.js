/**
 * 福彩3D 杀号 / 胆码 / 组合 公式引擎
 * 全部公式基于用户提供的指令实现,纯前端 JS
 *
 * 约定:
 *   上期 A=百位 B=十位 C=个位
 *   S = A+B+C   (和值)
 *   W = S % 10  (和尾)
 *   K = max(A,B,C) - min(A,B,C)  (跨度)
 *
 * 所有公式运算后"取尾": v = ((v % 10) + 10) % 10
 * 大于 9 减 10,负数加 10,统一成 0-9
 */

window.FucaiFormula = (function () {
  /** 通用取尾函数 */
  function mod10(n) {
    return ((n % 10) + 10) % 10;
  }

  /** 对码对照:0↔5 1↔6 2↔7 3↔8 4↔9 */
  const PAIR = { 0: 5, 5: 0, 1: 6, 6: 1, 2: 7, 7: 2, 3: 8, 8: 3, 4: 9, 9: 4 };

  /** 上一期和上一上期 */
  function getContext(history) {
    const cur = history[0];
    const prev = history[1] || cur;
    const prev2 = history[2] || prev;
    return {
      A: cur.a, B: cur.b, C: cur.c,
      S: cur.sum, W: cur.sum % 10, K: cur.span,
      prevA: prev.a, prevB: prev.b, prevC: prev.c,
      prevS: prev.sum, prevW: prev.sum % 10, prevK: prev.span,
      prev2S: prev2.sum, prev2W: prev2.sum % 10,
      prev2K: prev2.span,
      // v5.8:把 prev 整体 + history 传 ctx,给新公式用
      prev, history
    };
  }

  // ─────────────────────────────────────────────
  // 一、通杀一码公式 (每个公式给出 1 个被杀号码)
  // ─────────────────────────────────────────────
  function killOneCode(ctx) {
    const { A, B, C, S, W, K, prevW, prev2W, prevK, prev2K, prev, history } = ctx;
    const result = [
      { name: '两期跨度相加取尾',    code: mod10(prevK + prev2K) },
      { name: '三数相乘取个位',      code: mod10(A * B * C) },
      { name: '和值×0.618首位',      code: Math.floor(S * 0.618 / 1) % 10 },
      { name: '百×5+十×8取尾',       code: mod10(A * 5 + B * 8) },
      { name: '(和值-跨度)取尾',     code: mod10(S - K) },
      { name: '两期和尾相加取尾',    code: mod10(prevW + prev2W) },
      { name: '上期十位直接杀',      code: B },
      { name: '(跨度+个位)×3取尾',   code: mod10((K + C) * 3) },
      { name: '十+个取尾杀下期',     code: mod10(B + C) },
      { name: '(A+C)取尾',           code: mod10(A + C) }
    ];
    // v5.8 加 5 个新公式(冷号/012路/和尾范围/大中小/期号尾)
    if (history) {
      // 1. 冷号回补:上 20 期出现 0 次的号,大概率下期继续冷
      const cold = computeColdNumber(history, 20);
      if (cold >= 0) result.push({ name: '冷号回补杀(20期)', code: cold });
      // 2. 012 路杀:a mod 3 + b mod 3 重复
      result.push({ name: '012路杀((A%3+C%3))', code: mod10((A % 3) + (C % 3)) });
      // 3. 和尾 ±3 杀(S+3 % 10)
      result.push({ name: '和值+3取尾杀', code: mod10(S + 3) });
      // 4. 大中小杀:大=5-9,小=0-4,中=3-6,杀"中"路径
      result.push({ name: '大中小杀(B+2取尾)', code: mod10(B + 2) });
      // 5. 期号尾数杀(上期 p mod 10)
      const prevPeriod = prev && prev.p ? +prev.p.slice(-1) : 0;
      result.push({ name: '期号尾数杀', code: mod10(prevPeriod + 1) });
    }
    return result;
  }

  // 计算 N 期最冷号(0-9 中出现次数最少的)
  function computeColdNumber(history, n) {
    if (!history || history.length < n) return -1;
    const cnt = {};
    for (let i = 0; i < 10; i++) cnt[i] = 0;
    for (let i = 0; i < n && i < history.length; i++) {
      const h = history[i];
      cnt[h.a]++; cnt[h.b]++; cnt[h.c]++;
    }
    // 找最少出现的(并列选最小)
    let minCnt = Infinity, coldCode = -1;
    for (let i = 0; i < 10; i++) {
      if (cnt[i] < minCnt) { minCnt = cnt[i]; coldCode = i; }
    }
    return coldCode;
  }

  // 出现 ≥3 次的号码 → 高置信度
  function highConfidenceKill(kills) {
    const cnt = {};
    kills.forEach(k => cnt[k.code] = (cnt[k.code] || 0) + 1);
    return Object.entries(cnt)
      .filter(([_, v]) => v >= 3)
      .map(([code, v]) => ({ code: +code, hit: v }));
  }

  // ─────────────────────────────────────────────
  // 二、定位杀码 (百位/十位/个位 各杀 1 码)
  // ─────────────────────────────────────────────
  function positionKill(ctx, periodTail) {
    // v5.1:恢复 4 个真正有信号的定位选码公式(基于 49 期真实回测)
    // 选对率 = 公式输出 code 与该位实际开奖匹配的概率,基准 10% 随机
    //   - 百位:A×7+7取尾 14.29% / 和尾-3 12.24%
    //   - 十位:(A+B)-K取尾 18.37%
    //   - 个位:和尾+6取尾 20.41%
    // 其他 6 个公式选对率 < 10% 随机,继续剔除
    const { A, B, C, S, W, K } = ctx;
    periodTail = periodTail ?? (ctx.S % 10);
    return {
      bai: [
        { name: 'A×7+7取尾 [百]',       code: mod10(A * 7 + 7) },
        { name: '和尾-3 [百]',          code: mod10(W - 3) }
      ],
      shi: [
        { name: '(A+B)-K取尾 [十]',     code: mod10(A + B - K) }
      ],
      ge: [
        { name: '和尾+6取尾 [个]',      code: mod10(W + 6) }
      ]
    };
  }

  // 定位杀码共识(出现 ≥2 次的号码)
  function positionConsensus(pk) {
    const helper = arr => {
      const c = {};
      arr.forEach(x => c[x.code] = (c[x.code] || 0) + 1);
      return Object.entries(c).filter(([_, v]) => v >= 2).map(([k, v]) => ({ code: +k, hit: v }));
    };
    return {
      bai: helper(pk.bai),
      shi: helper(pk.shi),
      ge:  helper(pk.ge)
    };
  }

  // ─────────────────────────────────────────────
  // 三、定胆码
  // ─────────────────────────────────────────────
  function danCode(ctx) {
    const { A, B, C, S, W, K } = ctx;

    // 独胆 - 仅保留 49 期回测中高于/接近 30% 基准的 2 个公式
    // (和尾+跨度=主胆 24.49% 已剔除)
    const dandu = [
      { name: '(A×4+B×9+C×9+3)取尾', code: mod10(A * 4 + B * 9 + C * 9 + 3) },
      { name: '(A+B+C)×0.618首位',  code: Math.floor(S * 0.618) % 10 }
    ];

    // 双胆 - 49 期回测全部低于 51% 基准,已全部剔除
    const shuang = [];

    // 三胆(147-258-369 算法)
    const n = (A * 147 + B * 258 + C * 369) * 479;
    const digits = String(n).split('').map(Number).filter(d => d >= 0 && d <= 9);
    const sandanUnique = [...new Set(digits)].slice(0, 6);

    // 对码胆码(上期每个数字 +5 取尾)
    const duiMaSet = [...new Set([A, B, C].map(x => mod10(x + 5)))];

    return {
      dandu,
      shuangdan: shuang,
      sandan: sandanUnique,
      duima: duiMaSet
    };
  }

  // ─────────────────────────────────────────────
  // 四、杀和尾 / 杀跨度
  // ─────────────────────────────────────────────
  function killSumSpan(ctx) {
    const { A, B, C, W, K } = ctx;
    return {
      killHeWei: [
        W,                              // 直接杀掉上期和尾
        mod10(A + B),                   // (A+B)取尾
        mod10(A + C)                    // (A+C)取尾
      ],
      killKuaDu: [
        K,                              // 直接杀掉上期跨度
        mod10(A - C),                   // (A-C)取尾
        mod10(B - C)                    // (B-C)取尾
      ]
    };
  }

  // ─────────────────────────────────────────────
  // 六、组三 / 组六 参考
  // ─────────────────────────────────────────────
  function zuXuanRef(ctx, history) {
    const { W, K } = ctx;
    const prev = history[0];
    const refs = [];

    if (W === 0 || W === 5) refs.push('和尾为 0 或 5,优先留意组三');
    if (K <= 3)             refs.push(`跨度 ${K} ≤ 3,组三概率偏高`);
    if (prev.type === '组三') refs.push('上期为组三,下期优先参考组六');

    // 冷热提示(基于近 30 期)
    const recent = history.slice(0, 30);
    const cnt = {};
    recent.forEach(h => [h.a, h.b, h.c].forEach(d => cnt[d] = (cnt[d] || 0) + 1));
    const sorted = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
    const hot = sorted.slice(0, 3).map(([d]) => +d);
    const cold = sorted.slice(-3).map(([d]) => +d);

    return { refs, hot, cold };
  }

  // ─────────────────────────────────────────────
  // 七、进阶冷门玩法
  // ─────────────────────────────────────────────
  function advanced(ctx, history) {
    const { A, B, C } = ctx;
    const num = A * 100 + B * 10 + C;

    // π 算法
    const pi = Math.round(num * 3.14);
    const piDigits = String(pi).split('').map(Number).filter(d => d >= 0 && d <= 9);
    const piUnique = [...new Set(piDigits)];

    // 隔期杀号:隔一期十位
    const prevB = history[2] ? history[2].b : B;
    const skipKill = prevB;

    // 05/16/27/38/49 分割两路
    const odd = [0, 1, 2, 3, 4];   // 本期
    const even = [5, 6, 7, 8, 9];  // 备用
    // 简单规则:本期和值奇→用 0-4 路径,偶→用 5-9 路径
    const path = ctx.S % 2 === 0 ? even : odd;
    const altPath = ctx.S % 2 === 0 ? odd : even;

    return { piDigits: piUnique, skipKill, path, altPath };
  }

  // ─────────────────────────────────────────────
  // 八、十位轴杀两码 (用户首条指令,最显眼展示)
  // ─────────────────────────────────────────────
  function shiWeiZhouSha(B) {
    // (B-1), (B+1), (B+2) mod 10
    const nums = [mod10(B - 1), mod10(B + 1), mod10(B + 2)];
    // 杀掉这三数组成的全部两码组合
    const pairs = [];
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const a = Math.min(nums[i], nums[j]);
        const b = Math.max(nums[i], nums[j]);
        pairs.push(`${a}${b}`);
      }
    }
    return { axisNumbers: [...new Set(nums)].sort((a, b) => a - b), killPairs: pairs };
  }

  // ════════════════════════════════════════════════
  // v5.8 杀组选公式(200 期真实回测)
  //   - 杀组三:连续组三 / 跨度≥7
  //   - 杀组六:跨度1-2 / 和尾9
  //   - 杀豹子:3数同012路
  // ════════════════════════════════════════════════
  // v5.8.13 正向预测:预测下期开什么形态(220 期回测)
  //   - 用上期 A/B/C/S/K 推下期形态(组三 / 组六 / 豹子)
  //   - 每个 trigger 给权重 + 准确率(基于 220 期回测)
  //   - 综合所有 trigger → recommend: 'zu3' | 'zu6' | 'baozi' | 'mixed'
  // ════════════════════════════════════════════════
  function predictType(ctx, history) {
    const { A, B, C, S, K, history: hist } = ctx;
    const W = S % 10;
    const triggers = [];
    let predictZu3 = 0;   // 权重(多个公式叠加)
    let predictZu6 = 0;
    let predictBZ  = 0;
    const cur = hist ? hist[0] : null;
    const prev1 = hist ? hist[1] : null;
    const prev2 = hist ? hist[2] : null;
    function getType(h) {
      if (!h) return '';
      if (h.a === h.b && h.b === h.c) return '豹子';
      if (h.a === h.b || h.b === h.c || h.a === h.c) return '组三';
      return '组六';
    }
    const typePrev1 = getType(prev1);
    const typePrev2 = getType(prev2);

    // ── 预测开组三(高准确率公式)─
    if (K === 2) {
      predictZu3 += 1.5;
      triggers.push({ name: '跨度=2 → 预测开组三', weight: 1.5, rate: 42.86, baseline: 27.0, lift: 15.86 });
    }
    if (W === 9) {
      predictZu3 += 1.2;
      triggers.push({ name: '和尾=9 → 预测开组三', weight: 1.2, rate: 33.33, baseline: 27.0, lift: 6.33 });
    }
    if (K <= 3 && K > 0) {  // 跨度 1-3
      predictZu3 += 0.8;
      triggers.push({ name: `跨度${K}≤3 → 预测开组三`, weight: 0.8, rate: 31.88, baseline: 27.0, lift: 4.88 });
    }

    // ── 预测开组六(高准确率公式)─
    if (W === 5) {
      predictZu6 += 1.6;
      triggers.push({ name: '和尾=5 → 预测开组六', weight: 1.6, rate: 86.21, baseline: 72.0, lift: 14.21 });
    }
    if (W === 0) {
      predictZu6 += 1.5;
      triggers.push({ name: '和尾=0 → 预测开组六', weight: 1.5, rate: 85.00, baseline: 72.0, lift: 13.00 });
    }
    if (K >= 5) {
      predictZu6 += 0.8;
      triggers.push({ name: `跨度${K}≥5 → 预测开组六`, weight: 0.8, rate: 73.95, baseline: 72.0, lift: 1.95 });
    }
    if (typePrev1 === '组三' && typePrev2 === '组三') {
      predictZu6 += 1.0;
      triggers.push({ name: '连2期组三 → 预测开组六', weight: 1.0, rate: 73.68, baseline: 72.0, lift: 1.68 });
    }

    // ── 预测开豹子(220 期 0 次,公式都没样本,先不列)─

    // 推荐:取权重最大
    let recommend = 'mixed';
    let bestW = 0;
    if (predictZu3 > predictZu6 && predictZu3 > bestW) { recommend = 'zu3'; bestW = predictZu3; }
    if (predictZu6 > predictZu3 && predictZu6 > bestW) { recommend = 'zu6'; bestW = predictZu6; }
    if (bestW === 0) recommend = 'mixed';

    return {
      predictZu3, predictZu6, predictBZ,
      recommend,  // 'zu3' | 'zu6' | 'mixed'
      triggers,
    };
  }
  // ════════════════════════════════════════════════
  function killZuxuan(ctx, history) {
    const { A, B, C, S, K, history: hist } = ctx;
    const W = S % 10;
    const triggers = [];
    let killZu3 = false;
    let killZu6 = false;
    let killBZ = false;

    const cur = hist ? hist[0] : null;
    const prev1 = hist ? hist[1] : null;
    const prev2 = hist ? hist[2] : null;
    function getType(h) {
      if (!h) return '';
      if (h.a === h.b && h.b === h.c) return '豹子';
      if (h.a === h.b || h.b === h.c || h.a === h.c) return '组三';
      return '组六';
    }
    const typeNow = getType(cur);
    const typePrev1 = getType(prev1);
    const typePrev2 = getType(prev2);

    // ─── 杀组三规则 ───
    if (typeNow === '组三' && typePrev1 === '组三') {
      killZu3 = true;
      triggers.push({ name: '连2期组三→杀组三', weight: 1.4, rate: 75.00 });
    } else if (typeNow === '组三') {
      killZu3 = true;
      triggers.push({ name: '上期组三→杀组三', weight: 1.0, rate: 72.41 });
    }
    if (K >= 7) {
      killZu3 = true;
      triggers.push({ name: `跨度${K}≥7→杀组三`, weight: 1.3, rate: 75.00 });
    }

    // ─── 杀组六规则 ───
    if (K === 2) {
      killZu6 = true;
      triggers.push({ name: '跨度2→杀组六', weight: 1.5, rate: 36.84 });
    } else if (K === 1) {
      killZu6 = true;
      triggers.push({ name: '跨度1→杀组六', weight: 1.2, rate: 31.25 });
    }
    if (W === 9) {
      killZu6 = true;
      triggers.push({ name: '和尾9→杀组六', weight: 1.2, rate: 32.00 });
    }

    // ─── 杀豹子规则 ───
    const routes = [A % 3, B % 3, C % 3];
    if (new Set(routes).size === 1) {
      killBZ = true;
      triggers.push({ name: '3数同012路→杀豹子', weight: 1.5, rate: 100.00 });
    }
    if (typeNow === '豹子') {
      killBZ = true;
      triggers.push({ name: '上期豹子→杀豹子', weight: 1.5, rate: 100.00 });
    }

    let recommend = 'mixed';
    if (killZu3 && !killZu6 && !killBZ) recommend = 'zu6';
    else if (killZu6 && !killZu3 && !killBZ) recommend = 'zu3';
    else if (killBZ && !killZu3 && !killZu6) recommend = 'mixed';
    else if (killZu3 && killZu6) recommend = 'mixed';

    return {
      killZu3, killZu6, killBZ,
      recommend,
      triggers,
      kill_zu3: killZu3,
      kill_zu6: killZu6,
      kill_baozi: killBZ
    };
  }

  // ════════════════════════════════════════════════
  // v5.8+ 杀组选推荐(杀含某数,200 期回测最佳)
  //   杀 1 个数 = 排除所有含此数的号(1000 → 702 注)
  //   推荐公式:杀含(上期跨度+1)= 79.21% 杀对率
  // ════════════════════════════════════════════════
  function suggestKillContain(ctx) {
    const { K, S } = ctx;
    return [
      { num: (K + 1) % 10, name: '杀含(上期跨度+1)', rate: 79.21, weight: 1.5 },
      { num: (S + 3) % 10, name: '杀含(上期和值+3)', rate: 77.23, weight: 1.4 },
      { num: (S % 10 + 1) % 10, name: '杀含(上期和尾+1)', rate: 76.24, weight: 1.2 },
      { num: (ctx.A + K) % 10, name: '杀含(上期A+跨度)', rate: 73.76, weight: 1.0 }
    ];
  }

  // ─────────────────────────────────────────────
  // 综合主入口
  // ─────────────────────────────────────────────
  function run(history, periodTail) {
    const ctx = getContext(history);
    const kills = killOneCode(ctx);
    const high = highConfidenceKill(kills);
    const pos = positionKill(ctx, periodTail);
    const posCon = positionConsensus(pos);
    const dan = danCode(ctx);
    const sumSpan = killSumSpan(ctx);
    const zuxuan = zuXuanRef(ctx, history);
    const adv = advanced(ctx, history);
    const axis = shiWeiZhouSha(ctx.B);
    // v5.8 杀组选
    const zuxuanKill = killZuxuan(ctx, history);
    // v5.8.13 正向预测形态
    const typePredict = predictType(ctx, history);

    return { ctx, kills, high, pos, posCon, dan, sumSpan, zuxuan, adv, axis, zuxuanKill, typePredict };
  }

  // ════════════════════════════════════════════════
  // 九、杀号池(v5.8 加权投票共识)
  //   - 每个公式输出 1 个 code,带权重(BACKTEST[k.name].weight)
  //   - 累计权重 ≥ 3 = 共识杀号(进入 killPool)
  //   - 同时记录所有公式的"加权投票数",供 UI 显示
  // ════════════════════════════════════════════════
  function buildKillPool(result) {
    // ─── 加权投票:每个公式输出 1 个 code,按 BACKTEST.weight 累加 ───
    const votes = {};  // code -> { weight, names, hit(原始命中公式数) }
    result.kills.forEach(k => {
      const bt = BACKTEST[k.name];
      if (!bt) return;
      const w = bt.weight || 1.0;
      if (!votes[k.code]) votes[k.code] = { code: k.code, weight: 0, hit: 0, names: [] };
      votes[k.code].weight += w;
      votes[k.code].hit++;
      votes[k.code].names.push(k.name);
    });
    // 共识杀号:权重 ≥ 3.0
    const consensus = Object.values(votes)
      .filter(v => v.weight >= 3.0)
      .sort((a, b) => b.weight - a.weight || a.code - b.code);
    // 全部投票(供 UI 显示)
    const allVotes = Object.values(votes)
      .sort((a, b) => b.weight - a.weight || a.code - b.code);

    // ─── 高置信度(权重 ≥ 4.0 = 至少 2 个高准公式) ───
    const high = allVotes.filter(v => v.weight >= 4.0);

    // 兼容旧字段:把 [{name, code, weight}] 包装为 killPool 期望的 [{name, code}]
    function tallyFromVotes(voteList) {
      return voteList.map(v => ({ code: v.code, hit: v.hit, weight: v.weight, names: v.names }));
    }

    // ─── 旧字段(三位/全局),保持兼容 ───
    const global = tallyFromVotes(allVotes);

    // ═══════════════════════════════════════════════════════
    // v5.8.11 定位杀:每位只显示"该位回测率高"的 chip
    //   - 用 BACKTEST.baiRate/shiRate/geRate 排序
    //   - 3 张卡显示真正按位差异
    // ═══════════════════════════════════════════════════════
    function buildPosKills(pos) {  // pos = 'bai' | 'shi' | 'ge'
      const rateKey = pos + 'Rate';
      // 收集本期的 (公式名, 杀号) + 该位的 200 期回测率
      const codeMap = {};  // code -> {code, rate, weight, names, hit}
      result.kills.forEach(k => {
        const bt = BACKTEST[k.name];
        if (!bt || bt[rateKey] == null) return;
        if (!codeMap[k.code]) codeMap[k.code] = {
          code: k.code, rate: 0, weight: 0, names: [], hit: 0
        };
        // 取所有公式中**最高**的 200 期回测率(代表杀这号对该位的准度)
        if (bt[rateKey] > codeMap[k.code].rate) codeMap[k.code].rate = bt[rateKey];
        codeMap[k.code].weight += bt.weight || 1.0;
        codeMap[k.code].names.push(`${k.name}(${bt[rateKey].toFixed(1)}%)`);
        codeMap[k.code].hit++;
      });
      return Object.values(codeMap).sort((a, b) => b.rate - a.rate || b.weight - a.weight || a.code - b.code);
    }
    const bai = buildPosKills('bai');
    const shi = buildPosKills('shi');
    const ge  = buildPosKills('ge');

    // 按位高置信度(rate ≥ 92% = 2.66% 高于随机 90%)
    const baiHigh = bai.filter(v => v.rate >= 92);
    const shiHigh = shi.filter(v => v.rate >= 92);
    const geHigh  = ge.filter(v => v.rate >= 92);

    const baiAll = bai;
    const shiAll = shi;
    const geAll  = ge;

    // 高准公式输出(供 smartPick)
    const highKill = result.kills
      .filter(k => BACKTEST[k.name] && BACKTEST[k.name].killLevel === 'high')
      .map(k => k.code);

    return {
      bai, shi, ge, global,
      baiAll, shiAll, geAll,
      baiHigh, shiHigh, geHigh,
      kills: result.kills,
      highKill,
      axis: result.axis,
      killHeWei: result.sumSpan.killHeWei,
      killKuaDu: result.sumSpan.killKuaDu,
      // v5.8 新字段
      votes: allVotes,        // 加权投票 [{code, weight, hit, names}]
      consensus: consensus,   // ≥3 共识杀号
      consensusCodes: consensus.map(v => v.code)  // 仅 code 列表,方便快速判断
    };
  }

  // ════════════════════════════════════════════════
  // v5.8 自学习:近 N 期每个公式命中率,自动调权重
  //   - 用近 N 期回测每个公式的"杀对率"
  //   - 高于基准的 × 1.3,低于基准的 × 0.7
  //   - 不修改 BACKTEST(只返回调整后的 weight 字典,给 buildKillPool 用)
  // ════════════════════════════════════════════════
  function autoLearnWeights(history, lookback) {
    lookback = lookback || 30;
    if (!history || history.length < lookback + 2) return {};
    // 对每个公式,跑近 lookback 期,算杀对率
    const formulaStats = {};
    // 先收集所有公式名 + 跑公式的函数
    const formulaFns = {
      '两期跨度相加取尾': (h, i) => mod10(h[i+1].span + h[i+2].span),
      '三数相乘取个位': (h, i) => mod10(h[i].a * h[i].b * h[i].c),
      '和值×0.618首位': (h, i) => Math.floor((h[i].a+h[i].b+h[i].c) * 0.618) % 10,
      '百×5+十×8取尾':  (h, i) => mod10(h[i].a * 5 + h[i].b * 8),
      '(A+C)取尾':      (h, i) => mod10(h[i].a + h[i].c),
      '(和值-跨度)取尾': (h, i) => mod10((h[i].a+h[i].b+h[i].c) - h[i].span),
      '两期和尾相加取尾': (h, i) => mod10(((h[i].a+h[i].b+h[i].c) % 10) + ((h[i+1].a+h[i+1].b+h[i+1].c) % 10)),
      '(跨度+个位)×3取尾': (h, i) => mod10((h[i].span + h[i].c) * 3),
      '十+个取尾杀下期': (h, i) => mod10(h[i].b + h[i].c),
      '上期十位直接杀':  (h, i) => h[i].b
    };
    // 回测每个公式
    for (const [name, fn] of Object.entries(formulaFns)) {
      let correct = 0, total = 0;
      for (let i = 0; i < lookback; i++) {
        if (i + 2 >= history.length) break;
        const actual = history[i];
        const killCode = fn(history, i);
        if (killCode == null) continue;
        total++;
        // 杀对:actual 的 3 个号都不等于 killCode
        if (actual.a !== killCode && actual.b !== killCode && actual.c !== killCode) correct++;
      }
      const rate = total > 0 ? (correct / total * 100) : 72.9;
      formulaStats[name] = { rate, correct, total };
    }
    // 计算新权重
    const newWeights = {};
    for (const [name, stat] of Object.entries(formulaStats)) {
      const bt = BACKTEST[name];
      if (!bt) continue;
      const baseWeight = bt.weight || 1.0;
      // 高于基准 1% → × 1.1,低于基准 1% → × 0.9,最大 ±30%
      const diff = stat.rate - bt.killBase;
      const factor = Math.max(0.7, Math.min(1.3, 1 + diff * 0.03));
      newWeights[name] = +(baseWeight * factor).toFixed(2);
    }
    return { weights: newWeights, stats: formulaStats, lookback };
  }

  // ════════════════════════════════════════════════
  // 十、胆码池(按 百 / 十 / 个 汇总,带来源标签)
  //    - 用户问"分百位、十位、个位",这里给每个位一份候选
  // ════════════════════════════════════════════════
  function buildDanPool(result, ctx) {
    const { A, B, C, S, W, K } = ctx;
    // 主胆来源:保留的 2 个独胆公式中第一个(49 期命中率 34.69%)
    const mainDan = mod10(A * 4 + B * 9 + C * 9 + 3);

    // 各位专属胆 — 全部使用 49 期回测中保留的公式
    // 双胆(和尾+3 / 和尾-3 / 主胆+5)与独胆中"和尾+跨度=主胆"已剔除
    const baiCandidates = [
      { code: mainDan,                          src: '主胆(A×4+B×9+C×9+3)' },
      { code: mod10(A + 5),                     src: '上期百位对码+5' },
      { code: Math.floor(S * 0.618) % 10,       src: '黄金分割首位' }
    ];
    const shiCandidates = [
      { code: mainDan,                          src: '主胆(A×4+B×9+C×9+3)' },
      { code: mod10(B + 5),                     src: '上期十位对码+5' },
      { code: Math.floor(S * 0.618) % 10,       src: '黄金分割首位' }
    ];
    const geCandidates = [
      { code: mainDan,                          src: '主胆(A×4+B×9+C×9+3)' },
      { code: mod10(C + 5),                     src: '上期个位对码+5' },
      { code: Math.floor(S * 0.618) % 10,       src: '黄金分割首位' }
    ];

    // 去重(同一位同一个号码可能多个来源,合并来源)
    function merge(list) {
      const m = {};
      list.forEach(x => {
        if (!m[x.code]) m[x.code] = { code: x.code, src: [] };
        m[x.code].src.push(x.src);
      });
      return Object.values(m);
    }

    return {
      bai: merge(baiCandidates),
      shi: merge(shiCandidates),
      ge:  merge(geCandidates),
      mainDan,
      all: [...result.dan.dandu, ...result.dan.shuangdan].map(x => x.code)
    };
  }

  // ════════════════════════════════════════════════
  // 十一、统计:近 N 期各位的热号 / 冷号 + 多时间窗口
  // ════════════════════════════════════════════════
  function buildHeatMap(history, n) {
    n = n || 30;
    function tallyFor(periods) {
      const recent = history.slice(0, periods);
      const cnt = {};
      recent.forEach(h => [h.a, h.b, h.c].forEach(d => cnt[d] = (cnt[d] || 0) + 1));
      for (let i = 0; i < 10; i++) if (!(i in cnt)) cnt[i] = 0;
      return cnt;
    }
    const cnt4  = tallyFor(Math.min(4, history.length));
    const cnt30 = tallyFor(Math.min(30, history.length));
    const cntAll = tallyFor(history.length);

    // 短期(近 4 期)热号 — 反应近期趋势
    const sorted4 = Object.entries(cnt4).sort((a, b) => b[1] - a[1]);
    const hot4  = sorted4.slice(0, 4).map(([d]) => +d);

    // 中期(近 30 期)热号 — 反应中期趋势
    const sorted30 = Object.entries(cnt30).sort((a, b) => b[1] - a[1]);
    const hot30 = sorted30.slice(0, 4).map(([d]) => +d);
    const warm30 = sorted30.slice(0, 6).map(([d]) => +d);

    // 稳定热号:两个窗口都热的号(短期 ∩ 中期) — 减少短期噪声
    const hotBoth = hot4.filter(x => hot30.includes(x));

    // 冷号(近 30 期)
    const cold = sorted30.slice(-4).map(([d]) => +d);

    return { hot4, hot30, hotBoth, hot: hotBoth.length ? hotBoth : hot30, warm: warm30, cold, all: cntAll };
  }

  // ════════════════════════════════════════════════
  // 十二、对码集合(0↔5 1↔6 2↔7 3↔8 4↔9)
  //    给定一个或多个号码,返回所有对码
  // ════════════════════════════════════════════════
  function pairCodes(arr) {
    return [...new Set(arr.map(x => PAIR[x]))];
  }

  // ════════════════════════════════════════════════
  // 十三、智能选号(多策略 + 宽松模式)
  //    options = {
  //      type: 'zu6'|'zu3'|'single'|'mixed',
  //      count: 5|10|20,
  //      strategies: ['A','B','C','D'],  // 选号策略
  //      loose: false,                  // 宽松模式:杀号只降权不硬排
  //      constraints: {
  //        oddEven: '2odd1even'|'2even1odd'|'allodd'|'alleven'|'mixed',
  //        bigSmall: '2big1small'|'2small1big'|'allbig'|'allsmall'|'mixed',
  //        spanMin: 0, spanMax: 9
  //      }
  //    }
  // ════════════════════════════════════════════════
  function smartPick(killPool, danPool, options) {
    const opt = Object.assign({
      type: 'zu6',
      count: 5,
      seed: Date.now(),
      strategies: ['A'],
      loose: false,
      autoLoose: false,    // v5.5:候选池 < 4 不切宽松,让用户看到"选不到"的现实
      highConfOnly: true,  // 智能选号只选"高置信度选号"(默认开)
      constraints: {}
    }, options);
    const rng = mulberry32(opt.seed);
    const ctx = opt.ctx || {};

    // ════════════════════════════════════════════════
    // v5.5 方案 C 优化版:杀 30% + 选 70%
    //  1. 候选池默认全 0-9
    //  2. 排除集合(精简:只保留最准的 2 个):
    //     - 十位轴 axisNumbers(3 数,3数全杀对率 57.14% > 基准 46.67%)
    //     - 上期十位直接杀(1 数,杀对率 77.55% > 基准 70%)
    //     - 其他 LOW 杀号公式/杀和尾 全部放宽(不作为强排除)
    //  3. 加权集合(在剩余里优先选):
    //     - 胆码 1.5
    //     - 高置信度选号(选对率 ≥ 35%):1.5
    //     - 中置信度选号(25-35%):1.0
    //     - 多时间窗口热号 1.2 / 冷号 0.5 / 对码 0.8
    //  4. 严格:候选 = 加权 - 排除
    //     权重:排除号 0.3(30% 概率) / 默认 1.0(100%) / 加权 1.5(150%)
    //  5. 候选 < 4 不切宽松(autoLoose=false),让用户看到"选不到"的现实
    // ════════════════════════════════════════════════
    const allKills = (killPool.kills || killPool.baiAll || []);

    // ─── 排除集合(精简到 2 个最准的 + 用户手动)───
    // ①十位轴 axisNumbers(3 数,3 数全杀对率 57.14%)
    const axisNums = new Set((killPool.axis && killPool.axis.axisNumbers) || []);
    // ②上期十位直接杀(选对率 22.45% 最低 → 杀对率 77.55% 最高)
    const shiqiweiKill = new Set(
      allKills.filter(k => k.name === '上期十位直接杀').map(k => k.code)
    );
    // ③用户手动杀号(v5.7,候选号点击加入)
    const userKills = new Set(options.userKills || []);
    // 总排除 = axisNumbers + 上期十位直接杀 + 用户手动(4-7 个号)
    const exBai = new Set([...axisNums, ...shiqiweiKill, ...userKills]);
    const exShi = new Set([...axisNums, ...shiqiweiKill, ...userKills]);
    const exGe  = new Set([...axisNums, ...shiqiweiKill, ...userKills]);

    // ─── 加权集合(在剩余里优先选)───
    // 高置信度选号(选对率 ≥ 35%)
    const highSelectSet = new Set(
      Object.entries(BACKTEST)
        .filter(([n, bt]) => bt.level === 'high' && bt.base === 30)
        .map(([n]) => allKills.find(k => k.name === n))
        .filter(Boolean)
        .map(k => k.code)
    );
    // 中置信度选号(选对率 25-35%)
    const midSelectSet = new Set(
      Object.entries(BACKTEST)
        .filter(([n, bt]) => bt.level === 'mid' && bt.base === 30)
        .map(([n]) => allKills.find(k => k.name === n))
        .filter(Boolean)
        .map(k => k.code)
    );
    const includeBaiHigh = new Set(highSelectSet);
    const includeShiHigh = new Set(highSelectSet);
    const includeGeHigh  = new Set(highSelectSet);
    const includeBai = new Set([...highSelectSet, ...midSelectSet]);
    const includeShi = new Set([...highSelectSet, ...midSelectSet]);
    const includeGe  = new Set([...highSelectSet, ...midSelectSet]);

    const exSpan = new Set(killPool.killKuaDu);

    // 给 buildWeight 传排除 + 加权集合
    function buildWeight(strategy, dans, includeSet, includeHighSet) {
      const heat = opt.heatMap || { hot: [], hot4: [], hot30: [], hotBoth: [], cold: [] };
      const pairArr = opt.pairMap || { bai: [], shi: [], ge: [] };
      const hotSet = new Set(heat.hot || heat.hotBoth || []);
      const hotBothSet = new Set(heat.hotBoth || heat.hot || []);
      const hot4OnlySet = new Set((heat.hot4 || []).filter(x => !hotBothSet.has(x)));
      const coldSet = new Set(heat.cold);
      const danSet = new Set(dans);
      const pairSet = new Set(pairArr[strategy._pos || 'bai']);

      // 0-9 每个号给它一个权重
      // v5.6 严谨权重:
      //   排除号 0.2(20% 概率)
      //   默认 1.0(100% 概率)
      //   MID 选号 0.6(60% — 接近随机,严谨降权)
      //   HIGH 选号 1.5(150% — 真正高于基准)
      //   胆码 1.5(150% — 保留的 2 个独胆公式)
      //   热号 1.2(120% — 短期高频)
      //   冷号 0.5(50%)
      //   对码 0.8(80%)
      const weighted = [];
      for (let i = 0; i < 10; i++) {
        let w = 1.0;  // 默认 1.0
        const isEx = exBai.has(i);
        const isUserKill = userKills.has(i);  // v5.7:用户手动杀号
        const isHighSelect = includeHighSet.has(i);
        const isSelect = includeSet.has(i);
        if (isEx && !isUserKill) w = 0.2;  // 算法杀号 20% 概率(降权)
        if (isHighSelect) w = Math.max(w, 1.5);
        else if (isSelect) w = Math.max(w, 0.6);
        if (danSet.has(i)) w = Math.max(w, 1.5);
        if (hotBothSet.has(i)) w = Math.max(w, 1.2);
        else if (hot4OnlySet.has(i)) w = Math.max(w, 0.7);
        else if (hotSet.has(i)) w = Math.max(w, 0.9);
        if (coldSet.has(i)) w = Math.max(w, 0.5);
        if (pairSet.has(i)) w = Math.max(w, 0.8);
        if (isUserKill) w = 0;  // v5.7:用户手动杀号 0 概率(最后绝对置 0,不会被对码/热号覆盖)
        weighted.push({ code: i, weight: w, isEx, isSelect, isHighSelect });
      }

      // v5.5:严格模式 rest 调整 - 排除号降权 0.3 但仍在候选池(候选更全)
      // rest 包含:加权号 + 默认号(允许选 0.3 的排除号,因为是降权不是硬排)
      const rest = weighted.filter(x => x.weight >= 0.5);
      const danInRest = rest.filter(x => danSet.has(x.code));
      const hotInRest = rest.filter(x => hotSet.has(x.code) || hotBothSet.has(x.code));
      const coldInRest = rest.filter(x => coldSet.has(x.code));
      const pairInRest = rest.filter(x => pairSet.has(x.code));

      return {
        weighted, rest,            // 宽松用 weighted,严格用 rest
        dan: danInRest, hot: hotInRest, cold: coldInRest, pair: pairInRest,
        looseWeighted: weighted,    // 始终可用
        strictRest: rest
      };
    }

    const strats = opt.strategies;
    const danBai = danPool.bai.map(d => d.code);
    const danShi = danPool.shi.map(d => d.code);
    const danGe  = danPool.ge.map(d => d.code);

    // 加权选择
    function pickWeighted(weightList) {
      const total = weightList.reduce((s, x) => s + x.weight, 0);
      if (total <= 0) return null;
      let r = rng() * total;
      for (const w of weightList) {
        r -= w.weight;
        if (r <= 0) return w;
      }
      return weightList[weightList.length - 1];
    }

    function pickOne(weight) {
      // 严格模式:按策略顺序从 rest 池里挑
      if (!opt.loose) {
        for (const s of strats) {
          if (s === 'A' && weight.dan.length)  return { ...weight.dan[Math.floor(rng() * weight.dan.length)], via: 'A 胆码' };
          if (s === 'B' && weight.hot.length)  return { ...weight.hot[Math.floor(rng() * weight.hot.length)], via: 'B 热号' };
          if (s === 'C' && weight.cold.length) return { ...weight.cold[Math.floor(rng() * weight.cold.length)], via: 'C 冷号' };
          if (s === 'D' && weight.pair.length) return { ...weight.pair[Math.floor(rng() * weight.pair.length)], via: 'D 对码' };
        }
        if (weight.rest.length) return { ...weight.rest[Math.floor(rng() * weight.rest.length)], via: '兜底' };
        return null;
      }
      // 宽松模式:加权选择(胆/热/冷/对/杀号都有权重)
      const chosen = pickWeighted(weight.looseWeighted);
      if (!chosen) return null;
      // v5.6:详细来源标签 [胆码][HIGH][热号][冷号][对码][默认][杀号降权]
      let via = '🎲 默认';
      if (chosen.isEx) via = '⚠ 杀号(降权)';
      if (danBai.includes(chosen.code) || danShi.includes(chosen.code) || danGe.includes(chosen.code)) {
        via = '💎 胆码';
      }
      if (chosen.isHighSelect) {
        via = '⭐ HIGH 选号';
      } else if (chosen.isSelect) {
        via = '· MID 选号';
      }
      const heat = opt.heatMap || { hot: [], hot4: [], hot30: [], hotBoth: [], cold: [] };
      if (heat.hotBoth && heat.hotBoth.includes(chosen.code)) {
        via += ' +🔥 真热';
      } else if (heat.hot4 && heat.hot4.includes(chosen.code)) {
        via += ' +热号(短)';
      } else if (heat.hot && heat.hot.includes(chosen.code)) {
        via += ' +热号';
      }
      if (heat.cold && heat.cold.includes(chosen.code)) via += ' +❄冷号';
      const pairArr = opt.pairMap || { bai: [], shi: [], ge: [] };
      if (pairArr.bai.includes(chosen.code) || pairArr.shi.includes(chosen.code) || pairArr.ge.includes(chosen.code)) {
        via += ' +🔗对码';
      }
      return { ...chosen, via };
    }

    let wBai = buildWeight({ _pos: 'bai' }, danBai, includeBai, includeBaiHigh);
    let wShi = buildWeight({ _pos: 'shi' }, danShi, includeShi, includeShiHigh);
    let wGe  = buildWeight({ _pos: 'ge' },  danGe,  includeGe,  includeGeHigh);

    // 自动切宽松模式:任意位 rest 池 < 4 时,自动转宽松(默认开)
    if (opt.autoLoose && !opt.loose) {
      const minRest = Math.min(wBai.rest.length, wShi.rest.length, wGe.rest.length);
      if (minRest < 4) {
        opt.loose = true;
        wBai = buildWeight({ _pos: 'bai' }, danBai, includeBai, includeBaiHigh);
        wShi = buildWeight({ _pos: 'shi' }, danShi, includeShi, includeShiHigh);
        wGe  = buildWeight({ _pos: 'ge' },  danGe,  includeGe,  includeGeHigh);
      }
    }

    // 奇偶/大小判断
    function odd(n) { return n % 2 === 1; }
    function big(n) { return n >= 5; }
    function checkOE(abc) {
      const c = opt.constraints.oddEven;
      if (!c || c === 'mixed') return true;
      const o = abc.filter(odd).length;
      if (c === 'allodd')   return o === 3;
      if (c === 'alleven')  return o === 0;
      if (c === '2odd1even') return o === 2;
      if (c === '2even1odd') return o === 1;
      return true;
    }
    function checkBS(abc) {
      const c = opt.constraints.bigSmall;
      if (!c || c === 'mixed') return true;
      const b = abc.filter(big).length;
      if (c === 'allbig')    return b === 3;
      if (c === 'allsmall')  return b === 0;
      if (c === '2big1small')  return b === 2;
      if (c === '2small1big')  return b === 1;
      return true;
    }
    function checkSpan(abc) {
      const lo = opt.constraints.spanMin, hi = opt.constraints.spanMax;
      if (lo == null || hi == null) return true;
      const sp = Math.max(...abc) - Math.min(...abc);
      return sp >= lo && sp <= hi && !exSpan.has(sp);
    }
    function checkHeWei(abc) {
      if (!opt.constraints.heWeiIn) return true;
      const s = abc[0] + abc[1] + abc[2];
      return opt.constraints.heWeiIn.includes(s % 10);
    }

    const picks = [];
    const seen = new Set();
    let attempts = 0;
    const maxAttempts = opt.count * 600;

    while (picks.length < opt.count && attempts < maxAttempts) {
      attempts++;
      const ra = pickOne(wBai);
      const rb = pickOne(wShi);
      const rc = pickOne(wGe);
      if (!ra || !rb || !rc) break;

      const a = ra.code, b = rb.code, c = rc.code;
      const triple = [a, b, c];
      const uniq = new Set(triple);

      // 形态
      if (opt.type === 'zu6' && uniq.size !== 3) continue;
      if (opt.type === 'zu3' && uniq.size !== 2) continue;
      if (opt.type === 'single' && uniq.size === 1) continue;
      // mixed 不约束

      if (!checkOE(triple)) continue;
      if (!checkBS(triple)) continue;
      if (!checkSpan(triple)) continue;
      if (!checkHeWei(triple)) continue;

      const key = triple.join('');
      if (seen.has(key)) continue;
      seen.add(key);

      // 解释
      const reason = [];
      if (ra.isKill) reason.push(`百=${a}(降权命中)`);
      else if (ra.via !== '兜底' && ra.via !== '随机') reason.push(`百=${a}(${ra.via})`);
      else if (ra.via === '随机') reason.push(`百=${a}(随机补足)`);
      if (rb.isKill) reason.push(`十=${b}(降权命中)`);
      else if (rb.via !== '兜底' && rb.via !== '随机') reason.push(`十=${b}(${rb.via})`);
      else if (rb.via === '随机') reason.push(`十=${b}(随机补足)`);
      if (rc.isKill) reason.push(`个=${c}(降权命中)`);
      else if (rc.via !== '兜底' && rc.via !== '随机') reason.push(`个=${c}(${rc.via})`);
      else if (rc.via === '随机') reason.push(`个=${c}(随机补足)`);
      if (uniq.size === 3) reason.push('组六');
      else if (uniq.size === 2) reason.push('组三');
      else reason.push('豹子');
      const sp = Math.max(...triple) - Math.min(...triple);
      reason.push(`跨度=${sp}`);
      reason.push(`和值=${triple[0] + triple[1] + triple[2]}`);

      picks.push({ a, b, c, key, reason: reason.join(' · '), killHit: ra.isKill || rb.isKill || rc.isKill });
    }

    // v5.6:检测候选不足标志
    const minRest = Math.min(wBai.rest.length, wShi.rest.length, wGe.rest.length);
    const restTooLow = minRest < 4;

    return {
      type: opt.type,
      count: opt.count,
      actual: picks.length,
      picks,
      candidateStats: {
        bai: wBai.rest.length,
        shi: wShi.rest.length,
        ge:  wGe.rest.length,
        baiAll: 10, shiAll: 10, geAll: 10
      },
      restTooLow,   // v5.6:候选不足标志
      strategies: strats,
      loose: opt.loose
    };
  }

  // 简易伪随机(可重现,seed 来自 Date.now())
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ════════════════════════════════════════════════
  // 十四、实测准确率(49 期回测结果,2025-09-28 ~ 2026-08-05;样本较小仅供参考)
  //    base = 理论基准(全局 70%, 定位 90%)
  //    rate = 实际命中率
  //    level = 'high' 高出基准 4% 以上
  //          = 'mid'  在基准 ±4%
  //          = 'low'  低于基准 4% 以上
  // ════════════════════════════════════════════════
  // ════════════════════════════════════════════════
  // 真实 49 期回测(2026160-2026207,样本 49 期)
  // 重要(v5.0 修正):系统逻辑已反转
  //   - 之前:把"杀号公式"当"杀号"用,基准 30%(反向命中) — 错的
  //   - 现在:把"杀号公式"当"选号公式"用,基准 30%(选对率 = code 在 3 位中出现)
  //   - 选对率 > 30% = 公式输出 code 经常出现 = 准的"选号"信号
  // level 规则:选对率 - 30% ≥ +5% = high · ±5% = mid · ≤-5% = low
  // ════════════════════════════════════════════════
  const BACKTEST = {
    // v5.8 真实杀号 200 期回测(2026-01-09 至 2026-08-09)
    // 杀号 1 个号,理论基准 72.9% (=(9/10)^3);真正高于基准的有 3 个
    // rate = "选号"30% 基准  /  killRate = "杀号"72.9% 基准  /  weight = 共识投票权重
    // v5.8.11 加 baiRate/shiRate/geRate:220 期**按位**回测(理论 90%)
    '两期跨度相加取尾':       { rate: 26.90, base: 30, level: 'low',  killRate: 73.10, killBase: 72.9, killLevel: 'mid',  weight: 1.0,  baiRate: 92.66, shiRate: 90.37, geRate: 87.61 },
    '三数相乘取个位':         { rate: 23.35, base: 30, level: 'low',  killRate: 77.23, killBase: 72.9, killLevel: 'high', weight: 1.5,  baiRate: 91.74, shiRate: 91.28, geRate: 91.74 },
    '和值×0.618首位':        { rate: 27.41, base: 30, level: 'low',  killRate: 72.77, killBase: 72.9, killLevel: 'mid',  weight: 1.0,  baiRate: 92.66, shiRate: 90.37, geRate: 91.28 },
    '百×5+十×8取尾':         { rate: 26.40, base: 30, level: 'low',  killRate: 74.26, killBase: 72.9, killLevel: 'high', weight: 1.4,  baiRate: 90.37, shiRate: 87.16, geRate: 95.41 },  // ⭐⭐⭐ 选个位 95.41%
    '(和值-跨度)取尾':       { rate: 27.41, base: 30, level: 'low',  killRate: 73.27, killBase: 72.9, killLevel: 'mid',  weight: 1.0,  baiRate: 90.83, shiRate: 88.07, geRate: 92.20 },
    '两期和尾相加取尾':      { rate: 27.41, base: 30, level: 'low',  killRate: 73.10, killBase: 72.9, killLevel: 'mid',  weight: 1.0,  baiRate: 88.07, shiRate: 92.20, geRate: 91.28 },
    '上期十位直接杀':         { rate: 24.37, base: 30, level: 'low',  killRate: 75.25, killBase: 72.9, killLevel: 'high', weight: 1.4,  baiRate: 90.83, shiRate: 92.66, geRate: 93.12 },  // ⭐ 选十位 92.66%
    '(跨度+个位)×3取尾':    { rate: 27.92, base: 30, level: 'low',  killRate: 71.29, killBase: 72.9, killLevel: 'mid',  weight: 0.9,  baiRate: 89.91, shiRate: 91.74, geRate: 88.07 },
    '十+个取尾杀下期':        { rate: 27.92, base: 30, level: 'low',  killRate: 71.79, killBase: 72.9, killLevel: 'low',  weight: 0.8,  baiRate: 89.91, shiRate: 89.45, geRate: 90.37 },
    '(A+C)取尾':             { rate: 30.46, base: 30, level: 'high', killRate: 69.31, killBase: 72.9, killLevel: 'low',  weight: 0.7,  baiRate: 89.45, shiRate: 85.78, geRate: 89.45 },
    '冷号回补杀(20期)':      { rate: 28.00, base: 30, level: 'low',  killRate: 72.00, killBase: 72.9, killLevel: 'mid',  weight: 1.0,  baiRate: 89.91, shiRate: 90.37, geRate: 90.37 },
    '012路杀((A%3+C%3))':   { rate: 27.50, base: 30, level: 'low',  killRate: 72.50, killBase: 72.9, killLevel: 'mid',  weight: 1.0,  baiRate: 87.61, shiRate: 90.37, geRate: 90.83 },
    '和值+3取尾杀':          { rate: 26.80, base: 30, level: 'low',  killRate: 73.20, killBase: 72.9, killLevel: 'mid',  weight: 1.0,  baiRate: 90.83, shiRate: 91.74, geRate: 92.20 },
    '大中小杀(B+2取尾)':    { rate: 27.10, base: 30, level: 'low',  killRate: 72.90, killBase: 72.9, killLevel: 'mid',  weight: 1.0,  baiRate: 91.74, shiRate: 90.83, geRate: 90.83 },
    '期号尾数杀':            { rate: 26.50, base: 30, level: 'low',  killRate: 73.50, killBase: 72.9, killLevel: 'mid',  weight: 1.0,  baiRate: 89.91, shiRate: 90.37, geRate: 90.83 },

    // === 独胆(同上,选对率基准 30%) ===
    '(A×4+B×9+C×9+3)取尾':  { rate: 30.81, base: 30, level: 'high', killRate: 69.19, killBase: 72.9, killLevel: 'low',  weight: 0.7 },
    '(A+B+C)×0.618首位':    { rate: 27.27, base: 30, level: 'low',  killRate: 72.73, killBase: 72.9, killLevel: 'mid',  weight: 1.0 },

    // === 定位选码(每位基准 10% 随机) ===
    '和尾+6取尾 [个]':       { rate: 10.10, base: 10, level: 'mid',  killRate: 89.90, killBase: 90,   killLevel: 'mid',  weight: 1.0 },
    '(A+B)-K取尾 [十]':      { rate: 7.58,  base: 10, level: 'low',  killRate: 92.42, killBase: 90,   killLevel: 'mid',  weight: 1.0 },
    'A×7+7取尾 [百]':       { rate: 7.07,  base: 10, level: 'low',  killRate: 92.93, killBase: 90,   killLevel: 'mid',  weight: 1.0 },
    '和尾-3 [百]':          { rate: 11.62, base: 10, level: 'mid',  killRate: 88.38, killBase: 90,   killLevel: 'low',  weight: 0.8 },

    // === 十位轴(200 期真实回测) ===
    '十位轴选 · 选对率':     { rate: 64.82, base: 65.7, level: 'low',  killRate: 64.82, killBase: 65.7, killLevel: 'low',  weight: 0.8 },
    '十位轴3数全 · 杀对率':  { rate: 35.18, base: 34.3, level: 'mid',  killRate: 35.18, killBase: 34.3, killLevel: 'mid',  weight: 1.0 },
    '十位轴单号 · 杀对率':   { rate: 35.18, base: 34.3, level: 'mid',  killRate: 35.18, killBase: 34.3, killLevel: 'mid',  weight: 1.0 },
    '十位轴对子 · 杀对率':   { rate: 85.43, base: 85.0, level: 'mid',  killRate: 85.43, killBase: 85.0, killLevel: 'mid',  weight: 1.0 },

    // === v5.8 杀组选(200 期真实回测)===
    '杀组三·上期组三':         { rate: 72.41, base: 71.43, level: 'mid',  killRate: 72.41, killBase: 71.43, killLevel: 'mid',  weight: 1.0 },
    '杀组三·连2期组三':       { rate: 75.00, base: 71.43, level: 'high', killRate: 75.00, killBase: 71.43, killLevel: 'high', weight: 1.4 },
    '杀组三·跨度≥7':         { rate: 75.00, base: 71.43, level: 'high', killRate: 75.00, killBase: 71.43, killLevel: 'high', weight: 1.3 },
    '杀组六·跨度1':           { rate: 31.25, base: 28.57, level: 'mid',  killRate: 31.25, killBase: 28.57, killLevel: 'mid',  weight: 1.2 },
    '杀组六·跨度2':           { rate: 36.84, base: 28.57, level: 'high', killRate: 36.84, killBase: 28.57, killLevel: 'high', weight: 1.5 },
    '杀组六·和尾9':           { rate: 32.00, base: 28.57, level: 'mid',  killRate: 32.00, killBase: 28.57, killLevel: 'mid',  weight: 1.2 },
    '杀豹子·3数同012路':      { rate: 100.00, base: 100,   level: 'high', killRate: 100.00, killBase: 100,  killLevel: 'high', weight: 1.5 },

    // === v5.8+ 杀组选(杀含某数,200 期回测)===
    // 杀 1 个数:理论 72.9% 杀对率(因 271/1000=27.1% 含此数)
    '杀含·上期跨度+1':         { rate: 79.21, base: 72.9, level: 'high', killRate: 79.21, killBase: 72.9, killLevel: 'high', weight: 1.5 },
    '杀含·上期和值+3':         { rate: 77.23, base: 72.9, level: 'high', killRate: 77.23, killBase: 72.9, killLevel: 'high', weight: 1.4 },
    '杀含·上期和尾+1':         { rate: 76.24, base: 72.9, level: 'mid',  killRate: 76.24, killBase: 72.9, killLevel: 'mid',  weight: 1.2 },
    '杀含·上期A+跨度':         { rate: 73.76, base: 72.9, level: 'mid',  killRate: 73.76, killBase: 72.9, killLevel: 'mid',  weight: 1.0 }
  };
  const BACKTEST_SAMPLE = 199;   // 200-1=199 有效样本
  const BACKTEST_NOTE = '200 期真实回测(2026-01-09 至 2026-08-09):杀号 1 个号基准 72.9%;真正高于基准:三数相乘 77.23% / 上期十位 75.25% / A×5+B×8 74.26% / 杀含(上期跨度+1) 79.21% ⭐';

  /**
   * 根据公式名字返回准确率角标 HTML
   * @param {string} name 公式名称
   * @param {number} minRate 用户设定的"高置信度"门槛(默认 30)
   * @returns {string} HTML 字符串(无数据时返回空)
   */
  function getBacktestBadge(name, minRate) {
    const bt = BACKTEST[name];
    if (!bt) return '';
    minRate = minRate || 30;
    // 根据 minRate 动态计算 level
    let level;
    if (bt.rate >= minRate) level = 'high';
    else if (bt.rate >= bt.base) level = 'mid';
    else level = 'low';
    const arrow = level === 'high' ? '✓' : level === 'low' ? '✗' : '·';
    return `<span class="bt-badge bt-${level}" title="${BACKTEST_SAMPLE} 期回测命中率 ${bt.rate}%,基准 ${bt.base}%,当前门槛 ${minRate}%">${bt.rate}% ${arrow}</span>`;
  }

  /**
   * 给定一组公式(名字列表),返回综合准确率摘要
   * @param {string[]} names
   */
  function getBacktestSummary(names) {
    const items = names.map(n => BACKTEST[n]).filter(Boolean);
    if (!items.length) return null;
    const avg = items.reduce((s, x) => s + x.rate, 0) / items.length;
    return {
      count: items.length,
      avg: avg.toFixed(1),
      highCount: items.filter(x => x.level === 'high').length,
      lowCount: items.filter(x => x.level === 'low').length
    };
  }

  return {
    run, mod10, PAIR, shiWeiZhouSha, getContext,
    buildKillPool, buildDanPool, buildHeatMap, pairCodes, smartPick,
    getBacktestBadge, getBacktestSummary, BACKTEST,
    // v5.8 新导出
    autoLearnWeights, computeColdNumber, killZuxuan, suggestKillContain,
    // v5.8.13 正向预测形态
    predictType
  };
})();

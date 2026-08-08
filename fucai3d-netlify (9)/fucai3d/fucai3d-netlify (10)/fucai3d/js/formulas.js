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
      prev2K: prev2.span
    };
  }

  // ─────────────────────────────────────────────
  // 一、通杀一码公式 (每个公式给出 1 个被杀号码)
  // ─────────────────────────────────────────────
  function killOneCode(ctx) {
    const { A, B, C, S, W, K, prevW, prev2W, prevK, prev2K } = ctx;
    return [
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

    return { ctx, kills, high, pos, posCon, dan, sumSpan, zuxuan, adv, axis };
  }

  // ════════════════════════════════════════════════
  // 九、杀号池(按 百 / 十 / 个 汇总,带命中次数)
  //    - 各位的杀码 = 该位所有杀号公式的并集
  //    - 全局杀码 = 14 个通杀公式的并集(影响三位)
  // ════════════════════════════════════════════════
  function buildKillPool(result) {
    // 把 [{name, code}, ...] 转为 {code, hit, names}
    function tally(list) {
      const m = {};
      list.forEach(x => {
        if (!m[x.code]) m[x.code] = { code: x.code, hit: 0, names: [] };
        m[x.code].hit++;
        if (x.name) m[x.code].names.push(x.name);
      });
      return Object.values(m)
        .sort((a, b) => b.hit - a.hit || a.code - b.code);
    }
    // 全局通杀
    const global = tally(result.kills);
    // 三位选号(每位单独公式输出)
    const bai = tally(result.pos.bai);
    const shi = tally(result.pos.shi);
    const ge  = tally(result.pos.ge);

    // 高置信度(被 ≥2 个公式命中)
    function high(list) { return list.filter(x => x.hit >= 2); }

    // 某位"有效杀号"= 该位 + 全局(取并集)
    function merge(a, b) {
      const m = {};
      [...a, ...b].forEach(x => m[x.code] = Math.max(m[x.code] || 0, x.hit));
      return Object.entries(m)
        .map(([code, hit]) => ({ code: +code, hit }))
        .sort((a, b) => b.hit - a.hit || a.code - b.code);
    }
    const baiAll = merge(bai, global);
    const shiAll = merge(shi, global);
    const geAll  = merge(ge,  global);

    // 高置信度杀号(只收集 rate > base 的公式输出)
    // 49 期回测后,只有 2 个全局公式高于 30% 基准:两期跨度相加、三数相乘
    const highKill = result.kills
      .filter(k => BACKTEST[k.name] && BACKTEST[k.name].rate > BACKTEST[k.name].base)
      .map(k => k.code);

    return {
      bai, shi, ge, global,
      baiAll, shiAll, geAll,
      baiHigh: high(baiAll),
      shiHigh: high(shiAll),
      geHigh:  high(geAll),
      kills: result.kills,  // 原始杀号 [{name, code}],供 smartPick 加权回测
      highKill,  // 49 期回测高于基准的杀号公式输出(2 个公式)
      axis: result.axis,    // 十位轴(v5.3 用于排除集合)
      killHeWei: result.sumSpan.killHeWei,
      killKuaDu: result.sumSpan.killKuaDu
    };
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
    // === 全局通杀(当"选号"用,选对率基准 30%,200 期真实回测) ===
    // v5.7 用真实 200 期(2026-01-09 至 2026-08-06)回测
    // 真正高于基准的只有 (A+C)取尾 30.46%
    '两期跨度相加取尾':      { rate: 26.90, base: 30, level: 'low' },
    '三数相乘取个位':        { rate: 23.35, base: 30, level: 'low' },
    '和值×0.618首位':       { rate: 27.41, base: 30, level: 'low' },
    '百×5+十×8取尾':        { rate: 26.40, base: 30, level: 'low' },
    '(A+C)取尾':            { rate: 30.46, base: 30, level: 'high' },   // 200 期里真正高于基准
    '(和值-跨度)取尾':      { rate: 27.41, base: 30, level: 'low' },
    '两期和尾相加取尾':      { rate: 27.41, base: 30, level: 'low' },
    '(跨度+个位)×3取尾':    { rate: 27.92, base: 30, level: 'low' },
    '十+个取尾杀下期':       { rate: 27.92, base: 30, level: 'low' },
    '上期十位直接杀':        { rate: 24.37, base: 30, level: 'low' },

    // === 独胆(同上,选对率基准 30%) ===
    '(A×4+B×9+C×9+3)取尾': { rate: 30.81, base: 30, level: 'high' },  // 200 期里略高于基准
    '(A+B+C)×0.618首位':   { rate: 27.27, base: 30, level: 'low' },

    // === 定位选码(每位基准 10% 随机) ===
    '和尾+6取尾 [个]':      { rate: 10.10, base: 10, level: 'mid' },    // 200 期等基准
    '(A+B)-K取尾 [十]':     { rate: 7.58, base: 10, level: 'low' },
    'A×7+7取尾 [百]':      { rate: 7.07, base: 10, level: 'low' },
    '和尾-3 [百]':         { rate: 11.62, base: 10, level: 'mid' },     // 200 期略高于基准

    // === 十位轴(200 期真实回测) ===
    // 之前 49 期/2000 期的 96.60% / 57.14% 是错基准(基准 93.33% / 46.67% 实际是错的)
    // 正确基准:3 数选对率 1-(7/10)^3=65.7% / 3 数全杀对率 (7/10)^3=34.3% / 对子 85%
    '十位轴选 · 选对率':     { rate: 64.82, base: 65.7, level: 'low' },    // 接近基准
    '十位轴3数全 · 杀对率':  { rate: 35.18, base: 34.3, level: 'mid' },   // 略高于基准
    '十位轴单号 · 杀对率':   { rate: 35.18, base: 34.3, level: 'mid' },   // 整组不在下一期的概率
    '十位轴对子 · 杀对率':   { rate: 85.43, base: 85.0, level: 'mid' }    // 200 期真实 85%
  };
  const BACKTEST_SAMPLE = 199;   // 200-1=199 有效样本(跑预测用前 1 期)
  const BACKTEST_NOTE = '200 期真实回测(2026-01-09 至 2026-08-06):全局通杀选对率 23-30%(基准 30%);定位选码 7-12%(基准 10%);真正高于基准的只有 (A+C)取尾 30.46% 和 (A×4+B×9+C×9+3)取尾 30.81%';

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
    getBacktestBadge, getBacktestSummary, BACKTEST
  };
})();

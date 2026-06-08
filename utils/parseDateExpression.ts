/**
 * parseDateExpression.ts
 *
 * 从中文自然语言中提取时间范围，返回 Unix 时间戳（毫秒）。
 * 纯正则 + 规则实现，无外部依赖。
 */

/* ------------------------------------------------------------------ */
/*  辅助：中文数字 → 阿拉伯数字                                       */
/* ------------------------------------------------------------------ */
const CN_NUM_MAP: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12,
};

function cnToNum(s: string): number | null {
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (CN_NUM_MAP[s] !== undefined) return CN_NUM_MAP[s];
  // 处理 "十X" 的情况，如 "十一" "十二" 已在 map 中
  const m = s.match(/^十(.)?$/);
  if (m) {
    if (!m[1]) return 10;
    const d = CN_NUM_MAP[m[1]];
    return d !== undefined ? 10 + d : null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  辅助：月份中文 → 数字                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  农历春节 & 中秋 固定映射表（公历日期）                               */
/*  覆盖 2020-2030 年，足够大多数场景使用                                */
/* ------------------------------------------------------------------ */
const LUNAR_NEW_YEAR: Record<number, [number, number]> = {
  2020: [1, 25], 2021: [2, 12], 2022: [2, 1], 2023: [1, 22],
  2024: [2, 10], 2025: [1, 29], 2026: [2, 17], 2027: [2, 6],
  2028: [1, 26], 2029: [2, 13], 2030: [2, 3],
};

const MID_AUTUMN: Record<number, [number, number]> = {
  2020: [10, 1], 2021: [9, 21], 2022: [9, 10], 2023: [9, 29],
  2024: [9, 17], 2025: [10, 6], 2026: [9, 25], 2027: [9, 15],
  2028: [10, 3], 2029: [9, 22], 2030: [9, 12],
};

/* ------------------------------------------------------------------ */
/*  辅助：构造日期                                                     */
/* ------------------------------------------------------------------ */

/** 某年某月的第 1 毫秒 */
function monthStart(y: number, m: number): number {
  return new Date(y, m - 1, 1).getTime();
}
/** 某年某月最后 1 毫秒（下月第 1 毫秒 - 1） */
function monthEnd(y: number, m: number): number {
  return new Date(y, m, 1).getTime() - 1;
}

/** 以某天为中心 ± days 天 */
function aroundDay(y: number, m: number, d: number, days: number): { start: number; end: number } {
  const center = new Date(y, m - 1, d);
  const start = new Date(center);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  const end = new Date(center);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

/* ------------------------------------------------------------------ */
/*  解析"年份前缀"：今年 / 去年 / 前年 / 明年 / 2024年                   */
/* ------------------------------------------------------------------ */
function resolveYear(prefix: string, now: Date): number {
  const thisYear = now.getFullYear();
  if (!prefix || prefix === '今年') return thisYear;
  if (prefix === '去年' || prefix === '上一年') return thisYear - 1;
  if (prefix === '前年') return thisYear - 2;
  if (prefix === '明年' || prefix === '下一年') return thisYear + 1;
  const m = prefix.match(/^(\d{4})年?$/);
  if (m) return parseInt(m[1], 10);
  return thisYear;
}

/* ------------------------------------------------------------------ */
/*  主函数                                                             */
/* ------------------------------------------------------------------ */

export function parseDateExpression(text: string): { start: number; end: number } | null {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1; // 1-12

  // ---- 1. 相对月份 ------------------------------------------------
  // "上个月" "上月"
  if (/上个?月/.test(text)) {
    const d = new Date(thisYear, thisMonth - 2, 1); // 上个月 1 号
    return { start: d.getTime(), end: monthEnd(d.getFullYear(), d.getMonth() + 1) };
  }
  // "这个月" "本月"
  if (/这个?月|本月/.test(text)) {
    return { start: monthStart(thisYear, thisMonth), end: monthEnd(thisYear, thisMonth) };
  }
  // "前N个月" — 包含当前月往前 N 个月的区间
  {
    const m = text.match(/前([一二两三四五六七八九十\d]+)个?月/);
    if (m) {
      const n = cnToNum(m[1]);
      if (n !== null && n > 0) {
        const startDate = new Date(thisYear, thisMonth - 1 - n, 1);
        const endDate = new Date(thisYear, thisMonth - 1, 1);
        return { start: startDate.getTime(), end: endDate.getTime() - 1 };
      }
    }
  }

  // ---- 2. 季节 ----------------------------------------------------
  {
    const m = text.match(/(今年|去年|前年|明年|\d{4}年?)?(春天|夏天|秋天|冬天)/);
    if (m) {
      const year = resolveYear(m[1] || '', now);
      const season = m[2];
      const ranges: Record<string, [number, number, number, number]> = {
        春天: [year, 3, year, 5],
        夏天: [year, 6, year, 8],
        秋天: [year, 9, year, 11],
        冬天: [year, 12, year + 1, 2], // 12月 ~ 次年2月
      };
      const r = ranges[season];
      if (r) {
        return { start: monthStart(r[0], r[1]), end: monthEnd(r[2], r[3]) };
      }
    }
  }

  // ---- 3. 节日 ----------------------------------------------------
  // 春节 / 过年
  {
    const m = text.match(/(今年|去年|前年|明年|\d{4}年?)?(春节|过年)/);
    if (m) {
      const year = resolveYear(m[1] || '', now);
      const lny = LUNAR_NEW_YEAR[year];
      if (lny) {
        return aroundDay(year, lny[0], lny[1], 7);
      }
      // fallback：如果映射表没有，按 2 月 1 日 ±15 天粗略估计
      return aroundDay(year, 2, 1, 15);
    }
  }

  // 中秋
  {
    const m = text.match(/(今年|去年|前年|明年|\d{4}年?)?(中秋)/);
    if (m) {
      const year = resolveYear(m[1] || '', now);
      const ma = MID_AUTUMN[year];
      if (ma) {
        return aroundDay(year, ma[0], ma[1], 3);
      }
      // fallback
      return aroundDay(year, 9, 15, 10);
    }
  }

  // 情人节
  {
    const m = text.match(/(今年|去年|前年|明年|\d{4}年?)?情人节/);
    if (m) {
      const year = resolveYear(m[1] || '', now);
      return aroundDay(year, 2, 14, 3);
    }
  }

  // 圣诞
  {
    const m = text.match(/(今年|去年|前年|明年|\d{4}年?)?圣诞/);
    if (m) {
      const year = resolveYear(m[1] || '', now);
      return aroundDay(year, 12, 25, 3);
    }
  }

  // 元旦
  {
    const m = text.match(/(今年|去年|前年|明年|\d{4}年?)?元旦/);
    if (m) {
      // 元旦指 1 月 1 日，但 "去年元旦" 指去年的 1 月 1 日
      const year = resolveYear(m[1] || '', now);
      return aroundDay(year, 1, 1, 3);
    }
  }

  // ---- 4. 绝对月份 ------------------------------------------------
  // "去年三月" "2024年5月" "今年十二月"
  {
    const m = text.match(/(今年|去年|前年|明年|\d{4}年?)?([一二三四五六七八九十]+|\d{1,2})月/);
    if (m) {
      const year = resolveYear(m[1] || '', now);
      const month = cnToNum(m[2]);
      if (month !== null && month >= 1 && month <= 12) {
        return { start: monthStart(year, month), end: monthEnd(year, month) };
      }
    }
  }

  // ---- 5. 模糊时间 ------------------------------------------------
  // "年初"（1-2月）
  {
    const m = text.match(/(今年|去年|前年|明年|\d{4}年?)?年初/);
    if (m) {
      const year = resolveYear(m[1] || '', now);
      return { start: monthStart(year, 1), end: monthEnd(year, 2) };
    }
  }

  // "年底" / "年末"（11-12月）
  {
    const m = text.match(/(今年|去年|前年|明年|\d{4}年?)?(年底|年末)/);
    if (m) {
      const year = resolveYear(m[1] || '', now);
      return { start: monthStart(year, 11), end: monthEnd(year, 12) };
    }
  }

  // "年中"（5-7月）
  {
    const m = text.match(/(今年|去年|前年|明年|\d{4}年?)?年中/);
    if (m) {
      const year = resolveYear(m[1] || '', now);
      return { start: monthStart(year, 5), end: monthEnd(year, 7) };
    }
  }

  // 没有匹配到任何时间表达式
  return null;
}

/* ------------------------------------------------------------------ */
/*  简易中文分词（关键词提取）                                          */
/* ------------------------------------------------------------------ */

/** 时间关键词列表，用于分词时优先匹配 */
const TIME_KEYWORDS = [
  '上个月', '这个月', '本月', '上月',
  '前年', '去年', '今年', '明年',
  '春天', '夏天', '秋天', '冬天',
  '春节', '过年', '中秋', '情人节', '圣诞', '元旦',
  '年初', '年底', '年末', '年中',
];

/**
 * 简易中文分词 —— 基于最大正向匹配 + 时间关键词词典。
 * 不是通用分词器，仅用于在短句中拆分出时间相关的词汇。
 *
 * @example
 * segmentWords("去年夏天我们一起去看海")
 * // => ["去年", "夏天", "我", "们", "一", "起", "去", "看", "海"]
 */
export function segmentWords(text: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < text.length) {
    let matched = false;
    // 尝试从长到短匹配关键词
    for (let len = Math.min(4, text.length - i); len >= 2; len--) {
      const sub = text.slice(i, i + len);
      if (TIME_KEYWORDS.includes(sub)) {
        result.push(sub);
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // 尝试匹配连续数字（如 "2024"）
      const numMatch = text.slice(i).match(/^\d+/);
      if (numMatch) {
        result.push(numMatch[0]);
        i += numMatch[0].length;
      } else {
        // 单字切分
        result.push(text[i]);
        i++;
      }
    }
  }
  return result;
}

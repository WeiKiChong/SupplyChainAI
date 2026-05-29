import { ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TeamCategory } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number, decimals: number = 1) {
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function roundPrecise(num: number, decimals: number = 1): number {
  return Number(Math.round(Number(num + 'e' + decimals)) + 'e-' + decimals);
}

export const DEFAULT_TEAM_ORDER_VERSION = '20260524';

export const DEFAULT_TEAM_CATEGORIES: TeamCategory[] = [
  { id: 'cat_xialiao', name: "下料", order: 1, teamNames: ["下料", "下料（引擎）", "剪床", "锯割"] },
  { id: 'cat_jijia', name: "机加 + 车加", order: 2, teamNames: ["立铣", "卧铣", "卧铣6300", "四轴", "五轴", "车铣复合", "车加"] },
  { id: 'cat_banjin', name: "钣金", order: 3, teamNames: ["研磨", "机加（打磨）", "冲压", "去毛刺", "去毛刺（引擎）", "自动去毛刺机", "钳工", "钳工（引擎）", "折弯", "折弯（引擎）", "专项钣金"] },
  { id: 'cat_biaochu', name: "表处", order: 4, teamNames: ["钝化", "铬化", "阳极", "阳极保护", "拉丝", "丝印", "打码", "橡胶囊成型", "橡皮囊成型"] },
  { id: 'cat_tuzhuang', name: "涂装", order: 5, teamNames: ["喷砂", "喷粉", "喷漆", "喷涂保护"] },
  { id: 'cat_rechuli', name: "热处理", order: 6, teamNames: ["热处理-固溶炉", "热处理-时效炉", "热处理-真空炉", "热处理校形"] },
  { id: 'cat_hanjie', name: "焊接", order: 7, teamNames: ["熔焊（AL）", "熔焊（SUS）", "电阻焊（AL）", "电阻焊（SUS）", "植焊", "直缝焊", "焊接打磨"] },
  { id: 'cat_zhuangpei', name: "装配包装", order: 8, teamNames: ["内饰装配", "航电装配", "引擎装配"] },
  { id: 'cat_qita', name: "其他", order: 9, teamNames: ["体系", "品质", "仓库", "外协"] }
];

export const DEFAULT_TEAM_ORDER = DEFAULT_TEAM_CATEGORIES.flatMap(c => c.teamNames);

export function sortTeams(teams: string[], customOrder?: string[], categories?: TeamCategory[]) {
  const validCustomOrder = customOrder?.filter(t => t && String(t).trim().length > 0);
  const orderList = validCustomOrder && validCustomOrder.length > 0 ? validCustomOrder : DEFAULT_TEAM_ORDER;
  const activeCategories = categories && categories.length > 0 ? categories : DEFAULT_TEAM_CATEGORIES;
  
  return [...teams].sort((a, b) => {
    const strA = String(a || '');
    const strB = String(b || '');
    
    // 1. Check Categories first (User defined or Default)
    if (activeCategories && activeCategories.length > 0) {
      const catA = activeCategories.find(c => c.teamNames.includes(strA));
      const catB = activeCategories.find(c => c.teamNames.includes(strB));

      if (catA && catB) {
        const indexA = activeCategories.indexOf(catA);
        const indexB = activeCategories.indexOf(catB);
        if (indexA !== indexB) {
          return indexA - indexB;
        }
        // Same category, sort by index in teamNames
        return catA.teamNames.indexOf(strA) - catA.teamNames.indexOf(strB);
      }
      
      if (catA) return -1;
      if (catB) return 1;
    }

    // 2. Fallback to Scheme 1 rules (Default Order / Keyword matching)
    // 优先完全匹配
    let idxA = orderList.findIndex(t => strA === t);
    let idxB = orderList.findIndex(t => strB === t);
    
    // 如果没有完全匹配，再尝试包含匹配
    if (idxA === -1) {
      idxA = orderList.findIndex(t => strA.includes(t));
    }
    if (idxB === -1) {
      idxB = orderList.findIndex(t => strB.includes(t));
    }
    
    if (idxA !== -1 && idxB !== -1) {
      if (idxA !== idxB) {
        return idxA - idxB;
      }
      return strA.localeCompare(strB, 'zh-CN');
    }
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    
    return strA.localeCompare(strB, 'zh-CN');
  });
}

/**
 * 获取本地时间的 YYYY-MM-DD 字符串，避免 toISOString() 导致的 UTC 减一天或加一天问题
 */
export function getLocalDateString(date: Date = new Date()): string {
  const Y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, '0');
  const D = String(date.getDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
}

/**
 * 将 YYYY-MM-DD 或 YYYY/MM/DD 字符串安全的解析为本地时区的 Date 对象，避免 new Date(str) 解析为 UTC 导致日期跳变
 */
export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();
  const parts = trimmed.split(/[-/ ]/);
  if (parts.length >= 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d, 0, 0, 0, 0);
    }
  }
  const t = new Date(trimmed);
  if (isNaN(t.getTime())) {
    return new Date();
  }

  return t;
}

export function parseExcelDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    // 尝试匹配 YYYY-MM-DD 或 YYYY/MM/DD
    const match = val.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (match) {
       return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    // 如果已经是 YYYY-MM-DD 但没有匹配到（例如格式略有不同），也尝试返回
    return val.toString().slice(0, 10);
  }
  if (val instanceof Date) {
    return getLocalDateString(val);
  }
  // 如果是 Excel 的数字形式，通常需要转换
  if (typeof val === 'number') {
    // 使用本地时间进行日期偏移计算，彻底避免 toISOString() 导致的 UTC 偏差
    // Excel 的基准日期是 1899-12-30
    const date = new Date(1899, 11, 30);
    date.setDate(date.getDate() + Math.floor(val));
    return getLocalDateString(date);
  }
  return null;
}

export const DEFAULT_BUFFER_DELIVERY_OFFSETS: Record<string, number> = {
  '化学品': 10,
  '五金件': 5,
  '钣金原材料': 15,
  '机加原材料': 15,
  'ASY': 5,
  'DTL': 5,
  'AGS': 10,
  'POL': 15,
  'ALU': 20,
  'SST': 20,
  'CPP': 20,
  'NYL': 20,
  'FMT': 20,
  'HSS': 20,
  'MFC': 20,
  'MFN': 20
};


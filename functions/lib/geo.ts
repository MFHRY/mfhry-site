// 国家码 / 地区名的小工具：把 Cloudflare 给的英文地区翻成中文，并拼国旗 emoji。

// 两个区域指示符号就是一个国旗：U+1F1E6 + (字母序号)
export function flagOf(code?: string | null): string {
  const s = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) return '🏳️';
  return String.fromCodePoint(...[...s].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const ZH_REGION: Record<string, string> = {
  // 中国省级
  beijing: '北京', tianjin: '天津', hebei: '河北', shanxi: '山西', 'inner mongolia': '内蒙古',
  'nei mongol': '内蒙古', liaoning: '辽宁', jilin: '吉林', heilongjiang: '黑龙江', shanghai: '上海',
  jiangsu: '江苏', zhejiang: '浙江', anhui: '安徽', fujian: '福建', jiangxi: '江西', shandong: '山东',
  henan: '河南', hubei: '湖北', hunan: '湖南', guangdong: '广东', guangxi: '广西', hainan: '海南',
  chongqing: '重庆', sichuan: '四川', guizhou: '贵州', yunnan: '云南', tibet: '西藏', xizang: '西藏',
  shaanxi: '陕西', gansu: '甘肃', qinghai: '青海', ningxia: '宁夏', xinjiang: '新疆',
  'hong kong': '香港', macau: '澳门', macao: '澳门', taiwan: '台湾',
  // 常见海外地区
  california: '加利福尼亚', 'new york': '纽约', texas: '得克萨斯', washington: '华盛顿', florida: '佛罗里达',
  england: '英格兰', scotland: '苏格兰', wales: '威尔士', london: '伦敦',
  tokyo: '东京', osaka: '大阪', kyoto: '京都', seoul: '首尔', busan: '釜山', singapore: '新加坡',
  'kuala lumpur': '吉隆坡', bangkok: '曼谷', 'ho chi minh': '胡志明市', hanoi: '河内',
  'new south wales': '新南威尔士', victoria: '维多利亚', queensland: '昆士兰',
  ontario: '安大略', quebec: '魁北克', 'british columbia': '不列颠哥伦比亚',
  bavaria: '巴伐利亚', 'north rhine-westphalia': '北莱茵-威斯特法伦',
  'ile-de-france': '法兰西岛', 'île-de-france': '法兰西岛',
  moscow: '莫斯科', 'saint petersburg': '圣彼得堡',
  'sao paulo': '圣保罗', 'rio de janeiro': '里约热内卢',
};

export function regionName(region?: string | null, cc?: string | null): string {
  const raw = String(region || '').trim();
  if (!raw) return '';
  const hit = ZH_REGION[raw.toLowerCase()];
  if (hit) return hit;
  // 已经是中文（少数情况会直接给中文）就原样用
  if (/[\u4e00-\u9fa5]/.test(raw)) return raw;
  // 中国以外的英文地区名太长就截断，避免把表格撑爆
  const country = String(cc || '').toUpperCase();
  if (country && country !== 'CN' && raw.length > 18) return raw.slice(0, 18) + '…';
  return raw;
}

export function countryName(cc?: string | null): string {
  const s = String(cc || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) return '未知';
  try {
    return new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(s) || s;
  } catch {
    return s;
  }
}

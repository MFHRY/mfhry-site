// 补齐歌词里机翻失败（zh 为空）的行
import fs from 'node:fs';
import path from 'node:path';
import glob from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..');
const dir = path.join(ROOT, 'public/music');

async function tr(text) {
  const eps = [
    (t) => 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=zh-CN&dt=t&q=' + encodeURIComponent(t),
    (t) => 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=ja&tl=zh-CN&q=' + encodeURIComponent(t),
  ];
  for (const ep of eps) {
    for (let a = 0; a < 3; a++) {
      try {
        const r = await fetch(ep(text), { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        let out = '';
        if (Array.isArray(j?.[0])) out = j[0].map((x) => x?.[0]).filter(Boolean).join('');
        else if (Array.isArray(j) && typeof j[0] === 'string') out = j[0];
        else if (Array.isArray(j) && Array.isArray(j[0]) && typeof j[0][0] === 'string') out = j[0][0];
        if (out && out.trim()) return out.trim();
        throw new Error('empty');
      } catch (e) {
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }
  return '';
}

const files = fs.readdirSync(dir).filter((f) => /^osu-\d+-lyrics\.json$/.test(f));
let fixed = 0, left = 0;
for (const f of files) {
  const p = path.join(dir, f);
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  let dirty = false;
  for (const l of d.lines) {
    if (l.zh && l.zh.trim()) continue;
    const zh = await tr(l.ja);
    if (zh) {
      l.zh = zh;
      dirty = true;
      fixed++;
    } else left++;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (dirty) fs.writeFileSync(p, JSON.stringify(d, null, 1) + '\n');
}
console.log('补齐', fixed, '行，仍缺', left);

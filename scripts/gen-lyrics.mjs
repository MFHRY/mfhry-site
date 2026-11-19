// 给曲单里缺歌词的曲子补「日文 + 中文」双语时间轴歌词：
//   1. lrclib 找同步歌词（LRC）
//   2. 逐行机翻成中文（Google gtx，批 12 行一次，保持行数对齐）
//   3. 写 public/music/<文件名>-lyrics.json，并把路径写进 setids.json
//
// 用法：node scripts/gen-lyrics.mjs [--only=Label] [--limit=5] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const SONGS = path.join(ROOT, 'public/songs.js');
const SETIDS = path.join(ROOT, 'public/music/setids.json');
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const limit = Number((args.find((a) => a.startsWith('--limit=')) || '').slice(8)) || 0;
const dry = args.includes('--dry');

const UA = { 'user-agent': 'mfhry-music/1.0 (+https://mfhry.store)' };

/* ---------- 曲单 ---------- */
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SONGS, 'utf8') + ';window.__o=window.MFHRY_SONGS;', ctx);
const items = [];
for (const g of ctx.window.__o) {
  for (const it of g.items || []) if (!('divider' in it)) items.push(it);
}
const setids = JSON.parse(fs.readFileSync(SETIDS, 'utf8'));

/* ---------- LRC ---------- */
function parseLrc(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (!body) continue;
    for (const m of tags) {
      const ms = m[3] ? Number((m[3] + '00').slice(0, 3)) : 0;
      out.push({ t: Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000 + ms) / 1000, ja: body });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/* ---------- 翻译 ---------- */
async function tr(text) {
  const u =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=zh-CN&dt=t&q=' +
    encodeURIComponent(text);
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('翻译 ' + r.status);
  const j = await r.json();
  return (j?.[0] || []).map((x) => x?.[0]).filter(Boolean).join('');
}

async function translateLines(lines) {
  const out = [];
  const BATCH = 10;
  for (let i = 0; i < lines.length; i += BATCH) {
    const chunk = lines.slice(i, i + BATCH);
    const joined = chunk.map((l) => l.ja).join('\n');
    let parts = [];
    try {
      const txt = await tr(joined);
      parts = txt.split('\n').map((s) => s.trim());
    } catch (e) {
      parts = [];
    }
    for (let k = 0; k < chunk.length; k++) {
      let zh = parts[k];
      if (!zh) {
        try {
          zh = await tr(chunk[k].ja);
          await new Promise((r) => setTimeout(r, 250));
        } catch (e) {
          zh = '';
        }
      }
      out.push({ t: chunk[k].t, ja: chunk[k].ja, zh: zh || '' });
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return out;
}

/* ---------- lrclib ---------- */
async function findLyrics(it) {
  const title = String(it.label || '').replace(/\s*\(.*?\)\s*$/, '');
  const q = String(it.q || '').replace(/(full|tv|size|official)/gi, '').trim();
  const artist = String(it.artist || '').split(/[（(\/]/)[0].trim();
  const urls = [];
  if (artist) urls.push(`https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`);
  if (q) urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
  urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(title)}`);
  if (artist) urls.push(`https://lrclib.net/api/search?q=${encodeURIComponent(artist)}`);

  const seen = new Set();
  for (const u of urls) {
    for (let a = 0; a < 2; a++) {
      try {
        const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw new Error('lrclib ' + r.status);
        const list = await r.json();
        const cands = (list || []).filter((x) => x.syncedLyrics && !x.instrumental && !seen.has(x.id));
        if (!cands.length) break;
        // 打分：艺术家命中 / 标题里含日文原题或罗马字关键词 / 行数多
        const score = (o) => {
          let sc = 0;
          const an = (o.artistName || '').toLowerCase();
          const tn = (o.trackName || '').toLowerCase();
          if (artist && an.includes(artist.toLowerCase().slice(0, 5))) sc += 6;
          if (title && tn.includes(title.toLowerCase())) sc += 4;
          (q.toLowerCase().split(/\s+/).filter((w) => w.length > 3) || []).forEach((w) => {
            if (tn.includes(w)) sc += 2;
          });
          sc += Math.min(3, (parseLrc(o.syncedLyrics).length / 30));
          return sc;
        };
        cands.forEach((c) => seen.add(c.id));
        cands.sort((x, y) => score(y) - score(x));
        return cands[0];
      } catch (e) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  return null;
}

/* ---------- 主流程 ---------- */
const targets = items.filter((it) => {
  const sid = setids[it.label];
  return sid && !it.lyrics && !sid.lyrics && (!only || it.label === only);
});
const list = limit ? targets.slice(0, limit) : targets;
console.log(`待补歌词 ${targets.length} 首，本次处理 ${list.length}`);

let ok = 0;
const fails = [];
for (const it of list) {
  const sid = setids[it.label];
  process.stdout.write(`${it.label} … `);
  try {
    const hit = await findLyrics(it);
    if (!hit) throw new Error('lrclib 没有同步歌词');
    const lines = parseLrc(hit.syncedLyrics);
    if (lines.length < 6) throw new Error('歌词行数太少 ' + lines.length);
    const bilingual = await translateLines(lines);
    const file = `osu-${sid.id}-lyrics.json`;
    if (!dry) {
      fs.writeFileSync(
        path.join(ROOT, 'public/music', file),
        JSON.stringify({ song: it.label, artist: it.artist || hit.artistName || '', source: 'lrclib #' + hit.id + ' + 机翻', lines: bilingual }, null, 1) + '\n'
      );
      sid.lyrics = '/music/' + file;
      fs.writeFileSync(SETIDS, JSON.stringify(setids, null, 1) + '\n');
    }
    ok++;
    console.log(`ok ${bilingual.length} 行`);
  } catch (e) {
    console.log('fail: ' + e.message);
    fails.push(`${it.label}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`\n完成 ${ok}/${list.length}`);
if (fails.length) console.log('失败：\n' + fails.join('\n'));

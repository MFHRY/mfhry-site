// 把曲单里没有直链的歌灌进站内 R2：
//   1. 读 public/music/setids.json（每首歌已挑好的 osu 谱面包 id）
//   2. 下载谱面包 zip，取出音频与背景图
//   3. 传到 /api/music-upload（x-admin-key 校验）
//   4. 把 /api/r2 直链写回 setids.json
//
// 用法：MUSIC_ADMIN_KEY=xxx node scripts/cache-music.mjs [--only=label] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SETIDS = path.join(ROOT, 'public/music/setids.json');
const SITE = process.env.MUSIC_SITE || 'https://mfhry.store';
const KEY = process.env.MUSIC_ADMIN_KEY || '';
const EXTS = ['.mp3', '.ogg', '.m4a', '.wav'];
const IMGS = ['.jpg', '.jpeg', '.png'];
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const dry = args.includes('--dry');

if (!KEY && !dry) {
  console.error('缺少 MUSIC_ADMIN_KEY');
  process.exit(1);
}

const map = JSON.parse(fs.readFileSync(SETIDS, 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'music-cache-'));

function run(cmd, argv) {
  return new Promise((resolve, reject) => {
    execFile(cmd, argv, { maxBuffer: 1 << 26 }, (err, stdout, stderr) =>
      err ? reject(new Error(stderr || err.message)) : resolve(stdout)
    );
  });
}

const SOURCES = [(id) => 'https://osu.direct/api/d/' + id, (id) => 'https://catboy.best/d/' + id];

// 镜像会限流：换源 + 退避重试
async function download(id, file) {
  let last = '';
  for (let round = 0; round < 3; round++) {
    for (const src of SOURCES) {
      try {
        const res = await fetch(src(id), {
          headers: { 'user-agent': 'mfhry-cache/1.0', referer: 'https://catboy.best/' },
          signal: AbortSignal.timeout(300000),
        });
        if (!res.ok) {
          last = '下载失败 ' + res.status;
          continue;
        }
        fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        return fs.statSync(file).size;
      } catch (e) {
        last = e.message;
      }
    }
    await new Promise((r) => setTimeout(r, 4000 * (round + 1)));
  }
  throw new Error(last);
}

async function upload(key, file, type) {
  const buf = fs.readFileSync(file);
  const res = await fetch(SITE + '/api/music-upload?key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'x-admin-key': KEY, 'content-type': type },
    body: buf,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || 'HTTP ' + res.status);
  return data;
}

async function one(label, info) {
  const dir = path.join(tmp, String(info.id));
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(tmp, info.id + '.zip');
  if (!fs.existsSync(zip)) await download(info.id, zip);
  await run('tar', ['-xf', zip, '-C', dir]);

  const files = fs.readdirSync(dir, { recursive: true }).map(String);
  const pick = (list) =>
    list
      .map((f) => ({ f, size: fs.statSync(path.join(dir, f)).size }))
      .sort((a, b) => b.size - a.size)[0];

  const audio = pick(files.filter((f) => EXTS.includes(path.extname(f).toLowerCase())));
  if (!audio) throw new Error('包里没有音频');
  const img = pick(files.filter((f) => IMGS.includes(path.extname(f).toLowerCase())));

  const ext = path.extname(audio.f).toLowerCase();
  const key = 'music/track-' + info.id + ext;
  const type = ext === '.ogg' ? 'audio/ogg' : ext === '.m4a' ? 'audio/mp4' : 'audio/mpeg';

  let cover = '';
  if (img && img.size < 4 * 1024 * 1024) {
    const cext = path.extname(img.f).toLowerCase() === '.png' ? '.png' : '.jpg';
    const ckey = 'music/track-' + info.id + '-cover' + cext;
    if (!dry) await upload(ckey, path.join(dir, img.f), cext === '.png' ? 'image/png' : 'image/jpeg');
    cover = '/api/r2?key=' + ckey;
  }

  if (!dry) await upload(key, path.join(dir, audio.f), type);
  return {
    r2: '/api/r2?key=' + key,
    cover,
    bytes: audio.size,
    mb: +(audio.size / 1048576).toFixed(1),
  };
}

const labels = Object.keys(map).filter((l) => !only || l === only);
let done = 0;
let totalMB = 0;
const fails = [];

for (const label of labels) {
  const info = map[label];
  if (info.r2) {
    done++;
    continue;
  }
  process.stdout.write(`[${done + 1}/${labels.length}] ${label} (${info.id}) … `);
  try {
    const got = await one(label, info);
    map[label] = { ...info, ...got };
    fs.writeFileSync(SETIDS, JSON.stringify(map, null, 1) + '\n');
    totalMB += got.mb;
    console.log(`ok ${got.mb}MB`);
  } catch (e) {
    console.log('fail: ' + e.message);
    fails.push(label + ': ' + e.message);
  }
  done++;
}

console.log(`\n完成 ${done - fails.length}/${labels.length}，音频合计 ${totalMB.toFixed(0)}MB`);
if (fails.length) console.log('失败：\n' + fails.join('\n'));

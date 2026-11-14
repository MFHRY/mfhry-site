#!/usr/bin/env node
/**
 * Stand with Jensen 整站静态镜像（多语言）。
 *
 * 素材：scripts/jensen-langs/<lang>.html —— 无头浏览器按语言渲染后抓的 DOM（scripts/jensen-capture.mjs 生成）。
 * 处理：去掉全部脚本（React/Clerk/Replit/recaptcha）、CSS 指到本地稳定文件名、图片本地化、
 *       语言选择器改为跳转到对应的静态语言页。
 * 产物：public/standwithjensen/index.html（简体中文）+ lang/<lang>.html（其余 14 种）。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, cpSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'https://standwithjensen.com';
const SRC_DIR = join(root, 'scripts/jensen-langs');
const OUT = join(root, 'public/standwithjensen');
const BASE = '/standwithjensen';
const DEFAULT_LANG = 'zh-Hans';
const UA = 'Mozilla/5.0 (compatible; MFHRY-Public-Mirror/1.0)';

const LANGS = ['en', 'ko', 'zh-Hans', 'zh-Hant', 'fr', 'es', 'ru', 'de', 'hi', 'ta', 'bn', 'it', 'fi', 'ja', 'hy'];
const IMAGES = [
  'images/jensen-young.webp',
  'images/jensen-middle.avif',
  'images/jensen-stanford.webp',
  'images/stand-with-jensen-card-v2.jpg',
  'logo.svg',
  'favicon.svg',
];

async function download(url, dest) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Referer: `${SOURCE}/` },
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(dest, buf);
      return buf.length;
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  return 0;
}

function localize(html, cssHref) {
  let out = html;

  // 脚本全部去掉：内容已是渲染后的 DOM
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<script\b[^>]*\/>/gi, '');
  out = out.replace(/<div[^>]+(?:replit|recaptcha)[^>]*>[\s\S]*?<\/div>/gi, '');
  out = out.replace(/<iframe[^>]+recaptcha[^>]*>[\s\S]*?<\/iframe>/gi, '');

  // 样式：统一指向本地稳定文件名
  out = out.replace(/href="\/assets\/[^"]+\.css"/g, `href="${cssHref}"`);
  out = out.replace(/<link[^>]+href="[^"]*\/assets\/[^"]+\.css"[^>]*>/gi, `<link rel="stylesheet" href="${cssHref}">`);

  // 图片/图标本地化
  out = out.replace(/(src|href)="\/images\/"/g, `$1="${BASE}/images/"`);
  out = out.replace(/(src|srcset|href)="\/images\//g, `$1="${BASE}/images/`);
  out = out.replace(/src="\/logo\.svg"/g, `src="${BASE}/logo.svg"`);
  out = out.replace(/href="\/favicon\.svg"/g, `href="${BASE}/favicon.svg"`);

  // 链接：锚点保留，其它页面走原站
  out = out.replace(/href="\/#/g, 'href="#');
  out = out.replace(/href="\/"/g, `href="${BASE}/"`);
  out = out.replace(/href="\/(privacy|contact)"/g, `href="${SOURCE}/$1"`);
  return out;
}

const back = `<div style="position:fixed;top:10px;right:10px;z-index:9999;font:12px/1.4 system-ui,sans-serif">
  <a href="/records" style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.25)">← 返回 MFHRY 记录</a></div>`;

const banner = `<div style="position:fixed;left:10px;bottom:10px;z-index:9999;font:12px/1.5 system-ui,sans-serif;max-width:min(92vw,520px)">
  <div style="background:rgba(0,0,0,.82);color:#eee;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.2)">
    只读镜像，每 15 分钟同步；签署与留言请前往
    <a href="${SOURCE}" target="_blank" rel="noreferrer" style="color:#7ab8ff">原站</a>。
  </div></div>`;

function extraScripts(lang) {
  // 1) 统计数字每 15 分钟从本地快照刷新
  // 2) 语言选择器：跳到对应的静态语言页
  return `<script>
(function(){
  var fmt=function(n){try{return Number(n).toLocaleString('en-US')}catch(e){return n}};
  function paint(d){var c=d.campaign||{};var m={'text-total':c.total,'stat-current':c.currentEmployees,'stat-former':c.formerEmployees,'stat-shareholders':c.shareholders,'stat-supporters':c.supporters};
    Object.keys(m).forEach(function(k){var el=document.querySelector('[data-testid="'+k+'"]');if(el&&m[k]!=null)el.textContent=fmt(m[k])})}
  function load(){fetch('/data/jensen-mirror.json',{cache:'no-store'}).then(function(r){return r.json()}).then(paint).catch(function(){})}
  load();setInterval(load,15*60*1000);

  var sel=document.querySelector('[data-testid="language-selector"]');
  if(sel){
    sel.value=${JSON.stringify(lang)};
    sel.addEventListener('change',function(){
      var v=sel.value;
      // 默认语言就在站点根目录，其余在 lang/ 下
      location.href=(v===${JSON.stringify(DEFAULT_LANG)})?'/standwithjensen/':'/standwithjensen/lang/'+encodeURIComponent(v);
    });
  }
})();
</script>`;
}

async function main() {
  if (!existsSync(SRC_DIR)) throw new Error('缺少语言素材目录 scripts/jensen-langs（先跑 scripts/jensen-capture.mjs）');
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.html'));
  if (files.length < 2) throw new Error('语言素材不足，至少需要 2 种语言');

  const first = readFileSync(join(SRC_DIR, files[0]), 'utf8');
  const cssMatch = first.match(/href="(\/assets\/[^"]+\.css)"/);
  if (!cssMatch) throw new Error('素材里没有 CSS 引用，页面结构可能已变化');
  const cssRemote = cssMatch[1];

  const tmp = `${OUT}.tmp`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'assets'), { recursive: true });
  // 历史快照目录要跨重建保留
  if (existsSync(join(OUT, 'archive'))) {
    cpSync(join(OUT, 'archive'), join(tmp, 'archive'), { recursive: true });
    console.log('[jensen-site] 保留历史快照 archive/');
  }
  mkdirSync(join(tmp, 'images'), { recursive: true });
  mkdirSync(join(tmp, 'lang'), { recursive: true });

  const cssName = 'site.css';
  // 上游暂时不可用时，沿用上一份已下载的 CSS
  let cssSize = 0;
  try {
    cssSize = await download(`${SOURCE}${cssRemote}`, join(tmp, 'assets', cssName));
  } catch (err) {
    const cached = join(OUT, 'assets', cssName);
    if (!existsSync(cached)) throw err;
    cpSync(cached, join(tmp, 'assets', cssName));
    cssSize = statSync(cached).size;
    console.warn(`[jensen-site] CSS 下载失败，沿用缓存（${err.message}）`);
  }
  const css = readFileSync(join(tmp, 'assets', cssName), 'utf8').replace(
    /url\(\s*['"]?\/images\//g,
    `url(${BASE}/images/`
  );
  writeFileSync(join(tmp, 'assets', cssName), css, 'utf8');
  console.log(`[jensen-site] CSS ${cssRemote} → assets/${cssName} (${cssSize} bytes)`);

  for (const img of IMAGES) {
    try {
      const size = await download(`${SOURCE}/${img}`, join(tmp, img));
      console.log(`[jensen-site] 图片 ${img} → ${size} bytes`);
    } catch (err) {
      const cached = join(OUT, img);
      if (!existsSync(cached)) throw err;
      cpSync(cached, join(tmp, img));
      console.warn(`[jensen-site] 图片 ${img} 下载失败，沿用缓存`);
    }
  }

  const written = [];
  for (const lang of LANGS) {
    const file = join(SRC_DIR, `${lang}.html`);
    if (!existsSync(file)) {
      console.warn(`[jensen-site] 缺少 ${lang} 素材，跳过`);
      continue;
    }
    let html = localize(readFileSync(file, 'utf8'), `${BASE}/assets/${cssName}`);
    html = html.replace('</body>', `${extraScripts(lang)}${back}${banner}</body>`);
    const target = lang === DEFAULT_LANG ? join(tmp, 'index.html') : join(tmp, 'lang', `${lang}.html`);
    writeFileSync(target, html, 'utf8');
    written.push(lang);
  }
  if (!existsSync(join(tmp, 'index.html'))) throw new Error('缺少默认语言页面 ' + DEFAULT_LANG);

  rmSync(OUT, { recursive: true, force: true });
  renameSync(tmp, OUT);
  console.log(`[jensen-site] 整站镜像完成：${written.length} 种语言（${written.join(', ')}）`);
}

main().catch((err) => {
  console.error(`[jensen-site] 镜像失败：${err.message}`);
  if (existsSync(OUT)) {
    console.warn('[jensen-site] 保留上一份镜像，继续构建');
    return;
  }
  process.exitCode = 1;
});

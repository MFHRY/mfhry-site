#!/usr/bin/env node
/**
 * Stand with Jensen 整站静态镜像。
 *  用无头浏览器（Chrome/Edge/Chromium）渲染原站后 dump 真实 DOM，
 *  去掉全部脚本（React/Clerk/Replit/recaptcha），只留内容 + 本地 CSS/图片，
 *  这样镜像不依赖任何外部 JS，点开即见全部内容。
 *
 * 每 15 分钟随定时部署刷新。找不到浏览器或抓取失败时保留上一份镜像。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'https://standwithjensen.com';
const OUT = join(root, 'public/standwithjensen');
const BASE = '/standwithjensen';
const UA = 'Mozilla/5.0 (compatible; MFHRY-Public-Mirror/1.0)';

const IMAGES = [
  'images/jensen-young.webp',
  'images/jensen-middle.avif',
  'images/jensen-stanford.webp',
  'images/stand-with-jensen-card-v2.jpg',
  'logo.svg',
  'favicon.svg',
];

function findBrowser() {
  const candidates = [
    process.env.JENSEN_CHROME,
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) || '';
}

function dumpDom(bin) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--virtual-time-budget=15000',
    '--dump-dom',
    `${SOURCE}/`,
  ];
  const res = spawnSync(bin, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw new Error(res.error.message);
  const html = res.stdout || '';
  if (!html.includes('id="root"') || html.length < 20000) {
    throw new Error(`DOM 抓取结果异常（${html.length} bytes）`);
  }
  return html;
}

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

function localize(html) {
  let out = html;

  // 去掉所有脚本：React/Clerk/Replit/recaptcha 都不需要，内容已是渲染后的 DOM
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<script\b[^>]*\/>/gi, '');
  // 去掉 Replit 反馈挂件残留与 recaptcha 徽标
  out = out.replace(/<div[^>]+(?:replit|recaptcha)[^>]*>[\s\S]*?<\/div>/gi, '');
  out = out.replace(/<iframe[^>]+recaptcha[^>]*>[\s\S]*?<\/iframe>/gi, '');

  // 资源本地化
  out = out.replace(/href="\/assets\/([^"]+\.css)"/g, `href="${BASE}/assets/$1"`);
  out = out.replace(/src="\/images\//g, `src="${BASE}/images/`);
  out = out.replace(/href="\/images\//g, `href="${BASE}/images/`);
  out = out.replace(/src="\/logo\.svg"/g, `src="${BASE}/logo.svg"`);
  out = out.replace(/href="\/favicon\.svg"/g, `href="${BASE}/favicon.svg"`);
  out = out.replace(/(srcset|src|href)="\/images\/([^"]+)"/g, `$1="${BASE}/images/$2"`);

  // 内部链接：hash 锚点保留，其它页面指向原站
  out = out.replace(/href="\/#/g, 'href="#');
  out = out.replace(/href="\/"/g, `href="${BASE}/"`);
  out = out.replace(/href="\/(privacy|contact)"/g, `href="${SOURCE}/$1"`);

  return out;
}

const banner = `<div style="position:fixed;left:10px;bottom:10px;z-index:9999;font:12px/1.5 system-ui,sans-serif;max-width:min(92vw,520px)">
  <div style="background:rgba(0,0,0,.82);color:#eee;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.2)">
    本站为只读镜像，每 15 分钟同步一次；签署与留言请前往
    <a href="${SOURCE}" target="_blank" rel="noreferrer" style="color:#7ab8ff">原站</a>。
    <a href="/records" style="color:#7ab8ff">全部签名者 →</a>
  </div></div>`;
const back = `<div style="position:fixed;top:10px;right:10px;z-index:9999;font:12px/1.4 system-ui,sans-serif">
  <a href="/records" style="display:inline-block;padding:6px 12px;border-radius:999px;background:rgba(0,0,0,.72);color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.25)">← 返回 MFHRY 记录</a></div>`;

async function main() {
  const bin = findBrowser();
  if (!bin) throw new Error('未找到可用的无头浏览器（Chrome/Edge/Chromium）');

  const raw = dumpDom(bin);
  const tmp = `${OUT}.tmp`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(join(tmp, 'assets'), { recursive: true });
  mkdirSync(join(tmp, 'images'), { recursive: true });

  const cssRefs = [...raw.matchAll(/href="(\/assets\/[^"]+\.css)"/g)].map((m) => m[1]);
  for (const ref of cssRefs) {
    const name = ref.split('/').pop();
    const size = await download(`${SOURCE}${ref}`, join(tmp, 'assets', name));
    console.log(`[jensen-site] CSS ${ref} → ${size} bytes`);
  }

  for (const img of IMAGES) {
    const size = await download(`${SOURCE}/${img}`, join(tmp, img));
    console.log(`[jensen-site] 图片 ${img} → ${size} bytes`);
  }

  // CSS 里若有 /images 或 /fonts 引用，一并本地化标记
  for (const ref of cssRefs) {
    const name = ref.split('/').pop();
    const file = join(tmp, 'assets', name);
    if (!existsSync(file)) continue;
    const css = readFileSync(file, 'utf8').replace(/url\(\s*['"]?\/images\//g, `url(${BASE}/images/`);
    writeFileSync(file, css, 'utf8');
  }

  // 只做一件事：每 15 分钟把统计数字换成最新镜像快照里的值（页面其余部分是纯静态）
  const statsScript = `<script>
(function(){
  var fmt=function(n){try{return Number(n).toLocaleString('en-US')}catch(e){return n}};
  function paint(d){var c=d.campaign||{};var map={'text-total':c.total,'stat-current':c.currentEmployees,'stat-former':c.formerEmployees,'stat-shareholders':c.shareholders,'stat-supporters':c.supporters};
    Object.keys(map).forEach(function(k){var el=document.querySelector('[data-testid="'+k+'"]');if(el&&map[k]!=null)el.textContent=fmt(map[k])});}
  function load(){fetch('/data/jensen-mirror.json',{cache:'no-store'}).then(function(r){return r.json()}).then(paint).catch(function(){})}
  load();setInterval(load,15*60*1000);
})();
</script>`;
  let html = localize(raw);
  html = html.replace('</body>', `${statsScript}${back}${banner}</body>`);
  writeFileSync(join(tmp, 'index.html'), html, 'utf8');

  rmSync(OUT, { recursive: true, force: true });
  renameSync(tmp, OUT);
  console.log(
    `[jensen-site] 静态镜像完成：${OUT}（index.html ${statSync(join(OUT, 'index.html')).size} bytes，脚本已全部移除）`
  );
}

main().catch((err) => {
  console.error(`[jensen-site] 镜像失败：${err.message}`);
  if (existsSync(OUT)) {
    console.warn('[jensen-site] 保留上一份镜像，继续构建');
    return;
  }
  process.exitCode = 1;
});

#!/usr/bin/env node
/**
 * 用 CDP 驱动无头浏览器，按语言抓取 standwithjensen.com 渲染后的 DOM。
 * 用法: node scripts/jensen-capture.mjs <输出目录> [语言...]
 * 默认抓到全部 15 种语言。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const SOURCE = 'https://standwithjensen.com/';
const LANGS = ['en', 'ko', 'zh-Hans', 'zh-Hant', 'fr', 'es', 'ru', 'de', 'hi', 'ta', 'bn', 'it', 'fi', 'ja', 'hy'];
const PORT = Number(process.env.JENSEN_CDP_PORT || 9411);

const outDir = process.argv[2] || 'tmp/jensen-langs';
const langs = process.argv.slice(3).length ? process.argv.slice(3) : LANGS;

function findBrowser() {
  return [
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
  ].find((p) => p && existsSync(p));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitJson(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return await res.json();
    } catch {}
    await sleep(500);
  }
  throw new Error('CDP 未就绪：' + url);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP 超时: ' + method));
        }
      }, 60000);
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('WebSocket 失败')), { once: true });
    });
    return new Cdp(ws);
  }
}

// 等到 SPA 真正渲染出签名卡片再导出
async function waitReady(cdp, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await cdp.send('Runtime.evaluate', {
        // 签名卡已渲染 + 统计明细已拿到数据，两者都满足才算就绪
        expression:
          '(function(){var c=document.querySelectorAll(\'[data-testid^="card-signature-"]\').length;' +
          'var el=document.querySelector(\'[data-testid="stat-supporters"]\');' +
          'var st=el&&/[0-9]/.test(el.textContent||"");return (c>20?1:0)+(st?1:0)})()',
        returnByValue: true,
      });
      if ((res.result?.value || 0) === 2) return;
    } catch {}
    await sleep(700);
  }
  throw new Error('等待渲染超时');
}

async function main() {
  const bin = findBrowser();
  if (!bin) throw new Error('未找到 Chrome/Edge');
  mkdirSync(outDir, { recursive: true });

  const child = spawn(
    bin,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--window-size=1440,1200',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${resolve(tmpdir(), 'jensen-cdp-profile')}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], detached: false }
  );

  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += String(d);
  });
  child.on('error', (e) => {
    stderr += 'SPAWN_ERROR ' + e.message;
  });

  try {
    await waitJson(`http://127.0.0.1:${PORT}/json/version`, 80).catch((e) => {
      throw new Error(`${e.message}｜浏览器输出：${stderr.slice(0, 400)}`);
    });
    const list = await waitJson(`http://127.0.0.1:${PORT}/json/list`);
    const page = list.find((t) => t.type === 'page');
    if (!page) throw new Error('没有可用的页面 target');
    const cdp = await Cdp.connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');

    // 先落到目标源，才能写它的 localStorage
    await cdp.send('Page.navigate', { url: SOURCE });
    await sleep(6000);

    for (const lang of langs) {
      // 设置语言（站点读的就是这个键）
      await cdp.send('Runtime.evaluate', {
        expression: `localStorage.setItem('swj-language', ${JSON.stringify(lang)}); 'ok'`,
        returnByValue: true,
      });
      let html = '';
      for (let attempt = 1; attempt <= 3 && !html; attempt++) {
        try {
          await cdp.send('Page.reload');
          await waitReady(cdp, 40000);
          const res = await cdp.send('Runtime.evaluate', {
            expression: 'document.documentElement.outerHTML',
            returnByValue: true,
          });
          const out = res.result?.value || '';
          // 自校验：抓到的页面语言必须和目标一致，否则说明读到了上一次渲染的残留
          const langOk = new RegExp('<html[^>]*lang="' + lang + '"').test(out.slice(0, 400));
          if (out.length >= 20000 && langOk) html = out;
          else if (out.length >= 20000) console.warn(`[jensen-capture] ${lang} 语言不匹配，重试`);
        } catch (e) {
          console.warn(`[jensen-capture] ${lang} 第 ${attempt} 次失败：${e.message}`);
        }
      }
      if (!html) {
        console.warn(`[jensen-capture] ${lang} 跳过（多次失败）`);
        continue;
      }
      writeFileSync(join(outDir, `${lang}.html`), html, 'utf8');
      console.log(`[jensen-capture] ${lang} → ${html.length} bytes`);
    }
  } finally {
    try {
      child.kill();
    } catch {}
  }
}

main().catch((err) => {
  console.error('[jensen-capture] 失败：' + err.message);
  process.exitCode = 1;
});

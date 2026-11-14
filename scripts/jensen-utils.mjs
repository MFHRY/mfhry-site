import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const cell = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\t/g, '\\t')
  .replace(/\r/g, '\\r')
  .replace(/\n/g, '\\n');

export function mirrorToTxt(data) {
  const c = data.campaign || {};
  const items = data.items || [];
  const lines = [
    'Stand with Jensen 公开签名者完整镜像',
    `来源：${data.source || 'https://standwithjensen.com'}`,
    `抓取时间：${data.fetchedAt || ''}`,
    `签名总数：${c.total ?? 0}（含非公开签名）`,
    `公开签名者：${items.length}（原站接口报告 ${data.publicTotal ?? items.length}）`,
    `现任员工：${c.currentEmployees ?? 0}；前员工：${c.formerEmployees ?? 0}；股东：${c.shareholders ?? 0}；支持者：${c.supporters ?? 0}`,
    '说明：仅含原站公开展示的签名者；邮箱与非公开签名不由原站提供。 affiliations/titles 为签名者自报，未经验证。',
    '',
    ['公开ID', '姓名', '身份', '职务', '公开留言', '照片URL', '签署时间'].join('\t'),
  ];
  for (const x of items) {
    lines.push([
      x.id, x.name, x.affiliation, x.title, x.testimonial, x.photoUrl, x.createdAt,
    ].map(cell).join('\t'));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function writeDesktopTxt(data) {
  const dir = join(homedir(), 'Desktop');
  const out = join(dir, 'standwithjensen签名者.txt');
  const tmp = `${out}.tmp`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(tmp, mirrorToTxt(data), 'utf8');
  renameSync(tmp, out);
  return out;
}

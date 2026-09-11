#!/usr/bin/env node
/**
 * 把 travel-data.json 注入 index.html 的 #travel-data 中。
 * travel-data.json 是唯一数据源；改完数据跑一次：node scripts/sync-data.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = join(root, 'travel-data.json');
const htmlPath = join(root, 'index.html');

const raw = readFileSync(dataPath, 'utf8');

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error('✗ travel-data.json 不是合法 JSON：', e.message);
  process.exit(1);
}

// 压缩后内联；转义 </script> 与 U+2028/2029，避免提前闭合标签或解析异常
const inline = JSON.stringify(data)
  .replace(/<\/script/gi, '<\\/script')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const html = readFileSync(htmlPath, 'utf8');

const START = '<!-- TRAVEL_DATA_START -->';
const END = '<!-- TRAVEL_DATA_END -->';
const i = html.indexOf(START);
const j = html.indexOf(END);

if (i === -1 || j === -1) {
  console.error(`✗ index.html 中找不到 ${START} / ${END} 标记`);
  process.exit(1);
}

const block = `${START}\n<script type="application/json" id="travel-data">${inline}</script>\n`;
const next = html.slice(0, i) + block + html.slice(j);

if (next === html) {
  console.log('· 数据无变化，未写入');
} else {
  writeFileSync(htmlPath, next, 'utf8');
  console.log(`✓ 已注入 ${DATA_SUMMARY(data)}（${(inline.length / 1024).toFixed(1)} KB）`);
}

function DATA_SUMMARY(d) {
  return [
    `${d.flights?.length ?? 0} 段航班`,
    `${d.hotels?.length ?? 0} 家住宿`,
    `${d.itinerary?.length ?? 0} 天行程`,
  ].join(' / ');
}

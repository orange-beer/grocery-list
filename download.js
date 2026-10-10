#!/usr/bin/env node
/**
 * 蔬菜图片批量下载 / 接入脚本
 * ============================================================
 * 数据源是 蔬菜.md（里面有全部食材和它们的在线图片链接）。
 *
 * 用法：
 *   node download.js            下载 img/ 里还没有的图片
 *   node download.js --force    忽略已有文件，全部重新下载
 *   node download.js --apply    下载完成后，把 index.html 里的 img 字段
 *                               改成对应的本地路径 img/xxx.jpg
 *
 * 脚本会做这几件事：
 *   1. 从 蔬菜.md 解析出「名字 + 图片链接」（img 为空的自动跳过）
 *   2. 按名字下载到 img/，扩展名以文件真实内容为准（不信任 URL 后缀）
 *   3. 校验下载到的是不是真图片（查文件头），不是就报错，不写坏文件
 *   4. --apply 时回写 index.html，并检查条目数没变才落盘
 *   5. 最后报告：失败清单、仍无图片的食材、img/ 里没用上的文件
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = __dirname;
const IMG_DIR = path.join(ROOT, 'img');
const MD_FILE = path.join(ROOT, '蔬菜.md');
const HTML_FILE = path.join(ROOT, 'index.html');

const FORCE = process.argv.includes('--force');
const APPLY = process.argv.includes('--apply');

// 蔬菜.md 里的名字和 index.html 里的名字对不上的，在这里做映射
// 左边是 蔬菜.md 的名字，右边是 index.html 的名字（也是保存的文件名）
const ALIAS = {
  '鸡毛菜（小白菜幼苗）': '鸡毛菜',
  '尖椒': '辣椒',
  '圆椒': '青椒'
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TIMEOUT = 20000;          // 单张图超时（毫秒）
const MAX_REDIRECT = 5;         // 最多跟几跳重定向
const CONCURRENCY = 4;          // 同时下载几张
const MIN_SIZE = 1024;          // 小于 1KB 视为无效
const MAX_SIZE = 8 * 1024 * 1024;
const KNOWN_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/* ==================== 读取 蔬菜.md ==================== */
function readItems() {
  const md = fs.readFileSync(MD_FILE, 'utf8');
  const re = /\{\s*n:\s*"([^"]+)",\s*c:\s*"([^"]+)",\s*tag:\s*"[^"]*",\s*icon:\s*"[^"]*",\s*img:\s*"([^"]*)"\s*\}/g;
  const items = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    if (!m[3]) continue;                                  // 没有图片链接的跳过
    items.push({ name: m[1], cat: m[2], url: m[3], file: ALIAS[m[1]] || m[1] });
  }
  return items;
}

/* ==================== 图片识别与校验 ==================== */
// 按文件头判断真实格式，返回扩展名
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
  if (buf.slice(0, 3).toString('latin1') === 'GIF') return '.gif';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' &&
      buf.slice(8, 12).toString('latin1') === 'WEBP') return '.webp';
  return null;
}

const EXT_BY_TYPE = {
  'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/pjpeg': '.jpg',
  'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif'
};

function isImageFile(p) {
  try {
    if (fs.statSync(p).size < MIN_SIZE) return false;
    const fd = fs.openSync(p, 'r');
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    return !!sniff(head);
  } catch (e) {
    return false;
  }
}

// 按名字找已经下好的图（依次试各种扩展名）
function findLocal(name) {
  for (const ext of KNOWN_EXT) {
    const p = path.join(IMG_DIR, name + ext);
    if (fs.existsSync(p) && isImageFile(p)) {
      return { file: name + ext, size: fs.statSync(p).size };
    }
  }
  return null;
}

/* ==================== 下载 ==================== */
function fetchBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECT) return reject(new Error('重定向过多'));
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(new Error('链接非法'));
    }
    const client = u.protocol === 'https:' ? https : http;
    let settled = false;
    const fail = (e) => { if (!settled) { settled = true; reject(e); } };

    const req = client.get(u, {
      timeout: TIMEOUT,
      headers: {
        'User-Agent': UA,
        'Referer': u.origin + '/',        // 部分图床有防盗链，带上来源
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8'
      }
    }, (res) => {
      const code = res.statusCode;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, u).href;
        fetchBuffer(next, redirects + 1).then(resolve, fail);
        return;
      }
      if (code !== 200) {
        res.resume();
        return fail(new Error('HTTP ' + code));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_SIZE) { req.destroy(); return fail(new Error('文件过大')); }
        chunks.push(c);
      });
      res.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({ buf: Buffer.concat(chunks), type: res.headers['content-type'] || '' });
      });
      res.on('error', fail);
    });
    req.on('error', fail);
    req.on('timeout', () => { req.destroy(); fail(new Error('超时')); });
  });
}

async function downloadOne(item) {
  const { buf, type } = await fetchBuffer(item.url);
  const mime = (type || '').split(';')[0].trim().toLowerCase();
  const ext = sniff(buf) || EXT_BY_TYPE[mime];
  if (!ext) throw new Error('不是图片（' + (mime || '未知类型') + '）');
  if (buf.length < MIN_SIZE) throw new Error('文件太小（' + buf.length + ' 字节）');
  const file = item.file + ext;
  fs.writeFileSync(path.join(IMG_DIR, file), buf);
  return { file, size: buf.length, ext };
}

/* ==================== 简易并发池 ==================== */
async function runPool(list, limit, worker) {
  let next = 0;
  const loop = async () => {
    while (next < list.length) {
      const i = next++;
      await worker(list[i], i);
    }
  };
  const n = Math.max(1, Math.min(limit, list.length));
  await Promise.all(Array.from({ length: n }, loop));
}

/* ==================== 回写 index.html ==================== */
const HTML_LINE = /^(\s*\{\s*n:\s*"([^"]+)",\s*c:\s*"[^"]*",\s*tag:\s*"[^"]*",\s*icon:\s*"[^"]*",\s*img:\s*")([^"]*)("\s*\},?\s*)$/gm;

function applyToHtml() {
  const src = fs.readFileSync(HTML_FILE, 'utf8');
  const before = (src.match(/\{\s*n:\s*"/g) || []).length;
  let changed = 0;

  const out = src.replace(HTML_LINE, (full, pre, name, oldImg, post) => {
    const local = findLocal(name);
    if (!local) return full;
    const target = 'img/' + local.file;
    if (oldImg === target) return full;
    changed++;
    return pre + target + post;
  });

  const after = (out.match(/\{\s*n:\s*"/g) || []).length;
  if (after !== before) {
    console.error(`✗ index.html 条目数变了（${before} → ${after}），已放弃写入`);
    return false;
  }
  if (changed === 0) {
    console.log('index.html 无需修改（img 字段已经都是本地路径）');
    return true;
  }
  fs.writeFileSync(HTML_FILE, out);
  console.log(`✓ index.html 已更新 ${changed} 处 img 字段`);
  return true;
}

/* ==================== 统计 ==================== */
function htmlStats() {
  const src = fs.readFileSync(HTML_FILE, 'utf8');
  const re = /\{\s*n:\s*"([^"]+)",\s*c:\s*"([^"]+)",\s*tag:\s*"[^"]*",\s*icon:\s*"[^"]*",\s*img:\s*"([^"]*)"\s*\}/g;
  const withImg = [];
  const noImg = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    (m[3] ? withImg : noImg).push({ n: m[1], c: m[2] });
  }
  return { withImg, noImg };
}

/* ==================== 主流程 ==================== */
(async () => {
  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

  const items = readItems();
  console.log('════════ 蔬菜图片下载 ════════');
  console.log(`数据源：蔬菜.md，带图片链接的食材 ${items.length} 项`);
  console.log(`图片目录：img/    并发 ${CONCURRENCY}    模式：${FORCE ? '强制重下' : '跳过已有'}${APPLY ? ' + 回写 index.html' : ''}\n`);

  const skip = [];
  const todo = [];
  for (const it of items) {
    const local = FORCE ? null : findLocal(it.file);
    if (local) skip.push(Object.assign({}, it, local));
    else todo.push(it);
  }
  console.log(`已有可用图片 ${skip.length} 张，需要下载 ${todo.length} 张\n`);

  const ok = [];
  const fail = [];
  let done = 0;

  if (todo.length) {
    await runPool(todo, CONCURRENCY, async (it) => {
      const tag = `[${String(++done).padStart(2)}/${todo.length}]`;
      try {
        const r = await downloadOne(it);
        console.log(`${tag} ✓ ${it.file}${r.ext}  ${(r.size / 1024).toFixed(0)} KB${it.file !== it.name ? `（来自「${it.name}」）` : ''}`);
        ok.push(Object.assign({}, it, r));
      } catch (e) {
        console.log(`${tag} ✗ ${it.file}  ${e.message}`);
        fail.push(Object.assign({}, it, { reason: e.message }));
      }
    });
  }

  console.log('\n════════ 结果 ════════');
  console.log(`新下载 ${ok.length}    跳过已有 ${skip.length}    失败 ${fail.length}`);

  if (fail.length) {
    console.log('\n失败清单：');
    fail.forEach(f => console.log(`  - ${f.name}：${f.reason}`));
  }

  if (APPLY) {
    console.log('\n════════ 回写 index.html ════════');
    applyToHtml();
  }

  const { withImg, noImg } = htmlStats();
  console.log('\n════════ index.html 现状 ════════');
  console.log(`有图片 ${withImg.length} 项 / 无图片（用 emoji 兜底）${noImg.length} 项`);
  if (noImg.length) {
    const byCat = {};
    noImg.forEach(i => { (byCat[i.c] = byCat[i.c] || []).push(i.n); });
    Object.keys(byCat).forEach(c => console.log(`  ${c}：${byCat[c].join('、')}`));
  }

  // img/ 里下载了但 index.html 没用上的
  const referenced = new Set(withImg.map(i => i.n));
  const files = fs.readdirSync(IMG_DIR)
    .filter(f => KNOWN_EXT.includes(path.extname(f).toLowerCase()));
  const unused = files.filter(f => !referenced.has(path.basename(f, path.extname(f))));
  if (unused.length) {
    console.log(`\nimg/ 里未被 index.html 引用（可在 ALIAS 里做映射）：${unused.join('、')}`);
  }
})();

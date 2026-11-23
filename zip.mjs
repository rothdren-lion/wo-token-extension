#!/usr/bin/env node
// 打包：每个浏览器目录打成 zip（manifest.json 在 zip 根目录）。
// 火狐另外输出同名 .xpi，火狐只认 .xpi 后缀（zip 直接拖进去会提示文件无效）。
// 用法: node zip.mjs
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DIRS = ['chrome', 'firefox-mv3', 'firefox-mv2', 'safari'];

await mkdir(path.join(ROOT, 'dist'), { recursive: true });
for (const d of DIRS) {
  const zip = path.join(ROOT, 'dist', d + '.zip');
  await rm(zip, { force: true });
  execFileSync('zip', ['-qr', zip, '.'], { cwd: path.join(ROOT, d), stdio: 'inherit' });
  console.log('✓ dist/' + d + '.zip');
  if (d.startsWith('firefox')) {
    const xpi = path.join(ROOT, 'dist', d + '.xpi');
    await copyFile(zip, xpi);
    console.log('✓ dist/' + d + '.xpi');
  }
}

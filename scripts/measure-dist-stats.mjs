#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const distDir = join(process.cwd(), 'dist', 'assets');

function formatAsset(path) {
  const raw = readFileSync(path);
  return {
    file: path.split('/').pop(),
    bytes: statSync(path).size,
    gzipBytes: gzipSync(raw).length,
  };
}

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}

function main() {
  const files = readdirSync(distDir);
  const jsAssets = files
    .filter((file) => file.endsWith('.js'))
    .map((file) => formatAsset(join(distDir, file)))
    .sort((left, right) => right.bytes - left.bytes);
  const cssAssets = files
    .filter((file) => file.endsWith('.css'))
    .map((file) => formatAsset(join(distDir, file)))
    .sort((left, right) => right.bytes - left.bytes);

  console.log(JSON.stringify({
    measuredAt: new Date().toISOString(),
    totals: {
      jsBytes: sum(jsAssets, 'bytes'),
      jsGzipBytes: sum(jsAssets, 'gzipBytes'),
      cssBytes: sum(cssAssets, 'bytes'),
      cssGzipBytes: sum(cssAssets, 'gzipBytes'),
    },
    largestJsAssets: jsAssets.slice(0, 10),
    cssAssets,
  }, null, 2));
}

main();

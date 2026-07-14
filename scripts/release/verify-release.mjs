#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { access, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import {
  findPrivateHashCopies,
  findUnsafeArchiveEntries,
  isGitLfsPointer,
} from './release-helpers.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const releaseDirectory = path.join(repositoryRoot, 'release');
const sourceArchive = path.join(releaseDirectory, 'mimimia-source-v1.0.0.zip');
const distArchive = path.join(releaseDirectory, 'mimimia-dist-v1.0.0.zip');
const forbiddenRuntimeReference = /(?:\.superpowers[\\/]references|user-provided-witch-reference)/u;
const textExtensions = new Set(['.css', '.csv', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.tsx', '.txt', '.yml', '.yaml']);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath));
    if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

function archiveEntries(archive) {
  return run('unzip', ['-Z1', archive], { quiet: true }).split(/\r?\n/u).filter(Boolean);
}

async function hashRecords(root) {
  const records = [];
  for (const filePath of await listFiles(root)) {
    records.push({
      path: path.relative(root, filePath).split(path.sep).join('/'),
      sha256: createHash('sha256').update(await readFile(filePath)).digest('hex'),
    });
  }
  return records;
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.js') return 'text/javascript; charset=utf-8';
  if (extension === '.css') return 'text/css; charset=utf-8';
  if (extension === '.json') return 'application/json';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.mp3') return 'audio/mpeg';
  return 'application/octet-stream';
}

for (const archive of [sourceArchive, distArchive]) {
  if (!(await exists(archive))) throw new Error(`Missing release archive: ${archive}`);
  const unsafe = findUnsafeArchiveEntries(archiveEntries(archive));
  if (unsafe.length > 0) throw new Error(`Unsafe archive entries in ${path.basename(archive)}: ${unsafe.join(', ')}`);
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'mimimia-release-'));
const sourceRoot = path.join(temporaryRoot, 'source');
const distRoot = path.join(temporaryRoot, 'dist');

try {
  run('unzip', ['-q', sourceArchive, '-d', sourceRoot]);
  run('unzip', ['-q', distArchive, '-d', distRoot]);

  for (const [label, root] of [['source', sourceRoot], ['dist', distRoot]]) {
    const privateCopies = findPrivateHashCopies(await hashRecords(root));
    if (privateCopies.length > 0) throw new Error(`Private reference copy found in ${label}: ${privateCopies.join(', ')}`);
  }

  const runtimeRoots = ['src', 'public'];
  const runtimeFiles = [];
  for (const rootName of runtimeRoots) {
    const absoluteRoot = path.join(sourceRoot, rootName);
    if (await exists(absoluteRoot)) runtimeFiles.push(...await listFiles(absoluteRoot));
  }
  for (const rootFile of ['index.html', 'package.json', 'vite.config.ts', 'playwright.config.ts']) {
    const absolutePath = path.join(sourceRoot, rootFile);
    if (await exists(absolutePath)) runtimeFiles.push(absolutePath);
  }
  for (const filePath of runtimeFiles) {
    if (!textExtensions.has(path.extname(filePath).toLowerCase())) continue;
    if (forbiddenRuntimeReference.test(await readFile(filePath, 'utf8'))) {
      throw new Error(`Runtime file references private material: ${path.relative(sourceRoot, filePath)}`);
    }
  }

  const lfsFiles = run('git', ['lfs', 'ls-files', '--name-only'], { quiet: true })
    .split(/\r?\n/u)
    .filter(Boolean);
  for (const relativePath of lfsFiles) {
    const bytes = await readFile(path.join(sourceRoot, relativePath));
    if (isGitLfsPointer(bytes)) throw new Error(`Source package contains an unresolved LFS pointer: ${relativePath}`);
  }

  run('npm', ['ci'], { cwd: sourceRoot });
  run('npm', ['run', 'build'], { cwd: sourceRoot });

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const relativePath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
    const filePath = path.resolve(distRoot, relativePath);
    if (!filePath.startsWith(`${path.resolve(distRoot)}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error('not a file');
      response.writeHead(200, { 'content-type': mimeType(filePath) });
      response.end(await readFile(filePath));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Static verification server did not start');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.locator('[data-testid="enter-button"]:not([disabled])').waitFor({ timeout: 120_000 });
    await page.locator('[data-testid="enter-button"]').click();
    await page.locator('body[data-experience-state="idle"]').waitFor({ timeout: 10_000 });
    if (!(await page.locator('canvas[data-render-surface]').isVisible())) throw new Error('Release canvas is not visible');
    if (consoleErrors.length > 0) throw new Error(`Release browser errors: ${consoleErrors.join(' | ')}`);
  } finally {
    await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  console.log('Release verification passed: archives are private-safe, source rebuilds, and dist opens from a static server.');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

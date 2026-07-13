#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_PRIVATE_SHA256 = '068cb272738f78eb2ec3f10239de63450afeb433a44af8ee1abd24835b72ea23';
const PRIVATE_RELATIVE_PATH = '.superpowers/references/user-provided-witch-reference.png';
const REPOSITORY_ROOT = path.resolve(
  process.env.MIMIMIA_REPOSITORY_ROOT ?? fileURLToPath(new URL('../../', import.meta.url)),
);
const HASH_SCAN_ROOTS = ['public', 'src', 'art', 'docs'];
const RUNTIME_SCAN_ROOTS = ['src', 'public'];
const RUNTIME_SCAN_FILES = [
  'index.html',
  'package.json',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'tsconfig.json',
];
const TEXT_EXTENSIONS = new Set([
  '.css', '.csv', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.ts', '.tsx', '.txt', '.xml', '.yml', '.yaml',
]);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(rootPath) {
  if (!(await exists(rootPath))) return [];

  const entries = await readdir(rootPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath));
    if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

async function sha256(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

function git(repositoryRoot, args, options = {}) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', options.allowFailure ? 'ignore' : 'pipe'],
  }).trim();
}

function isRuntimeTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export async function verifyPrivateBoundary(repositoryRoot = REPOSITORY_ROOT) {
  const failures = [];
  const privatePath = path.join(repositoryRoot, PRIVATE_RELATIVE_PATH);
  const privateExists = await exists(privatePath);

  if (privateExists) {
    const actualHash = await sha256(privatePath);
    if (actualHash !== EXPECTED_PRIVATE_SHA256) {
      failures.push(`私有参考图校验值不匹配：${actualHash}`);
    }
  } else if (!process.env.CI) {
    failures.push(`本地私有参考图不存在：${PRIVATE_RELATIVE_PATH}`);
  }

  try {
    git(repositoryRoot, ['check-ignore', '--quiet', '--', PRIVATE_RELATIVE_PATH]);
  } catch {
    failures.push(`私有参考路径未被 Git 排除：${PRIVATE_RELATIVE_PATH}`);
  }

  const trackedPrivateFiles = git(repositoryRoot, ['ls-files', '--', '.superpowers']);
  if (trackedPrivateFiles) failures.push(`发现已记录的私有文件：${trackedPrivateFiles}`);

  let scannedFiles = 0;
  for (const rootName of HASH_SCAN_ROOTS) {
    const files = await listFiles(path.join(repositoryRoot, rootName));
    for (const filePath of files) {
      scannedFiles += 1;
      if (await sha256(filePath) === EXPECTED_PRIVATE_SHA256) {
        failures.push(`发现私有参考图副本：${path.relative(repositoryRoot, filePath)}`);
      }
    }
  }

  const runtimeFiles = [];
  for (const rootName of RUNTIME_SCAN_ROOTS) {
    runtimeFiles.push(...await listFiles(path.join(repositoryRoot, rootName)));
  }
  for (const relativePath of RUNTIME_SCAN_FILES) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    if (await exists(absolutePath)) runtimeFiles.push(absolutePath);
  }

  const forbiddenRuntimeReference = /(?:\.superpowers[\\/]references|user-provided-witch-reference)/;
  for (const filePath of new Set(runtimeFiles)) {
    if (!isRuntimeTextFile(filePath)) continue;
    const contents = await readFile(filePath, 'utf8');
    if (forbiddenRuntimeReference.test(contents)) {
      failures.push(`运行时文件引用了私有参考：${path.relative(repositoryRoot, filePath)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`私有参考边界检查失败：\n- ${failures.join('\n- ')}`);
  }

  return { privateReferencePresent: privateExists, scannedFiles };
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  verifyPrivateBoundary()
    .then(({ privateReferencePresent, scannedFiles }) => {
      const localStatus = privateReferencePresent ? '本地参考图校验通过' : '公开环境未包含私有参考图';
      console.log(`私有边界通过：${localStatus}，已扫描 ${scannedFiles} 个公开候选文件。`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

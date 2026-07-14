#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isGitLfsPointer, selectSourceFiles } from './release-helpers.mjs';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const releaseDirectory = path.join(repositoryRoot, 'release');
const version = 'v1.0.0';
const sourceArchive = path.join(releaseDirectory, `mimimia-source-${version}.zip`);
const distArchive = path.join(releaseDirectory, `mimimia-dist-${version}.zip`);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relativePath));
    if (entry.isFile()) files.push(relativePath);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    input: options.input,
    stdio: options.capture
      ? ['ignore', 'pipe', 'pipe']
      : options.input === undefined
        ? 'inherit'
        : ['pipe', 'inherit', 'inherit'],
  });
}

async function removeIfPresent(filePath) {
  if (await exists(filePath)) await unlink(filePath);
}

await mkdir(releaseDirectory, { recursive: true });

const lfsFiles = run('git', ['lfs', 'ls-files', '--name-only'], { capture: true })
  .split(/\r?\n/u)
  .map((entry) => entry.trim())
  .filter(Boolean);
for (const relativePath of lfsFiles) {
  const bytes = await readFile(path.join(repositoryRoot, relativePath));
  if (isGitLfsPointer(bytes)) throw new Error(`Git LFS file is not materialized: ${relativePath}`);
}

const trackedFiles = run('git', ['ls-files', '-z'], { capture: true }).split('\0').filter(Boolean);
const sourceFiles = selectSourceFiles(trackedFiles);
if (!sourceFiles.includes('package-lock.json') || !sourceFiles.includes('docs/reports/performance-report.md')) {
  throw new Error('Tracked source set is missing required delivery files');
}

run('npm', ['run', 'build']);
const distFiles = await listFiles(path.join(repositoryRoot, 'dist'));
if (!distFiles.includes('index.html')) throw new Error('Production build did not create dist/index.html');

await removeIfPresent(sourceArchive);
await removeIfPresent(distArchive);
run('zip', ['-X', '-q', sourceArchive, '-@'], { input: `${sourceFiles.join('\n')}\n` });
run('zip', ['-X', '-q', distArchive, '-@'], {
  cwd: path.join(repositoryRoot, 'dist'),
  input: `${distFiles.join('\n')}\n`,
});

console.log(`Release packages created:\n- ${sourceArchive}\n- ${distArchive}`);

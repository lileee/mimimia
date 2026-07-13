import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../../../', import.meta.url);

const LEDGER_HEADER = 'asset_id,path,category,creator_or_source,creation_method,modifications,license_basis,public_use_status,sha256\n';

function runAssetCheck(script: string, environment: NodeJS.ProcessEnv = {}): string {
  return execFileSync('npm', ['run', script], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('asset provenance safeguards', () => {
  it('keeps the private reference outside tracked and public files', () => {
    expect(() => runAssetCheck('assets:private-check')).not.toThrow();
  });

  it('requires one approved ledger record for every public asset', () => {
    expect(() => runAssetCheck('assets:ledger-check')).not.toThrow();
  });

  it('rejects a runtime source file that reads the private reference path', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'mimimia-private-boundary-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: fixture });
      await mkdir(path.join(fixture, 'src'), { recursive: true });
      await writeFile(path.join(fixture, '.gitignore'), '.superpowers/\n');
      await writeFile(path.join(fixture, 'src', 'leak.ts'), "fetch('.superpowers/references/private.png');\n");

      expect(() => runAssetCheck('assets:private-check', {
        CI: '1',
        MIMIMIA_REPOSITORY_ROOT: fixture,
      })).toThrow(/运行时文件引用了私有参考/);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it('rejects an unregistered file in public assets', async () => {
    const fixture = await mkdtemp(path.join(tmpdir(), 'mimimia-ledger-'));
    try {
      await mkdir(path.join(fixture, 'docs', 'assets'), { recursive: true });
      await mkdir(path.join(fixture, 'public', 'assets'), { recursive: true });
      await writeFile(path.join(fixture, 'docs', 'assets', 'asset-ledger.csv'), LEDGER_HEADER);
      await writeFile(path.join(fixture, 'public', 'assets', 'unregistered.bin'), 'not registered');

      expect(() => runAssetCheck('assets:ledger-check', {
        MIMIMIA_REPOSITORY_ROOT: fixture,
      })).toThrow(/必须恰有一条素材记录/);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});

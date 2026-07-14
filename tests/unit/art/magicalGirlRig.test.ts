import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../../../', import.meta.url);

describe('magical girl layer pack', () => {
  it('contains the approved 15 layers with valid pivots and motion limits', () => {
    expect(() => execFileSync('npm', ['run', 'art:validate-layers', '--', 'magical-girl'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })).not.toThrow();
  }, 30_000);
});

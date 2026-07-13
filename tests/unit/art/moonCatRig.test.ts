import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const projectRoot = new URL('../../../', import.meta.url);

describe('moon cat layer pack', () => {
  it('contains the approved eight layers with valid pivots and motion limits', () => {
    expect(() => execFileSync('npm', ['run', 'art:validate-layers', '--', 'moon-cat'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';

import {
  EXPECTED_PRIVATE_SHA256,
  findPrivateHashCopies,
  findUnsafeArchiveEntries,
  isGitLfsPointer,
  selectSourceFiles,
} from '../../../scripts/release/release-helpers.mjs';

describe('release source selection', () => {
  it('keeps tracked delivery files while excluding local, generated, and private roots', () => {
    expect(selectSourceFiles([
      'src/main.ts',
      'art/source/magical-girl/approved-master.ora',
      'docs/reports/performance-report.md',
      '.superpowers/references/private.png',
      'release/mimimia-source-v1.0.0.zip',
      'dist/index.html',
      'node_modules/three/package.json',
      'test-results/trace.zip',
    ])).toEqual([
      'art/source/magical-girl/approved-master.ora',
      'docs/reports/performance-report.md',
      'src/main.ts',
    ]);
  });
});

describe('release boundary checks', () => {
  it('rejects private segments and traversal in archive entries on both path separators', () => {
    expect(findUnsafeArchiveEntries([
      'mimimia-source-v1.0.0/src/main.ts',
      'mimimia-source-v1.0.0/.superpowers/references/private.png',
      'mimimia-source-v1.0.0\\.superpowers\\private.png',
      '../outside.txt',
    ])).toEqual([
      'mimimia-source-v1.0.0/.superpowers/references/private.png',
      'mimimia-source-v1.0.0/.superpowers/private.png',
      '../outside.txt',
    ]);
  });

  it('finds byte-identical copies of the private reference by hash', () => {
    expect(findPrivateHashCopies([
      { path: 'safe.png', sha256: 'abc' },
      { path: 'copied.png', sha256: EXPECTED_PRIVATE_SHA256 },
    ])).toEqual(['copied.png']);
  });

  it('distinguishes unresolved Git LFS pointers from real source files', () => {
    expect(isGitLfsPointer(new TextEncoder().encode(
      'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n',
    ))).toBe(true);
    expect(isGitLfsPointer(new TextEncoder().encode('real layered image bytes'))).toBe(false);
  });
});

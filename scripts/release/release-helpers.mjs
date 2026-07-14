export const EXPECTED_PRIVATE_SHA256 = '068cb272738f78eb2ec3f10239de63450afeb433a44af8ee1abd24835b72ea23';

const EXCLUDED_SOURCE_ROOTS = new Set([
  '.git',
  '.superpowers',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'release',
  'test-results',
]);

const normalize = (entry) => entry.replaceAll('\\', '/').replace(/^\.\//u, '');

export function selectSourceFiles(entries) {
  return entries
    .map(normalize)
    .filter((entry) => {
      const [root] = entry.split('/');
      return entry.length > 0 && !EXCLUDED_SOURCE_ROOTS.has(root);
    })
    .sort((left, right) => left.localeCompare(right));
}

export function findUnsafeArchiveEntries(entries) {
  return entries
    .map(normalize)
    .filter((entry) => {
      const segments = entry.split('/');
      return segments.includes('.superpowers') || segments.includes('..') || entry.startsWith('/');
    });
}

export function findPrivateHashCopies(records) {
  return records
    .filter(({ sha256 }) => sha256 === EXPECTED_PRIVATE_SHA256)
    .map(({ path }) => path);
}

export function isGitLfsPointer(bytes) {
  return new TextDecoder().decode(bytes.subarray(0, 200)).startsWith('version https://git-lfs.github.com/spec/v1\n');
}

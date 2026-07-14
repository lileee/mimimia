export const EXPECTED_PRIVATE_SHA256: string;

export function selectSourceFiles(entries: readonly string[]): string[];
export function findUnsafeArchiveEntries(entries: readonly string[]): string[];
export function findPrivateHashCopies(
  records: readonly { path: string; sha256: string }[],
): string[];
export function isGitLfsPointer(bytes: Uint8Array): boolean;

declare namespace NodeJS {
  type ProcessEnv = Record<string, string | undefined>;
}

declare const process: {
  env: NodeJS.ProcessEnv;
};

declare module 'node:child_process' {
  export function execFileSync(
    executable: string,
    arguments_: readonly string[],
    options: {
      cwd?: string | URL;
      encoding?: string;
      env?: NodeJS.ProcessEnv;
      stdio?: readonly string[];
    },
  ): string;
}

declare module 'node:fs/promises' {
  export function mkdtemp(prefix: string): Promise<string>;
  export function mkdir(path: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  export function rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  export function writeFile(path: string, data: string): Promise<void>;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  const path: {
    join(...parts: string[]): string;
  };
  export default path;
}

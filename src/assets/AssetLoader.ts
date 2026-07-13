import type { AssetManifestEntry, AssetProgressHandler, LoadedAssets } from './assetTypes';

interface AssetLoaderOptions {
  fetcher?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export class AssetLoader {
  readonly #manifest: readonly AssetManifestEntry[];
  readonly #fetcher: typeof fetch;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  #controller: AbortController | null = null;

  constructor(manifest: readonly AssetManifestEntry[], options: AssetLoaderOptions = {}) {
    this.#manifest = manifest;
    this.#fetcher = options.fetcher ?? ((input, init) => globalThis.fetch(input, init));
    this.#sleep = options.sleep ?? defaultSleep;
  }

  cancel(): void {
    this.#controller?.abort();
  }

  async load(onProgress: AssetProgressHandler): Promise<LoadedAssets> {
    this.cancel();
    const controller = new AbortController();
    this.#controller = controller;
    const assets = new Map<string, Uint8Array>();
    const skipped: string[] = [];
    const failed: string[] = [];
    const progressById = new Map(this.#manifest.map((entry) => [entry.id, 0]));
    const totalBytes = this.#manifest.reduce((total, entry) => total + Math.max(0, entry.bytes), 0);
    let muted = false;
    let criticalFailure = false;
    let reportedProgress = 0;

    const report = (entry: AssetManifestEntry, bytes: number) => {
      progressById.set(entry.id, Math.min(entry.bytes, Math.max(0, bytes)));
      const complete = [...progressById.values()].reduce((total, value) => total + value, 0);
      const progress = totalBytes === 0 ? 1 : Math.min(1, complete / totalBytes);
      reportedProgress = Math.max(reportedProgress, progress);
      onProgress(reportedProgress);
    };

    onProgress(0);
    for (const entry of this.#manifest) {
      if (controller.signal.aborted) return this.#result('aborted', assets, muted, skipped, failed);
      try {
        const data = await this.#loadWithRetry(entry, controller.signal, (bytes) => report(entry, bytes));
        assets.set(entry.id, data);
        report(entry, entry.bytes);
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) {
          return this.#result('aborted', assets, muted, skipped, failed);
        }
        failed.push(entry.id);
        report(entry, entry.bytes);
        if (entry.kind === 'music') {
          muted = true;
        } else if (!entry.critical) {
          skipped.push(entry.id);
        } else {
          criticalFailure = true;
        }
      }
    }

    onProgress(1);
    return this.#result(criticalFailure ? 'critical-failure' : 'success', assets, muted, skipped, failed);
  }

  async #loadWithRetry(
    entry: AssetManifestEntry,
    signal: AbortSignal,
    onBytes: (bytes: number) => void,
  ): Promise<Uint8Array> {
    const retryCount = entry.kind === 'character' ? entry.retryCount : 0;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        return await this.#loadOne(entry, signal, onBytes);
      } catch (error) {
        if (isAbortError(error) || signal.aborted || attempt === retryCount) throw error;
        await this.#sleep(300);
      }
    }
    throw new Error('unreachable');
  }

  async #loadOne(
    entry: AssetManifestEntry,
    signal: AbortSignal,
    onBytes: (bytes: number) => void,
  ): Promise<Uint8Array> {
    const response = await this.#fetcher(entry.url, { signal });
    if (!response.ok) throw new Error(`Asset ${entry.id} returned HTTP ${response.status}`);
    if (!response.body) {
      const data = new Uint8Array(await response.arrayBuffer());
      onBytes(entry.bytes);
      return data;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      received += value.byteLength;
      onBytes(received);
    }
    const data = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    onBytes(entry.bytes);
    return data;
  }

  #result(
    status: LoadedAssets['status'],
    assets: Map<string, Uint8Array>,
    muted: boolean,
    skipped: string[],
    failed: string[],
  ): LoadedAssets {
    return { status, assets, muted, skipped, failed };
  }
}

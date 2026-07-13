import { describe, expect, it, vi } from 'vitest';

import { AssetLoader } from '../../../src/assets/AssetLoader';
import type { AssetManifestEntry } from '../../../src/assets/assetTypes';

function entry(overrides: Partial<AssetManifestEntry> = {}): AssetManifestEntry {
  return {
    id: 'girl-body',
    url: '/girl-body.webp',
    kind: 'character',
    critical: true,
    bytes: 4,
    retryCount: 1,
    ...overrides,
  };
}

function chunkedResponse(chunks: number[][], contentLength?: number): Response {
  const headers = contentLength === undefined ? undefined : { 'content-length': String(contentLength) };
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk));
      controller.close();
    },
  }), { status: 200, headers });
}

describe('AssetLoader', () => {
  it('calls the browser fetch function with the global receiver', async () => {
    let receiver: unknown;
    const browserFetch = vi.fn(function (this: unknown) {
      receiver = this;
      return Promise.resolve(chunkedResponse([[1, 2, 3, 4]], 4));
    });
    vi.stubGlobal('fetch', browserFetch);
    try {
      const loader = new AssetLoader([entry({ kind: 'sound', retryCount: 0 })]);
      await expect(loader.load(() => undefined)).resolves.toMatchObject({ status: 'success' });
      expect(receiver).toBe(globalThis);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reports monotonic real-byte progress and finishes at one', async () => {
    const manifest = [entry(), entry({ id: 'cat-body', url: '/cat.webp', bytes: 3 })];
    const responses = [chunkedResponse([[1, 2], [3, 4]], 4), chunkedResponse([[5], [6, 7]])];
    const progress: number[] = [];
    const loader = new AssetLoader(manifest, {
      fetcher: vi.fn(async () => responses.shift()!),
      sleep: async () => undefined,
    });

    const result = await loader.load((value) => progress.push(value));

    expect(result.status).toBe('success');
    expect(progress.at(-1)).toBe(1);
    expect(progress.length).toBeGreaterThan(2);
    expect(progress.every((value, index) => index === 0 || value >= progress[index - 1])).toBe(true);
  });

  it('retries a failed character once after exactly 300 milliseconds', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(chunkedResponse([[1, 2, 3, 4]], 4));
    const sleep = vi.fn(async () => undefined);
    const loader = new AssetLoader([entry()], { fetcher, sleep });

    const result = await loader.load(() => undefined);

    expect(result.status).toBe('success');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(300);
  });

  it('returns critical-failure when a required character fails twice', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 500 }));
    const loader = new AssetLoader([entry()], { fetcher, sleep: async () => undefined });

    const result = await loader.load(() => undefined);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('critical-failure');
    expect(result.failed).toEqual(['girl-body']);
  });

  it('marks music unavailable but still succeeds', async () => {
    const music = entry({
      id: 'ambient-moon-void',
      url: '/ambient.mp3',
      kind: 'music',
      bytes: 10,
      retryCount: 0,
    });
    const loader = new AssetLoader([music], {
      fetcher: async () => new Response(null, { status: 404 }),
      sleep: async () => undefined,
    });

    const result = await loader.load(() => undefined);

    expect(result.status).toBe('success');
    expect(result.muted).toBe(true);
    expect(result.failed).toEqual(['ambient-moon-void']);
  });

  it('skips a failed noncritical decoration', async () => {
    const decoration = entry({
      id: 'extra-dust',
      url: '/extra.webp',
      kind: 'decoration',
      critical: false,
      bytes: 2,
      retryCount: 0,
    });
    const loader = new AssetLoader([decoration], {
      fetcher: async () => new Response(null, { status: 404 }),
      sleep: async () => undefined,
    });

    const result = await loader.load(() => undefined);

    expect(result.status).toBe('success');
    expect(result.skipped).toEqual(['extra-dust']);
  });

  it('can cancel an in-flight load', async () => {
    const loader = new AssetLoader([entry()], {
      fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
      sleep: async () => undefined,
    });

    const pending = loader.load(() => undefined);
    loader.cancel();

    await expect(pending).resolves.toMatchObject({ status: 'aborted' });
  });
});

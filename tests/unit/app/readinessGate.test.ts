import { describe, expect, it, vi } from 'vitest';

import { ReadinessGate } from '../../../src/app/readinessGate';

describe('ReadinessGate', () => {
  it('stays closed at 100% assets until renderer, warmup, and benchmark are all ready', () => {
    const gate = new ReadinessGate();
    gate.mark('assetsReady');
    expect(gate.snapshot()).toMatchObject({
      assetsReady: true,
      rendererReady: false,
      warmupReady: false,
      benchmarkReady: false,
      ready: false,
    });

    gate.mark('rendererReady');
    gate.mark('warmupReady');
    expect(gate.isReady()).toBe(false);
    gate.mark('benchmarkReady');
    expect(gate.isReady()).toBe(true);
  });

  it('notifies only when a readiness value changes and can reset for retry', () => {
    const listener = vi.fn();
    const gate = new ReadinessGate(listener);
    gate.mark('assetsReady');
    gate.mark('assetsReady');
    expect(listener).toHaveBeenCalledTimes(1);
    gate.reset();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(gate.isReady()).toBe(false);
    expect(gate.snapshot()).toMatchObject({
      assetsReady: false,
      rendererReady: false,
      warmupReady: false,
      benchmarkReady: false,
    });
  });
});

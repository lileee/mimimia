import { describe, expect, it, vi } from 'vitest';

import { WarmupController } from '../../../src/performance/WarmupController';

describe('WarmupController', () => {
  it('renders every first-cast state before reporting ready', async () => {
    const states: string[] = [];
    const target = {
      setQuality: vi.fn(),
      renderFrame: vi.fn((signals: { state: string }) => { states.push(signals.state); }),
      renderClosedEyesFrame: vi.fn((signals: { state: string }) => { states.push(signals.state); }),
      prepareTextures: vi.fn(async () => undefined),
      clearHistory: vi.fn(),
      settle: vi.fn(async () => undefined),
    };
    const controller = new WarmupController(target);

    await expect(controller.prepare('balanced')).resolves.toEqual({
      ready: true,
      frameCount: 12,
      states: ['idle', 'charged', 'dissolving', 'summoning', 'complete'],
    });
    expect(states).toHaveLength(12);
    expect(new Set(states)).toEqual(new Set(['idle', 'charged', 'dissolving', 'summoning', 'complete']));
    expect(target.setQuality).toHaveBeenLastCalledWith('balanced');
    expect(target.prepareTextures).toHaveBeenCalledOnce();
    expect(target.clearHistory).toHaveBeenCalledOnce();
    expect(target.renderClosedEyesFrame).toHaveBeenCalledOnce();
    expect(target.settle).toHaveBeenCalledOnce();
  });
});

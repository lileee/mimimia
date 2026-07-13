import { describe, expect, it, vi } from 'vitest';

import { SummonDirector } from '../../../src/summon/SummonDirector';
import { getSummonFrame } from '../../../src/summon/summonTiming';

const signalsAt = (elapsedMs: number, state: 'summoning' | 'complete' = 'summoning') => ({
  nowMs: elapsedMs,
  deltaSeconds: 1 / 60,
  state,
  charge: 1,
  dissolve: 0,
  summon: state === 'complete' ? 1 : elapsedMs / 2_600,
  pointerNdc: { x: 0, y: 0 },
});

describe('summon timing', () => {
  it('matches every confirmed reveal and movement boundary', () => {
    expect(getSummonFrame(0)).toMatchObject({ shadow: 0, fill: 0, move: 0, complete: false });
    expect(getSummonFrame(120)).toMatchObject({ shadow: 0, fill: 0, move: 0 });
    expect(getSummonFrame(760).shadow).toBe(1);
    expect(getSummonFrame(520).fill).toBe(0);
    expect(getSummonFrame(1_660).fill).toBe(1);
    expect(getSummonFrame(1_500).move).toBe(0);
    expect(getSummonFrame(2_360).move).toBe(1);
    expect(getSummonFrame(2_599).complete).toBe(false);
    expect(getSummonFrame(2_600).complete).toBe(true);
  });

  it('keeps the cat path outside the face safety margin', () => {
    for (let elapsed = 0; elapsed <= 2_600; elapsed += 20) {
      const frame = getSummonFrame(elapsed);
      if (frame.position.y > 2.65) expect(frame.position.x).toBeGreaterThan(0.9);
    }
    expect(getSummonFrame(2_600).position).toMatchObject({ x: 1.28, y: 3.02 });
  });
});

describe('SummonDirector', () => {
  it('triggers each pooled burst once and leaves the cat complete', () => {
    const cat = { setReveal: vi.fn(), setAnchorPosition: vi.fn(), reset: vi.fn() };
    const particles = { burst: vi.fn() };
    const director = new SummonDirector(cat, particles);

    for (const elapsed of [0, 120, 520, 760, 1_500, 1_660, 2_360, 2_600, 2_600]) {
      director.update(signalsAt(elapsed, elapsed >= 2_600 ? 'complete' : 'summoning'));
    }
    expect(particles.burst.mock.calls).toEqual([
      ['release-flash'],
      ['fill-rise'],
      ['cat-settle'],
    ]);
    expect(cat.setReveal).toHaveBeenLastCalledWith(1, 1, 1);
    expect(director.isComplete()).toBe(true);
  });
});

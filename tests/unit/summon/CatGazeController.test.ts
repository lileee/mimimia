import { describe, expect, it } from 'vitest';

import { CatGazeController } from '../../../src/summon/CatGazeController';

describe('CatGazeController', () => {
  it('clamps head and eye movement and eases over 180 ms', () => {
    const gaze = new CatGazeController();
    gaze.setPointerNdc(4, -3, true);
    const first = gaze.update(180);
    expect(first.headDegrees).toBeGreaterThan(1.7);
    expect(first.headDegrees).toBeLessThanOrEqual(3);
    expect(first.eyeOffsetFraction).toBeGreaterThan(0.02);
    expect(first.eyeOffsetFraction).toBeLessThanOrEqual(0.04);

    for (let index = 0; index < 20; index += 1) gaze.update(180);
    const settled = gaze.getState();
    expect(settled.headDegrees).toBeCloseTo(3, 3);
    expect(settled.eyeOffsetFraction).toBeCloseTo(0.04, 3);
  });

  it('returns gently toward center after the pointer leaves', () => {
    const gaze = new CatGazeController();
    gaze.setPointerNdc(-1, 0, true);
    for (let index = 0; index < 10; index += 1) gaze.update(180);
    expect(gaze.getState().headDegrees).toBeLessThan(-2.9);
    gaze.setPointerNdc(0, 0, false);
    const firstReturn = gaze.update(180).headDegrees;
    expect(firstReturn).toBeLessThan(-1);
    for (let index = 0; index < 20; index += 1) gaze.update(180);
    expect(Math.abs(gaze.getState().headDegrees)).toBeLessThan(0.01);
  });
});

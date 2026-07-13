import { describe, expect, it } from 'vitest';

import { ContinuousFrameSampler, selectInitialQuality } from '../../../src/quality/frameSampling';

describe('initial quality boundaries', () => {
  it.each([
    [45, 'high'],
    [44.9, 'balanced'],
    [30, 'balanced'],
    [29.9, 'compatibility'],
  ] as const)('selects %s fps as %s', (fps, expected) => {
    expect(selectInitialQuality(fps)).toBe(expected);
  });
});

describe('continuous frame sampling', () => {
  it('completes only after three uninterrupted valid seconds', () => {
    const sampler = new ContinuousFrameSampler(3_000);
    expect(sampler.observe(0, true)).toBeNull();
    expect(sampler.observe(1_500, true)).toBeNull();
    expect(sampler.observe(2_999, true)).toBeNull();
    expect(sampler.observe(3_000, true)).toMatchObject({ durationMs: 3_000, frameCount: 3, fps: 1 });
  });

  it('clears hidden, unfocused, unhealthy, and reversed samples before measuring again', () => {
    const sampler = new ContinuousFrameSampler(3_000);
    sampler.observe(0, true);
    sampler.observe(1_500, true);
    expect(sampler.observe(1_600, false)).toBeNull();
    expect(sampler.getSnapshot()).toMatchObject({ durationMs: 0, frameCount: 0, fps: 0 });
    expect(sampler.observe(2_000, true)).toBeNull();
    expect(sampler.observe(1_900, true)).toBeNull();
    expect(sampler.observe(4_899, true)).toBeNull();
    expect(sampler.observe(4_900, true)).toMatchObject({ durationMs: 3_000, frameCount: 2 });
  });
});

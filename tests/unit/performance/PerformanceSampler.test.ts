import { describe, expect, it } from 'vitest';

import {
  PerformanceSampler,
  countRuntimeObjects,
  type RuntimeObjectSource,
} from '../../../src/performance/PerformanceSampler';

const valid = { visible: true, focused: true, graphicsHealthy: true };

describe('PerformanceSampler', () => {
  it('uses actual frame intervals for average fps and one-percent low fps', () => {
    const sampler = new PerformanceSampler();
    sampler.beginProfile(0);
    for (const nowMs of [0, 16, 33, 50]) sampler.observeFrame(nowMs, valid);
    const snapshot = sampler.getSnapshot();
    expect(snapshot.sampleCount).toBe(3);
    expect(snapshot.averageFps).toBeCloseTo(60, 4);
    expect(snapshot.onePercentLowFps).toBeCloseTo(1_000 / 17, 4);
  });

  it('clears samples across hidden, unfocused, or unhealthy intervals', () => {
    const sampler = new PerformanceSampler();
    sampler.beginProfile(0);
    sampler.observeFrame(0, valid);
    sampler.observeFrame(16, valid);
    sampler.observeFrame(32, { ...valid, focused: false });
    expect(sampler.getSnapshot().sampleCount).toBe(0);
    sampler.observeFrame(10_000, valid);
    sampler.observeFrame(10_020, valid);
    expect(sampler.getSnapshot()).toMatchObject({ sampleCount: 1, averageFps: 50 });
  });

  it('counts stalls only from the first pointer down through the third completed summon', () => {
    const sampler = new PerformanceSampler();
    sampler.observeFrame(0, valid);
    sampler.observeFrame(700, valid);
    sampler.beginProfile(1_000);
    sampler.observeFrame(1_000, valid);
    sampler.observeFrame(1_499, valid);
    sampler.observeFrame(1_999, valid);
    sampler.markSummonComplete(2_000);
    sampler.markSummonComplete(3_000);
    sampler.markSummonComplete(4_000);
    sampler.observeFrame(5_000, valid);
    expect(sampler.getSnapshot()).toMatchObject({
      summonCount: 3,
      maxFrameGapMs: 500,
      passesStallBudget: false,
      complete: true,
    });
  });

  it('counts unique runtime resources by the approved categories', () => {
    const geometry = {};
    const material = {};
    const texture = {};
    const source: RuntimeObjectSource = {
      sceneObjects: [
        { geometry, material: { ...material, map: texture } },
        { geometry, material: [{ ...material, map: texture }, {}] },
        {},
      ],
      rendererInfo: { memory: { geometries: 4, textures: 3 } },
      poolCapacity: 1_200,
    };
    expect(countRuntimeObjects(source)).toEqual({
      geometries: 4,
      materials: 3,
      textures: 3,
      sceneObjects: 3,
      poolCapacity: 1_200,
    });
  });
});

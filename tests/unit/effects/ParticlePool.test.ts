import { describe, expect, it } from 'vitest';

import { ParticlePool } from '../../../src/effects/ParticlePool';

describe('ParticlePool', () => {
  it('reuses one fixed allocation through repeated acquire and release cycles', () => {
    let allocations = 0;
    const pool = new ParticlePool(12, (index) => {
      allocations += 1;
      return { index };
    });
    expect(allocations).toBe(12);

    for (let cycle = 0; cycle < 20; cycle += 1) {
      const items = Array.from({ length: 12 }, () => pool.acquire());
      expect(items.every(Boolean)).toBe(true);
      expect(pool.acquire()).toBeNull();
      items.forEach((item) => pool.release(item!));
      expect(pool.getStats()).toEqual({ capacity: 12, activeCount: 0, allocatedObjects: 12 });
    }
    expect(allocations).toBe(12);
  });
});

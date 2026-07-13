import { describe, expect, it } from 'vitest';

import { ParticleSystem } from '../../../src/effects/ParticleSystem';
import { QUALITY_PROFILES, type QualityTier } from '../../../src/quality/qualityProfiles';

const frame = (state: 'idle' | 'charged' | 'dissolving' | 'summoning', charge: number, dissolve = 0, nowMs = 0) => ({
  nowMs,
  deltaSeconds: 1 / 60,
  state,
  charge,
  dissolve,
  summon: state === 'summoning' ? nowMs / 2_600 : 0,
  pointerNdc: { x: 0, y: 0 },
});

describe('ParticleSystem', () => {
  it('uses deterministic positions and exact quality caps', () => {
    const first = new ParticleSystem(0x4d4f4f4e);
    const second = new ParticleSystem(0x4d4f4f4e);
    expect(first.getLayoutSample(8)).toEqual(second.getLayoutSample(8));

    const expectedTrails: Record<QualityTier, number> = { high: 4, balanced: 2, compatibility: 0 };
    for (const quality of ['high', 'balanced', 'compatibility'] as const) {
      first.update(frame('charged', 1), quality);
      expect(first.getStats().activeCount).toBe(QUALITY_PROFILES[quality].gatherStardust);
      expect(first.getStats().trailSegments).toBe(expectedTrails[quality]);
    }
    first.dispose();
    second.dispose();
  });

  it('returns to the same allocation baseline after 20 dissolve resets', () => {
    const particles = new ParticleSystem(1234);
    const allocatedObjects = particles.getStats().allocatedObjects;
    for (let cast = 0; cast < 20; cast += 1) {
      particles.update(frame('charged', 1), 'high');
      particles.update(frame('dissolving', 1, 0.5), 'high');
      particles.update(frame('dissolving', 1, 1), 'high');
      particles.reset();
      expect(particles.getStats()).toMatchObject({ activeCount: 0, allocatedObjects });
    }
    particles.dispose();
  });

  it('preallocates all three successful summon burst modes for every tier', () => {
    const particles = new ParticleSystem(99);
    for (const quality of ['high', 'balanced', 'compatibility'] as const) {
      particles.update(frame('idle', 0), quality);
      for (const mode of ['release-flash', 'fill-rise', 'cat-settle'] as const) {
        particles.burst(mode);
        particles.update(frame('summoning', 1, 0, 100), quality);
        expect(particles.getStats().activeCount).toBe(QUALITY_PROFILES[quality].burstParticles);
        expect(particles.getStats().mode).toBe(mode);
        particles.reset();
      }
    }
    particles.dispose();
  });
});

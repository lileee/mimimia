import { describe, expect, it } from 'vitest';

import { QUALITY_PROFILES } from '../../../src/quality/qualityProfiles';

describe('quality profiles', () => {
  it('matches every approved high quality value', () => {
    expect(QUALITY_PROFILES.high).toMatchObject({
      pixelRatioMax: 2,
      renderScale: 1,
      backgroundStardust: 180,
      gatherStardust: 900,
      burstParticles: 1200,
      fogLayers: 3,
      bloomStrength: 1.1,
      bloomResolutionScale: 0.5,
      chromaticAberration: 0.16,
      trails: 'fullscreen-and-4-particle',
      distortion: 'full',
    });
  });

  it('matches every approved balanced quality value', () => {
    expect(QUALITY_PROFILES.balanced).toMatchObject({
      pixelRatioMax: 1.5,
      renderScale: 0.85,
      backgroundStardust: 110,
      gatherStardust: 520,
      burstParticles: 680,
      fogLayers: 2,
      bloomStrength: 0.82,
      bloomResolutionScale: 0.4,
      chromaticAberration: 0.08,
      trails: '2-particle',
      distortion: 'light',
    });
  });

  it('matches every approved compatibility quality value', () => {
    expect(QUALITY_PROFILES.compatibility).toMatchObject({
      pixelRatioMax: 1.25,
      renderScale: 0.7,
      backgroundStardust: 60,
      gatherStardust: 240,
      burstParticles: 320,
      fogLayers: 1,
      bloomStrength: 0.58,
      bloomResolutionScale: 0.3,
      chromaticAberration: 0,
      trails: 'off',
      distortion: 'off',
    });
  });

  it('keeps framing, timeline, and color palette identical across tiers', () => {
    const profiles = Object.values(QUALITY_PROFILES);
    expect(new Set(profiles.map((profile) => profile.cameraFraming))).toEqual(new Set(['moon-overlook-v1']));
    expect(new Set(profiles.map((profile) => profile.timeline))).toEqual(new Set(['summoning-v1']));
    expect(new Set(profiles.map((profile) => profile.colorPalette))).toEqual(new Set(['moonlight-violet-v1']));
  });
});

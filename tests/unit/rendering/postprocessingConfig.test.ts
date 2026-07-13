import { describe, expect, it } from 'vitest';

import { getPostProcessingFrame, getPostProcessingTierConfig } from '../../../src/rendering/postprocessingNodes';
import { QUALITY_PROFILES } from '../../../src/quality/qualityProfiles';
import postProcessingSource from '../../../src/rendering/PostProcessing.ts?raw';
import postProcessingNodesSource from '../../../src/rendering/postprocessingNodes.ts?raw';

const frame = (state: 'idle' | 'charging' | 'charged' | 'dissolving' | 'summoning', charge: number, dissolve = 0, summon = 0) => ({
  nowMs: 1_000,
  deltaSeconds: 1 / 60,
  state,
  charge,
  dissolve,
  summon,
  pointerNdc: { x: 0, y: 0 },
});

describe('r185 postprocessing configuration', () => {
  it('keeps the exact cost differences for all quality tiers', () => {
    expect(getPostProcessingTierConfig(QUALITY_PROFILES.high)).toMatchObject({
      distortion: 'full', afterImage: true, bloomResolutionScale: 0.5, chromaticAberration: 0.16,
    });
    expect(getPostProcessingTierConfig(QUALITY_PROFILES.balanced)).toMatchObject({
      distortion: 'light', afterImage: false, bloomResolutionScale: 0.4, chromaticAberration: 0.08,
    });
    expect(getPostProcessingTierConfig(QUALITY_PROFILES.compatibility)).toMatchObject({
      distortion: 'off', afterImage: false, bloomResolutionScale: 0.3, chromaticAberration: 0,
    });
  });

  it('peaks during charged and reveal while dissolving gently', () => {
    const profile = QUALITY_PROFILES.high;
    const idle = getPostProcessingFrame(frame('idle', 0), profile);
    const phaseTwo = getPostProcessingFrame(frame('charging', 0.67), profile);
    const phaseThree = getPostProcessingFrame(frame('charging', 0.9), profile);
    const charged = getPostProcessingFrame(frame('charged', 1), profile);
    const reveal = getPostProcessingFrame(frame('summoning', 1, 0, 0.43), profile);
    const dissolve = getPostProcessingFrame(frame('dissolving', 0.9, 0.6), profile);
    expect(idle.bloomStrength).toBeLessThan(phaseThree.bloomStrength);
    expect(phaseTwo.distortionStrength).toBe(0);
    expect(phaseThree.distortionStrength).toBeGreaterThan(0);
    expect(charged.bloomStrength).toBeGreaterThanOrEqual(phaseThree.bloomStrength);
    expect(reveal.bloomStrength).toBeGreaterThan(charged.bloomStrength);
    expect(dissolve.bloomStrength).toBeLessThan(phaseThree.bloomStrength);
    expect(charged.bloomStrength).toBeLessThanOrEqual(0.36);
    expect(reveal.bloomStrength).toBeLessThanOrEqual(0.42);
    expect(charged.distortionStrength).toBeLessThanOrEqual(0.003);
    expect(charged.chromaticAberration).toBeLessThanOrEqual(0.04);
  });

  it('uses RenderPipeline and rejects every legacy or custom shader path', () => {
    const sources = `${postProcessingSource}\n${postProcessingNodesSource}`;
    for (const forbidden of ['EffectComposer', 'ShaderMaterial', 'RawShaderMaterial', 'onBeforeCompile']) {
      expect(sources).not.toContain(forbidden);
    }
    expect(postProcessingSource).toContain('new RenderPipeline');
    expect(postProcessingSource).toContain('pass(scene, camera)');
    expect(postProcessingSource).toContain("getTextureNode('output')");
    expect(postProcessingSource).toContain('setResolutionScale');
  });
});

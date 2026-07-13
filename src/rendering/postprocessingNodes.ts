import type { Node } from 'three/webgpu';
import {
  convertToTexture,
  length,
  normalize,
  oneMinus,
  smoothstep,
  time,
  uniform,
  uv,
  vec2,
} from 'three/tsl';

import type { FrameSignals } from '../app/frameSignals';
import { EXPERIENCE_TIMING } from '../config/experience';
import type { QualityProfile } from '../quality/qualityProfiles';

export interface PostProcessingTierConfig {
  distortion: QualityProfile['distortion'];
  afterImage: boolean;
  bloomResolutionScale: number;
  chromaticAberration: number;
}

export interface PostProcessingFrame {
  energy: number;
  bloomStrength: number;
  distortionStrength: number;
  chromaticAberration: number;
  afterImageDamp: number;
}

export interface SpatialDistortionControls {
  strength: { value: number };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
};

export function getPostProcessingTierConfig(profile: QualityProfile): PostProcessingTierConfig {
  return {
    distortion: profile.distortion,
    afterImage: profile.trails === 'fullscreen-and-4-particle',
    bloomResolutionScale: profile.bloomResolutionScale,
    chromaticAberration: profile.chromaticAberration,
  };
}

export function getPostProcessingFrame(signals: FrameSignals, profile: QualityProfile): PostProcessingFrame {
  let energy = 0;
  if (signals.state === 'charging' || signals.state === 'charged') {
    energy = smooth((signals.charge - EXPERIENCE_TIMING.chargePhase2End) / (1 - EXPERIENCE_TIMING.chargePhase2End));
  } else if (signals.state === 'dissolving') {
    const chargedEnergy = smooth((signals.charge - EXPERIENCE_TIMING.chargePhase2End) / (1 - EXPERIENCE_TIMING.chargePhase2End));
    energy = chargedEnergy * (1 - smooth(signals.dissolve));
  } else if (signals.state === 'summoning') {
    const elapsedMs = clamp01(signals.summon) * EXPERIENCE_TIMING.summonEndMs;
    const fill = clamp01((elapsedMs - EXPERIENCE_TIMING.fillStartMs)
      / (EXPERIENCE_TIMING.fillEndMs - EXPERIENCE_TIMING.fillStartMs));
    energy = 0.78 + Math.sin(Math.PI * fill) * 0.44;
  } else if (signals.state === 'complete') {
    energy = 0.16;
  }

  const distortionMultiplier = profile.distortion === 'full' ? 1 : profile.distortion === 'light' ? 0.42 : 0;
  const bloomMultiplier = 0.14 + Math.min(1.25, energy) * 0.17;
  return {
    energy,
    bloomStrength: profile.bloomStrength * bloomMultiplier,
    distortionStrength: distortionMultiplier * energy * 0.0028,
    chromaticAberration: profile.chromaticAberration * Math.min(1, energy) * 0.25,
    afterImageDamp: profile.trails === 'fullscreen-and-4-particle' ? 0.18 + Math.min(1, energy) * 0.68 : 0,
  };
}

export function createSpatialDistortion(input: Node<'vec4'>): {
  outputNode: Node<'vec4'>;
  controls: SpatialDistortionControls;
} {
  const strength = uniform(0);
  const source = convertToTexture(input);
  const coordinates = uv();
  const centered = coordinates.sub(vec2(0.5, 0.5));
  const radius = length(centered);
  const direction = normalize(centered.add(vec2(0.0001, 0.0001)));
  const wave = radius.mul(22).sub(time.mul(1.8)).sin();
  const envelope = oneMinus(smoothstep(0.08, 0.86, radius));
  const distortedCoordinates = coordinates.add(direction.mul(wave).mul(envelope).mul(strength));
  return { outputNode: source.sample(distortedCoordinates), controls: { strength } };
}

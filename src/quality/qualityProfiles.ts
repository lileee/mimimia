export type QualityTier = 'high' | 'balanced' | 'compatibility';

export interface QualityProfile {
  pixelRatioMax: number;
  renderScale: number;
  backgroundStardust: number;
  gatherStardust: number;
  burstParticles: number;
  fogLayers: number;
  bloomStrength: number;
  bloomResolutionScale: number;
  chromaticAberration: number;
  trails: 'fullscreen-and-4-particle' | '2-particle' | 'off';
  distortion: 'full' | 'light' | 'off';
  cameraFraming: 'moon-overlook-v1';
  timeline: 'summoning-v1';
  colorPalette: 'moonlight-violet-v1';
}

const SHARED_COMPOSITION = {
  cameraFraming: 'moon-overlook-v1',
  timeline: 'summoning-v1',
  colorPalette: 'moonlight-violet-v1',
} as const;

export const QUALITY_PROFILES: Readonly<Record<QualityTier, QualityProfile>> = {
  high: {
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
    ...SHARED_COMPOSITION,
  },
  balanced: {
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
    ...SHARED_COMPOSITION,
  },
  compatibility: {
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
    ...SHARED_COMPOSITION,
  },
};

export function isQualityTier(value: string | null): value is QualityTier {
  return value === 'high' || value === 'balanced' || value === 'compatibility';
}

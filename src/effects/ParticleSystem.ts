import {
  Group,
  InstancedBufferAttribute,
  PointsNodeMaterial,
  Sprite,
} from 'three/webgpu';

import type { FrameSignals } from '../app/frameSignals';
import { QUALITY_PROFILES, type QualityTier } from '../quality/qualityProfiles';
import { LAYER_ORDER } from '../stage/layerOrder';
import { ParticlePool } from './ParticlePool';
import { createParticleNodeMaterial, type ParticleNodeAttributes, type ParticleNodeControls } from './particleNodes';
import { createParticleLayout, type ParticleLayoutPoint } from './seededRandom';

export type ParticleBurstKind = 'release-flash' | 'fill-rise' | 'cat-settle';

export interface ParticleSystemStats {
  capacity: number;
  activeCount: number;
  allocatedObjects: number;
  trailSegments: number;
  mode: 'gather' | ParticleBurstKind;
}

interface ParticleLayer {
  sprite: Sprite;
  material: PointsNodeMaterial;
  controls: ParticleNodeControls;
}

const CAPACITY = QUALITY_PROFILES.high.burstParticles;
const TRAILS: Record<QualityTier, number> = { high: 4, balanced: 2, compatibility: 0 };
const BURST_MODE: Record<ParticleBurstKind, number> = { 'release-flash': 1, 'fill-rise': 2, 'cat-settle': 3 };
const BURST_DURATION: Record<ParticleBurstKind, number> = { 'release-flash': 620, 'fill-rise': 1_140, 'cat-settle': 860 };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
};

function chargeDensity(charge: number): number {
  const progress = clamp01(charge);
  if (progress <= 0.32) return 0.16 * progress / 0.32;
  if (progress <= 0.68) return 0.16 + 0.54 * (progress - 0.32) / 0.36;
  return 0.7 + 0.3 * (progress - 0.68) / 0.32;
}

function createAttributes(layout: readonly ParticleLayoutPoint[]): ParticleNodeAttributes {
  const origins = new Float32Array(layout.length * 3);
  const targets = new Float32Array(layout.length * 3);
  const seeds = new Float32Array(layout.length);
  const sizes = new Float32Array(layout.length);
  layout.forEach((point, index) => {
    origins.set(point.origin, index * 3);
    targets.set(point.target, index * 3);
    seeds[index] = point.seed;
    sizes[index] = point.size;
  });
  return {
    origins: new InstancedBufferAttribute(origins, 3),
    targets: new InstancedBufferAttribute(targets, 3),
    seeds: new InstancedBufferAttribute(seeds, 1),
    sizes: new InstancedBufferAttribute(sizes, 1),
  };
}

export class ParticleSystem {
  readonly group = new Group();
  readonly #pool = new ParticlePool(CAPACITY, (index) => index);
  readonly #layout: ParticleLayoutPoint[];
  readonly #layers: ParticleLayer[] = [];
  #quality: QualityTier = 'high';
  #trailSegments = 4;
  #mode: 'gather' | ParticleBurstKind = 'gather';
  #pendingBurst: ParticleBurstKind | null = null;
  #burstStartedAt: number | null = null;
  #allocatedObjects = 0;

  constructor(seed = 0x4d4f4f4e) {
    this.group.name = 'pooled-spell-particles';
    this.#layout = createParticleLayout(CAPACITY, seed);
    const attributes = createAttributes(this.#layout);
    for (let index = 0; index <= 4; index += 1) {
      const { material, controls } = createParticleNodeMaterial(attributes, index * 0.009);
      const sprite = new Sprite(material);
      sprite.name = index === 0 ? 'spell-particles-main' : `spell-particles-trail-${index}`;
      sprite.count = 0;
      sprite.renderOrder = LAYER_ORDER.foregroundStardust.min + index;
      sprite.frustumCulled = false;
      this.group.add(sprite);
      this.#layers.push({ sprite, material, controls });
    }
    this.#allocatedObjects = 1 + this.group.children.length;
    this.#applyVisibility();
  }

  update(signals: FrameSignals, quality: QualityTier): void {
    this.#quality = quality;
    this.#trailSegments = TRAILS[quality];
    let activeCount = 0;
    let opacity = 0;
    let burstProgress = 0;

    if (signals.state === 'charging' || signals.state === 'charged') {
      this.#mode = 'gather';
      activeCount = Math.round(QUALITY_PROFILES[quality].gatherStardust * chargeDensity(signals.charge));
      opacity = 1;
      this.#pendingBurst = null;
      this.#burstStartedAt = null;
    } else if (signals.state === 'dissolving') {
      this.#mode = 'gather';
      activeCount = Math.round(
        QUALITY_PROFILES[quality].gatherStardust
        * chargeDensity(signals.charge)
        * (1 - smoothstep(signals.dissolve)),
      );
      opacity = 1 - smoothstep(signals.dissolve);
    } else if (signals.state === 'summoning' && this.#pendingBurst) {
      this.#mode = this.#pendingBurst;
      if (this.#burstStartedAt === null) this.#burstStartedAt = signals.nowMs;
      burstProgress = clamp01((signals.nowMs - this.#burstStartedAt) / BURST_DURATION[this.#mode]);
      activeCount = burstProgress < 1 ? QUALITY_PROFILES[quality].burstParticles : 0;
      opacity = 1 - smoothstep((burstProgress - 0.72) / 0.28);
    } else {
      this.#mode = 'gather';
      this.#burstStartedAt = null;
      this.#pendingBurst = null;
    }

    this.#setActiveCount(activeCount);
    for (const { controls } of this.#layers) {
      controls.time.value = signals.nowMs / 1_000;
      controls.charge.value = clamp01(signals.charge);
      controls.dissolve.value = signals.state === 'dissolving' ? clamp01(signals.dissolve) : 0;
      controls.burstProgress.value = burstProgress;
      controls.mode.value = this.#mode === 'gather' ? 0 : BURST_MODE[this.#mode];
      controls.opacity.value = opacity;
    }
    this.#applyVisibility();
  }

  burst(kind: ParticleBurstKind): void {
    this.#pendingBurst = kind;
    this.#mode = kind;
    this.#burstStartedAt = null;
  }

  getLayoutSample(count: number): ParticleLayoutPoint[] {
    return this.#layout.slice(0, Math.max(0, count)).map((point) => ({
      origin: [...point.origin],
      target: [...point.target],
      seed: point.seed,
      size: point.size,
    }));
  }

  getStats(): ParticleSystemStats {
    const pool = this.#pool.getStats();
    return {
      capacity: pool.capacity,
      activeCount: pool.activeCount,
      allocatedObjects: this.#allocatedObjects,
      trailSegments: this.#trailSegments,
      mode: this.#mode,
    };
  }

  reset(): void {
    this.#pool.releaseAll();
    this.#mode = 'gather';
    this.#pendingBurst = null;
    this.#burstStartedAt = null;
    for (const { sprite, controls } of this.#layers) {
      sprite.count = 0;
      controls.charge.value = 0;
      controls.dissolve.value = 0;
      controls.burstProgress.value = 0;
      controls.mode.value = 0;
      controls.opacity.value = 0;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.#layers.forEach(({ material, sprite }) => {
      material.dispose();
      sprite.removeFromParent();
    });
    this.#layers.length = 0;
    this.group.clear();
    this.#pool.releaseAll();
  }

  #setActiveCount(count: number): void {
    this.#pool.setActiveCount(count);
    const active = this.#pool.getStats().activeCount;
    this.#layers.forEach(({ sprite }) => { sprite.count = active; });
  }

  #applyVisibility(): void {
    this.#layers.forEach(({ sprite }, index) => {
      sprite.visible = index === 0 || index <= this.#trailSegments;
    });
  }
}

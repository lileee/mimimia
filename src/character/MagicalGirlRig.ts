import { Group } from 'three/webgpu';

import type { FrameSignals } from '../app/frameSignals';
import { EXPERIENCE_TIMING } from '../config/experience';
import { BlinkController } from './BlinkController';
import { LayeredSpriteRig } from './LayeredSpriteRig';

export type CharacterDebugPose = 'min' | 'idle' | 'max';

const BASE_URL = '/assets/characters/magical-girl/';
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
};

const MOTION = {
  'back-hair': { period: 5.4, phase: 0.15, amplitude: 0.52, chargeDirection: -1 },
  'cape-lining': { period: 5.9, phase: 1.7, amplitude: 0.45, chargeDirection: -1 },
  'cape-outer': { period: 6.2, phase: 0.9, amplitude: 0.5, chargeDirection: 1 },
  'ribbon-left': { period: 4.6, phase: 2.2, amplitude: 0.68, chargeDirection: -1 },
  'ribbon-right': { period: 5.1, phase: 0.4, amplitude: 0.64, chargeDirection: 1 },
  skirt: { period: 5.7, phase: 2.8, amplitude: 0.42, chargeDirection: 1 },
  'front-hair': { period: 5.2, phase: 1.2, amplitude: 0.34, chargeDirection: 0 },
  'hat-body': { period: 6.4, phase: 0.6, amplitude: 0.25, chargeDirection: 0 },
  'hat-ornament': { period: 4.9, phase: 2.5, amplitude: 0.56, chargeDirection: 0 },
  staff: { period: 7.1, phase: 1.5, amplitude: 0.2, chargeDirection: 0 },
  'staff-glow': { period: 7.1, phase: 1.5, amplitude: 0.2, chargeDirection: 0 },
} as const;

export class MagicalGirlRig {
  readonly root: Group;
  readonly layered: LayeredSpriteRig;
  readonly #blink = new BlinkController(0x4749524c);
  #debugPose: CharacterDebugPose = 'idle';

  static async create(): Promise<MagicalGirlRig> {
    const layered = await LayeredSpriteRig.load(`${BASE_URL}rig.json`, BASE_URL);
    return new MagicalGirlRig(layered);
  }

  constructor(layered: LayeredSpriteRig) {
    this.layered = layered;
    this.root = layered.root;
    this.root.name = 'magical-girl';
  }

  setVisible(visible: boolean): void {
    this.layered.setVisible(visible);
  }

  setDebugPose(pose: CharacterDebugPose): void {
    this.#debugPose = pose;
  }

  update(signals: FrameSignals): void {
    if (this.#debugPose !== 'idle') {
      const fraction = this.#debugPose === 'min' ? -1 : 1;
      for (const name of Object.keys(MOTION)) {
        this.layered.setLayerMotion(name, { rotationFraction: fraction, translateYFraction: fraction });
      }
      this.root.position.y = 0;
      this.root.scale.set(1, 1, 1);
      this.#setEyes(true);
      return;
    }

    const seconds = signals.nowMs / 1_000;
    const breath = Math.sin(seconds * Math.PI * 2 / 4.8);
    this.root.position.y = breath * 0.008;
    this.root.scale.set(1 - breath * 0.0015, 1 + breath * 0.003, 1);
    const energy = this.#chargeEnergy(signals);

    for (const [name, motion] of Object.entries(MOTION)) {
      const idle = Math.sin(seconds * Math.PI * 2 / motion.period + motion.phase) * motion.amplitude;
      const charged = motion.chargeDirection * energy;
      this.layered.setLayerMotion(name, {
        rotationFraction: Math.min(0.9, Math.max(-0.9, idle + charged)),
        translateYFraction: 0,
      });
    }

    const blink = this.#blink.update(signals.nowMs);
    this.#setEyes(blink.openness >= 0.5);
  }

  reset(): void {
    this.layered.reset();
    this.#blink.reset(0);
    this.#debugPose = 'idle';
  }

  dispose(): void {
    this.layered.dispose();
  }

  #chargeEnergy(signals: FrameSignals): number {
    const charged = smoothstep((signals.charge - EXPERIENCE_TIMING.chargePhase2End) / (1 - EXPERIENCE_TIMING.chargePhase2End)) * 0.9;
    if (signals.state === 'charging' || signals.state === 'charged') return charged;
    if (signals.state === 'dissolving') return charged * (1 - smoothstep(signals.dissolve));
    if (signals.state === 'summoning') {
      const fillEnd = EXPERIENCE_TIMING.fillEndMs / EXPERIENCE_TIMING.summonEndMs;
      return 0.9 * (1 - smoothstep((signals.summon - fillEnd) / 0.18));
    }
    return 0;
  }

  #setEyes(open: boolean): void {
    this.layered.setLayerVisible('eyes-open', open);
    this.layered.setLayerVisible('eyes-closed', !open);
  }
}

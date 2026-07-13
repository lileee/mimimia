import { Group } from 'three/webgpu';

import type { FrameSignals } from '../app/frameSignals';
import { BlinkController } from '../character/BlinkController';
import { LayeredSpriteRig } from '../character/LayeredSpriteRig';

const BASE_URL = '/assets/characters/moon-cat/';
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export class MoonCatRig {
  readonly root: Group;
  readonly layered: LayeredSpriteRig;
  readonly #blink = new BlinkController(0x434154);
  #baseY = 3.02;
  #pointerNdc = { x: 0, y: 0 };
  #opacity = 0;
  #debugPose: 'min' | 'idle' | 'max' = 'idle';

  static async create(): Promise<MoonCatRig> {
    const layered = await LayeredSpriteRig.load(`${BASE_URL}rig.json`, BASE_URL, { renderOrderBase: 500 });
    return new MoonCatRig(layered);
  }

  constructor(layered: LayeredSpriteRig) {
    this.layered = layered;
    this.root = layered.root;
    this.root.name = 'moon-cat';
    this.root.position.set(1.28, this.#baseY, 0);
    this.layered.setVisible(false);
  }

  setReveal(shadow: number, fill: number, opacity: number): void {
    this.root.userData.reveal = { shadow: clamp01(shadow), fill: clamp01(fill), opacity: clamp01(opacity) };
    this.#opacity = clamp01(opacity);
    this.layered.setOpacity(this.#opacity);
    this.layered.setVisible(this.#opacity > 0);
  }

  setPointerNdc(x: number, y: number): void {
    this.#pointerNdc = { x: clamp01((x + 1) / 2) * 2 - 1, y: clamp01((y + 1) / 2) * 2 - 1 };
    this.root.userData.pointerNdc = { ...this.#pointerNdc };
  }

  setDebugPose(pose: 'min' | 'idle' | 'max'): void {
    this.#debugPose = pose;
  }

  update(signals: FrameSignals): void {
    if (!this.root.visible) return;
    const fraction = this.#debugPose === 'min' ? -1 : this.#debugPose === 'max' ? 1 : null;
    if (fraction !== null) {
      this.root.position.y = this.#baseY;
      this.layered.setLayerMotion('ear-left', { rotationFraction: fraction, translateYFraction: 0 });
      this.layered.setLayerMotion('ear-right', { rotationFraction: -fraction, translateYFraction: 0 });
      this.layered.setLayerMotion('tail', { rotationFraction: fraction, translateYFraction: 0 });
      this.#setEyes(true);
      return;
    }

    const seconds = signals.nowMs / 1_000;
    const float = Math.sin(seconds * Math.PI * 2 / 3.6);
    const amplitude = (this.layered.definition.groupMotion?.translateYPercent ?? 2.5) * 0.01
      * this.layered.definition.worldHeight * 0.7;
    this.root.position.y = this.#baseY + float * amplitude;
    this.layered.setLayerMotion('ear-left', { rotationFraction: Math.sin(seconds * 2.2 + 0.4) * 0.7, translateYFraction: 0 });
    this.layered.setLayerMotion('ear-right', { rotationFraction: Math.sin(seconds * 2.05 + 2.1) * 0.7, translateYFraction: 0 });
    this.layered.setLayerMotion('tail', { rotationFraction: Math.sin(seconds * 1.45 + 0.8) * 0.7, translateYFraction: 0 });
    const blink = this.#blink.update(signals.nowMs);
    this.#setEyes(blink.openness >= 0.5);
  }

  reset(): void {
    this.layered.reset();
    this.#baseY = 3.02;
    this.root.position.set(1.28, this.#baseY, 0);
    this.#blink.reset(0);
    this.#debugPose = 'idle';
    this.setReveal(0, 0, 0);
    this.setPointerNdc(0, 0);
  }

  dispose(): void {
    this.layered.dispose();
  }

  #setEyes(open: boolean): void {
    this.layered.setLayerVisible('eyes-open', open);
    this.layered.setLayerVisible('eyes-closed', !open);
  }
}

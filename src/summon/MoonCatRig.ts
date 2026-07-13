import { Group, Vector3 } from 'three/webgpu';

import type { FrameSignals } from '../app/frameSignals';
import { BlinkController } from '../character/BlinkController';
import { LayeredSpriteRig } from '../character/LayeredSpriteRig';
import { CatGazeController } from './CatGazeController';
import { applyCatRevealNodes, type CatRevealControls } from './catRevealNodes';

const BASE_URL = '/assets/characters/moon-cat/';
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export class MoonCatRig {
  readonly root: Group;
  readonly layered: LayeredSpriteRig;
  readonly #blink = new BlinkController(0x434154);
  readonly #gaze = new CatGazeController();
  readonly #revealControls: CatRevealControls;
  readonly #anchor = new Vector3(1.28, 3.02, 0);
  #pointerNdc = { x: 0, y: 0 };
  #opacity = 0;
  #fill = 0;
  #keepResident = false;
  #debugPose: 'min' | 'idle' | 'max' = 'idle';

  static async create(): Promise<MoonCatRig> {
    const layered = await LayeredSpriteRig.load(`${BASE_URL}rig.json`, BASE_URL, { renderOrderBase: 500 });
    return new MoonCatRig(layered);
  }

  constructor(layered: LayeredSpriteRig) {
    this.layered = layered;
    this.root = layered.root;
    this.root.name = 'moon-cat';
    this.#revealControls = applyCatRevealNodes(layered);
    this.root.position.copy(this.#anchor);
    this.layered.setVisible(false);
  }

  setReveal(shadow: number, fill: number, opacity: number): void {
    this.root.userData.reveal = { shadow: clamp01(shadow), fill: clamp01(fill), opacity: clamp01(opacity) };
    this.#opacity = clamp01(opacity);
    this.#fill = clamp01(fill);
    this.#revealControls.shadow.value = clamp01(shadow);
    this.#revealControls.fill.value = this.#fill;
    this.#revealControls.opacity.value = this.#opacity;
    this.layered.setVisible(this.#keepResident || this.#opacity > 0);
  }

  setPointerNdc(x: number, y: number): void {
    this.#pointerNdc = { x: clamp01((x + 1) / 2) * 2 - 1, y: clamp01((y + 1) / 2) * 2 - 1 };
    this.#gaze.setPointerNdc(this.#pointerNdc.x, this.#pointerNdc.y, true);
    this.root.userData.pointerNdc = { ...this.#pointerNdc };
  }

  keepResident(): void {
    this.#keepResident = true;
    this.layered.setVisible(true);
  }

  isRevealed(): boolean {
    return this.#opacity > 0;
  }

  setAnchorPosition(x: number, y: number, z: number): void {
    this.#anchor.set(x, y, z);
  }

  setDebugPose(pose: 'min' | 'idle' | 'max'): void {
    this.#debugPose = pose;
  }

  showClosedEyesForWarmup(): void {
    this.#setEyes(false);
  }

  update(signals: FrameSignals): void {
    if (!this.isRevealed()) return;
    const fraction = this.#debugPose === 'min' ? -1 : this.#debugPose === 'max' ? 1 : null;
    if (fraction !== null) {
      this.root.position.copy(this.#anchor);
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
    this.root.position.set(this.#anchor.x, this.#anchor.y + float * amplitude * this.#fill, this.#anchor.z);
    this.layered.setLayerMotion('ear-left', { rotationFraction: Math.sin(seconds * 2.2 + 0.4) * 0.7, translateYFraction: 0 });
    this.layered.setLayerMotion('ear-right', { rotationFraction: Math.sin(seconds * 2.05 + 2.1) * 0.7, translateYFraction: 0 });
    this.layered.setLayerMotion('tail', { rotationFraction: Math.sin(seconds * 1.45 + 0.8) * 0.7, translateYFraction: 0 });
    const blink = this.#blink.update(signals.nowMs);
    this.#setEyes(blink.openness >= 0.5);
    const gaze = this.#gaze.update(signals.deltaSeconds * 1_000);
    this.layered.setLayerMotion('head', { rotationFraction: gaze.headDegrees / 3, translateYFraction: 0 });
    const eyeOffsetWorld = gaze.eyeOffsetFraction * 0.51;
    this.layered.setLayerOffsetWorld('eyes-open', eyeOffsetWorld, this.#pointerNdc.y * 0.006);
    this.layered.setLayerOffsetWorld('eyes-closed', eyeOffsetWorld, this.#pointerNdc.y * 0.006);
  }

  getDiagnostics() {
    const gaze = this.#gaze.getState();
    return {
      visible: this.isRevealed(),
      reveal: { ...this.root.userData.reveal },
      position: { x: this.root.position.x, y: this.root.position.y, z: this.root.position.z },
      ...gaze,
    };
  }

  reset(): void {
    this.layered.reset();
    this.#anchor.set(1.28, 3.02, 0);
    this.root.position.copy(this.#anchor);
    this.#blink.reset(0);
    this.#debugPose = 'idle';
    this.#gaze.reset();
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

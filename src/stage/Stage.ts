import { Color, Scene } from 'three/webgpu';

import type { FrameSignals } from '../app/frameSignals';
import { MagicalGirlRig, type CharacterDebugPose } from '../character/MagicalGirlRig';
import { MagicCircle } from '../effects/MagicCircle';
import { ParticleSystem } from '../effects/ParticleSystem';
import type { QualityTier } from '../quality/qualityProfiles';
import { MoonCatRig } from '../summon/MoonCatRig';
import { CameraRig } from './CameraRig';
import { createProceduralBackdrop } from './proceduralBackdrop';

interface StageOptions {
  characterPose?: CharacterDebugPose;
  showCat?: boolean;
}

export class Stage {
  readonly scene = new Scene();
  readonly cameraRig = new CameraRig();
  readonly #backdrop = createProceduralBackdrop();
  readonly magicCircle = new MagicCircle();
  readonly particleSystem = new ParticleSystem();
  readonly #options: StageOptions;
  magicalGirl: MagicalGirlRig | null = null;
  moonCat: MoonCatRig | null = null;

  constructor(options: StageOptions = {}) {
    this.#options = options;
    this.scene.background = new Color(0x0a061b);
    this.scene.add(this.#backdrop.group, this.magicCircle.group, this.particleSystem.group);
  }

  async loadCharacters(): Promise<void> {
    const [magicalGirl, moonCat] = await Promise.all([
      MagicalGirlRig.create(),
      MoonCatRig.create(),
    ]);
    this.magicalGirl = magicalGirl;
    this.moonCat = moonCat;
    magicalGirl.setDebugPose(this.#options.characterPose ?? 'idle');
    moonCat.setDebugPose(this.#options.characterPose ?? 'idle');
    if (this.#options.showCat) moonCat.setReveal(0, 1, 1);
    this.scene.add(magicalGirl.root, moonCat.root);
  }

  update(signals: FrameSignals, quality: QualityTier): void {
    if (signals.state === 'charging' || signals.state === 'charged') {
      this.cameraRig.setChargeProgress(signals.charge);
    } else if (signals.state === 'dissolving') {
      this.cameraRig.setDissolveProgress(signals.dissolve);
    } else if (signals.state === 'summoning') {
      this.cameraRig.setSummonProgress(signals.summon);
    } else {
      this.cameraRig.reset();
    }
    this.#backdrop.update(signals.nowMs, quality);
    this.magicCircle.update(signals);
    this.particleSystem.update(signals, quality);
    this.magicalGirl?.update(signals);
    this.moonCat?.setPointerNdc(signals.pointerNdc.x, signals.pointerNdc.y);
    this.moonCat?.update(signals);
  }

  resize(width: number, height: number): void {
    this.cameraRig.resize(width, height);
  }

  dispose(): void {
    this.magicalGirl?.dispose();
    this.moonCat?.dispose();
    this.magicCircle.dispose();
    this.particleSystem.dispose();
    this.#backdrop.dispose();
    this.scene.clear();
  }
}

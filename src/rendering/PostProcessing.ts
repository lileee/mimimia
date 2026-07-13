import {
  type Camera,
  RenderPipeline,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import { float, pass, uniform, vec2 } from 'three/tsl';
import { afterImage } from 'three/addons/tsl/display/AfterImageNode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';

import type { FrameSignals } from '../app/frameSignals';
import { QUALITY_PROFILES, type QualityProfile, type QualityTier } from '../quality/qualityProfiles';
import {
  createSpatialDistortion,
  getPostProcessingFrame,
  getPostProcessingTierConfig,
  type PostProcessingFrame,
  type PostProcessingTierConfig,
} from './postprocessingNodes';

export interface PostProcessingSnapshot extends PostProcessingFrame, PostProcessingTierConfig {
  quality: QualityTier;
  renderPath: 'r185-render-pipeline';
}

function tierForProfile(profile: QualityProfile): QualityTier {
  const entry = (Object.entries(QUALITY_PROFILES) as Array<[QualityTier, QualityProfile]>)
    .find(([, candidate]) => candidate === profile);
  if (!entry) throw new Error('Unknown quality profile');
  return entry[0];
}

export class PostProcessing {
  readonly #renderer: WebGPURenderer;
  readonly #scene: Scene;
  readonly #camera: Camera;
  readonly #pipeline: RenderPipeline;
  readonly #bloom;
  readonly #afterImage;
  readonly #distortionControls;
  readonly #chromaticStrength = uniform(0);
  readonly #afterImageDamp = uniform(0.18);
  readonly #outputs;
  #profile: QualityProfile = QUALITY_PROFILES.high;
  #quality: QualityTier = 'high';
  #frame: PostProcessingFrame = getPostProcessingFrame({
    nowMs: 0, deltaSeconds: 0, state: 'idle', charge: 0, dissolve: 0, summon: 0, pointerNdc: { x: 0, y: 0 },
  }, QUALITY_PROFILES.high);

  constructor(renderer: WebGPURenderer, scene: Scene, camera: Camera, profile: QualityProfile) {
    this.#renderer = renderer;
    this.#scene = scene;
    this.#camera = camera;
    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode('output');
    this.#bloom = bloom(sceneColor, 0.4, 0.28, 0.68);
    const composite = sceneColor.add(this.#bloom);
    const distortion = createSpatialDistortion(composite);
    this.#distortionControls = distortion.controls;
    const chromatic = chromaticAberration(
      distortion.outputNode,
      this.#chromaticStrength,
      vec2(0.5, 0.5),
      float(1.035),
    );
    this.#afterImage = afterImage(chromatic, this.#afterImageDamp);
    this.#outputs = {
      high: this.#afterImage,
      balanced: chromatic,
      compatibility: composite,
    } as const;
    this.#pipeline = new RenderPipeline(renderer);
    this.setQuality(profile);
  }

  async precompile(): Promise<void> {
    await this.#renderer.compileAsync(this.#scene, this.#camera, this.#scene);
  }

  setQuality(profile: QualityProfile): void {
    this.#profile = profile;
    this.#quality = tierForProfile(profile);
    const config = getPostProcessingTierConfig(profile);
    this.#bloom.setResolutionScale(config.bloomResolutionScale);
    this.#pipeline.outputNode = this.#outputs[this.#quality];
    this.#pipeline.needsUpdate = true;
  }

  update(signals: FrameSignals): void {
    this.#frame = getPostProcessingFrame(signals, this.#profile);
    this.#bloom.strength.value = this.#frame.bloomStrength;
    this.#bloom.radius.value = 0.24 + Math.min(1, this.#frame.energy) * 0.16;
    this.#bloom.threshold.value = 0.68;
    this.#distortionControls.strength.value = this.#frame.distortionStrength;
    this.#chromaticStrength.value = this.#frame.chromaticAberration;
    this.#afterImageDamp.value = this.#frame.afterImageDamp;
  }

  render(): void {
    this.#pipeline.render();
  }

  clearHistory(): void {
    const selectedOutput = this.#outputs[this.#quality];
    const damp = this.#afterImageDamp.value;
    this.#afterImageDamp.value = 0;
    this.#pipeline.outputNode = this.#outputs.high;
    this.#pipeline.needsUpdate = true;
    this.#pipeline.render();
    this.#afterImageDamp.value = damp;
    this.#pipeline.outputNode = selectedOutput;
    this.#pipeline.needsUpdate = true;
  }

  resize(width: number, height: number): void {
    // RenderPipeline display nodes size their internal targets from the
    // renderer drawing buffer on their first update. Calling setSize before
    // their node materials are built leaves BloomNode without blur uniforms.
    void width;
    void height;
  }

  getSnapshot(): PostProcessingSnapshot {
    return {
      quality: this.#quality,
      renderPath: 'r185-render-pipeline',
      ...getPostProcessingTierConfig(this.#profile),
      ...this.#frame,
    };
  }

  dispose(): void {
    this.#afterImage.dispose();
    this.#bloom.dispose();
    this.#pipeline.dispose();
  }
}

import { AudioController } from '../audio/AudioController';
import type { FrameSignals } from './frameSignals';
import type { CharacterDebugPose } from '../character/MagicalGirlRig';
import { QUALITY_PROFILES, type QualityTier } from '../quality/qualityProfiles';
import { createRenderer } from '../rendering/createRenderer';
import { PostProcessing } from '../rendering/PostProcessing';
import type { RendererHandle } from '../rendering/renderingTypes';
import { Stage } from '../stage/Stage';

export interface CreateExperienceOptions {
  canvas: HTMLCanvasElement;
  assets: ReadonlyMap<string, Uint8Array>;
  quality: QualityTier;
  forceWebGL?: boolean;
  characterPose?: CharacterDebugPose;
  showCat?: boolean;
  onRendererReady?: (handle: RendererHandle) => void;
  onWarmupReady?: () => void;
}

export interface ExperienceRuntime {
  readonly renderer: RendererHandle;
  readonly stage: Stage;
  readonly postProcessing: PostProcessing;
  readonly audio: AudioController;
  readonly quality: QualityTier;
  setQuality(quality: QualityTier): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const frame = (
  nowMs: number,
  state: FrameSignals['state'],
  charge = 0,
  dissolve = 0,
  summon = 0,
): FrameSignals => ({
  nowMs,
  deltaSeconds: 1 / 60,
  state,
  charge,
  dissolve,
  summon,
  pointerNdc: { x: 0, y: 0 },
});

export async function createExperience(options: CreateExperienceOptions): Promise<ExperienceRuntime> {
  const stage = new Stage({ characterPose: options.characterPose, showCat: options.showCat });
  let renderer: RendererHandle | null = null;
  let audio: AudioController | null = null;
  let postProcessing: PostProcessing | null = null;

  try {
    renderer = await createRenderer(options.canvas, {
      forceWebGL: options.forceWebGL ?? false,
      quality: options.quality,
    });
    options.onRendererReady?.(renderer);
    audio = await AudioController.create(options.assets);
    await stage.loadCharacters();
    const handle = renderer;
    const controller = audio;

    postProcessing = new PostProcessing(
      handle.renderer,
      stage.scene,
      stage.cameraRig.camera,
      QUALITY_PROFILES[options.quality],
    );
    const resize = (width: number, height: number) => {
      handle.resize(width, height);
      stage.resize(width, height);
      postProcessing?.resize(width, height);
    };
    resize(window.innerWidth, window.innerHeight);
    await postProcessing.precompile();

    const nowMs = performance.now();
    const warmupFrames: Array<[QualityTier, FrameSignals]> = [
      ['compatibility', frame(nowMs, 'idle')],
      ['balanced', frame(nowMs + 16, 'charged', 1)],
      ['high', frame(nowMs + 32, 'summoning', 1, 0, 0.43)],
    ];
    for (const [quality, signals] of warmupFrames) {
      postProcessing.setQuality(QUALITY_PROFILES[quality]);
      stage.update(signals, quality);
      postProcessing.update(signals);
      postProcessing.render();
    }
    postProcessing.setQuality(QUALITY_PROFILES[options.quality]);
    const idle = frame(nowMs + 48, 'idle');
    stage.update(idle, options.quality);
    postProcessing.update(idle);
    postProcessing.clearHistory();
    postProcessing.render();
    options.onWarmupReady?.();

    let disposed = false;
    let currentQuality = options.quality;
    return {
      renderer: handle,
      stage,
      postProcessing,
      audio: controller,
      get quality() { return currentQuality; },
      setQuality: (quality) => {
        if (quality === currentQuality) return;
        currentQuality = quality;
        handle.setQuality(quality);
        postProcessing?.setQuality(QUALITY_PROFILES[quality]);
        resize(window.innerWidth, window.innerHeight);
      },
      resize,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        postProcessing?.dispose();
        controller.dispose();
        stage.dispose();
        handle.dispose();
      },
    };
  } catch (error) {
    postProcessing?.dispose();
    audio?.dispose();
    stage.dispose();
    renderer?.dispose();
    throw error;
  }
}

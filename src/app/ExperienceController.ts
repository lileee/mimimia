import { EXPERIENCE_TIMING } from '../config/experience';
import { PointerInput, type NormalizedPointerPosition } from '../input/PointerInput';
import type { QualityTier } from '../quality/qualityProfiles';
import { ExperienceMachine } from '../state/experienceMachine';
import type { ExperienceEvent, ExperienceState } from '../state/experienceTypes';
import type { AppUI } from '../ui/AppUI';
import type { UIAction } from '../ui/uiTypes';
import type { ExperienceRuntime } from './createExperience';
import type { FrameSignals } from './frameSignals';

const RESETTING_MS = 240;
const FIRST_HINT_MS = 5_000;

export interface DebugFrameState {
  state: ExperienceState;
  charge: number;
  dissolve: number;
  summon: number;
  pointerNdc: NormalizedPointerPosition;
}

interface ExperienceControllerOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  ui: AppUI;
  runtime: ExperienceRuntime;
  quality: QualityTier;
  debugFrame?: DebugFrameState;
  onFrameRendered?: (signals: FrameSignals) => void;
}

export class ExperienceController {
  readonly #canvas: HTMLCanvasElement;
  readonly #ui: AppUI;
  readonly #runtime: ExperienceRuntime;
  readonly #quality: QualityTier;
  readonly #machine = new ExperienceMachine();
  readonly #debugFrame?: DebugFrameState;
  readonly #onFrameRendered?: (signals: FrameSignals) => void;
  readonly #input: PointerInput | null;
  #pointerNdc: NormalizedPointerPosition = { x: 0, y: 0 };
  #active = false;
  #disposed = false;
  #animationFrame = 0;
  #previousTime = performance.now();
  #hintVisible = false;
  #hintStartedAt: number | null = null;

  constructor(options: ExperienceControllerOptions) {
    this.#canvas = options.canvas;
    this.#ui = options.ui;
    this.#runtime = options.runtime;
    this.#quality = options.quality;
    this.#debugFrame = options.debugFrame;
    this.#onFrameRendered = options.onFrameRendered;
    this.#pointerNdc = options.debugFrame?.pointerNdc ?? { x: 0, y: 0 };
    this.#ui.setActionHandler(this.#handleAction);

    if (this.#debugFrame) {
      this.#input = null;
    } else {
      this.#machine.dispatch({ type: 'ASSETS_READY' }, performance.now());
      this.#input = new PointerInput(options.canvas, options.uiRoot, {
        getState: () => this.state(),
        dispatch: this.#dispatchInput,
        onPointerMove: (position) => { this.#pointerNdc = position; },
      });
    }
    window.addEventListener('resize', this.#resize);
    this.#resize();
  }

  state(): ExperienceState {
    return this.#debugFrame?.state ?? this.#machine.snapshot().state;
  }

  start(): void {
    if (this.#active || this.#disposed) return;
    this.#active = true;
    this.#previousTime = performance.now();
    this.#renderFrame(this.#previousTime);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#active = false;
    cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = 0;
    window.removeEventListener('resize', this.#resize);
    this.#input?.dispose();
    this.#runtime.dispose();
  }

  readonly #dispatchInput = (event: ExperienceEvent, nowMs: number): void => {
    if (event.type === 'POINTER_DOWN') {
      this.#hintVisible = false;
      this.#hintStartedAt = null;
    }
    this.#machine.dispatch(event, nowMs);
  };

  readonly #handleAction = (action: UIAction): void => {
    const nowMs = performance.now();
    if (action === 'enter' && this.#machine.snapshot().state === 'entry') {
      void this.#runtime.audio.unlock();
      this.#machine.dispatch({ type: 'ENTER' }, nowMs);
      this.#hintVisible = true;
      this.#hintStartedAt = nowMs;
    } else if (action === 'mute' && this.state() !== 'loading' && this.state() !== 'entry') {
      this.#runtime.audio.setMuted(!this.#runtime.audio.getSnapshot().muted);
    } else if (action === 'reset' && this.#machine.snapshot().state === 'complete') {
      this.#machine.dispatch({ type: 'RESET' }, nowMs);
      this.#runtime.audio.reset();
      this.#hintVisible = false;
    } else if (action === 'reload' || action === 'reenter') {
      window.location.reload();
    }
  };

  readonly #resize = (): void => {
    this.#runtime.resize(window.innerWidth, window.innerHeight);
    this.#canvas.dataset.safeFrame = JSON.stringify(
      this.#runtime.stage.cameraRig.getSafeFrame(window.innerWidth, window.innerHeight),
    );
  };

  readonly #renderFrame = (nowMs: number): void => {
    const deltaSeconds = Math.min(0.1, Math.max(0, (nowMs - this.#previousTime) / 1_000));
    this.#previousTime = nowMs;
    const signals = this.#signals(nowMs, deltaSeconds);

    this.#runtime.stage.update(signals, this.#quality);
    this.#runtime.audio.update(signals);
    this.#runtime.postProcessing.update(signals);
    this.#updateDiagnostics(signals);
    this.#runtime.postProcessing.render();
    this.#onFrameRendered?.(signals);
    this.#renderUI(nowMs, signals.state);

    if (this.#active) this.#animationFrame = requestAnimationFrame(this.#renderFrame);
  };

  #signals(nowMs: number, deltaSeconds: number): FrameSignals {
    if (this.#debugFrame) {
      return {
        nowMs,
        deltaSeconds,
        ...this.#debugFrame,
        pointerNdc: this.#pointerNdc,
      };
    }

    let snapshot = this.#machine.tick(nowMs);
    const elapsedMs = Math.max(0, nowMs - snapshot.stateStartedAt);
    if (snapshot.state === 'dissolving' && elapsedMs >= EXPERIENCE_TIMING.dissolveMs) {
      snapshot = this.#machine.dispatch({ type: 'DISSOLVE_DONE' }, nowMs);
    } else if (snapshot.state === 'summoning' && elapsedMs >= EXPERIENCE_TIMING.summonEndMs) {
      snapshot = this.#machine.dispatch({ type: 'SUMMON_DONE' }, nowMs);
    } else if (snapshot.state === 'resetting' && elapsedMs >= RESETTING_MS) {
      snapshot = this.#machine.dispatch({ type: 'RESET_DONE' }, nowMs);
    }

    const stateElapsedMs = Math.max(0, nowMs - snapshot.stateStartedAt);
    return {
      nowMs,
      deltaSeconds,
      state: snapshot.state,
      charge: snapshot.charge,
      dissolve: snapshot.state === 'dissolving' ? Math.min(1, stateElapsedMs / EXPERIENCE_TIMING.dissolveMs) : 0,
      summon: snapshot.state === 'summoning' ? Math.min(1, stateElapsedMs / EXPERIENCE_TIMING.summonEndMs) : 0,
      pointerNdc: this.#pointerNdc,
    };
  }

  #renderUI(nowMs: number, state: ExperienceState): void {
    if (this.#hintVisible && this.#hintStartedAt !== null && nowMs - this.#hintStartedAt >= FIRST_HINT_MS) {
      this.#hintVisible = false;
      this.#hintStartedAt = null;
    }
    const audio = this.#runtime.audio.getSnapshot();
    this.#ui.render({
      state,
      progress: 1,
      muted: audio.muted,
      quality: this.#quality,
      error: null,
      readyToEnter: state === 'entry',
      hintVisible: this.#hintVisible,
      debugHidden: this.#debugFrame !== undefined,
    });
  }

  #updateDiagnostics(signals: FrameSignals): void {
    const stage = this.#runtime.stage;
    this.#canvas.dataset.magicCircle = JSON.stringify(stage.magicCircle.getSnapshot());
    this.#canvas.dataset.particleStats = JSON.stringify(stage.particleSystem.getStats());
    this.#canvas.dataset.summon = JSON.stringify(stage.summonDirector?.getSnapshot() ?? {});
    this.#canvas.dataset.cat = JSON.stringify(stage.moonCat?.getDiagnostics() ?? {});
    this.#canvas.dataset.postprocessing = JSON.stringify(this.#runtime.postProcessing.getSnapshot());
    this.#canvas.dataset.audio = JSON.stringify(this.#runtime.audio.getSnapshot());
    this.#canvas.dataset.renderReady = 'true';
    document.body.dataset.stageReady = 'true';
    document.body.dataset.characterReady = 'true';
    document.body.dataset.girlLayerCount = String(stage.magicalGirl?.layered.layerNames.length ?? 0);
    document.body.dataset.catLayerCount = String(stage.moonCat?.layered.layerNames.length ?? 0);
    document.body.dataset.catVisible = String(stage.moonCat?.root.visible ?? false);
    document.body.dataset.magicCircleReady = 'true';
    document.body.dataset.particlesReady = 'true';
    document.body.dataset.summonReady = 'true';
    document.body.dataset.postprocessingReady = 'true';
    document.body.dataset.experienceState = signals.state;
    document.body.dataset.muted = String(this.#runtime.audio.getSnapshot().muted);
  }
}

import { EXPERIENCE_TIMING } from '../config/experience';
import type { DebugPanel } from '../dev/DebugPanel';
import { PointerInput, type NormalizedPointerPosition } from '../input/PointerInput';
import { countRuntimeObjects, type PerformanceSampler } from '../performance/PerformanceSampler';
import type { QualityController } from '../quality/QualityController';
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
  qualityController: QualityController;
  performanceSampler?: PerformanceSampler;
  debugPanel?: DebugPanel;
  debugFrame?: DebugFrameState;
  onFrameRendered?: (signals: FrameSignals) => void;
  onRenderFailure?: (error: unknown) => void;
}

export class ExperienceController {
  #canvas: HTMLCanvasElement;
  readonly #uiRoot: HTMLElement;
  readonly #ui: AppUI;
  #runtime: ExperienceRuntime;
  readonly #qualityController: QualityController;
  readonly #performanceSampler?: PerformanceSampler;
  readonly #debugPanel?: DebugPanel;
  #quality: QualityTier;
  readonly #machine = new ExperienceMachine();
  readonly #debugFrame?: DebugFrameState;
  readonly #onFrameRendered?: (signals: FrameSignals) => void;
  readonly #onRenderFailure?: (error: unknown) => void;
  #input: PointerInput | null;
  #pointerNdc: NormalizedPointerPosition = { x: 0, y: 0 };
  #active = false;
  #disposed = false;
  #animationFrame = 0;
  #previousTime = performance.now();
  #hintVisible = false;
  #hintStartedAt: number | null = null;
  #qualityNoticeUntil = 0;
  #graphicsHealthy = true;
  #recovering = false;
  #objectStatsRuntime: ExperienceRuntime | null = null;

  constructor(options: ExperienceControllerOptions) {
    this.#canvas = options.canvas;
    this.#uiRoot = options.uiRoot;
    this.#ui = options.ui;
    this.#runtime = options.runtime;
    this.#qualityController = options.qualityController;
    this.#performanceSampler = options.performanceSampler;
    this.#quality = options.qualityController.getSnapshot().tier;
    this.#debugPanel = options.debugPanel;
    this.#debugFrame = options.debugFrame;
    this.#onFrameRendered = options.onFrameRendered;
    this.#onRenderFailure = options.onRenderFailure;
    this.#pointerNdc = options.debugFrame?.pointerNdc ?? { x: 0, y: 0 };
    this.#ui.setActionHandler(this.#handleAction);

    if (this.#debugFrame) {
      this.#input = null;
    } else {
      this.#machine.dispatch({ type: 'ASSETS_READY' }, performance.now());
      this.#input = this.#createPointerInput(options.canvas);
    }
    window.addEventListener('resize', this.#resize);
    window.addEventListener('blur', this.#clearQualitySampling);
    document.addEventListener('visibilitychange', this.#clearQualitySampling);
    this.#resize();
  }

  state(): ExperienceState {
    if (this.#recovering) return 'loading';
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
    window.removeEventListener('blur', this.#clearQualitySampling);
    document.removeEventListener('visibilitychange', this.#clearQualitySampling);
    this.#input?.dispose();
    this.#runtime.dispose();
  }

  resetExperience(): void {
    const nowMs = performance.now();
    if (this.#machine.snapshot().state !== 'complete') return;
    this.#machine.dispatch({ type: 'RESET' }, nowMs);
    this.#clearSpellResidue();
    this.#hintVisible = false;
    this.#hintStartedAt = null;
    document.body.dataset.experienceState = 'resetting';
  }

  beginGraphicsRecovery(): void {
    if (this.#disposed || this.#recovering) return;
    this.#recovering = true;
    this.#graphicsHealthy = false;
    this.#active = false;
    cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = 0;
    this.#qualityController.clearSampling();
    this.#performanceSampler?.clearSamples();
    this.#runtime.stage.reset();
    this.#runtime.audio.reset();
    this.#machine.dispatch({ type: 'RECOVER' }, performance.now());
    document.body.dataset.graphicsRecovery = 'recovering';
    document.body.dataset.experienceState = 'loading';
    this.#ui.render({
      state: 'loading', progress: 1, muted: true, quality: this.#quality,
      error: null, readyToEnter: false, recovering: true,
    });
  }

  completeGraphicsRecovery(runtime: ExperienceRuntime, canvas: HTMLCanvasElement): void {
    if (this.#disposed) {
      runtime.dispose();
      return;
    }
    this.#runtime = runtime;
    if (canvas !== this.#canvas) {
      this.#input?.dispose();
      this.#canvas = canvas;
      this.#input = this.#debugFrame ? null : this.#createPointerInput(canvas);
    }
    this.#runtime.stage.reset();
    this.#machine.dispatch({ type: 'RECOVER' }, performance.now());
    this.#recovering = false;
    this.#graphicsHealthy = true;
    this.#canvas.hidden = false;
    document.body.dataset.graphicsRecovery = 'healthy';
    void this.#runtime.audio.unlock();
    this.#resize();
    this.start();
  }

  failGraphicsRecovery(): void {
    if (this.#disposed) return;
    this.#recovering = false;
    this.#graphicsHealthy = false;
    this.#canvas.hidden = true;
    document.body.dataset.graphicsRecovery = 'failed';
    document.body.dataset.experienceState = 'loading';
    this.#ui.render({
      state: 'loading', progress: 1, muted: true, quality: this.#quality,
      error: {
        message: '月光通路需要重新连接',
        detail: '图形环境未能恢复，请重新进入仪式。',
        action: 'reenter',
      },
    });
  }

  readonly #dispatchInput = (event: ExperienceEvent, nowMs: number): void => {
    if (event.type === 'POINTER_DOWN') {
      this.#hintVisible = false;
      this.#hintStartedAt = null;
      this.#performanceSampler?.beginProfile(nowMs);
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
      this.resetExperience();
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

    try {
      const workStartedAt = performance.now();
      this.#runtime.stage.update(signals, this.#quality);
      const stageFinishedAt = performance.now();
      this.#runtime.audio.update(signals);
      const audioFinishedAt = performance.now();
      this.#runtime.postProcessing.update(signals);
      const postFinishedAt = performance.now();
      this.#updateDiagnostics(signals);
      const diagnosticsFinishedAt = performance.now();
      this.#runtime.postProcessing.render();
      const renderFinishedAt = performance.now();
      this.#performanceSampler?.recordFrameWork(signals.state, {
        stage: stageFinishedAt - workStartedAt,
        audio: audioFinishedAt - stageFinishedAt,
        postprocessing: postFinishedAt - audioFinishedAt,
        diagnostics: diagnosticsFinishedAt - postFinishedAt,
        render: renderFinishedAt - diagnosticsFinishedAt,
        total: renderFinishedAt - workStartedAt,
      });
    } catch (error) {
      this.#active = false;
      this.#graphicsHealthy = false;
      this.#qualityController.clearSampling();
      this.#performanceSampler?.clearSamples();
      this.#onRenderFailure?.(error);
      return;
    }
    this.#onFrameRendered?.(signals);
    this.#observeQuality(nowMs, signals.state);
    this.#observePerformance(nowMs, signals);
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
      this.#performanceSampler?.markSummonComplete(nowMs);
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
      qualityNotice: nowMs < this.#qualityNoticeUntil,
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
    this.#canvas.dataset.cameraDistance = this.#runtime.stage.cameraRig.distanceToTarget().toFixed(6);
    this.#canvas.dataset.renderReady = 'true';
    document.body.dataset.stageReady = 'true';
    document.body.dataset.characterReady = 'true';
    document.body.dataset.girlLayerCount = String(stage.magicalGirl?.layered.layerNames.length ?? 0);
    document.body.dataset.catLayerCount = String(stage.moonCat?.layered.layerNames.length ?? 0);
    document.body.dataset.catVisible = String(stage.moonCat?.isRevealed() ?? false);
    document.body.dataset.magicCircleReady = 'true';
    document.body.dataset.particlesReady = 'true';
    document.body.dataset.summonReady = 'true';
    document.body.dataset.postprocessingReady = 'true';
    document.body.dataset.experienceState = signals.state;
    document.body.dataset.muted = String(this.#runtime.audio.getSnapshot().muted);
  }

  #observeQuality(nowMs: number, state: ExperienceState): void {
    this.#qualityController.observeFrame(nowMs, {
      visible: document.visibilityState === 'visible',
      focused: document.hasFocus(),
      graphicsHealthy: this.#graphicsHealthy,
      state,
    });
    const applied = this.#qualityController.applyPendingIfSafe(state);
    if (applied) {
      this.#quality = applied;
      this.#runtime.setQuality(applied);
      this.#qualityNoticeUntil = nowMs + 2_000;
    }

    const snapshot = this.#qualityController.getSnapshot();
    const stats = this.#runtime.stage.particleSystem.getStats();
    document.body.dataset.qualityTier = snapshot.tier;
    document.body.dataset.qualityForced = String(snapshot.forcedMode);
    document.body.dataset.qualityPending = String(snapshot.pendingDowngrade);
    document.body.dataset.effectiveFps = snapshot.effectiveFps.toFixed(1);
    this.#debugPanel?.update({
      backend: this.#runtime.renderer.backend,
      quality: snapshot.tier,
      effectiveFps: snapshot.effectiveFps,
      state,
      activeObjects: stats.activeCount,
      allocatedObjects: stats.allocatedObjects,
    });
  }

  readonly #clearQualitySampling = (): void => {
    this.#qualityController.clearSampling();
    this.#performanceSampler?.clearSamples();
  };

  #clearSpellResidue(): void {
    this.#runtime.stage.reset();
    this.#runtime.audio.reset();
    this.#runtime.postProcessing.clearHistory();
  }

  #createPointerInput(canvas: HTMLCanvasElement): PointerInput {
    return new PointerInput(canvas, this.#uiRoot, {
      getState: () => this.state(),
      dispatch: this.#dispatchInput,
      onPointerMove: (position) => { this.#pointerNdc = position; },
    });
  }

  #observePerformance(nowMs: number, signals: FrameSignals): void {
    if (!this.#performanceSampler) return;
    this.#performanceSampler.observeFrame(nowMs, {
      visible: document.visibilityState === 'visible',
      focused: document.hasFocus(),
      graphicsHealthy: this.#graphicsHealthy,
      state: signals.state === 'summoning'
        ? `summoning@${signals.summon.toFixed(3)}`
        : signals.state,
    });
    if (this.#objectStatsRuntime !== this.#runtime) {
      this.#objectStatsRuntime = this.#runtime;
      const sceneObjects: Array<{ geometry?: object; material?: object | object[] }> = [];
      this.#runtime.stage.scene.traverse((object) => {
        sceneObjects.push(object as unknown as { geometry?: object; material?: object | object[] });
      });
      const renderer = this.#runtime.renderer.renderer as unknown as {
        info?: { memory?: { geometries?: number; textures?: number } };
      };
      this.#performanceSampler.setObjectStats(countRuntimeObjects({
        sceneObjects,
        rendererInfo: renderer.info,
        poolCapacity: this.#runtime.stage.particleSystem.getStats().capacity,
      }));
    }
    const snapshot = this.#performanceSampler.getSnapshot();
    this.#canvas.dataset.performance = JSON.stringify(snapshot);
    document.body.dataset.performanceComplete = String(snapshot.complete);
  }
}

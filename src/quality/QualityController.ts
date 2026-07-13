import type { ExperienceState } from '../state/experienceTypes';
import { ContinuousFrameSampler, selectInitialQuality } from './frameSampling';
import type { QualityTier } from './qualityProfiles';

const STABILIZATION_MS = 10_000;
const RUNTIME_WINDOW_MS = 5_000;
const LOW_FPS_THRESHOLD = 27;
const LOW_WINDOWS_TO_DOWNGRADE = 2;
const DOWNGRADE_COOLDOWN_MS = 30_000;

const NEXT_LOWER_TIER: Readonly<Partial<Record<QualityTier, QualityTier>>> = {
  high: 'balanced',
  balanced: 'compatibility',
};

export interface InitialBenchmark {
  run(): Promise<number>;
}

export interface QualityObservationContext {
  visible: boolean;
  focused: boolean;
  graphicsHealthy: boolean;
  state: ExperienceState;
}

export interface QualityControllerOptions {
  benchmark: InitialBenchmark;
  initialTier?: QualityTier;
  forcedMode?: boolean;
}

export interface QualityControllerSnapshot {
  tier: QualityTier;
  effectiveFps: number;
  lowWindowCount: number;
  pendingDowngrade: boolean;
  forcedMode: boolean;
  cooldownUntil: number;
}

function isRuntimeState(state: ExperienceState): boolean {
  return state !== 'loading' && state !== 'entry';
}

export class QualityController {
  readonly #benchmark: InitialBenchmark;
  readonly #forcedMode: boolean;
  readonly #runtimeSampler = new ContinuousFrameSampler(RUNTIME_WINDOW_MS);
  #tier: QualityTier;
  #stableStartedAt: number | null = null;
  #lastObservedAt = 0;
  #effectiveFps = 0;
  #lowWindowCount = 0;
  #pendingDowngrade = false;
  #cooldownUntil = 0;

  constructor(options: QualityControllerOptions) {
    this.#benchmark = options.benchmark;
    this.#tier = options.initialTier ?? 'high';
    this.#forcedMode = options.forcedMode ?? false;
  }

  async runInitialBenchmark(): Promise<QualityTier> {
    if (this.#forcedMode) return this.#tier;
    this.#effectiveFps = await this.#benchmark.run();
    this.#tier = selectInitialQuality(this.#effectiveFps);
    return this.#tier;
  }

  observeFrame(nowMs: number, context: QualityObservationContext): void {
    this.#lastObservedAt = nowMs;
    if (this.#forcedMode) return;

    const valid = context.visible && context.focused && context.graphicsHealthy && isRuntimeState(context.state);
    if (!valid) {
      this.#resetObservation();
      return;
    }
    if (this.#stableStartedAt === null) this.#stableStartedAt = nowMs;
    if (nowMs < this.#cooldownUntil || nowMs - this.#stableStartedAt < STABILIZATION_MS) {
      this.#runtimeSampler.reset();
      return;
    }

    const window = this.#runtimeSampler.observe(nowMs, true);
    this.#effectiveFps = this.#runtimeSampler.getSnapshot().fps || this.#effectiveFps;
    if (!window) return;
    this.#effectiveFps = window.fps;
    this.#lowWindowCount = window.fps < LOW_FPS_THRESHOLD ? this.#lowWindowCount + 1 : 0;
    if (this.#lowWindowCount >= LOW_WINDOWS_TO_DOWNGRADE) this.requestDowngrade();
  }

  requestDowngrade(): void {
    if (this.#forcedMode || !NEXT_LOWER_TIER[this.#tier]) return;
    this.#pendingDowngrade = true;
  }

  applyPendingIfSafe(state: ExperienceState): QualityTier | null {
    if (
      this.#forcedMode
      || !this.#pendingDowngrade
      || this.#lastObservedAt < this.#cooldownUntil
      || (state !== 'idle' && state !== 'complete')
    ) return null;

    const next = NEXT_LOWER_TIER[this.#tier];
    if (!next) {
      this.#pendingDowngrade = false;
      return null;
    }
    this.#tier = next;
    this.#pendingDowngrade = false;
    this.#cooldownUntil = this.#lastObservedAt + DOWNGRADE_COOLDOWN_MS;
    this.#resetObservation();
    return next;
  }

  getSnapshot(): QualityControllerSnapshot {
    return {
      tier: this.#tier,
      effectiveFps: this.#effectiveFps,
      lowWindowCount: this.#lowWindowCount,
      pendingDowngrade: this.#pendingDowngrade,
      forcedMode: this.#forcedMode,
      cooldownUntil: this.#cooldownUntil,
    };
  }

  #resetObservation(): void {
    this.#runtimeSampler.reset();
    this.#stableStartedAt = null;
    this.#lowWindowCount = 0;
  }
}

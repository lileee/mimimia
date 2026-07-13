import type { ExperienceRuntime } from '../app/createExperience';
import type { FrameSignals } from '../app/frameSignals';
import { ContinuousFrameSampler } from './frameSampling';

const BENCHMARK_DURATION_MS = 3_000;
const BENCHMARK_SEED = 0x4d4f4f4e;

export interface BenchmarkSceneOptions {
  runtime: ExperienceRuntime;
  fpsOverride?: number;
  graphicsHealthy?: () => boolean;
}

export class BenchmarkScene {
  readonly seed = BENCHMARK_SEED;
  readonly #runtime: ExperienceRuntime;
  readonly #fpsOverride?: number;
  readonly #graphicsHealthy: () => boolean;
  #animationFrame = 0;
  #running = false;
  #lastDurationMs = 0;

  constructor(options: BenchmarkSceneOptions) {
    this.#runtime = options.runtime;
    this.#fpsOverride = Number.isFinite(options.fpsOverride) ? options.fpsOverride : undefined;
    this.#graphicsHealthy = options.graphicsHealthy ?? (() => true);
  }

  async run(): Promise<number> {
    if (this.#running) throw new Error('Initial benchmark is already running');
    if (this.#fpsOverride !== undefined) {
      this.#lastDurationMs = 0;
      return Math.max(0, this.#fpsOverride);
    }
    this.#running = true;
    this.#runtime.setQuality('high');
    const sampler = new ContinuousFrameSampler(BENCHMARK_DURATION_MS);
    let firstValidAt: number | null = null;

    return new Promise<number>((resolve) => {
      const tick = (nowMs: number) => {
        const valid = document.visibilityState === 'visible'
          && document.hasFocus()
          && this.#graphicsHealthy();
        if (valid && firstValidAt === null) firstValidAt = nowMs;
        if (!valid) firstValidAt = null;
        this.#renderPeak(nowMs, firstValidAt ?? nowMs);
        const result = sampler.observe(nowMs, valid);
        if (result) {
          this.#lastDurationMs = result.durationMs;
          this.#running = false;
          this.#animationFrame = 0;
          this.#runtime.postProcessing.clearHistory();
          resolve(result.fps);
          return;
        }
        this.#animationFrame = requestAnimationFrame(tick);
      };
      this.#animationFrame = requestAnimationFrame(tick);
    });
  }

  cancel(): void {
    this.#running = false;
    cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = 0;
  }

  getLastDurationMs(): number {
    return this.#lastDurationMs;
  }

  #renderPeak(nowMs: number, startedAt: number): void {
    const phase = Math.floor((nowMs - startedAt) / 750) % 2;
    const signals: FrameSignals = phase === 0
      ? {
        nowMs,
        deltaSeconds: 1 / 60,
        state: 'charged',
        charge: 1,
        dissolve: 0,
        summon: 0,
        pointerNdc: { x: 0.18, y: 0.06 },
      }
      : {
        nowMs,
        deltaSeconds: 1 / 60,
        state: 'summoning',
        charge: 1,
        dissolve: 0,
        summon: 0.46,
        pointerNdc: { x: -0.14, y: 0.08 },
      };
    this.#runtime.stage.update(signals, 'high');
    this.#runtime.postProcessing.update(signals);
    this.#runtime.postProcessing.render();
  }
}

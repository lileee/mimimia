import type { QualityTier } from './qualityProfiles';

export interface FrameWindowResult {
  durationMs: number;
  frameCount: number;
  fps: number;
}

export interface FrameSamplerSnapshot extends FrameWindowResult {
  complete: boolean;
}

export function selectInitialQuality(fps: number): QualityTier {
  if (fps >= 45) return 'high';
  if (fps >= 30) return 'balanced';
  return 'compatibility';
}

export class ContinuousFrameSampler {
  readonly #windowMs: number;
  #startedAt: number | null = null;
  #lastObservedAt: number | null = null;
  #frameCount = 0;

  constructor(windowMs: number) {
    if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error('Frame sample window must be positive');
    this.#windowMs = windowMs;
  }

  observe(nowMs: number, valid: boolean): FrameWindowResult | null {
    if (!valid || !Number.isFinite(nowMs)) {
      this.reset();
      return null;
    }
    if (this.#lastObservedAt !== null && nowMs < this.#lastObservedAt) this.reset();
    if (this.#startedAt === null) {
      this.#startedAt = nowMs;
      this.#lastObservedAt = nowMs;
      return null;
    }

    this.#lastObservedAt = nowMs;
    this.#frameCount += 1;
    const durationMs = nowMs - this.#startedAt;
    if (durationMs < this.#windowMs) return null;

    const result = {
      durationMs,
      frameCount: this.#frameCount,
      fps: durationMs > 0 ? this.#frameCount * 1_000 / durationMs : 0,
    };
    this.reset();
    return result;
  }

  reset(): void {
    this.#startedAt = null;
    this.#lastObservedAt = null;
    this.#frameCount = 0;
  }

  getSnapshot(): FrameSamplerSnapshot {
    const durationMs = this.#startedAt !== null && this.#lastObservedAt !== null
      ? Math.max(0, this.#lastObservedAt - this.#startedAt)
      : 0;
    return {
      durationMs,
      frameCount: this.#frameCount,
      fps: durationMs > 0 ? this.#frameCount * 1_000 / durationMs : 0,
      complete: durationMs >= this.#windowMs,
    };
  }
}

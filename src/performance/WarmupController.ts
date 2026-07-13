import type { FrameSignals } from '../app/frameSignals';
import type { QualityTier } from '../quality/qualityProfiles';
import type { WarmupReport } from './performanceTypes';

export interface WarmupTarget {
  setQuality(quality: QualityTier): void;
  renderFrame(signals: FrameSignals, quality: QualityTier): void;
  renderClosedEyesFrame?: (signals: FrameSignals, quality: QualityTier) => void;
  prepareTextures?: () => Promise<void> | void;
  clearHistory(): void;
  settle?: () => Promise<void> | void;
}

const frame = (
  nowMs: number,
  state: FrameSignals['state'],
  charge: number,
  dissolve: number,
  summon: number,
): FrameSignals => ({
  nowMs,
  deltaSeconds: 1 / 60,
  state,
  charge,
  dissolve,
  summon,
  pointerNdc: { x: 0.12, y: 0.05 },
});

export class WarmupController {
  readonly #target: WarmupTarget;
  #report: WarmupReport = { ready: false, frameCount: 0, states: [] };

  constructor(target: WarmupTarget) {
    this.#target = target;
  }

  async prepare(quality: QualityTier): Promise<WarmupReport> {
    if (this.#report.ready) return this.getReport();
    const nowMs = performance.now();
    const frames = [
      frame(nowMs, 'idle', 0, 0, 0),
      frame(nowMs + 16, 'charged', 1, 0, 0),
      frame(nowMs + 32, 'dissolving', 0.78, 0.5, 0),
      frame(nowMs + 48, 'summoning', 1, 0, 0.05),
      frame(nowMs + 64, 'summoning', 1, 0, 0.06),
      frame(nowMs + 80, 'summoning', 1, 0, 0.22),
      frame(nowMs + 96, 'summoning', 1, 0, 0.23),
      frame(nowMs + 112, 'summoning', 1, 0, 0.59),
      frame(nowMs + 128, 'summoning', 1, 0, 0.6),
      frame(nowMs + 144, 'summoning', 1, 0, 0.75),
      frame(nowMs + 160, 'complete', 1, 0, 1),
    ] as const;
    await this.#target.prepareTextures?.();
    this.#target.setQuality(quality);
    for (const signals of frames) this.#target.renderFrame(signals, quality);
    if (this.#target.renderClosedEyesFrame) {
      this.#target.renderClosedEyesFrame(frame(nowMs + 176, 'complete', 1, 0, 1), quality);
    }
    this.#target.clearHistory();
    await this.#target.settle?.();
    this.#report = {
      ready: true,
      frameCount: frames.length + (this.#target.renderClosedEyesFrame ? 1 : 0),
      states: ['idle', 'charged', 'dissolving', 'summoning', 'complete'],
    };
    return this.getReport();
  }

  getReport(): WarmupReport {
    return { ...this.#report, states: [...this.#report.states] };
  }
}

export interface BlinkSchedule {
  scheduledFrom: number;
  nextBlinkAt: number;
  durationMs: number;
}

export interface BlinkFrame {
  openness: number;
  active: boolean;
}

const MIN_INTERVAL_MS = 3_000;
const MAX_INTERVAL_MS = 6_000;
const MIN_DURATION_MS = 220;
const MAX_DURATION_MS = 320;

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (minimum: number, maximum: number, amount: number) => minimum + (maximum - minimum) * amount;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export class BlinkController {
  readonly #seed: number;
  #random: () => number;
  #schedule: BlinkSchedule = { scheduledFrom: 0, nextBlinkAt: 3_000, durationMs: 260 };

  constructor(seed: number) {
    this.#seed = seed;
    this.#random = mulberry32(seed);
    this.reset(0);
  }

  reset(nowMs = 0): void {
    this.#random = mulberry32(this.#seed);
    this.#scheduleNext(nowMs);
  }

  getSchedule(): Readonly<BlinkSchedule> {
    return { ...this.#schedule };
  }

  update(nowMs: number): BlinkFrame {
    const start = this.#schedule.nextBlinkAt;
    const end = start + this.#schedule.durationMs;
    if (nowMs < start) return { openness: 1, active: false };
    if (nowMs > end) {
      this.#scheduleNext(nowMs);
      return { openness: 1, active: false };
    }

    const phase = clamp01((nowMs - start) / this.#schedule.durationMs);
    const edge = 0.28;
    const openness = phase < edge
      ? 1 - phase / edge
      : phase > 1 - edge
        ? (phase - (1 - edge)) / edge
        : 0;
    return { openness: clamp01(openness), active: true };
  }

  #scheduleNext(nowMs: number): void {
    this.#schedule = {
      scheduledFrom: nowMs,
      nextBlinkAt: nowMs + lerp(MIN_INTERVAL_MS, MAX_INTERVAL_MS, this.#random()),
      durationMs: lerp(MIN_DURATION_MS, MAX_DURATION_MS, this.#random()),
    };
  }
}

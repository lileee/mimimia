export type ReadinessKey = 'assetsReady' | 'rendererReady' | 'warmupReady' | 'benchmarkReady';

export interface ReadinessSnapshot extends Record<ReadinessKey, boolean> {
  ready: boolean;
}

const KEYS: readonly ReadinessKey[] = ['assetsReady', 'rendererReady', 'warmupReady', 'benchmarkReady'];

export class ReadinessGate {
  readonly #values: Record<ReadinessKey, boolean> = {
    assetsReady: false,
    rendererReady: false,
    warmupReady: false,
    benchmarkReady: false,
  };
  readonly #onChange?: (snapshot: ReadinessSnapshot) => void;

  constructor(onChange?: (snapshot: ReadinessSnapshot) => void) {
    this.#onChange = onChange;
  }

  mark(key: ReadinessKey, value = true): void {
    if (this.#values[key] === value) return;
    this.#values[key] = value;
    this.#onChange?.(this.snapshot());
  }

  isReady(): boolean {
    return KEYS.every((key) => this.#values[key]);
  }

  snapshot(): ReadinessSnapshot {
    return { ...this.#values, ready: this.isReady() };
  }

  reset(): void {
    const changed = KEYS.some((key) => this.#values[key]);
    for (const key of KEYS) this.#values[key] = false;
    if (changed) this.#onChange?.(this.snapshot());
  }
}

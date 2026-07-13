import type { FrameSignals } from '../app/frameSignals';
import { EXPERIENCE_TIMING } from '../config/experience';
import {
  AUDIO_CUE_IDS,
  type AudioContextPort,
  type AudioControllerOptions,
  type AudioControllerSnapshot,
  type AudioCueCountId,
  type AudioCueId,
  type ChargeLayerId,
} from './audioTypes';

const CHARGE_CUES: Readonly<Record<ChargeLayerId, AudioCueId>> = {
  low: 'charge-low',
  crystals: 'charge-crystals',
  rise: 'charge-rise',
};

const LAYER_LEVELS: Readonly<Record<ChargeLayerId, number>> = {
  low: 0.46,
  crystals: 0.38,
  rise: 0.32,
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
};

const defaultContextFactory = (): AudioContextPort => {
  if (typeof AudioContext === 'undefined') throw new Error('Web Audio is unavailable');
  return new AudioContext();
};

export class AudioController {
  readonly #context: AudioContextPort | null;
  readonly #buffers: ReadonlyMap<AudioCueId, AudioBuffer>;
  readonly #decodeFailures: AudioCueId[];
  readonly #master: GainNode | null;
  readonly #ambientBus: GainNode | null;
  readonly #chargeBus: GainNode | null;
  readonly #cueBus: GainNode | null;
  readonly #layerNodes: Record<ChargeLayerId, GainNode | null>;
  readonly #loopSources: AudioBufferSourceNode[] = [];
  readonly #oneShots = new Set<AudioBufferSourceNode>();
  #unlocked = false;
  #muted: boolean;
  #disposed = false;
  #ambientLoopStarts = 0;
  #chargeLoopStarts = 0;
  #previousState: FrameSignals['state'] | null = null;
  #chargedPlayed = false;
  #outcome: 'dissolve' | 'summon' | null = null;
  #masterGain = 1;
  #layerGains: Record<ChargeLayerId, number> = { low: 0, crystals: 0, rise: 0 };
  #cueCounts: Record<AudioCueCountId, number> = { charged: 0, dissolve: 0, release: 0, catForm: 0 };
  #lastCueDelays: Partial<Record<AudioCueCountId, number>> = {};
  #lastSignals: AudioControllerSnapshot['lastSignals'] = null;

  private constructor(
    context: AudioContextPort | null,
    buffers: ReadonlyMap<AudioCueId, AudioBuffer>,
    decodeFailures: AudioCueId[],
  ) {
    this.#context = context;
    this.#buffers = buffers;
    this.#decodeFailures = decodeFailures;
    this.#muted = !buffers.has('ambient-moon-void') || context === null;
    this.#masterGain = this.#muted ? 0 : 1;

    if (context === null) {
      this.#master = null;
      this.#ambientBus = null;
      this.#chargeBus = null;
      this.#cueBus = null;
      this.#layerNodes = { low: null, crystals: null, rise: null };
      return;
    }

    this.#master = context.createGain();
    this.#ambientBus = context.createGain();
    this.#chargeBus = context.createGain();
    this.#cueBus = context.createGain();
    this.#layerNodes = {
      low: context.createGain(),
      crystals: context.createGain(),
      rise: context.createGain(),
    };

    this.#master.gain.value = this.#masterGain;
    this.#ambientBus.gain.value = 0.52;
    this.#chargeBus.gain.value = 0.82;
    this.#cueBus.gain.value = 0.9;
    this.#ambientBus.connect(this.#master);
    this.#chargeBus.connect(this.#master);
    this.#cueBus.connect(this.#master);
    this.#master.connect(context.destination);
    for (const layer of Object.values(this.#layerNodes)) {
      if (!layer) continue;
      layer.gain.value = 0;
      layer.connect(this.#chargeBus);
    }
  }

  static async create(
    assets: ReadonlyMap<string, Uint8Array>,
    options: AudioControllerOptions = {},
  ): Promise<AudioController> {
    let context: AudioContextPort | null = null;
    try {
      context = (options.contextFactory ?? defaultContextFactory)();
    } catch {
      return new AudioController(null, new Map(), [...AUDIO_CUE_IDS]);
    }

    const buffers = new Map<AudioCueId, AudioBuffer>();
    const failures: AudioCueId[] = [];
    for (const id of AUDIO_CUE_IDS) {
      const bytes = assets.get(id);
      if (!bytes) {
        failures.push(id);
        continue;
      }
      try {
        const copy = bytes.slice().buffer as ArrayBuffer;
        buffers.set(id, await context.decodeAudioData(copy));
      } catch {
        failures.push(id);
      }
    }
    return new AudioController(context, buffers, failures);
  }

  async unlock(): Promise<void> {
    if (this.#disposed || this.#context === null) return;
    try {
      if (this.#context.state !== 'running') await this.#context.resume();
    } catch {
      return;
    }
    if (this.#unlocked) return;
    this.#unlocked = true;
    this.#previousState = null;
    if (this.#startLoop('ambient-moon-void', this.#ambientBus)) this.#ambientLoopStarts += 1;
    for (const [layer, cue] of Object.entries(CHARGE_CUES) as Array<[ChargeLayerId, AudioCueId]>) {
      if (this.#startLoop(cue, this.#layerNodes[layer])) this.#chargeLoopStarts += 1;
    }
  }

  update(signals: FrameSignals): void {
    if (this.#disposed) return;
    this.#lastSignals = {
      state: signals.state,
      charge: signals.charge,
      dissolve: signals.dissolve,
      summon: signals.summon,
    };
    this.#updateChargeLayers(signals);

    if (this.#unlocked && signals.state !== this.#previousState) {
      if (signals.state === 'charged' && !this.#chargedPlayed) {
        this.#chargedPlayed = true;
        this.#playCue('charged-cue', 'charged');
      } else if (signals.state === 'dissolving' && this.#outcome === null) {
        this.#outcome = 'dissolve';
        this.#playCue('dissolve', 'dissolve');
      } else if (signals.state === 'summoning' && this.#outcome === null) {
        this.#outcome = 'summon';
        this.#playCue('release-chime', 'release');
        this.#playCue('cat-form', 'catForm', EXPERIENCE_TIMING.releaseHoldMs / 1_000);
      }
    }

    if (signals.state === 'idle' && this.#previousState === 'dissolving') {
      this.#chargedPlayed = false;
      this.#outcome = null;
    }
    this.#previousState = signals.state;
  }

  setMuted(muted: boolean): void {
    if (this.#disposed) return;
    this.#muted = muted;
    this.#masterGain = muted ? 0 : 1;
    this.#ramp(this.#master, this.#masterGain, 0.04);
  }

  reset(): void {
    if (this.#disposed) return;
    this.#chargedPlayed = false;
    this.#outcome = null;
    this.#previousState = null;
    this.#lastSignals = null;
    this.#stopOneShots();
    this.#setLayers({ low: 0, crystals: 0, rise: 0 }, 0.08);
  }

  getSnapshot(): AudioControllerSnapshot {
    return {
      unlocked: this.#unlocked,
      muted: this.#muted,
      musicAvailable: this.#buffers.has('ambient-moon-void'),
      availableCueIds: AUDIO_CUE_IDS.filter((id) => this.#buffers.has(id)),
      decodeFailures: [...this.#decodeFailures],
      ambientLoopStarts: this.#ambientLoopStarts,
      chargeLoopStarts: this.#chargeLoopStarts,
      masterGain: this.#masterGain,
      layerGains: { ...this.#layerGains },
      cueCounts: { ...this.#cueCounts },
      lastCueDelays: { ...this.#lastCueDelays },
      lastSignals: this.#lastSignals ? { ...this.#lastSignals } : null,
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopOneShots();
    for (const source of this.#loopSources) {
      try { source.stop(); } catch { /* source can already be stopped */ }
      source.disconnect();
    }
    this.#loopSources.length = 0;
    for (const node of [this.#ambientBus, this.#chargeBus, this.#cueBus, this.#master, ...Object.values(this.#layerNodes)]) {
      node?.disconnect();
    }
    if (this.#context?.state !== 'closed') void this.#context?.close().catch(() => undefined);
  }

  #updateChargeLayers(signals: FrameSignals): void {
    const base = {
      low: LAYER_LEVELS.low * smooth(signals.charge / 0.08),
      crystals: LAYER_LEVELS.crystals * smooth((signals.charge - EXPERIENCE_TIMING.chargePhase1End) / 0.06),
      rise: LAYER_LEVELS.rise * smooth((signals.charge - EXPERIENCE_TIMING.chargePhase2End) / 0.06),
    };
    let release = signals.state === 'charging' || signals.state === 'charged' ? 1 : 0;
    if (signals.state === 'dissolving') release = 1 - clamp01(signals.dissolve / 0.08);
    if (signals.state === 'summoning') {
      const elapsedMs = clamp01(signals.summon) * EXPERIENCE_TIMING.summonEndMs;
      release = 1 - clamp01(elapsedMs / 80);
    }
    const duration = signals.state === 'dissolving' ? 0.08 : 0.04;
    this.#setLayers({
      low: base.low * release,
      crystals: base.crystals * release,
      rise: base.rise * release,
    }, duration);
  }

  #setLayers(values: Record<ChargeLayerId, number>, duration: number): void {
    this.#layerGains = values;
    for (const id of Object.keys(values) as ChargeLayerId[]) this.#ramp(this.#layerNodes[id], values[id], duration);
  }

  #ramp(node: GainNode | null, value: number, duration: number): void {
    if (!node || !this.#context) return;
    const now = this.#context.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(value, now + duration);
  }

  #startLoop(id: AudioCueId, destination: GainNode | null): boolean {
    const buffer = this.#buffers.get(id);
    if (!buffer || !destination || !this.#context) return false;
    try {
      const source = this.#context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(destination);
      source.start();
      this.#loopSources.push(source);
      return true;
    } catch {
      return false;
    }
  }

  #playCue(id: AudioCueId, countId: AudioCueCountId, delaySeconds = 0): void {
    const buffer = this.#buffers.get(id);
    if (!buffer || !this.#cueBus || !this.#context) return;
    try {
      const source = this.#context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.#cueBus);
      source.onended = () => {
        this.#oneShots.delete(source);
        source.disconnect();
      };
      source.start(this.#context.currentTime + delaySeconds);
      this.#oneShots.add(source);
      this.#cueCounts[countId] += 1;
      this.#lastCueDelays[countId] = delaySeconds;
    } catch {
      // Individual cue failure never interrupts the visual experience.
    }
  }

  #stopOneShots(): void {
    for (const source of this.#oneShots) {
      source.onended = null;
      try { source.stop(); } catch { /* source can already be stopped */ }
      source.disconnect();
    }
    this.#oneShots.clear();
  }
}

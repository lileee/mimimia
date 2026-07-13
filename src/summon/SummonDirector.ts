import type { FrameSignals } from '../app/frameSignals';
import { EXPERIENCE_TIMING } from '../config/experience';
import type { ParticleBurstKind } from '../effects/ParticleSystem';
import { getSummonFrame, type SummonFrame } from './summonTiming';

interface SummonCatTarget {
  setReveal: (shadow: number, fill: number, opacity: number) => void;
  setAnchorPosition: (x: number, y: number, z: number) => void;
  reset: () => void;
}

interface SummonParticleTarget {
  burst: (kind: ParticleBurstKind) => void;
}

export class SummonDirector {
  readonly #cat: SummonCatTarget;
  readonly #particles: SummonParticleTarget;
  readonly #triggered = new Set<ParticleBurstKind>();
  #complete = false;
  #active = false;
  #frame: SummonFrame = getSummonFrame(0);

  constructor(cat: SummonCatTarget, particles: SummonParticleTarget) {
    this.#cat = cat;
    this.#particles = particles;
  }

  update(signals: FrameSignals): void {
    if (signals.state === 'complete') {
      this.#active = true;
      this.#frame = getSummonFrame(EXPERIENCE_TIMING.summonEndMs);
      this.#applyFrame();
      this.#complete = true;
      return;
    }
    if (signals.state !== 'summoning') {
      if (this.#active || this.#complete) this.reset();
      return;
    }

    this.#active = true;
    const elapsedMs = Math.min(1, Math.max(0, signals.summon)) * EXPERIENCE_TIMING.summonEndMs;
    this.#frame = getSummonFrame(elapsedMs);
    this.#triggerAt(elapsedMs, EXPERIENCE_TIMING.releaseHoldMs, 'release-flash');
    this.#triggerAt(elapsedMs, EXPERIENCE_TIMING.fillStartMs, 'fill-rise');
    this.#triggerAt(elapsedMs, EXPERIENCE_TIMING.catMoveStartMs, 'cat-settle');
    this.#applyFrame();
    this.#complete = this.#frame.complete;
  }

  getSnapshot(): Readonly<SummonFrame> {
    return { ...this.#frame, position: { ...this.#frame.position } };
  }

  isComplete(): boolean {
    return this.#complete;
  }

  reset(): void {
    this.#triggered.clear();
    this.#complete = false;
    this.#active = false;
    this.#frame = getSummonFrame(0);
    this.#cat.reset();
  }

  #triggerAt(elapsedMs: number, threshold: number, kind: ParticleBurstKind): void {
    if (elapsedMs < threshold || this.#triggered.has(kind)) return;
    this.#triggered.add(kind);
    this.#particles.burst(kind);
  }

  #applyFrame(): void {
    this.#cat.setReveal(this.#frame.shadow, this.#frame.fill, this.#frame.opacity);
    this.#cat.setAnchorPosition(this.#frame.position.x, this.#frame.position.y, this.#frame.position.z);
  }
}

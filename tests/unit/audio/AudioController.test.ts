import { describe, expect, it } from 'vitest';

import { AudioController } from '../../../src/audio/AudioController';
import { AUDIO_CUE_IDS, type AudioContextPort } from '../../../src/audio/audioTypes';
import type { FrameSignals } from '../../../src/app/frameSignals';

class FakeAudioParam {
  value = 0;
  cancelScheduledValues(): this { return this; }
  setValueAtTime(value: number): this { this.value = value; return this; }
  linearRampToValueAtTime(value: number): this { this.value = value; return this; }
}

class FakeGain {
  gain = new FakeAudioParam();
  connect(): this { return this; }
  disconnect(): void {}
}

class FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  starts: number[] = [];
  connect(): this { return this; }
  disconnect(): void {}
  start(when = 0): void { this.starts.push(when); }
  stop(): void { this.onended?.(); }
}

class FakeContext {
  currentTime = 10;
  state: AudioContextState = 'suspended';
  destination = {} as AudioDestinationNode;
  gains: FakeGain[] = [];
  sources: FakeSource[] = [];
  decodeFailureAt = -1;
  decodeCount = 0;

  createGain(): GainNode {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  async decodeAudioData(): Promise<AudioBuffer> {
    const index = this.decodeCount;
    this.decodeCount += 1;
    if (index === this.decodeFailureAt) throw new Error('decode failed');
    return { duration: 2.5 } as AudioBuffer;
  }

  async resume(): Promise<void> { this.state = 'running'; }
  async close(): Promise<void> { this.state = 'closed'; }
}

const assets = () => new Map(AUDIO_CUE_IDS.map((id) => [id, new Uint8Array([1, 2, 3])]));
const signals = (
  state: FrameSignals['state'],
  charge = 0,
  dissolve = 0,
  summon = 0,
): FrameSignals => ({
  nowMs: 1_000,
  deltaSeconds: 1 / 60,
  state,
  charge,
  dissolve,
  summon,
  pointerNdc: { x: 0.2, y: -0.1 },
});

async function createController(context = new FakeContext()) {
  const controller = await AudioController.create(assets(), {
    contextFactory: () => context as unknown as AudioContextPort,
  });
  return { controller, context };
}

describe('AudioController', () => {
  it('decodes during loading but starts no audio before a user unlock', async () => {
    const { controller, context } = await createController();
    expect(context.decodeCount).toBe(8);
    expect(context.sources).toHaveLength(0);
    expect(controller.getSnapshot()).toMatchObject({ unlocked: false, ambientLoopStarts: 0, chargeLoopStarts: 0 });

    await controller.unlock();
    await controller.unlock();
    expect(context.state).toBe('running');
    expect(controller.getSnapshot()).toMatchObject({ unlocked: true, ambientLoopStarts: 1, chargeLoopStarts: 3 });
  });

  it('mixes the three charge layers from the shared 0.8 and 1.7 second boundaries', async () => {
    const { controller } = await createController();
    await controller.unlock();

    controller.update(signals('charging', 0.31));
    expect(controller.getSnapshot().layerGains).toMatchObject({ low: expect.any(Number), crystals: 0, rise: 0 });
    expect(controller.getSnapshot().layerGains.low).toBeGreaterThan(0);

    controller.update(signals('charging', 0.36));
    expect(controller.getSnapshot().layerGains.crystals).toBeGreaterThan(0);
    expect(controller.getSnapshot().layerGains.rise).toBe(0);

    controller.update(signals('charging', 0.74));
    expect(controller.getSnapshot().layerGains.rise).toBeGreaterThan(0);
  });

  it('plays charged once and keeps failure and success outcomes mutually exclusive', async () => {
    const { controller } = await createController();
    await controller.unlock();

    controller.update(signals('charged', 1));
    controller.update(signals('charged', 1));
    expect(controller.getSnapshot().cueCounts).toMatchObject({ charged: 1, dissolve: 0, release: 0, catForm: 0 });

    controller.update(signals('dissolving', 1, 0.08));
    controller.update(signals('dissolving', 1, 0.4));
    expect(controller.getSnapshot().cueCounts).toMatchObject({ charged: 1, dissolve: 1, release: 0, catForm: 0 });
    expect(controller.getSnapshot().layerGains).toEqual({ low: 0, crystals: 0, rise: 0 });

    controller.reset();
    controller.update(signals('charged', 1));
    controller.update(signals('summoning', 1, 0, 0));
    expect(controller.getSnapshot().cueCounts).toMatchObject({ charged: 2, dissolve: 1, release: 1, catForm: 1 });
    expect(controller.getSnapshot().lastCueDelays).toMatchObject({ release: 0, catForm: 0.12 });
  });

  it('mutes only the master gain and never mutates shared animation signals', async () => {
    const { controller } = await createController();
    await controller.unlock();
    const frame = signals('summoning', 1, 0, 0.42);
    const before = structuredClone(frame);
    controller.update(frame);
    const animationBeforeMute = controller.getSnapshot().lastSignals;

    controller.setMuted(true);
    expect(frame).toEqual(before);
    expect(controller.getSnapshot()).toMatchObject({ muted: true, masterGain: 0, lastSignals: animationBeforeMute });
    controller.setMuted(false);
    expect(controller.getSnapshot()).toMatchObject({ muted: false, masterGain: 1, lastSignals: animationBeforeMute });
  });

  it('continues muted when music decoding fails and allows surviving effects after unmute', async () => {
    const context = new FakeContext();
    context.decodeFailureAt = AUDIO_CUE_IDS.indexOf('ambient-moon-void');
    const { controller } = await createController(context);
    expect(controller.getSnapshot()).toMatchObject({ muted: true, musicAvailable: false, decodeFailures: ['ambient-moon-void'] });

    await controller.unlock();
    controller.setMuted(false);
    controller.update(signals('charged', 1));
    expect(controller.getSnapshot()).toMatchObject({ muted: false, ambientLoopStarts: 0 });
    expect(controller.getSnapshot().cueCounts.charged).toBe(1);
  });
});

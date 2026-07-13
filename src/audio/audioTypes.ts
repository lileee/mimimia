import type { FrameSignals } from '../app/frameSignals';

export const AUDIO_CUE_IDS = [
  'ambient-moon-void',
  'charge-low',
  'charge-crystals',
  'charge-rise',
  'charged-cue',
  'dissolve',
  'release-chime',
  'cat-form',
] as const;

export type AudioCueId = typeof AUDIO_CUE_IDS[number];
export type ChargeLayerId = 'low' | 'crystals' | 'rise';
export type AudioCueCountId = 'charged' | 'dissolve' | 'release' | 'catForm';

export interface AudioContextPort {
  readonly currentTime: number;
  readonly state: AudioContextState;
  readonly destination: AudioDestinationNode;
  createGain(): GainNode;
  createBufferSource(): AudioBufferSourceNode;
  decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer>;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export interface AudioControllerOptions {
  contextFactory?: () => AudioContextPort;
}

export interface AudioSignalSnapshot {
  state: FrameSignals['state'];
  charge: number;
  dissolve: number;
  summon: number;
}

export interface AudioControllerSnapshot {
  unlocked: boolean;
  muted: boolean;
  musicAvailable: boolean;
  availableCueIds: AudioCueId[];
  decodeFailures: AudioCueId[];
  ambientLoopStarts: number;
  chargeLoopStarts: number;
  masterGain: number;
  layerGains: Record<ChargeLayerId, number>;
  cueCounts: Record<AudioCueCountId, number>;
  lastCueDelays: Partial<Record<AudioCueCountId, number>>;
  lastSignals: AudioSignalSnapshot | null;
}

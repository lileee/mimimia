import type { QualityTier } from '../quality/qualityProfiles';
import type { ExperienceState } from '../state/experienceTypes';

export type UIAction = 'enter' | 'mute' | 'reset' | 'reload' | 'reenter';

export interface UIErrorState {
  message: string;
  detail?: string;
  action: 'reload' | 'reenter';
}

export interface UIRenderState {
  state: ExperienceState;
  progress: number;
  muted: boolean;
  quality: QualityTier;
  error: UIErrorState | null;
  readyToEnter?: boolean;
  calibrating?: boolean;
  hintVisible?: boolean;
  qualityNotice?: boolean;
  debugHidden?: boolean;
}

export type UIActionHandler = (action: UIAction) => void;

import type { BackendKind } from '../rendering/renderingTypes';
import type { QualityTier } from '../quality/qualityProfiles';
import type { ExperienceState } from '../state/experienceTypes';

export interface DebugPanelState {
  backend: BackendKind;
  quality: QualityTier;
  effectiveFps: number;
  state: ExperienceState;
  activeObjects: number;
  allocatedObjects: number;
}

export class DebugPanel {
  readonly #element = document.createElement('aside');

  constructor() {
    this.#element.className = 'debug-panel';
    this.#element.dataset.testid = 'debug-panel';
    document.body.append(this.#element);
  }

  update(model: DebugPanelState): void {
    this.#element.textContent = [
      `BACKEND  ${model.backend.toUpperCase()}`,
      `QUALITY  ${model.quality.toUpperCase()}`,
      `FPS      ${model.effectiveFps.toFixed(1)}`,
      `STATE    ${model.state.toUpperCase()}`,
      `OBJECTS  ${model.activeObjects} / ${model.allocatedObjects}`,
    ].join('\n');
    document.body.dataset.qualityTier = model.quality;
    document.body.dataset.effectiveFps = model.effectiveFps.toFixed(1);
  }

  dispose(): void {
    this.#element.remove();
  }
}

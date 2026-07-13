import type { ExperienceEvent, ExperienceState } from '../state/experienceTypes';

export interface NormalizedPointerPosition {
  x: number;
  y: number;
}

interface PointerInputOptions {
  getState: () => ExperienceState;
  dispatch: (event: ExperienceEvent, nowMs: number) => void;
  onPointerMove: (position: NormalizedPointerPosition) => void;
  windowTarget?: EventTarget;
  documentTarget?: Document;
}

const isHoldingState = (state: ExperienceState) => state === 'charging' || state === 'charged';
const clampNdc = (value: number) => Math.min(1, Math.max(-1, value));

export class PointerInput {
  readonly #canvas: HTMLCanvasElement;
  readonly #uiRoot: HTMLElement;
  readonly #options: PointerInputOptions;
  readonly #windowTarget: EventTarget;
  readonly #documentTarget: Document;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, options: PointerInputOptions) {
    this.#canvas = canvas;
    this.#uiRoot = uiRoot;
    this.#options = options;
    this.#windowTarget = options.windowTarget ?? window;
    this.#documentTarget = options.documentTarget ?? document;
    this.#bind();
  }

  dispose(): void {
    this.#canvas.removeEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.removeEventListener('pointerup', this.#onPointerUp);
    this.#canvas.removeEventListener('pointerleave', this.#onPointerCancel);
    this.#canvas.removeEventListener('pointercancel', this.#onPointerCancel);
    this.#canvas.removeEventListener('pointermove', this.#onPointerMove);
    this.#uiRoot.removeEventListener('pointerdown', this.#stopUiPointer);
    this.#uiRoot.removeEventListener('pointerup', this.#stopUiPointer);
    this.#windowTarget.removeEventListener('blur', this.#onWindowBlur);
    this.#documentTarget.removeEventListener('visibilitychange', this.#onVisibilityChange);
  }

  #bind(): void {
    this.#canvas.addEventListener('pointerdown', this.#onPointerDown);
    this.#canvas.addEventListener('pointerup', this.#onPointerUp);
    this.#canvas.addEventListener('pointerleave', this.#onPointerCancel);
    this.#canvas.addEventListener('pointercancel', this.#onPointerCancel);
    this.#canvas.addEventListener('pointermove', this.#onPointerMove);
    this.#uiRoot.addEventListener('pointerdown', this.#stopUiPointer);
    this.#uiRoot.addEventListener('pointerup', this.#stopUiPointer);
    this.#windowTarget.addEventListener('blur', this.#onWindowBlur);
    this.#documentTarget.addEventListener('visibilitychange', this.#onVisibilityChange);
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.#options.getState() !== 'idle') return;
    this.#canvas.setPointerCapture(event.pointerId);
    this.#options.dispatch({ type: 'POINTER_DOWN' }, event.timeStamp);
    event.preventDefault();
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0 || !isHoldingState(this.#options.getState())) return;
    this.#options.dispatch({ type: 'POINTER_UP' }, event.timeStamp);
    event.preventDefault();
  };

  readonly #onPointerCancel = (event: Event): void => {
    if (isHoldingState(this.#options.getState())) this.#options.dispatch({ type: 'POINTER_CANCEL' }, event.timeStamp);
  };

  readonly #onPointerMove = (event: PointerEvent): void => {
    const bounds = this.#canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;
    this.#options.onPointerMove({ x: clampNdc(x), y: clampNdc(y) });
  };

  readonly #stopUiPointer = (event: Event): void => {
    event.stopPropagation();
  };

  readonly #onWindowBlur = (event: Event): void => {
    if (isHoldingState(this.#options.getState())) this.#options.dispatch({ type: 'POINTER_CANCEL' }, event.timeStamp);
  };

  readonly #onVisibilityChange = (event: Event): void => {
    if (this.#documentTarget.hidden && isHoldingState(this.#options.getState())) {
      this.#options.dispatch({ type: 'POINTER_CANCEL' }, event.timeStamp);
    }
  };
}

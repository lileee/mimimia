export interface CatGazeState {
  headDegrees: number;
  eyeOffsetFraction: number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export class CatGazeController {
  #pointerX = 0;
  #pointerActive = false;
  #state: CatGazeState = { headDegrees: 0, eyeOffsetFraction: 0 };

  setPointerNdc(x: number, _y: number, active = true): void {
    this.#pointerX = clamp(x, -1, 1);
    this.#pointerActive = active;
  }

  update(deltaMs: number): Readonly<CatGazeState> {
    const targetHead = this.#pointerActive ? this.#pointerX * 3 : 0;
    const targetEye = this.#pointerActive ? this.#pointerX * 0.04 : 0;
    const timeConstant = this.#pointerActive ? 180 : 360;
    const amount = 1 - Math.exp(-Math.max(0, deltaMs) / timeConstant);
    this.#state = {
      headDegrees: this.#state.headDegrees + (targetHead - this.#state.headDegrees) * amount,
      eyeOffsetFraction: this.#state.eyeOffsetFraction + (targetEye - this.#state.eyeOffsetFraction) * amount,
    };
    return this.getState();
  }

  getState(): Readonly<CatGazeState> {
    return { ...this.#state };
  }

  reset(): void {
    this.#pointerX = 0;
    this.#pointerActive = false;
    this.#state = { headDegrees: 0, eyeOffsetFraction: 0 };
  }
}

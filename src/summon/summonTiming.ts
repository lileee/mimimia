import { EXPERIENCE_TIMING } from '../config/experience';

export interface SummonPosition {
  x: number;
  y: number;
  z: number;
}

export interface SummonFrame {
  elapsedMs: number;
  shadow: number;
  fill: number;
  opacity: number;
  move: number;
  position: SummonPosition;
  complete: boolean;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
};
const progress = (elapsedMs: number, startMs: number, endMs: number) =>
  smoothstep((elapsedMs - startMs) / (endMs - startMs));

function cubicBezier(
  amount: number,
  start: SummonPosition,
  controlOne: SummonPosition,
  controlTwo: SummonPosition,
  end: SummonPosition,
): SummonPosition {
  const inverse = 1 - amount;
  return {
    x: inverse ** 3 * start.x + 3 * inverse ** 2 * amount * controlOne.x
      + 3 * inverse * amount ** 2 * controlTwo.x + amount ** 3 * end.x,
    y: inverse ** 3 * start.y + 3 * inverse ** 2 * amount * controlOne.y
      + 3 * inverse * amount ** 2 * controlTwo.y + amount ** 3 * end.y,
    z: inverse ** 3 * start.z + 3 * inverse ** 2 * amount * controlOne.z
      + 3 * inverse * amount ** 2 * controlTwo.z + amount ** 3 * end.z,
  };
}

export function getSummonFrame(rawElapsedMs: number): SummonFrame {
  const elapsedMs = Math.min(EXPERIENCE_TIMING.summonEndMs, Math.max(0, rawElapsedMs));
  const shadow = progress(elapsedMs, EXPERIENCE_TIMING.releaseHoldMs, EXPERIENCE_TIMING.shadowEndMs);
  const fill = progress(elapsedMs, EXPERIENCE_TIMING.fillStartMs, EXPERIENCE_TIMING.fillEndMs);
  const move = progress(elapsedMs, EXPERIENCE_TIMING.catMoveStartMs, EXPERIENCE_TIMING.catMoveEndMs);
  const risePosition = { x: 0, y: 0.12 + shadow * 0.72, z: 0 };
  const position = move === 0
    ? risePosition
    : cubicBezier(
      move,
      { x: 0, y: 0.84, z: 0 },
      { x: 1.5, y: 1.3, z: 0.16 },
      { x: 1.82, y: 2.62, z: 0.08 },
      { x: 1.28, y: 3.02, z: 0 },
    );
  return {
    elapsedMs,
    shadow,
    fill,
    opacity: smoothstep(shadow / 0.14),
    move,
    position,
    complete: elapsedMs >= EXPERIENCE_TIMING.summonEndMs,
  };
}

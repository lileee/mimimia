import { describe, expect, it, vi } from 'vitest';

import { PointerInput } from '../../../src/input/PointerInput';
import type { ExperienceEvent, ExperienceState } from '../../../src/state/experienceTypes';

class FakeCanvas extends EventTarget {
  readonly setPointerCapture = vi.fn();

  getBoundingClientRect(): DOMRect {
    return { left: 10, top: 20, width: 200, height: 100, right: 210, bottom: 120, x: 10, y: 20, toJSON: () => ({}) };
  }
}

class FakeDocument extends EventTarget {
  hidden = false;
}

function pointerEvent(type: string, values: Record<string, number> = {}): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
  return event;
}

function setup(initialState: ExperienceState = 'idle') {
  const canvas = new FakeCanvas();
  const uiRoot = new EventTarget();
  const windowTarget = new EventTarget();
  const documentTarget = new FakeDocument();
  let state = initialState;
  const events: ExperienceEvent[] = [];
  const eventTimes: Array<number | undefined> = [];
  const positions: Array<{ x: number; y: number }> = [];
  const input = new PointerInput(canvas as unknown as HTMLCanvasElement, uiRoot as unknown as HTMLElement, {
    getState: () => state,
    dispatch: (event, nowMs?: number) => { events.push(event); eventTimes.push(nowMs); },
    onPointerMove: (position) => positions.push(position),
    windowTarget,
    documentTarget: documentTarget as unknown as Document,
  });
  return { canvas, uiRoot, windowTarget, documentTarget, events, eventTimes, positions, input, setState: (value: ExperienceState) => { state = value; } };
}

describe('PointerInput', () => {
  it('starts only a primary-button spell from idle and captures the pointer', () => {
    const fixture = setup();
    fixture.canvas.dispatchEvent(pointerEvent('pointerdown', { button: 2, pointerId: 3 }));
    expect(fixture.events).toEqual([]);

    fixture.canvas.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 7 }));

    expect(fixture.events).toEqual([{ type: 'POINTER_DOWN' }]);
    expect(fixture.canvas.setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('forwards the input timestamp so a delayed render cannot extend the hold', () => {
    const fixture = setup();
    fixture.canvas.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 7, timeStamp: 123 }));
    expect(fixture.eventTimes).toEqual([123]);
  });

  it('does not start a spell while summoning or complete', () => {
    const fixture = setup('summoning');
    fixture.canvas.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 1 }));
    fixture.setState('complete');
    fixture.canvas.dispatchEvent(pointerEvent('pointerdown', { button: 0, pointerId: 2 }));
    expect(fixture.events).toEqual([]);
  });

  it('stops interface pointer events before they reach the canvas', () => {
    const fixture = setup();
    const event = pointerEvent('pointerdown', { button: 0, pointerId: 1 });
    fixture.uiRoot.dispatchEvent(event);
    expect(event.cancelBubble).toBe(true);
    expect(fixture.events).toEqual([]);
  });

  it('releases only an active hold', () => {
    const fixture = setup('idle');
    fixture.canvas.dispatchEvent(pointerEvent('pointerup', { button: 0, pointerId: 1 }));
    fixture.setState('charging');
    fixture.canvas.dispatchEvent(pointerEvent('pointerup', { button: 0, pointerId: 1 }));
    fixture.setState('charged');
    fixture.canvas.dispatchEvent(pointerEvent('pointerup', { button: 0, pointerId: 1 }));
    expect(fixture.events).toEqual([{ type: 'POINTER_UP' }, { type: 'POINTER_UP' }]);
  });

  it('turns leave, cancel, blur, and hidden visibility into safe cancellation', () => {
    for (const type of ['pointerleave', 'pointercancel']) {
      const fixture = setup('charging');
      fixture.canvas.dispatchEvent(pointerEvent(type, { pointerId: 1 }));
      expect(fixture.events).toEqual([{ type: 'POINTER_CANCEL' }]);
    }
    const blurred = setup('charged');
    blurred.windowTarget.dispatchEvent(new Event('blur'));
    expect(blurred.events).toEqual([{ type: 'POINTER_CANCEL' }]);

    const hidden = setup('charging');
    hidden.documentTarget.hidden = true;
    hidden.documentTarget.dispatchEvent(new Event('visibilitychange'));
    expect(hidden.events).toEqual([{ type: 'POINTER_CANCEL' }]);
  });

  it('converts pointer movement to normalized coordinates and keeps updating when complete', () => {
    const fixture = setup('complete');
    fixture.canvas.dispatchEvent(pointerEvent('pointermove', { clientX: 110, clientY: 70 }));
    fixture.canvas.dispatchEvent(pointerEvent('pointermove', { clientX: 210, clientY: 20 }));
    expect(fixture.positions).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  });
});

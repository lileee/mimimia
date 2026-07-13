import { describe, expect, it } from 'vitest';

import { BlinkController } from '../../../src/character/BlinkController';

describe('BlinkController', () => {
  it('replays the same natural blink schedule for a fixed seed', () => {
    const first = new BlinkController(0x4d4f4f4e);
    const second = new BlinkController(0x4d4f4f4e);

    first.reset(1_000);
    second.reset(1_000);

    for (let index = 0; index < 5; index += 1) {
      expect(first.getSchedule()).toEqual(second.getSchedule());
      const schedule = first.getSchedule();
      expect(schedule.nextBlinkAt - schedule.scheduledFrom).toBeGreaterThanOrEqual(3_000);
      expect(schedule.nextBlinkAt - schedule.scheduledFrom).toBeLessThanOrEqual(6_000);
      expect(schedule.durationMs).toBeGreaterThanOrEqual(220);
      expect(schedule.durationMs).toBeLessThanOrEqual(320);

      expect(first.update(schedule.nextBlinkAt - 1).openness).toBe(1);
      expect(second.update(schedule.nextBlinkAt - 1)).toEqual(first.update(schedule.nextBlinkAt - 1));

      const closedAt = schedule.nextBlinkAt + schedule.durationMs * 0.5;
      expect(first.update(closedAt).openness).toBeLessThan(0.05);
      expect(second.update(closedAt)).toEqual(first.update(closedAt));

      const endedAt = schedule.nextBlinkAt + schedule.durationMs + 1;
      expect(first.update(endedAt).openness).toBe(1);
      expect(second.update(endedAt)).toEqual(first.update(endedAt));
      expect(first.getSchedule().nextBlinkAt - endedAt).toBeGreaterThanOrEqual(3_000);
    }
  });
});

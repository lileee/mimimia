import { describe, expect, it } from 'vitest';

import { PostProcessingHistoryReset } from '../../../src/rendering/PostProcessingHistoryReset';

describe('PostProcessingHistoryReset', () => {
  it('clears history on exactly the first rendered frame after a reset request', () => {
    const reset = new PostProcessingHistoryReset();

    expect(reset.consume()).toBe(false);
    reset.request();
    expect(reset.consume()).toBe(true);
    expect(reset.consume()).toBe(false);
  });

  it('coalesces repeated reset requests before the next frame', () => {
    const reset = new PostProcessingHistoryReset();

    reset.request();
    reset.request();
    expect(reset.consume()).toBe(true);
    expect(reset.consume()).toBe(false);
  });
});

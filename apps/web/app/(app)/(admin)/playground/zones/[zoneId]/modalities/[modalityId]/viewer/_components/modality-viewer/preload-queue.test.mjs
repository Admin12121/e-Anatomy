import { describe, expect, test } from "bun:test";

import {
  findNextPreloadTaskIndex,
  sortPreloadQueue,
} from "./preload-queue.ts";

function createTask(id, priority, order) {
  return { id, priority, order };
}

describe("viewer preload queue", () => {
  test("sorts high-priority work first and preserves insertion order per priority", () => {
    const queue = [
      createTask("low-new", "low", 3),
      createTask("high-new", "high", 2),
      createTask("low-old", "low", 0),
      createTask("high-old", "high", 1),
    ];

    sortPreloadQueue(queue);

    expect(queue.map((task) => task.id)).toEqual([
      "high-old",
      "high-new",
      "low-old",
      "low-new",
    ]);
  });

  test("reserves capacity for queued high-priority work", () => {
    const queue = [
      createTask("low", "low", 0),
      createTask("high", "high", 1),
    ];

    expect(
      findNextPreloadTaskIndex(queue, {
        inFlightCount: 4,
        lowInFlightCount: 0,
        maxInFlight: 6,
        maxLowInFlight: 2,
        reservedHighPrioritySlots: 2,
      }),
    ).toBe(1);
  });

  test("uses low-priority work when no high-priority task is waiting", () => {
    expect(
      findNextPreloadTaskIndex([createTask("low", "low", 0)], {
        inFlightCount: 4,
        lowInFlightCount: 0,
        maxInFlight: 6,
        maxLowInFlight: 2,
        reservedHighPrioritySlots: 2,
      }),
    ).toBe(0);
  });

  test("waits when all low-priority slots are occupied", () => {
    expect(
      findNextPreloadTaskIndex([createTask("low", "low", 0)], {
        inFlightCount: 2,
        lowInFlightCount: 2,
        maxInFlight: 6,
        maxLowInFlight: 2,
        reservedHighPrioritySlots: 2,
      }),
    ).toBe(-1);
  });
});

import type { ZoneModalityAsset } from "@/lib/playground/types";

export type PreloadPriority = "high" | "low";

export type PreloadQueueItem = {
  asset: ZoneModalityAsset;
  cacheKey: string;
  imageUrl: string;
  order: number;
  priority: PreloadPriority;
  resolve: () => void;
};

type OrderedPreloadTask = {
  order: number;
  priority: PreloadPriority;
};

function preloadPriorityRank(priority: PreloadPriority) {
  return priority === "high" ? 0 : 1;
}

export function sortPreloadQueue<Task extends OrderedPreloadTask>(
  queue: Task[],
) {
  queue.sort((left, right) => {
    const priorityDifference =
      preloadPriorityRank(left.priority) -
      preloadPriorityRank(right.priority);

    return priorityDifference || left.order - right.order;
  });
}

export function findNextPreloadTaskIndex<Task extends OrderedPreloadTask>(
  queue: Task[],
  {
    inFlightCount,
    lowInFlightCount,
    maxInFlight,
    maxLowInFlight,
    reservedHighPrioritySlots,
  }: {
    inFlightCount: number;
    lowInFlightCount: number;
    maxInFlight: number;
    maxLowInFlight: number;
    reservedHighPrioritySlots: number;
  },
) {
  const hasHighPriorityTask = queue.some(
    (task) => task.priority === "high",
  );

  return queue.findIndex((task) => {
    if (task.priority === "high") {
      return true;
    }

    if (lowInFlightCount >= maxLowInFlight) {
      return false;
    }

    return (
      !hasHighPriorityTask ||
      inFlightCount < maxInFlight - reservedHighPrioritySlots
    );
  });
}

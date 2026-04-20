import { Skeleton } from "@/components/ui/skeleton";

export default function PlaygroundLoading() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden p-2">
      <div className="grid h-full min-h-0 overflow-hidden gap-2 xl:grid-cols-[minmax(0,1fr)_30rem]">
        <Skeleton className="relative min-h-0 overflow-hidden rounded-xl" />
        <Skeleton className="xl:sticky xl:top-0 flex h-full min-h-0 flex-col gap-3 self-start overflow-y-auto overscroll-contain pr-1" />
      </div>
    </section>
  );
}

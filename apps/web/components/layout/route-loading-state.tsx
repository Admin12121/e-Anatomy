import { LoaderCircleIcon } from "lucide-react";

type RouteLoadingStateProps = {
  description: string;
  title: string;
};

export function RouteLoadingState({
  description,
  title,
}: RouteLoadingStateProps) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center p-6 md:p-8">
      <div className="max-w-sm rounded-3xl border border-border/60 bg-background/80 px-6 py-8 text-center shadow-sm backdrop-blur">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-muted/60">
          <LoaderCircleIcon className="size-5 animate-spin text-muted-foreground" />
        </div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

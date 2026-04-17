import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import Loader from "@/components/ui/loader";

export default function EmptyParticle() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <Loader />
        </EmptyMedia>
        <EmptyTitle>Viewer unavailable</EmptyTitle>
        <EmptyDescription>Data is being processed.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex gap-2">
          <Button size="sm">Back</Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}

import { Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type RankHelpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const METRICS = [
  { label: "Stars", weight: "4x" },
  { label: "Pull requests", weight: "3x" },
  { label: "Commits (last year)", weight: "2x" },
  { label: "Issues", weight: "1x" },
  { label: "Code reviews", weight: "1x" },
  { label: "Followers", weight: "1x" },
];

export function RankHelpDialog({ open, onOpenChange }: RankHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3 sm:items-center">
            <span className="bg-violet-500/15 text-violet-600 dark:text-violet-400 flex size-10 shrink-0 items-center justify-center rounded-full">
              <Trophy className="size-5" aria-hidden />
            </span>
            <div className="space-y-1.5 text-left">
              <DialogTitle>How rank is calculated</DialogTitle>
              <DialogDescription>
                Each developer gets a letter grade from S (best) to C, based on
                public GitHub activity compared to typical GitHub medians.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              What counts (and how much)
            </p>
            <ul className="border-border/60 bg-muted/30 divide-border/60 divide-y rounded-md border">
              {METRICS.map((metric) => (
                <li
                  key={metric.label}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span className="text-foreground">{metric.label}</span>
                  <span className="text-muted-foreground font-mono text-xs">
                    {metric.weight}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-muted-foreground leading-relaxed">
            Each metric is normalized against a typical-GitHub median, then
            combined using these weights into a single score. Higher activity
            earns a better grade. Stars and pull requests count the most.
          </p>

          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Chile standings
            </p>
            <p className="text-muted-foreground leading-relaxed">
              <span className="text-foreground font-medium">Top X% in Chile</span>{" "}
              is your percentile among all indexed Chilean developers.{" "}
              <span className="text-foreground font-medium">#N</span> positions
              show your exact ranking within your location and across the
              country.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

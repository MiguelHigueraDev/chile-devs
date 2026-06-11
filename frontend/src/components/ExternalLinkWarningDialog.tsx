import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ExternalLinkWarningDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  developerLogin: string;
};

function formatDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function ExternalLinkWarningDialog({
  open,
  onOpenChange,
  url,
  developerLogin,
}: ExternalLinkWarningDialogProps) {
  const displayUrl = formatDisplayUrl(url);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3 sm:items-center">
            <span className="bg-amber-500/15 text-amber-600 dark:text-amber-400 flex size-10 shrink-0 items-center justify-center rounded-full motion-safe:animate-[pulse_2s_ease-in-out_1]">
              <AlertTriangle className="size-5" aria-hidden />
            </span>
            <div className="space-y-1.5 text-left">
              <DialogTitle>Leaving Chile Devs</DialogTitle>
              <DialogDescription>
                You are about to visit an external site provided by{" "}
                <span className="text-foreground font-medium">
                  {developerLogin}
                </span>
                . We do not control third-party content.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="border-border/60 bg-muted/30 rounded-md border px-3 py-2.5">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Destination
          </p>
          <p className="text-foreground mt-1 truncate font-mono text-sm">
            {displayUrl}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Stay here
          </Button>
          <Button
            type="button"
            onClick={() => {
              window.open(url, "_blank", "noopener,noreferrer");
              onOpenChange(false);
            }}
          >
            Continue
            <ExternalLink className="size-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

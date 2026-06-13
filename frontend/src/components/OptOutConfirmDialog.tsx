import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type OptOutConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending?: boolean;
  login: string;
};

export function OptOutConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending = false,
  login,
}: OptOutConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3 sm:items-center">
            <span className="bg-destructive/15 text-destructive flex size-10 shrink-0 items-center justify-center rounded-full">
              <AlertTriangle className="size-5" aria-hidden />
            </span>
            <div className="space-y-1.5 text-left">
              <DialogTitle>Remove your profile</DialogTitle>
              <DialogDescription>
                This will immediately and permanently remove{" "}
                <span className="text-foreground font-medium">{login}</span>{" "}
                from Chile Devs. Your GitHub account will not be indexed again.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Removing…" : "Remove my profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

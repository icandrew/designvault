"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

export function DeleteReferenceDialog({
  referenceId,
  title,
  open,
  onOpenChange,
  redirectTo,
  onDeleted,
}: {
  referenceId: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectTo?: string;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await api(`/api/app/references/${referenceId}`, { method: "DELETE" });
      toast.success(`Deleted “${title}”`);
      onOpenChange(false);
      onDeleted?.();
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !deleting && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this reference?</AlertDialogTitle>
          <AlertDialogDescription>
            “{title}” and all of its stored screenshots will be permanently removed from your vault and from every
            collection. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={deleting} aria-live="polite">
            {deleting && <Loader2 className="animate-spin" />}
            {deleting ? "Deleting…" : "Delete reference"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

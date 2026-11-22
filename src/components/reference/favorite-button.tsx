"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function useFavorite(id: string, initial: boolean) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setIsFavorite(initial);
  }
  const toggle = async () => {
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      await api(`/api/app/references/${id}`, { method: "PATCH", json: { isFavorite: next } });
      toast.success(next ? "Added to favorites" : "Removed from favorites");
      router.refresh();
    } catch (error) {
      setIsFavorite(!next);
      toast.error((error as Error).message);
    }
  };
  return { isFavorite, toggle };
}

export function FavoriteButton({
  id,
  initial,
  variant = "overlay",
  className,
}: {
  id: string;
  initial: boolean;
  variant?: "overlay" | "plain";
  className?: string;
}) {
  const { isFavorite, toggle } = useFavorite(id, initial);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void toggle();
      }}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "grid place-items-center rounded-md transition-colors duration-150",
        variant === "overlay"
          ? "size-8 bg-background/90 text-foreground shadow-sm ring-1 ring-black/5 backdrop-blur hover:bg-background dark:ring-white/10"
          : "size-9 border bg-background hover:bg-accent",
        className,
      )}
    >
      <motion.span
        key={String(isFavorite)}
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
        className="grid place-items-center"
      >
        <Heart className={cn("size-4", isFavorite && "fill-highlight text-highlight")} />
      </motion.span>
    </button>
  );
}

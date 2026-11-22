import type { Metadata } from "next";
import { GalleryPage } from "@/components/gallery/gallery-page";

export const metadata: Metadata = { title: "Favorites" };

export default async function FavoritesPage({ searchParams }: PageProps<"/favorites">) {
  return (
    <GalleryPage
      searchParams={await searchParams}
      title="Favorites"
      description="Your bookmarked references, ready when you need them."
      fixed={{ favorite: true }}
    />
  );
}

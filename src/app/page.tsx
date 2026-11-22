import { GalleryPage } from "@/components/gallery/gallery-page";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <GalleryPage
      searchParams={await searchParams}
      title="Your design references"
      description="Screenshots of websites, layouts and interface patterns you have chosen to learn from."
    />
  );
}

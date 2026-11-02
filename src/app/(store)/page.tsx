import { getHomeSections } from "@/server/catalog";
import { HomeSectionRenderer } from "@/components/home/sections";

export default async function HomePage() {
  const sections = await getHomeSections(); // ordered, enabled sections from admin config
  return sections.map((s) => <HomeSectionRenderer key={s.id} section={s} />);
}

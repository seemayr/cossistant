import type { MetadataRoute } from "next";
import { getLanderSitemapEntries } from "@/lib/seo-content";

export const revalidate = false;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	return getLanderSitemapEntries();
}

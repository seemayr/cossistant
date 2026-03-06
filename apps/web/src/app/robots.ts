import type { MetadataRoute } from "next";
import { toAbsoluteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: "/",
			disallow: ["/_next/", "/api/"],
		},
		sitemap: toAbsoluteUrl("/sitemap.xml"),
	};
}

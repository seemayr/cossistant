import { buildDocsLlmsFullText } from "@/lib/seo-content";

// cached forever
export const revalidate = false;
const SEARCH_ENGINE_NOINDEX = "noindex, nofollow";

export async function GET() {
	return new Response(await buildDocsLlmsFullText(), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"X-Robots-Tag": SEARCH_ENGINE_NOINDEX,
		},
	});
}

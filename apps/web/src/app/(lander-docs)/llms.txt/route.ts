import { buildDocsLlmsIndexText } from "@/lib/seo-content";

export const revalidate = false;
const SEARCH_ENGINE_NOINDEX = "noindex, nofollow";

export async function GET() {
	return new Response(buildDocsLlmsIndexText(), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"X-Robots-Tag": SEARCH_ENGINE_NOINDEX,
		},
	});
}

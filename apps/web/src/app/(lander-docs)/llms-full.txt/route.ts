import { buildDocsLlmsFullText } from "@/lib/seo-content";

// cached forever
export const revalidate = false;

export async function GET() {
	return new Response(await buildDocsLlmsFullText());
}

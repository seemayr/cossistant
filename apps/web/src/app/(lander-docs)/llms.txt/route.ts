import { buildDocsLlmsIndexText } from "@/lib/seo-content";

export const revalidate = false;

export async function GET() {
	return new Response(buildDocsLlmsIndexText());
}

import { prefetchAgentToolsPageData } from "../../_lib/prefetch";
import ToolsPage from "./tools-page";

type PageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
};

export default async function Page({ params }: PageProps) {
	const { websiteSlug } = await params;

	await prefetchAgentToolsPageData(websiteSlug);

	return <ToolsPage />;
}

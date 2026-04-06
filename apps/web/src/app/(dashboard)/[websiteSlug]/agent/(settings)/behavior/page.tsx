import { prefetchAgentBehaviorPageData } from "../../_lib/prefetch";
import BehaviorPage from "./behavior-page";

type PageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
};

export default async function Page({ params }: PageProps) {
	const { websiteSlug } = await params;

	await prefetchAgentBehaviorPageData(websiteSlug);

	return <BehaviorPage />;
}

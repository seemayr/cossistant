import { notFound, redirect } from "next/navigation";
import { mdxComponents } from "@/app/(lander-docs)/components/docs/mdx-components";
import { CentralContainer } from "@/components/ui/layout";
import { NavigationTopbar } from "@/components/ui/layout/navigation-topbar";
import { InboxesProvider } from "@/contexts/inboxes";
import { VisitorPresenceProvider } from "@/contexts/visitor-presence";
import { WebsiteProvider } from "@/contexts/website";
import { getLatestRelease, getLatestReleaseBody } from "@/lib/latest-release";
import {
	getQueryClient,
	HydrateClient,
	prefetch,
	trpc,
} from "@/lib/trpc/server";
import { isValidWebsiteSlug } from "@/lib/url";
import { ModalsAndSheets } from "./overlays/modals-and-sheets";
import { Realtime } from "./providers/realtime";
import { DashboardWebSocketProvider } from "./providers/websocket";

type LayoutProps = {
	children: React.ReactNode;
	params: Promise<{
		websiteSlug: string;
	}>;
};

export default async function Layout({ children, params }: LayoutProps) {
	const { websiteSlug } = await params;

	// Reject invalid slugs (e.g., __webpack_hmr, _next paths)
	if (!isValidWebsiteSlug(websiteSlug)) {
		notFound();
	}

	const latestRelease = getLatestRelease();
	const ChangelogBody = getLatestReleaseBody();
	const changelogContent = ChangelogBody ? (
		<ChangelogBody components={mdxComponents} />
	) : null;
	const queryClient = getQueryClient();

	const handleAuthRedirect = (
		error: Parameters<NonNullable<Parameters<typeof prefetch>[1]>>[0]
	) => {
		if (error.data?.code === "UNAUTHORIZED") {
			redirect("/login");
		}

		if (error.data?.code === "FORBIDDEN") {
			redirect("/select");
		}

		redirect("/select");
	};

	await prefetch(
		trpc.website.getBySlug.queryOptions({ slug: websiteSlug }),
		handleAuthRedirect
	);

	await Promise.all([
		prefetch(
			trpc.view.list.queryOptions({ slug: websiteSlug }),
			handleAuthRedirect
		),
		prefetch(
			trpc.user.getWebsiteMembers.queryOptions({ websiteSlug }),
			handleAuthRedirect
		),
		prefetch(
			trpc.aiAgent.get.queryOptions({ websiteSlug }),
			handleAuthRedirect
		),
		// Prefetch the conversation headers as an infinite query
		queryClient.prefetchInfiniteQuery({
			queryKey: [
				...trpc.conversation.listConversationsHeaders.queryOptions({
					websiteSlug,
				}).queryKey,
				{ type: "infinite" },
			],
			queryFn: async ({ pageParam }) => {
				const response = await queryClient.fetchQuery(
					trpc.conversation.listConversationsHeaders.queryOptions({
						websiteSlug,
						limit: 500,
						cursor: pageParam ?? null,
					})
				);
				return response;
			},
			initialPageParam: null as string | null,
			getNextPageParam: (lastPage) => lastPage.nextCursor,
			pages: 1, // Prefetch the first page
		}),
		prefetch(
			trpc.website.getTinybirdToken.queryOptions({ websiteSlug }),
			handleAuthRedirect
		),
	]);

	return (
		<HydrateClient>
			<WebsiteProvider websiteSlug={websiteSlug}>
				<VisitorPresenceProvider websiteSlug={websiteSlug}>
					<DashboardWebSocketProvider>
						<Realtime>
							<InboxesProvider websiteSlug={websiteSlug}>
								<div className="h-screen w-screen overflow-hidden bg-background-100 dark:bg-background">
									<NavigationTopbar
										changelogContent={changelogContent}
										latestRelease={latestRelease}
									/>
									<CentralContainer>{children}</CentralContainer>
									<ModalsAndSheets />
								</div>
							</InboxesProvider>
						</Realtime>
					</DashboardWebSocketProvider>
				</VisitorPresenceProvider>
			</WebsiteProvider>
		</HydrateClient>
	);
}

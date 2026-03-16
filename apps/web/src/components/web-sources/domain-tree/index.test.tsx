import { beforeEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let domainTreeState: {
	groupedDomainData: Map<
		string,
		{
			summary: {
				hasActiveCrawl: boolean;
				totalPages: number;
				totalSizeBytes: number;
			};
			sources: Array<{ id: string }>;
		}
	>;
	isLoading: boolean;
	error: Error | null;
	totalDomains: number;
} = {
	groupedDomainData: new Map(),
	isLoading: false,
	error: null,
	totalDomains: 0,
};

mock.module("../hooks/use-merged-domain-tree", () => ({
	useMergedDomainTree: () => domainTreeState,
}));

mock.module("./domain-node", () => ({
	DomainNode: ({ domain }: { domain: string }) => (
		<div data-slot="mock-domain-node">{domain}</div>
	),
}));

const modulePromise = import("./index");

async function renderDomainTree(props: Record<string, unknown> = {}) {
	const { DomainTree } = await modulePromise;
	const mergedProps = {
		aiAgentId: "agent_123",
		websiteSlug: "acme",
		...props,
	};

	return renderToStaticMarkup(<DomainTree {...(mergedProps as any)} />);
}

describe("DomainTree", () => {
	beforeEach(() => {
		domainTreeState = {
			groupedDomainData: new Map(),
			isLoading: false,
			error: null,
			totalDomains: 0,
		};
	});

	it("renders the supplied empty state when there are no domains", async () => {
		const html = await renderDomainTree({
			emptyState: (
				<div data-slot="custom-empty-state">Add your first website</div>
			),
		});

		expect(html).toContain('data-slot="custom-empty-state"');
		expect(html).not.toContain("No link sources yet");
	});

	it("keeps the existing error state", async () => {
		domainTreeState = {
			...domainTreeState,
			error: new Error("Nope"),
		};

		const html = await renderDomainTree();

		expect(html).toContain("Failed to load web sources: Nope");
	});

	it("renders domain nodes when data exists", async () => {
		domainTreeState = {
			groupedDomainData: new Map([
				[
					"docs.example.com",
					{
						summary: {
							hasActiveCrawl: false,
							totalPages: 4,
							totalSizeBytes: 2048,
						},
						sources: [{ id: "source_1" }],
					},
				],
			]),
			isLoading: false,
			error: null,
			totalDomains: 1,
		};

		const html = await renderDomainTree();

		expect(html).toContain('data-slot="mock-domain-node"');
		expect(html).toContain("docs.example.com");
	});
});

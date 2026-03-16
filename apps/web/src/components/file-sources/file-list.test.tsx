import { beforeEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let queryState: {
	data?: { items: Array<{ id: string }> };
	isLoading: boolean;
} = {
	data: { items: [] },
	isLoading: false,
};

mock.module("@tanstack/react-query", () => ({
	useQuery: () => queryState,
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		knowledge: {
			list: {
				queryOptions: () => ({}),
			},
		},
	}),
}));

mock.module("./file-list-item", () => ({
	FileListItem: ({ file }: { file: { id: string } }) => (
		<div data-slot="mock-file-list-item">{file.id}</div>
	),
}));

const modulePromise = import("./file-list");

async function renderFileList(props: Record<string, unknown> = {}) {
	const { FileList } = await modulePromise;
	const mergedProps = {
		aiAgentId: "agent_123",
		onDelete: () => {},
		onEdit: () => {},
		onToggleIncluded: () => {},
		websiteSlug: "acme",
		...props,
	};

	return renderToStaticMarkup(<FileList {...(mergedProps as any)} />);
}

describe("FileList", () => {
	beforeEach(() => {
		queryState = {
			data: { items: [] },
			isLoading: false,
		};
	});

	it("renders the supplied empty state when there are no files", async () => {
		const html = await renderFileList({
			emptyState: <div data-slot="custom-empty-state">Add your first file</div>,
		});

		expect(html).toContain('data-slot="custom-empty-state"');
		expect(html).not.toContain("No files yet");
	});

	it("renders file items when files exist", async () => {
		queryState = {
			data: { items: [{ id: "file_1" }] },
			isLoading: false,
		};

		const html = await renderFileList();

		expect(html).toContain('data-slot="mock-file-list-item"');
		expect(html).toContain("file_1");
	});
});

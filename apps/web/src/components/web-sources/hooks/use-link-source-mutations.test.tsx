import { beforeEach, describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const toastErrorMock = mock((_message: unknown) => {});
const toastSuccessMock = mock((_message: unknown) => {});

const queryClientMock = {
	cancelQueries: mock((async (_args: unknown) => {}) as (
		args: unknown
	) => Promise<void>),
	getQueryData: mock((_args: unknown) => {}),
	invalidateQueries: mock((async (_args: unknown) => {}) as (
		args: unknown
	) => Promise<void>),
	setQueryData: mock((_queryKey: unknown, _updater: unknown) => {}),
};

mock.module("sonner", () => ({
	toast: {
		error: toastErrorMock,
		success: toastSuccessMock,
	},
}));

mock.module("@tanstack/react-query", () => ({
	useMutation: (options: {
		onError?: (
			error: unknown,
			variables: unknown,
			context: unknown
		) => Promise<void> | void;
		onMutate?: (variables: unknown) => Promise<unknown> | unknown;
		onSettled?: (
			data: unknown,
			error: unknown,
			variables: unknown,
			context: unknown
		) => Promise<void> | void;
		onSuccess?: (
			data: unknown,
			variables: unknown,
			context: unknown
		) => Promise<void> | void;
	}) => ({
		isPending: false,
		mutateAsync: async (variables: unknown) => {
			const context = await options.onMutate?.(variables);
			const data = {};

			try {
				await options.onSuccess?.(data, variables, context);
				await options.onSettled?.(data, null, variables, context);
				return data;
			} catch (error) {
				await options.onError?.(error, variables, context);
				await options.onSettled?.(undefined, error, variables, context);
				throw error;
			}
		},
	}),
	useQueryClient: () => queryClientMock,
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		aiAgent: {
			getTrainingReadiness: {
				queryKey: (input: unknown) => ["aiAgent.getTrainingReadiness", input],
			},
		},
		linkSource: {
			cancel: { mutationOptions: (options: unknown) => options },
			create: { mutationOptions: (options: unknown) => options },
			delete: { mutationOptions: (options: unknown) => options },
			deletePage: { mutationOptions: (options: unknown) => options },
			getTrainingStats: {
				queryKey: (input: unknown) => ["linkSource.getTrainingStats", input],
			},
			ignorePage: { mutationOptions: (options: unknown) => options },
			list: {
				queryKey: (input: unknown) => ["linkSource.list", input],
			},
			listKnowledgeByLinkSource: {
				queryKey: (input: unknown) => [
					"linkSource.listKnowledgeByLinkSource",
					input,
				],
			},
			recrawl: { mutationOptions: (options: unknown) => options },
			reindexPage: { mutationOptions: (options: unknown) => options },
			scanSubpages: { mutationOptions: (options: unknown) => options },
			toggleKnowledgeIncluded: {
				mutationOptions: (options: unknown) => options,
			},
		},
	}),
}));

const useLinkSourceMutationsModulePromise = import(
	"./use-link-source-mutations"
);

async function renderHook(): Promise<{
	handleRecrawl: (id: string) => Promise<void>;
}> {
	const { useLinkSourceMutations } = await useLinkSourceMutationsModulePromise;
	let hookValue: { handleRecrawl: (id: string) => Promise<void> } | null = null;

	function Harness() {
		hookValue = useLinkSourceMutations({
			aiAgentId: "agent-1",
			websiteSlug: "acme",
		});
		return null;
	}

	renderToStaticMarkup(<Harness />);

	if (!hookValue) {
		throw new Error("Hook did not render");
	}

	return hookValue as { handleRecrawl: (id: string) => Promise<void> };
}

describe("useLinkSourceMutations", () => {
	beforeEach(() => {
		queryClientMock.cancelQueries.mockClear();
		queryClientMock.getQueryData.mockClear();
		queryClientMock.invalidateQueries.mockClear();
		queryClientMock.setQueryData.mockClear();
		toastErrorMock.mockClear();
		toastSuccessMock.mockClear();
	});

	it("does not show a redundant recrawl started success toast", async () => {
		const hookValue = await renderHook();

		await hookValue.handleRecrawl("link-1");

		expect(toastSuccessMock).toHaveBeenCalledTimes(0);
		expect(queryClientMock.invalidateQueries).toHaveBeenCalledTimes(1);
		expect(queryClientMock.invalidateQueries.mock.calls[0]?.[0]).toEqual({
			queryKey: ["linkSource.list", { websiteSlug: "acme" }],
		});
	});
});

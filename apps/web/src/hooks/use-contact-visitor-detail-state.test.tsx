import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const queryValues = new Map<string, string | null>();
const setterCalls: Array<{ key: string; value: string | null }> = [];

mock.module("nuqs", () => ({
	parseAsString: {},
	useQueryState: (key: string) => [
		queryValues.get(key) ?? null,
		(value: string | null) => {
			setterCalls.push({ key, value });
			queryValues.set(key, value);
			return Promise.resolve(new URLSearchParams());
		},
	],
}));

const modulePromise = import("./use-contact-visitor-detail-state");

function resetQueryState() {
	queryValues.clear();
	setterCalls.length = 0;
}

async function renderHook() {
	const { useContactVisitorDetailState } = await modulePromise;
	let hookValue: any = null;

	function Harness() {
		hookValue = useContactVisitorDetailState();
		return null;
	}

	renderToStaticMarkup(React.createElement(Harness));

	if (!hookValue) {
		throw new Error("Hook did not render");
	}

	return hookValue as {
		closeDetailPage: () => Promise<unknown>;
		openContactDetail: (contactId: string) => Promise<unknown>;
		openVisitorDetail: (visitorId: string) => Promise<unknown>;
	};
}

describe("resolveContactVisitorDetailState", () => {
	it("prefers contactId when both detail params are present", async () => {
		const { resolveContactVisitorDetailState } = await modulePromise;

		expect(
			resolveContactVisitorDetailState({
				contactId: "contact-1",
				visitorId: "visitor-1",
			})
		).toEqual({
			type: "contact",
			contactId: "contact-1",
		});
	});

	it("falls back to visitorId when no contactId is present", async () => {
		const { resolveContactVisitorDetailState } = await modulePromise;

		expect(
			resolveContactVisitorDetailState({
				contactId: null,
				visitorId: "visitor-1",
			})
		).toEqual({
			type: "visitor",
			visitorId: "visitor-1",
		});
	});
});

describe("useContactVisitorDetailState", () => {
	it("opens a contact detail page with contactId and clears visitorId", async () => {
		resetQueryState();
		queryValues.set("visitorId", "visitor-9");
		const hookValue = await renderHook();

		await hookValue.openContactDetail("contact-7");

		expect(setterCalls).toEqual([
			{ key: "contactId", value: "contact-7" },
			{ key: "visitorId", value: null },
		]);
	});

	it("opens a visitor detail page with visitorId and clears contactId", async () => {
		resetQueryState();
		queryValues.set("contactId", "contact-3");
		const hookValue = await renderHook();

		await hookValue.openVisitorDetail("visitor-4");

		expect(setterCalls).toEqual([
			{ key: "contactId", value: null },
			{ key: "visitorId", value: "visitor-4" },
		]);
	});

	it("clears both params when the detail page closes", async () => {
		resetQueryState();
		queryValues.set("contactId", "contact-2");
		queryValues.set("visitorId", "visitor-2");
		const hookValue = await renderHook();

		await hookValue.closeDetailPage();

		expect(setterCalls).toEqual([
			{ key: "contactId", value: null },
			{ key: "visitorId", value: null },
		]);
	});
});

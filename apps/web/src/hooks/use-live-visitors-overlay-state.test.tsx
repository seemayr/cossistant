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

const modulePromise = import("./use-live-visitors-overlay-state");

function resetQueryState() {
	queryValues.clear();
	setterCalls.length = 0;
}

async function renderHook(): Promise<{
	isOpen: boolean;
	openLiveVisitorsOverlay: () => Promise<unknown>;
	closeLiveVisitorsOverlay: () => Promise<unknown>;
}> {
	const { useLiveVisitorsOverlayState } = await modulePromise;
	let hookValue: {
		isOpen: boolean;
		openLiveVisitorsOverlay: () => Promise<unknown>;
		closeLiveVisitorsOverlay: () => Promise<unknown>;
	} | null = null;

	function Harness() {
		hookValue = useLiveVisitorsOverlayState();
		return null;
	}

	renderToStaticMarkup(React.createElement(Harness));

	if (!hookValue) {
		throw new Error("Hook did not render");
	}

	return hookValue;
}

describe("useLiveVisitorsOverlayState", () => {
	it("reports open when the live visitors overlay query value is present", async () => {
		resetQueryState();
		queryValues.set("live", "visitors");

		const hookValue = await renderHook();

		expect(hookValue.isOpen).toBe(true);
	});

	it("opens the live visitors overlay with the expected query value", async () => {
		resetQueryState();

		const hookValue = await renderHook();
		await hookValue.openLiveVisitorsOverlay();

		expect(setterCalls).toEqual([{ key: "live", value: "visitors" }]);
	});

	it("closes the live visitors overlay by clearing the query value", async () => {
		resetQueryState();
		queryValues.set("live", "visitors");

		const hookValue = await renderHook();
		await hookValue.closeLiveVisitorsOverlay();

		expect(setterCalls).toEqual([{ key: "live", value: null }]);
	});
});

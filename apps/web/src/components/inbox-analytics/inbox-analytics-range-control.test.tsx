import { beforeEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

let capturedSegmentedControlProps: {
	"aria-label": string;
	onValueChange: (value: string) => void;
	options: Array<{ value: string; label: string }>;
	value: string;
} | null = null;

mock.module("@/components/ui/segmented-control", () => ({
	SegmentedControl: (props: {
		"aria-label": string;
		onValueChange: (value: string) => void;
		options: Array<{ value: string; label: string }>;
		value: string;
	}) => {
		capturedSegmentedControlProps = props;
		return <div data-slot="mock-segmented-control" />;
	},
}));

const modulePromise = import("./inbox-analytics-display");

describe("InboxAnalyticsRangeControl", () => {
	beforeEach(() => {
		capturedSegmentedControlProps = null;
	});

	it("maps segmented-control selections to supported analytics ranges", async () => {
		const onRangeChange = mock(((_rangeDays: number) => {}) as (
			value: number
		) => void);
		const { InboxAnalyticsRangeControl } = await modulePromise;

		renderToStaticMarkup(
			<InboxAnalyticsRangeControl
				onRangeChange={onRangeChange}
				rangeDays={14}
			/>
		);

		expect(capturedSegmentedControlProps).not.toBeNull();
		expect(capturedSegmentedControlProps?.["aria-label"]).toBe(
			"Analytics date range"
		);
		expect(capturedSegmentedControlProps?.value).toBe("14");
		expect(capturedSegmentedControlProps?.options).toEqual([
			{ value: "7", label: "7d" },
			{ value: "14", label: "14d" },
			{ value: "30", label: "30d" },
		]);

		capturedSegmentedControlProps?.onValueChange("30");
		capturedSegmentedControlProps?.onValueChange("999");

		expect(onRangeChange).toHaveBeenCalledTimes(1);
		expect(onRangeChange).toHaveBeenCalledWith(30);
	});
});

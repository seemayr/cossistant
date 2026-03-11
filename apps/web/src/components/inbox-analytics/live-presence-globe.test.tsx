import { beforeEach, describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let presenceHookCalls = 0;
let presenceResponse = {
	data: [
		{
			city: "Bangkok",
			country_code: "TH",
			entity_count: 3,
			latitude: 13.7563,
			longitude: 100.5018,
		},
	],
	isError: false,
	isLoading: false,
};

mock.module("next-themes", () => ({
	useTheme: () => ({
		resolvedTheme: "light",
	}),
}));

mock.module("@/data/use-presence-locations", () => ({
	usePresenceLocations: () => {
		presenceHookCalls += 1;
		return presenceResponse;
	},
}));

mock.module("@cossistant/globe/cossistant", () => {
	const CossistantGlobe = ({
		autoRotateSpeed,
		canvasClassName,
		children,
		className,
		clustering,
		config,
		dragSensitivity,
		focusOn,
		overlayClassName,
		style,
	}: {
		autoRotateSpeed?: number;
		canvasClassName?: string;
		children?: React.ReactNode;
		className?: string;
		clustering?: unknown;
		config?: unknown;
		dragSensitivity?: number;
		focusOn?: unknown;
		overlayClassName?: string;
		style?: React.CSSProperties;
	}) => (
		<div className={className} data-slot="mock-cossistant-globe">
			<span data-slot="mock-cossistant-globe-classname">{className ?? ""}</span>
			<span data-slot="mock-cossistant-globe-style">
				{JSON.stringify(style ?? null)}
			</span>
			<span data-slot="mock-cossistant-globe-config">
				{JSON.stringify(config ?? null)}
			</span>
			<span data-slot="mock-cossistant-globe-auto-rotate-speed">
				{String(autoRotateSpeed ?? "")}
			</span>
			<span data-slot="mock-cossistant-globe-drag-sensitivity">
				{String(dragSensitivity ?? "")}
			</span>
			<span data-slot="mock-cossistant-globe-focus-on">
				{JSON.stringify(focusOn ?? null)}
			</span>
			<span data-slot="mock-cossistant-globe-canvas-classname">
				{canvasClassName ?? ""}
			</span>
			<span data-slot="mock-cossistant-globe-overlay-classname">
				{overlayClassName ?? ""}
			</span>
			<span data-slot="mock-cossistant-globe-clustering">
				{JSON.stringify(clustering ?? null)}
			</span>
			{children}
		</div>
	);

	CossistantGlobe.Pin = ({
		children,
		id,
		latitude,
		longitude,
		weight,
	}: {
		children?: React.ReactNode;
		id: string;
		latitude: number;
		longitude: number;
		weight?: number;
	}) => (
		<div
			data-id={id}
			data-latitude={String(latitude)}
			data-longitude={String(longitude)}
			data-slot="mock-cossistant-globe-pin"
			data-weight={weight == null ? "" : String(weight)}
		>
			{children}
		</div>
	);

	return { CossistantGlobe };
});

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({
		fallbackName,
		url,
	}: {
		fallbackName: string;
		url?: string | null;
	}) => (
		<div
			data-fallback-name={fallbackName}
			data-slot="mock-avatar"
			data-url={url ?? ""}
		/>
	),
}));

const modulePromise = import("./live-presence-globe");

beforeEach(() => {
	presenceHookCalls = 0;
	presenceResponse = {
		data: [
			{
				city: "Bangkok",
				country_code: "TH",
				entity_count: 3,
				latitude: 13.7563,
				longitude: 100.5018,
			},
		],
		isError: false,
		isLoading: false,
	};
});

describe("LivePresenceGlobe", () => {
	it("keeps the default scene classes and summary badge in live mode", async () => {
		const { LivePresenceGlobe } = await modulePromise;
		const html = renderToStaticMarkup(
			<LivePresenceGlobe websiteSlug="website-1" />
		);

		expect(presenceHookCalls).toBe(1);
		expect(html).toContain('data-slot="live-presence-globe-summary-badge"');
		expect(html).toContain("3 live users across 1 locations");
		expect(html).toContain("min-h-[320px]");
		expect(html).toContain(
			"bg-gradient-to-b from-background via-background to-muted/40"
		);
		expect(html).toContain(
			'data-slot="mock-cossistant-globe-auto-rotate-speed"'
		);
		expect(html).toContain(">0<");
	});

	it("applies backgroundClassName to the inner globe scene", async () => {
		const { LivePresenceGlobe } = await modulePromise;
		const html = renderToStaticMarkup(
			<LivePresenceGlobe
				backgroundClassName="bg-[radial-gradient(circle,_red,_blue)]"
				websiteSlug="website-1"
			/>
		);

		expect(html).toContain("bg-[radial-gradient(circle,_red,_blue)]");
	});

	it("merges globeProps.className onto the rendered globe scene", async () => {
		const { LivePresenceGlobe } = await modulePromise;
		const html = renderToStaticMarkup(
			<LivePresenceGlobe
				globeProps={{
					className: "rounded-none opacity-60",
				}}
				websiteSlug="website-1"
			/>
		);

		expect(html).toContain("rounded-none opacity-60");
		expect(html).toContain("min-h-[320px]");
	});

	it("forwards style and globe behavior props", async () => {
		const { LivePresenceGlobe } = await modulePromise;
		const html = renderToStaticMarkup(
			<LivePresenceGlobe
				globeProps={{
					autoRotateSpeed: 0.01,
					canvasClassName: "globe-canvas",
					dragSensitivity: 0.25,
					overlayClassName: "globe-overlay",
					style: {
						maxWidth: "28rem",
						minHeight: 480,
					},
				}}
				websiteSlug="website-1"
			/>
		);

		expect(html).toContain('data-slot="mock-cossistant-globe-style"');
		expect(html).toContain("&quot;minHeight&quot;:480");
		expect(html).toContain("&quot;maxWidth&quot;:&quot;28rem&quot;");
		expect(html).toContain(
			'data-slot="mock-cossistant-globe-auto-rotate-speed"'
		);
		expect(html).toContain(">0.01<");
		expect(html).toContain(
			'data-slot="mock-cossistant-globe-drag-sensitivity"'
		);
		expect(html).toContain(">0.25<");
		expect(html).toContain("globe-canvas");
		expect(html).toContain("globe-overlay");
	});

	it("merges globeProps.config with default dark mode and caller overrides", async () => {
		const { LivePresenceGlobe } = await modulePromise;
		const html = renderToStaticMarkup(
			<LivePresenceGlobe
				globeProps={{
					config: {
						dark: 1,
						offset: [0.1, -0.2],
						scale: 1.4,
						theta: 0.7,
					},
				}}
				websiteSlug="website-1"
			/>
		);

		expect(html).toContain("&quot;dark&quot;:1");
		expect(html).toContain("&quot;theta&quot;:0.7");
		expect(html).toContain("&quot;scale&quot;:1.4");
		expect(html).toContain("&quot;offset&quot;:[0.1,-0.2]");
	});

	it("renders static mode without the summary badge and skips live presence queries", async () => {
		const { LivePresenceGlobe } = await modulePromise;
		const html = renderToStaticMarkup(
			<LivePresenceGlobe
				showSummaryBadge={false}
				staticLocations={[
					{
						fallbackName: "Gorgeous Wolf",
						id: "visitor-1",
						latitude: 13.7563,
						longitude: 100.5018,
					},
				]}
				websiteSlug="website-1"
			/>
		);

		expect(presenceHookCalls).toBe(0);
		expect(html).toContain('data-slot="live-presence-globe"');
		expect(html).toContain('data-slot="live-presence-globe-static-avatar-pin"');
		expect(html).toContain('data-slot="mock-cossistant-globe-focus-on"');
		expect(html).toContain("&quot;latitude&quot;:13.7563");
		expect(html).toContain("&quot;longitude&quot;:100.5018");
		expect(html).not.toContain('data-slot="live-presence-globe-summary-badge"');
	});

	it("renders the provided static location avatar marker instead of the live count badge", async () => {
		const { LivePresenceGlobe } = await modulePromise;
		const html = renderToStaticMarkup(
			<LivePresenceGlobe
				staticLocations={[
					{
						avatarUrl: "https://example.com/wolf.png",
						fallbackName: "Gorgeous Wolf",
						id: "visitor-1",
						latitude: 13.7563,
						longitude: 100.5018,
					},
				]}
				websiteSlug="website-1"
			/>
		);

		expect(html).toContain('data-id="visitor-1"');
		expect(html).toContain('data-latitude="13.7563"');
		expect(html).toContain('data-longitude="100.5018"');
		expect(html).toContain('data-slot="live-presence-globe-static-avatar-pin"');
		expect(html).toContain('data-slot="mock-avatar"');
		expect(html).toContain('data-fallback-name="Gorgeous Wolf"');
		expect(html).toContain('data-url="https://example.com/wolf.png"');
		expect(html).not.toContain('data-slot="live-presence-globe-live-pin"');
	});

	it("falls back to the dot marker when static avatar data is absent", async () => {
		const { LivePresenceGlobe } = await modulePromise;
		const html = renderToStaticMarkup(
			<LivePresenceGlobe
				staticLocations={[
					{
						id: "visitor-1",
						latitude: 13.7563,
						longitude: 100.5018,
					},
				]}
				websiteSlug="website-1"
			/>
		);

		expect(html).toContain('data-slot="live-presence-globe-static-pin"');
		expect(html).not.toContain(
			'data-slot="live-presence-globe-static-avatar-pin"'
		);
		expect(html).not.toContain('data-slot="mock-avatar"');
	});

	it("keeps live mode behavior when static locations are not provided", async () => {
		const { LivePresenceGlobe } = await modulePromise;
		const html = renderToStaticMarkup(
			<LivePresenceGlobe websiteSlug="website-1" />
		);

		expect(presenceHookCalls).toBe(1);
		expect(html).toContain('data-slot="live-presence-globe-summary-badge"');
		expect(html).toContain("3 live users across 1 locations");
		expect(html).toContain('data-slot="live-presence-globe-live-pin"');
		expect(html).not.toContain('data-slot="live-presence-globe-static-pin"');
	});
});

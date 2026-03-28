import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("facehash", () => ({
	Facehash: ({ className }: { className?: string }) => (
		<div className={className}>facehash</div>
	),
}));

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({
		className,
		fallbackName,
		url,
	}: {
		className?: string;
		fallbackName: string;
		url?: string | null;
	}) => (
		<div
			className={className}
			data-fallback-name={fallbackName}
			data-slot="mock-avatar"
			data-url={url ?? ""}
		/>
	),
}));

mock.module("@/components/ui/tooltip", () => ({
	TooltipOnHover: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

mock.module("@/components/globe", () => ({
	Globe: ({
		allowDrag,
		autoRotate,
		className,
		focus,
		visitors,
	}: {
		allowDrag?: boolean;
		autoRotate?: boolean;
		className?: string;
		focus?: {
			latitude: number;
			longitude: number;
		};
		visitors?: Array<{
			avatarUrl?: string | null;
			id: string;
			latitude: number;
			locationLabel?: string | null;
			longitude: number;
			name: string;
			pageLabel?: string | null;
		}>;
	}) => (
		<div
			className={className}
			data-allow-drag={String(allowDrag ?? true)}
			data-auto-rotate={String(autoRotate ?? true)}
			data-focus={JSON.stringify(focus ?? null)}
			data-slot="mock-globe"
		>
			{visitors?.map((visitor) => (
				<div
					data-avatar-url={visitor.avatarUrl ?? ""}
					data-id={visitor.id}
					data-latitude={String(visitor.latitude)}
					data-location-label={visitor.locationLabel ?? ""}
					data-longitude={String(visitor.longitude)}
					data-name={visitor.name}
					data-page-label={visitor.pageLabel ?? ""}
					data-slot="mock-globe-visitor"
					key={visitor.id}
				/>
			))}
		</div>
	),
}));

mock.module("@/components/ui/layout/sidebars/visitor/utils", () => ({
	CountryFlag: ({ countryCode }: { countryCode: string }) => (
		<span>{countryCode}</span>
	),
	formatLocalTime: () => ({
		time: "2:30 PM",
		offset: "+07:00",
	}),
}));

const modulePromise = import("./detail-page-overlay");

const contact = {
	id: "contact-1",
	externalId: "crm_123",
	name: "Gorgeous Wolf",
	email: "wolf@example.com",
	image: "https://example.com/wolf.png",
	metadata: {
		plan: "pro",
		owner: "Anthony",
	},
	contactOrganizationId: "org-1",
	websiteId: "website-1",
	organizationId: "organization-1",
	userId: null,
	createdAt: "2026-01-10T10:00:00.000Z",
	updatedAt: "2026-03-01T09:30:00.000Z",
};

const heroVisitor = {
	id: "visitor-1",
	browser: "Chrome",
	browserVersion: "134.0",
	os: "macOS",
	osVersion: "15.0",
	device: "MacBook Pro",
	deviceType: "desktop",
	ip: "127.0.0.1",
	city: "Bangkok",
	region: "Bangkok",
	country: "Thailand",
	countryCode: "TH",
	latitude: 13.7563,
	longitude: 100.5018,
	language: "en-US",
	timezone: "Asia/Bangkok",
	screenResolution: "1728x1117",
	viewport: "1440x900",
	createdAt: "2026-01-10T10:00:00.000Z",
	updatedAt: "2026-03-01T09:30:00.000Z",
	lastSeenAt: "2026-03-05T14:45:00.000Z",
	websiteId: "website-1",
	organizationId: "organization-1",
	blockedAt: null,
	blockedByUserId: null,
	isBlocked: false,
	attribution: {
		version: 1 as const,
		firstTouch: {
			channel: "email" as const,
			isDirect: false,
			referrer: {
				url: "https://news.ycombinator.com/item",
				domain: "news.ycombinator.com",
			},
			landing: {
				url: "https://app.example.com/pricing?utm_source=launch_list&utm_medium=email&utm_campaign=april_launch&ttclid=ttclid_123",
				path: "/pricing",
				title: "Pricing | Cossistant",
			},
			utm: {
				source: "launch_list",
				medium: "email",
				campaign: "april_launch",
				content: null,
				term: null,
			},
			clickIds: {
				gclid: null,
				gbraid: null,
				wbraid: null,
				fbclid: null,
				msclkid: null,
				ttclid: "ttclid_123",
				li_fat_id: null,
				twclid: null,
			},
			capturedAt: "2026-03-01T09:30:00.000Z",
		},
	},
	currentPage: {
		url: "https://app.example.com/pricing?utm_source=launch_list&utm_medium=email&utm_campaign=april_launch&ttclid=ttclid_123",
		path: "/pricing",
		title: "Pricing | Cossistant",
		referrerUrl: "https://news.ycombinator.com/item",
		updatedAt: "2026-03-05T14:45:00.000Z",
	},
	contact,
};

const visitorSummaries = [
	{
		id: "visitor-1",
		lastSeenAt: "2026-03-05T14:45:00.000Z",
		createdAt: "2026-01-10T10:00:00.000Z",
		browser: "Chrome",
		device: "MacBook Pro",
		country: "Thailand",
		city: "Bangkok",
		language: "en-US",
		blockedAt: null,
		blockedByUserId: null,
		isBlocked: false,
	},
	{
		id: "visitor-2",
		lastSeenAt: "2026-02-28T10:00:00.000Z",
		createdAt: "2026-01-22T08:00:00.000Z",
		browser: "Safari",
		device: "iPhone",
		country: "Thailand",
		city: "Chiang Mai",
		language: "th",
		blockedAt: null,
		blockedByUserId: null,
		isBlocked: false,
	},
];

async function renderView(props: Record<string, unknown>) {
	const { ContactVisitorDetailView } = await modulePromise;

	return renderToStaticMarkup(
		<ContactVisitorDetailView
			contact={contact}
			deviceDetailsById={{
				"visitor-1": {
					deviceType: "desktop",
					ip: "127.0.0.1",
				},
				"visitor-2": {
					deviceType: "mobile",
					ip: "127.0.0.2",
				},
			}}
			heroVisitor={heroVisitor}
			isError={false}
			isLoading={false}
			leadVisitorSummary={visitorSummaries[0] ?? null}
			mode="contact"
			visitors={visitorSummaries}
			websiteSlug="website-1"
			{...props}
		/>
	);
}

describe("ContactVisitorDetailView", () => {
	it("renders the equal-width split layout with the flattened contact/device view", async () => {
		const html = await renderView({});

		expect(html).toContain('data-slot="contact-visitor-detail-overlay"');
		expect(html).toContain('data-slot="contact-visitor-detail-layout"');
		expect(html).toContain("grid-cols-1 lg:grid-cols-2");
		expect(html.match(/max-w-sm/g)?.length).toBe(3);
		expect(html).toContain("size-10 rounded-[2px]");
		expect(html).toContain('data-slot="contact-visitor-summary-copy"');
		expect(html).toContain('data-slot="contact-visitor-summary-location"');
		expect(html).toContain('data-slot="contact-visitor-summary-flag"');
		expect(html).toContain('data-slot="contact-visitor-summary-language"');
		expect(html).toContain('data-slot="contact-visitor-summary-time-of-day"');
		expect(html).toContain('data-slot="contact-visitor-summary-time"');
		expect(html).toContain(">Bangkok, Thailand<");
		expect(html).toContain(">TH<");
		expect(html).toContain(">English (United States)<");
		expect(html).toContain(">afternoon<");
		expect(html).toContain(">14:30<");
		expect(html).toContain("for them");
		expect(html).toContain('data-slot="visitor-source-badge"');
		expect(html).toContain("news.ycombinator.com");
		expect(html).toContain("Email");
		expect(html).toContain("wolf@example.com");
		expect(html).toContain("crm_123");
		expect(html).toContain("org-1");
		expect(html).toContain('data-slot="contact-visitor-detail-device-list"');
		expect(html).toContain('data-slot="contact-visitor-detail-metadata-panel"');
		expect(html).toContain("Devices (2)");
		expect(html).toContain("MacBook Pro • Chrome • 127.0.0.1");
		expect(html).toContain("iPhone • Safari • 127.0.0.2");
		expect(html).toContain('data-slot="visitor-attribution-group"');
		expect(html).toContain(">Hacker News<");
		expect(html).not.toContain(">Campaign<");
		expect(html).not.toContain(">Ad IDs<");
		expect(html).not.toContain("Lead device");
		expect(html).not.toContain("Contact details");
		expect(html).not.toContain("Overview");
		expect(html).not.toContain(">Back<");
		expect(html).not.toContain("translate-y-12");
		expect(html).toContain("Anthony");
		expect(html).toContain("pro");
		expect(html).toContain(
			'data-slot="contact-visitor-detail-mobile-globe-wrapper"'
		);
		expect(html).toContain(
			'data-slot="contact-visitor-detail-desktop-globe-wrapper"'
		);
		expect(html).toContain('data-slot="mock-globe"');
		expect(html).toContain('data-allow-drag="false"');
		expect(html).toContain('data-auto-rotate="false"');
		expect(html).toContain(
			'data-focus="{&quot;latitude&quot;:13.7563,&quot;longitude&quot;:100.5018}"'
		);
		expect(html).toContain('data-slot="mock-globe-visitor"');
		expect(html).toContain('data-id="visitor-1"');
		expect(html).toContain('data-avatar-url="https://example.com/wolf.png"');
		expect(html).toContain('data-name="Gorgeous Wolf"');
		expect(html).toContain('data-location-label="Bangkok, Thailand"');
		expect(html).toContain('data-page-label="/pricing"');
	});

	it("renders visitor mode with linked contact details on the right", async () => {
		const html = await renderView({
			mode: "visitor",
			visitors: [],
		});

		expect(html).toContain('data-mode="visitor"');
		expect(html).toContain('data-slot="contact-visitor-detail-metadata-panel"');
		expect(html).toContain("Email");
		expect(html).toContain("wolf@example.com");
		expect(html).toContain("crm_123");
	});

	it("renders visitor details instead of an empty contact state for anonymous visitors", async () => {
		const html = await renderView({
			contact: null,
			mode: "visitor",
			visitors: [],
		});

		expect(html).toContain('data-slot="contact-visitor-detail-visitor-panel"');
		expect(html).toContain("Browser");
		expect(html).toContain("Chrome / 134.0");
		expect(html).toContain("Local time");
		expect(html).not.toContain(
			"No contact is associated with this visitor yet."
		);
	});

	it("omits the globe when the hero visitor is missing part of the coordinate pair", async () => {
		const html = await renderView({
			heroVisitor: {
				...heroVisitor,
				latitude: null,
			},
		});

		expect(html).not.toContain(
			'data-slot="contact-visitor-detail-desktop-globe-wrapper"'
		);
		expect(html).not.toContain(
			'data-slot="contact-visitor-detail-mobile-globe-wrapper"'
		);
		expect(html).not.toContain('data-slot="mock-globe"');
	});

	it("renders loading, error, and empty states", async () => {
		const loadingHtml = await renderView({
			isLoading: true,
		});
		const errorHtml = await renderView({
			isError: true,
		});
		const emptyHtml = await renderView({
			contact: null,
			heroVisitor: null,
			leadVisitorSummary: null,
			visitors: [],
		});

		expect(loadingHtml).toContain("Loading details...");
		expect(errorHtml).toContain("Unable to load details");
		expect(emptyHtml).toContain("No details are available for this selection.");
	});
});

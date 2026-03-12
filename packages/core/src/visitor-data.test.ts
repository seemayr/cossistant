import { afterEach, describe, expect, it } from "bun:test";
import { buildAttributionSnapshot } from "./visitor-data";

const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"document"
);
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"window"
);

function installPage(params: {
	href: string;
	referrer: string;
	title: string;
}) {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			location: {
				href: params.href,
			},
		},
	});
	Object.defineProperty(globalThis, "document", {
		configurable: true,
		value: {
			referrer: params.referrer,
			title: params.title,
		},
	});
}

afterEach(() => {
	if (originalWindowDescriptor) {
		Object.defineProperty(globalThis, "window", originalWindowDescriptor);
	} else {
		Reflect.deleteProperty(globalThis, "window");
	}

	if (originalDocumentDescriptor) {
		Object.defineProperty(globalThis, "document", originalDocumentDescriptor);
	} else {
		Reflect.deleteProperty(globalThis, "document");
	}
});

describe("buildAttributionSnapshot", () => {
	it("captures UTMs and click IDs while sanitizing URLs", () => {
		installPage({
			href: "https://app.example.com/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_content=hero&utm_term=ai-support&fbclid=fbclid_123&ignore=secret#pricing",
			referrer: "https://google.com/search?q=cossistant&ved=123",
			title: "Pricing | Cossistant",
		});

		const snapshot = buildAttributionSnapshot("2026-03-12T10:00:00.000Z");

		expect(snapshot).not.toBeNull();
		expect(snapshot?.attribution.firstTouch.channel).toBe("email");
		expect(snapshot?.attribution.firstTouch.referrer.url).toBe(
			"https://google.com/search"
		);
		expect(snapshot?.attribution.firstTouch.utm).toEqual({
			source: "newsletter",
			medium: "email",
			campaign: "launch",
			content: "hero",
			term: "ai-support",
		});
		expect(snapshot?.attribution.firstTouch.clickIds.fbclid).toBe("fbclid_123");
		expect(snapshot?.currentPage.url).toBe(
			"https://app.example.com/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_content=hero&utm_term=ai-support&fbclid=fbclid_123"
		);
	});

	it("suppresses same-site self referrals and treats them as direct", () => {
		installPage({
			href: "https://app.example.com/docs",
			referrer: "https://www.app.example.com/pricing?utm_source=ignore-me",
			title: "Docs | Cossistant",
		});

		const snapshot = buildAttributionSnapshot("2026-03-12T10:00:00.000Z");

		expect(snapshot).not.toBeNull();
		expect(snapshot?.attribution.firstTouch.isDirect).toBe(true);
		expect(snapshot?.attribution.firstTouch.channel).toBe("direct");
		expect(snapshot?.attribution.firstTouch.referrer.domain).toBeNull();
		expect(snapshot?.currentPage.referrerUrl).toBeNull();
	});

	it("infers organic search from known search referrers without campaign params", () => {
		installPage({
			href: "https://app.example.com/blog/how-to-reduce-support-volume",
			referrer: "https://www.google.com/search?q=customer+support+widget",
			title: "How to Reduce Support Volume",
		});

		const snapshot = buildAttributionSnapshot("2026-03-12T10:00:00.000Z");

		expect(snapshot).not.toBeNull();
		expect(snapshot?.attribution.firstTouch.channel).toBe("organic_search");
		expect(snapshot?.attribution.firstTouch.isDirect).toBe(false);
		expect(snapshot?.attribution.firstTouch.referrer.domain).toBe("google.com");
		expect(snapshot?.attribution.firstTouch.landing.path).toBe(
			"/blog/how-to-reduce-support-volume"
		);
	});
});

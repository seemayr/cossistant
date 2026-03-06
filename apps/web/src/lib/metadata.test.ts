import { afterEach, describe, expect, it } from "bun:test";
import {
	blogCollection,
	createRootMetadata,
	DEFAULT_SITE_TITLE,
	TITLE_TEMPLATE,
	utilityNoindex,
} from "./metadata";

const originalPublicAppUrl = process.env.PUBLIC_APP_URL;

afterEach(() => {
	process.env.PUBLIC_APP_URL = originalPublicAppUrl;
});

describe("metadata builders", () => {
	it("keeps root title defaults and template stable", () => {
		const metadata = createRootMetadata();

		expect(metadata.title).toEqual({
			default: DEFAULT_SITE_TITLE,
			template: TITLE_TEMPLATE,
		});
	});

	it("builds absolute canonicals without mutating previous results", () => {
		process.env.PUBLIC_APP_URL = "https://example.com/";

		const first = blogCollection({
			title: "First page",
			description:
				"This description is intentionally long enough to pass the metadata builder tests without edge-case truncation concerns.",
			path: "/first",
		});
		const second = blogCollection({
			title: "Second page",
			description:
				"This description is also intentionally long enough to produce stable metadata output for the second builder call.",
			path: "/second",
		});

		expect(first.alternates?.canonical).toBe("https://example.com/first");
		expect(second.alternates?.canonical).toBe("https://example.com/second");
		expect(first.openGraph?.title).toBe("First page");
		expect(second.openGraph?.title).toBe("Second page");
		expect(createRootMetadata().openGraph?.title).toBe(DEFAULT_SITE_TITLE);
	});

	it("marks utility pages as noindex and nofollow", () => {
		process.env.PUBLIC_APP_URL = "https://example.com";

		const metadata = utilityNoindex({
			title: "Sign in",
			description:
				"Utility pages should be blocked from indexing while still receiving consistent canonical handling.",
			path: "/login",
		});

		expect(metadata.alternates?.canonical).toBe("https://example.com/login");
		expect(metadata.robots).toMatchObject({
			index: false,
			follow: false,
		});
	});

	it("allows crawlable paginated collections to be noindex", () => {
		process.env.PUBLIC_APP_URL = "https://example.com";

		const metadata = blogCollection({
			title: "Blog - Page 2",
			description:
				"Paginated collections should stay crawlable for discovery while remaining out of the index.",
			path: "/blog/page/2",
			noIndex: true,
			follow: true,
		});

		expect(metadata.robots).toMatchObject({
			index: false,
			follow: true,
		});
		expect(metadata.alternates?.canonical).toBe(
			"https://example.com/blog/page/2"
		);
	});
});

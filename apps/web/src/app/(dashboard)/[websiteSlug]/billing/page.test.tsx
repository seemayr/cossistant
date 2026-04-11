import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const ensureWebsiteAccessMock = mock((async () => ({
	website: {
		id: "site_1",
		organizationId: "org_1",
	},
})) as (...args: unknown[]) => Promise<unknown>);
const isPolarEnabledMock = mock(() => false);
const redirectMock = mock(() => {
	throw new Error("redirect");
});

mock.module("@/lib/auth/website-access", () => ({
	ensureWebsiteAccess: ensureWebsiteAccessMock,
}));

mock.module("@api/lib/billing-mode", () => ({
	isPolarEnabled: isPolarEnabledMock,
}));

mock.module("next/navigation", () => ({
	redirect: redirectMock,
}));

mock.module("next/link", () => ({
	default: ({
		children,
		href,
		...props
	}: {
		children: ReactNode;
		href: string;
	}) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

const modulePromise = import("./page");

describe("billing page self-hosted mode", () => {
	beforeEach(() => {
		ensureWebsiteAccessMock.mockReset();
		isPolarEnabledMock.mockReset();
		redirectMock.mockReset();

		ensureWebsiteAccessMock.mockResolvedValue({
			website: {
				id: "site_1",
				organizationId: "org_1",
			},
		});
		isPolarEnabledMock.mockReturnValue(false);
	});

	it("renders a billing-disabled message instead of redirecting to Polar", async () => {
		const BillingPage = (await modulePromise).default;
		const html = renderToStaticMarkup(
			await BillingPage({
				params: Promise.resolve({
					websiteSlug: "acme",
				}),
			})
		);

		expect(html).toContain("Billing Disabled");
		expect(html).toContain("Polar disabled");
		expect(html).toContain("/acme/settings/plan");
		expect(redirectMock).not.toHaveBeenCalled();
	});
});

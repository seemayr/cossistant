export type TestUiPageId = "composer" | "timeline";

export type TestUiPageDefinition = {
	id: TestUiPageId;
	href: `/test/ui/${string}`;
	navLabel: string;
	title: string;
	description: string;
};

export const TEST_UI_INDEX_PAGE = {
	href: "/test/ui",
	navLabel: "Index",
	title: "UI Test Index",
	description:
		"Internal sandbox pages for exercising shared Cossistant UI components.",
} as const;

export const TEST_UI_PAGE_DEFINITIONS = [
	{
		id: "composer",
		href: "/test/ui/composer",
		navLabel: "Composer",
		title: "Composer UI Test",
		description:
			"Inspect composer presets, optional states, and slot overrides without inbox data.",
	},
	{
		id: "timeline",
		href: "/test/ui/timeline",
		navLabel: "Timeline",
		title: "Timeline UI Test",
		description:
			"Compare dashboard and widget timeline rendering across message, activity, tool, and typing states.",
	},
] as const satisfies readonly TestUiPageDefinition[];

export type TestUiNavItem = {
	href: string;
	label: string;
};

export function getTestUiPageDefinition(
	pageId: TestUiPageId
): TestUiPageDefinition {
	const page = TEST_UI_PAGE_DEFINITIONS.find((entry) => entry.id === pageId);

	if (!page) {
		throw new Error(`Unknown test UI page: ${pageId}`);
	}

	return page;
}

export function getTestUiNavItems(): readonly TestUiNavItem[] {
	return [
		{
			href: TEST_UI_INDEX_PAGE.href,
			label: TEST_UI_INDEX_PAGE.navLabel,
		},
		...TEST_UI_PAGE_DEFINITIONS.map((page) => ({
			href: page.href,
			label: page.navLabel,
		})),
	];
}

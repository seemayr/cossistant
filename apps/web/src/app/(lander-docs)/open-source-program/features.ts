export type FeaturedOpenSourceProject = {
	id: string;
	name: string;
	websiteUrl: string;
	ogImageUrl: string;
};

export const FEATURED_OPEN_SOURCE_PROJECTS: FeaturedOpenSourceProject[] = [
	{
		id: "facehash",
		name: "Facehash",
		websiteUrl: "https://facehash.dev",
		ogImageUrl: "https://facehash.dev/og-image.png",
	},
	{
		id: "databuddy",
		name: "DataBuddy",
		websiteUrl: "https://databuddy.cc",
		ogImageUrl: "https://databuddy.cc/og-image.png",
	},
];

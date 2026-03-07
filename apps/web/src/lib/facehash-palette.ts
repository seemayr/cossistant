const COSSISTANT_FACEHASH_PALETTE = [
	{
		className: "dark:bg-cossistant-pink/90 bg-cossistant-pink/20",
		routeColor: "hsla(314, 100%, 85%, 1)",
	},
	{
		className: "dark:bg-cossistant-yellow/90 bg-cossistant-yellow/20",
		routeColor: "hsla(58, 92%, 79%, 1)",
	},
	{
		className: "dark:bg-cossistant-blue/90 bg-cossistant-blue/20",
		routeColor: "hsla(218, 91%, 78%, 1)",
	},
	{
		className: "dark:bg-cossistant-orange/90 bg-cossistant-orange/20",
		routeColor: "hsla(19, 99%, 50%, 1)",
	},
	{
		className: "dark:bg-cossistant-green/90 bg-cossistant-green/20",
		routeColor: "hsla(156, 86%, 64%, 1)",
	},
] as const;

export const COSSISTANT_FACEHASH_COLOR_CLASSES =
	COSSISTANT_FACEHASH_PALETTE.map((entry) => entry.className);

export const COSSISTANT_FACEHASH_ROUTE_COLORS_DARK =
	COSSISTANT_FACEHASH_PALETTE.map((entry) => entry.routeColor);

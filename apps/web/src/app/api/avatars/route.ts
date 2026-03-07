import { toFacehashHandler } from "facehash/next";
import { COSSISTANT_FACEHASH_ROUTE_COLORS_DARK } from "@/lib/facehash-palette";

export const { GET } = toFacehashHandler({
	colors: [...COSSISTANT_FACEHASH_ROUTE_COLORS_DARK],
	size: 200,
	variant: "gradient",
	showInitial: true,
});

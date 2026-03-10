"use client";

import { CossistantGlobe } from "@cossistant/globe/cossistant";
import { useTheme } from "next-themes";
import { usePresenceLocations } from "@/data/use-presence-locations";
import { cn } from "@/lib/utils";

export function LivePresenceGlobe({
	websiteSlug,
	minutes = 5,
	className,
}: {
	websiteSlug: string;
	minutes?: number;
	className?: string;
}) {
	const { resolvedTheme } = useTheme();
	const {
		data = [],
		isError,
		isLoading,
	} = usePresenceLocations({
		websiteSlug,
		minutes,
	});

	const totalEntities = data.reduce(
		(total, location) => total + location.entity_count,
		0
	);

	return (
		<div className={cn("relative overflow-hidden rounded-3xl", className)}>
			<CossistantGlobe
				className="min-h-[320px] bg-gradient-to-b from-background via-background to-muted/40"
				config={{
					dark: resolvedTheme === "dark" ? 1 : 0,
				}}
				style={{ minHeight: 320 }}
			>
				{data.map((location) => (
					<CossistantGlobe.Pin
						data={location}
						id={`presence:${location.latitude}:${location.longitude}`}
						key={`presence:${location.latitude}:${location.longitude}`}
						latitude={location.latitude}
						longitude={location.longitude}
						weight={location.entity_count}
					>
						<div className="rounded-full border border-white/20 bg-background/85 px-3 py-1 font-semibold text-[11px] shadow-lg backdrop-blur-sm">
							{location.entity_count}
						</div>
					</CossistantGlobe.Pin>
				))}
			</CossistantGlobe>

			<div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background via-background/80 to-transparent" />
			<div className="pointer-events-none absolute top-4 left-4 rounded-full border border-border/60 bg-background/85 px-3 py-1 font-medium text-muted-foreground text-xs backdrop-blur-sm">
				{isError
					? "Live presence unavailable"
					: isLoading && data.length === 0
						? "Syncing live presence..."
						: `${totalEntities} live users across ${data.length} locations`}
			</div>
		</div>
	);
}

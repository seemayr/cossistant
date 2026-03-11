"use client";

import { CossistantGlobe, type GlobeProps } from "@cossistant/globe/cossistant";
import { useTheme } from "next-themes";
import { Avatar } from "@/components/ui/avatar";
import { usePresenceLocations } from "@/data/use-presence-locations";
import { cn } from "@/lib/utils";

type StaticLocation = {
	id: string;
	latitude: number;
	longitude: number;
	avatarUrl?: string | null;
	fallbackName?: string;
};

type GlobeLocation = {
	id: string;
	latitude: number;
	longitude: number;
	avatarUrl?: string | null;
	entityCount?: number;
	fallbackName?: string;
	isStatic?: boolean;
};

type GlobeSceneProps = {
	className?: string;
	backgroundClassName?: string;
	darkMode: number;
	globeProps?: Omit<GlobeProps, "children">;
	locations: GlobeLocation[];
	showSummaryBadge: boolean;
	summaryBadgeContent?: string | null;
};

function LivePresenceGlobeScene({
	className,
	backgroundClassName,
	darkMode,
	globeProps,
	locations,
	showSummaryBadge,
	summaryBadgeContent,
}: GlobeSceneProps) {
	const {
		autoRotateSpeed: globeAutoRotateSpeed,
		className: globeClassName,
		clustering: globeClustering,
		config: globeConfig,
		style: globeStyle,
		...restGlobeProps
	} = globeProps ?? {};

	return (
		<div
			className={cn("relative overflow-hidden rounded-3xl", className)}
			data-slot="live-presence-globe"
		>
			<CossistantGlobe
				{...restGlobeProps}
				autoRotateSpeed={globeAutoRotateSpeed ?? 0}
				className={cn(
					"min-h-[320px] bg-gradient-to-b from-background via-background to-muted/40",
					backgroundClassName,
					globeClassName
				)}
				clustering={
					globeClustering ?? (locations.length <= 1 ? false : undefined)
				}
				config={{
					dark: darkMode,
					...(globeConfig ?? {}),
				}}
				style={{ minHeight: 320, ...(globeStyle ?? {}) }}
			>
				{locations.map((location) => (
					<CossistantGlobe.Pin
						clusterable={!location.isStatic}
						id={location.id}
						key={location.id}
						latitude={location.latitude}
						longitude={location.longitude}
						weight={location.entityCount}
					>
						{location.isStatic ? (
							location.avatarUrl || location.fallbackName ? (
								<span
									className="inline-flex items-center justify-center rounded-[2px] bg-background p-1 shadow-[0_10px_24px_rgba(15,23,42,0.18)] backdrop-blur-sm"
									data-slot="live-presence-globe-static-avatar-pin"
								>
									<Avatar
										className="size-6 rounded-[2px] ring-1 ring-white ring-offset-0"
										fallbackName={location.fallbackName ?? "Visitor"}
										tooltipContent={null}
										url={location.avatarUrl}
									/>
								</span>
							) : (
								<span
									className="block size-3 rounded-full border border-white/45 bg-background/85 shadow-[0_0_0_6px_rgba(255,255,255,0.08)] backdrop-blur-sm"
									data-slot="live-presence-globe-static-pin"
								/>
							)
						) : (
							<div
								className="rounded-full border border-white/20 bg-background/85 px-3 py-1 font-semibold text-[11px] shadow-lg backdrop-blur-sm"
								data-slot="live-presence-globe-live-pin"
							>
								{location.entityCount}
							</div>
						)}
					</CossistantGlobe.Pin>
				))}
			</CossistantGlobe>

			<div
				className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background via-background/80 to-transparent"
				data-slot="live-presence-globe-bottom-fade"
			/>
			{showSummaryBadge && summaryBadgeContent ? (
				<div
					className="pointer-events-none absolute top-4 left-4 rounded-full border border-border/60 bg-background/85 px-3 py-1 font-medium text-muted-foreground text-xs backdrop-blur-sm"
					data-slot="live-presence-globe-summary-badge"
				>
					{summaryBadgeContent}
				</div>
			) : null}
		</div>
	);
}

function StaticLocationGlobe({
	className,
	backgroundClassName,
	darkMode,
	globeProps,
	showSummaryBadge,
	staticLocations,
}: {
	className?: string;
	backgroundClassName?: string;
	darkMode: number;
	globeProps?: Omit<GlobeProps, "children">;
	showSummaryBadge: boolean;
	staticLocations: StaticLocation[];
}) {
	const focusedLocation =
		staticLocations.length === 1 ? staticLocations[0] : undefined;
	const resolvedGlobeProps =
		focusedLocation && !globeProps?.focusOn
			? {
					...globeProps,
					focusOn: {
						latitude: focusedLocation.latitude,
						longitude: focusedLocation.longitude,
					},
				}
			: globeProps;

	return (
		<LivePresenceGlobeScene
			backgroundClassName={backgroundClassName}
			className={className}
			darkMode={darkMode}
			globeProps={resolvedGlobeProps}
			locations={staticLocations.map((location) => ({
				avatarUrl: location.avatarUrl,
				...location,
				fallbackName: location.fallbackName,
				isStatic: true,
			}))}
			showSummaryBadge={showSummaryBadge}
			summaryBadgeContent={
				staticLocations.length === 1
					? "1 selected location"
					: `${staticLocations.length} selected locations`
			}
		/>
	);
}

function DynamicPresenceGlobe({
	className,
	backgroundClassName,
	darkMode,
	globeProps,
	minutes,
	showSummaryBadge,
	websiteSlug,
}: {
	className?: string;
	backgroundClassName?: string;
	darkMode: number;
	globeProps?: Omit<GlobeProps, "children">;
	minutes: number;
	showSummaryBadge: boolean;
	websiteSlug: string;
}) {
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
		<LivePresenceGlobeScene
			backgroundClassName={backgroundClassName}
			className={className}
			darkMode={darkMode}
			globeProps={globeProps}
			locations={data.map((location) => ({
				entityCount: location.entity_count,
				id: `presence:${location.latitude}:${location.longitude}`,
				latitude: location.latitude,
				longitude: location.longitude,
			}))}
			showSummaryBadge={showSummaryBadge}
			summaryBadgeContent={
				isError
					? "Live presence unavailable"
					: isLoading && data.length === 0
						? "Syncing live presence..."
						: `${totalEntities} live users across ${data.length} locations`
			}
		/>
	);
}

export function LivePresenceGlobe({
	websiteSlug,
	minutes = 5,
	backgroundClassName,
	className,
	globeProps,
	staticLocations,
	showSummaryBadge = true,
}: {
	websiteSlug: string;
	minutes?: number;
	backgroundClassName?: string;
	className?: string;
	globeProps?: Omit<GlobeProps, "children">;
	staticLocations?: StaticLocation[];
	showSummaryBadge?: boolean;
}) {
	const { resolvedTheme } = useTheme();
	const darkMode = resolvedTheme === "dark" ? 1 : 0;

	if (staticLocations) {
		return (
			<StaticLocationGlobe
				backgroundClassName={backgroundClassName}
				className={className}
				darkMode={darkMode}
				globeProps={globeProps}
				showSummaryBadge={showSummaryBadge}
				staticLocations={staticLocations}
			/>
		);
	}

	return (
		<DynamicPresenceGlobe
			backgroundClassName={backgroundClassName}
			className={className}
			darkMode={darkMode}
			globeProps={globeProps}
			minutes={minutes}
			showSummaryBadge={showSummaryBadge}
			websiteSlug={websiteSlug}
		/>
	);
}

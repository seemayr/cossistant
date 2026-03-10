"use client";

import { Globe } from "../globe";
import { GlobePin as GlobePinComponent } from "../pin";
import type { GlobeCluster, GlobeConfig, GlobeProps } from "../types";

type CossistantGlobeCompoundComponent = ((
	props: GlobeProps
) => React.JSX.Element) & {
	Pin: typeof GlobePinComponent;
};

export const COSSISTANT_GLOBE_CONFIG: Partial<GlobeConfig> = {
	mapBrightness: 1.2,
	mapBaseBrightness: 0.15,
	baseColor: [1, 1, 1],
	markerColor: [218 / 255, 91 / 255, 68 / 255],
	glowColor: [1, 1, 1],
	diffuse: 0.4,
	dark: 0,
};

export function renderCossistantCluster(cluster: GlobeCluster) {
	return (
		<div
			style={{
				display: "inline-flex",
				minWidth: "2.25rem",
				height: "2.25rem",
				alignItems: "center",
				justifyContent: "center",
				padding: "0 0.75rem",
				borderRadius: "999px",
				background:
					"linear-gradient(135deg, rgba(218, 91, 68, 0.95), rgba(233, 127, 75, 0.92))",
				border: "1px solid rgba(255, 255, 255, 0.28)",
				color: "white",
				fontSize: "0.75rem",
				fontWeight: 700,
				lineHeight: 1,
				boxShadow: "0 14px 34px rgba(218, 91, 68, 0.28)",
				whiteSpace: "nowrap",
			}}
		>
			{cluster.count}
		</div>
	);
}

function CossistantGlobeBase(props: GlobeProps) {
	const clustering =
		props.clustering === false
			? false
			: {
					...(props.clustering ?? {}),
					renderCluster:
						props.clustering?.renderCluster ?? renderCossistantCluster,
				};

	return (
		<Globe
			{...props}
			clustering={clustering}
			config={{
				...COSSISTANT_GLOBE_CONFIG,
				...(props.config ?? {}),
			}}
		/>
	);
}

export const CossistantGlobe = Object.assign(CossistantGlobeBase, {
	Pin: GlobePinComponent,
}) as CossistantGlobeCompoundComponent;

export { GlobePin } from "../pin";
export type {
	GlobeCluster,
	GlobeConfig,
	GlobeMarker,
	GlobeProps,
} from "../types";

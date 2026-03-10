import {
	Children,
	Fragment,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react";
import { DEFAULT_MARKER_SIZE } from "../defaults";
import { GlobePin } from "../pin";
import type { GlobeClusterMember, GlobePinProps } from "../types";

export interface NormalizedPin extends GlobeClusterMember {}

export function extractPins(children: ReactNode) {
	const pins: NormalizedPin[] = [];
	visit(children, pins);
	return pins;
}

function visit(children: ReactNode, pins: NormalizedPin[]) {
	Children.forEach(children, (child) => {
		if (!isValidElement(child)) {
			return;
		}

		if (child.type === Fragment) {
			const fragmentChild = child as ReactElement<{ children?: ReactNode }>;
			visit(fragmentChild.props.children, pins);
			return;
		}

		if (child.type !== GlobePin) {
			return;
		}

		const props = child.props as GlobePinProps;
		pins.push({
			id: props.id,
			latitude: props.latitude,
			longitude: props.longitude,
			children: props.children,
			clusterable: props.clusterable ?? true,
			data: props.data,
			weight: props.weight ?? 1,
			markerSize: props.markerSize ?? DEFAULT_MARKER_SIZE,
			markerColor: props.markerColor,
		});
	});
}

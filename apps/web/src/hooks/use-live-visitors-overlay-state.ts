"use client";

import { parseAsString, useQueryState } from "nuqs";

export const LIVE_VISITORS_OVERLAY_PARAM_KEY = "live";
export const LIVE_VISITORS_OVERLAY_PARAM_VALUE = "visitors";

export function useLiveVisitorsOverlayState() {
	const [liveOverlayParam, setLiveOverlayParam] = useQueryState(
		LIVE_VISITORS_OVERLAY_PARAM_KEY,
		parseAsString
	);

	return {
		isOpen: liveOverlayParam === LIVE_VISITORS_OVERLAY_PARAM_VALUE,
		openLiveVisitorsOverlay: () =>
			setLiveOverlayParam(LIVE_VISITORS_OVERLAY_PARAM_VALUE),
		closeLiveVisitorsOverlay: () => setLiveOverlayParam(null),
	};
}

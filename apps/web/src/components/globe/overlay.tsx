"use client";

import type * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import type { ResolvedGlobeVisitor } from "./model";

type AnchorStyle = React.CSSProperties & {
	positionAnchor?: string;
};

function GlobeVisitorPin({ visitor }: { visitor: ResolvedGlobeVisitor }) {
	const style: AnchorStyle = {
		bottom: "anchor(top)",
		left: "anchor(center)",
		opacity: `var(--cobe-visible-${visitor.id}, 0)`,
		position: "absolute",
		positionAnchor: `--cobe-${visitor.id}`,
	};

	return (
		<div
			className="pointer-events-none"
			data-slot="globe-visitor-pin"
			style={style}
		>
			<Avatar
				className="size-9 border border-background/80 bg-background shadow-lg ring-1 ring-black/10 dark:ring-white/10"
				facehashSeed={visitor.facehashSeed}
				fallbackName={visitor.name}
				status={visitor.status}
				tooltipContent={null}
				url={visitor.avatarUrl}
			/>
		</div>
	);
}

export function GlobeVisitorOverlay({
	visitors,
}: {
	visitors: readonly ResolvedGlobeVisitor[];
}) {
	return visitors.map((visitor) => (
		<GlobeVisitorPin key={visitor.id} visitor={visitor} />
	));
}

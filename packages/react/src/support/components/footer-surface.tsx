"use client";

import type * as React from "react";
import { useSupportSlotOverrides } from "../context/slot-overrides";
import { cn } from "../utils";

export type FooterSurfaceProps = {
	className?: string;
	children?: React.ReactNode;
	page?: string;
};

export function FooterSurface({
	className,
	children,
	page,
}: FooterSurfaceProps): React.ReactElement {
	const { slots, slotProps } = useSupportSlotOverrides();
	const FooterSlot = slots.footer;
	const footerSlotProps = slotProps.footer;

	if (FooterSlot) {
		return (
			<FooterSlot
				{...footerSlotProps}
				className={cn(footerSlotProps?.className, className)}
				data-page={page}
				data-slot="footer"
				page={page}
			>
				{children}
			</FooterSlot>
		);
	}

	return (
		<div className={className} data-page={page} data-slot="footer">
			{children}
		</div>
	);
}

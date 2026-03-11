"use client";

import type * as React from "react";
import { cn } from "../../support/utils";
import { TriggerRefProvider } from "../context/positioning";

export type RootProps = {
	className?: string;
	children: React.ReactNode;
};

export const Root: React.FC<RootProps> = ({ className, children }) => (
	<TriggerRefProvider>
		<div className={cn("cossistant co-animate-fade-in relative", className)}>
			{children}
		</div>
	</TriggerRefProvider>
);

"use client";

import { SupportProvider } from "@cossistant/react";

export function CossistantProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	return <SupportProvider>{children}</SupportProvider>;
}

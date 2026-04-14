"use client";

import { SupportTextProvider } from "@cossistant/react/support/text";
import type React from "react";

export function FakeSupportTextProvider({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	return <SupportTextProvider>{children}</SupportTextProvider>;
}

export { useSupportText } from "@cossistant/react/support/text";

"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
} from "@/components/ui/layout/settings-layout";

type SettingsErrorPageProps = {
	error: Error & { digest?: string };
	reset: () => void;
};

export default function SettingsErrorPage({
	error,
	reset,
}: SettingsErrorPageProps) {
	useEffect(() => {
		console.error("agent settings route error", error);
	}, [error]);

	return (
		<SettingsPage>
			<SettingsHeader>Agent settings</SettingsHeader>
			<PageContent className="py-30">
				<SettingsRow
					description="Something went wrong while loading this settings view."
					title="Unable to load"
				>
					<div className="flex items-center justify-between gap-4 p-4">
						<p className="text-muted-foreground text-sm">
							Try reloading this section.
						</p>
						<Button onClick={() => reset()} type="button">
							Retry
						</Button>
					</div>
				</SettingsRow>
			</PageContent>
		</SettingsPage>
	);
}

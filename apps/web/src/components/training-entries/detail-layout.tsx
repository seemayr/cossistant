"use client";

import type { ReactNode } from "react";
import {
	PageContent,
	PageHeader,
	PageHeaderTitle,
} from "@/components/ui/layout";
import { SettingsPage } from "@/components/ui/layout/settings-layout";

type TrainingEntryDetailLayoutProps = {
	backHref: string;
	title: string;
	children: ReactNode;
};

export function TrainingEntryDetailLayout({
	backHref,
	title,
	children,
}: TrainingEntryDetailLayoutProps) {
	return (
		<SettingsPage>
			<PageHeader
				className="border-b bg-background pr-3 pl-4 text-sm 2xl:border-transparent 2xl:bg-transparent dark:bg-background-50 dark:2xl:border-transparent 2xl:dark:bg-transparent"
				defaultBackPath={backHref}
			>
				<div className="min-w-0 flex-1">
					<PageHeaderTitle className="truncate text-sm">
						{title}
					</PageHeaderTitle>
				</div>
			</PageHeader>
			<PageContent className="px-4 py-8 pt-20">{children}</PageContent>
		</SettingsPage>
	);
}

export type { TrainingEntryDetailLayoutProps };

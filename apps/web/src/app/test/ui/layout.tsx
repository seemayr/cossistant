import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TestUiNav } from "@/components/test-ui/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { utilityNoindex } from "@/lib/metadata";

export const metadata: Metadata = utilityNoindex({
	title: "UI Test",
	description:
		"Internal sandbox pages for exercising shared Cossistant UI components.",
	path: "/test/ui",
});

export default function TestUiLayout({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-background dark:bg-background-100">
			<div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6 p-6">
				<header className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/80 px-5 py-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-1">
						<p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]">
							UI Tests
						</p>
						<h1 className="font-semibold text-2xl tracking-tight">
							Component sandboxes for fast visual checks
						</h1>
					</div>
					<div className="flex flex-col gap-3 sm:items-end">
						<TestUiNav />
						<div
							className="flex items-center gap-2 self-start sm:self-end"
							data-test-ui-page-theme-toggle="true"
						>
							<p className="text-muted-foreground text-sm">Page Theme</p>
							<ThemeToggle />
						</div>
					</div>
				</header>
				{children}
			</div>
		</div>
	);
}

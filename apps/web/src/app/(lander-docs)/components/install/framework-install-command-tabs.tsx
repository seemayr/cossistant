"use client";

import * as React from "react";
import { CodeBlockCommand } from "@/components/code-block-command";
import { Logos } from "@/components/ui/logos";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	getSupportInstallCommands,
	type SupportIntegrationFramework,
} from "@/lib/support-integration-guide";

const FRAMEWORK_OPTIONS: {
	value: SupportIntegrationFramework;
	label: string;
	icon: React.ComponentType<React.HTMLAttributes<SVGElement>>;
}[] = [
	{
		value: "nextjs",
		label: "Next.js",
		icon: Logos.nextjs,
	},
	{
		value: "react",
		label: "React",
		icon: Logos.react,
	},
];

type FrameworkInstallCommandTabsProps = {
	version?: string;
};

export function FrameworkInstallCommandTabs({
	version,
}: FrameworkInstallCommandTabsProps) {
	const [framework, setFramework] =
		React.useState<SupportIntegrationFramework>("nextjs");

	const installCommands = React.useMemo(
		() => getSupportInstallCommands(framework, version),
		[framework, version]
	);

	return (
		<Tabs
			className="flex flex-col gap-2"
			onValueChange={(value) =>
				setFramework(value as SupportIntegrationFramework)
			}
			value={framework}
		>
			<TabsList className="justify-start gap-4 bg-transparent p-0">
				{FRAMEWORK_OPTIONS.map(({ value, label, icon: Icon }) => (
					<TabsTrigger
						className="h-8 flex-none gap-2 px-0 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
						key={value}
						value={value}
					>
						<Icon className="size-3.5 fill-current" />
						{label}
					</TabsTrigger>
				))}
			</TabsList>
			<div className="bg-background-100">
				<CodeBlockCommand
					__bun__={installCommands.bun}
					__npm__={installCommands.npm}
					__pnpm__={installCommands.pnpm}
					__yarn__={installCommands.yarn}
				/>
			</div>
		</Tabs>
	);
}

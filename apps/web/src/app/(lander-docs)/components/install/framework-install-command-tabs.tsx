"use client";

import * as React from "react";
import { CodeBlockCommand } from "@/components/code-block-command";
import { Logos } from "@/components/ui/logos";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
		<div className="flex flex-col">
			<div className="flex items-center px-1 py-1">
				<Select
					onValueChange={(value) =>
						setFramework(value as SupportIntegrationFramework)
					}
					value={framework}
				>
					<SelectTrigger
						aria-label="Select framework"
						className="w-[112px] border-transparent bg-transparent px-[9px] shadow-none dark:bg-transparent"
						size="sm"
					>
						<SelectValue placeholder="Select framework" />
					</SelectTrigger>
					<SelectContent alignOffset={-3}>
						{FRAMEWORK_OPTIONS.map(({ value, label, icon: Icon }) => (
							<SelectItem key={value} value={value}>
								<Icon className="size-3.5 fill-current" />
								{label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="border border-primary/10 border-dashed bg-background-100">
				<CodeBlockCommand
					__bun__={installCommands.bun}
					__npm__={installCommands.npm}
					__pnpm__={installCommands.pnpm}
					__yarn__={installCommands.yarn}
				/>
			</div>
		</div>
	);
}

import Link from "next/link";
import { ComponentPreview } from "@/components/component-preview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FullWidthBorder } from "../full-width-border";
import { FrameworkInstallCommandTabs } from "./framework-install-command-tabs";

export const Install = () => (
	<section
		className="relative flex flex-col gap-6 md:h-[calc(100vh-20px)] md:gap-12"
		suppressHydrationWarning
	>
		<FullWidthBorder className="top-0" />

		<div className="flex w-full flex-1 flex-col-reverse justify-stretch gap-0 lg:flex-row">
			<div className="h-full w-full flex-1 border-dashed pt-4 lg:border-r dark:bg-background-100">
				<ComponentPreview
					name="support"
					sizeClasses="min-h-[450px] md:min-h-[730px]"
				/>
			</div>
			<div
				className={cn(
					"relative flex flex-col justify-center gap-4 px-4 py-16 lg:w-1/2 lg:px-8 xl:px-12"
				)}
			>
				<p className="font-mono text-primary/70 text-xs">
					[For React + Next.js]
				</p>
				<h2 className="w-full max-w-3xl text-pretty font-f37-stout text-4xl md:text-balance md:text-4xl">
					Add a support AI agent to your app in one command.
				</h2>
				<p className="w-5/6 max-w-3xl text-pretty text-primary/70">
					Not a separate tool. Not a generic widget. Support AI agent that lives
					in your product and learns how your team works.
				</p>
				<div className="mt-6 lg:w-5/6">
					<FrameworkInstallCommandTabs />
				</div>
				<div className="mt-6 flex w-full flex-row gap-3 md:max-w-[75%] md:gap-6 lg:max-w-full lg:items-center">
					<Button
						asChild
						className="h-12 border border-transparent font-medium text-md has-[>svg]:px-4 lg:w-[250px]"
					>
						<Link href="/sign-up">Install Cossistant</Link>
					</Button>
					<Button
						asChild
						className="h-12 border border-transparent font-medium text-md has-[>svg]:px-4"
						variant="ghost"
					>
						<Link href="/docs">Read the docs</Link>
					</Button>
				</div>
			</div>
		</div>
		<FullWidthBorder className="bottom-0" />
	</section>
);

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
			<div
				className={cn(
					"relative flex flex-col justify-center gap-4 border-dashed p-4 py-20 lg:border-r"
				)}
			>
				<p className="font-mono text-primary/70 text-xs">{"<Support />"}</p>
				<h2 className="w-full max-w-3xl text-pretty font-f37-stout text-4xl md:text-balance md:text-4xl">
					Support widget built for NextJS and React
				</h2>
				<p className="w-5/6 max-w-3xl text-pretty text-primary/70">
					Meet Cossistant, the programmatic support platform that matches
					shadcn/ui philosophy. React components, production-ready blocks,
					styled with Tailwind CSS.
				</p>
				<div className="mt-6 lg:w-5/6">
					<FrameworkInstallCommandTabs />
				</div>
				<div className="mt-6 flex w-full flex-row gap-3 md:max-w-[75%] md:gap-6 lg:max-w-full lg:items-center">
					<Button
						asChild
						className="h-12 border border-transparent font-medium text-md has-[>svg]:px-4 lg:w-[250px]"
					>
						<Link href="/sign-up">Start integration now</Link>
					</Button>
					<Button
						asChild
						className="h-12 border border-transparent font-medium text-md has-[>svg]:px-4"
						variant="ghost"
					>
						<Link href="/docs">See the docs first</Link>
					</Button>
				</div>
			</div>
			<div className="h-full w-full flex-1 pt-4 dark:bg-background-100">
				<ComponentPreview
					name="support"
					sizeClasses="min-h-[450px] md:min-h-[730px]"
				/>
			</div>
		</div>
		<FullWidthBorder className="bottom-0" />
	</section>
);

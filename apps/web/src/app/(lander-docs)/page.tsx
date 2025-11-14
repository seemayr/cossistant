import { SupportConfig } from "@cossistant/react/support-config";
import Link from "next/link";
import { FakeDashboard } from "@/components/landing/fake-dashboard";
import { Button } from "@/components/ui/button";
import { Logos } from "@/components/ui/logos";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { AnimationControls } from "./components/animation-controls";
import { Benefits } from "./components/benefits";
import { BrowserWithBackground } from "./components/browser-with-background";
import { GitHubLink } from "./components/github-link";
import { Install } from "./components/install";

export const dynamic = "force-dynamic";

export default async function Landing() {
	return (
		<>
			<SupportConfig
				defaultMessages={[
					{
						content: "Hi, liking Cossistant so far? How can I help you today?",
						senderType: "team_member",
					},
				]}
			/>
			<div className="flex flex-col gap-8 pt-32 md:flex-row lg:min-h-screen">
				<div className="flex flex-1 flex-col gap-6">
					{/* <EscapeIframeAnimation /> */}
					<div className="flex flex-col items-start gap-4 px-4 pb-8">
						<p className="font-mono text-primary/70 text-xs">
							[Programmatic Human + AI agent support your users love]
						</p>
						<h1 className="max-w-3xl text-balance text-left font-f37-stout text-[36px] leading-tight md:text-3xl xl:text-5xl">
							Add customer support to your SaaS under 10 lines of code.
						</h1>
						{/* <h3 className="w-full text-balance text-left text-[18px] text-primary/70 md:max-w-[75%] md:text-lg lg:max-w-full">
              Human + AI agent support your users love in under 10 lines of
              code.
            </h3> */}
						<div className="mt-6 flex w-full flex-col gap-3 md:max-w-[75%] md:gap-6 lg:max-w-full lg:flex-row lg:items-center">
							<Link href="/signup">
								<Button className="h-12 w-full border border-transparent font-medium text-md has-[>svg]:px-4 lg:w-[250px]">
									Create your account
								</Button>
							</Link>
							<GitHubLink
								className="h-12 w-full justify-between px-4 font-medium text-md lg:w-[250px]"
								variant="secondary"
							>
								Star us on GitHub
							</GitHubLink>
						</div>
						<p className="text-balance text-center font-mono text-primary/70 text-xs md:text-left">
							Ship AI-assisted support with human oversight today—no waiting
							required.
						</p>
					</div>
					<BrowserWithBackground containerClassName="w-full border-primary/10 border-y border-dashed hidden lg:block">
						<div className="fake-dashboard-container">
							<FakeDashboard />
						</div>
					</BrowserWithBackground>
					<div className="mt-10 flex w-full flex-col-reverse items-center justify-center gap-10 px-6 lg:mt-auto lg:flex-row lg:justify-between lg:px-4">
						<div className="flex items-center gap-2">
							<p className="font-mono text-foreground/60 text-xs">
								Works well with
							</p>
							<TooltipOnHover content="React">
								<Link href="https://react.dev" target="_blank">
									<Logos.react className="size-4" />
								</Link>
							</TooltipOnHover>
							<TooltipOnHover content="Next.js">
								<Link href="https://nextjs.org" target="_blank">
									<Logos.nextjs className="size-4" />
								</Link>
							</TooltipOnHover>
							<TooltipOnHover content="Tailwind">
								<Link href="https://tailwindcss.com" target="_blank">
									<Logos.tailwind className="size-4" />
								</Link>
							</TooltipOnHover>
							<TooltipOnHover content="Shadcn/UI">
								<Link href="https://ui.shadcn.com" target="_blank">
									<Logos.shadcn className="size-4" />
								</Link>
							</TooltipOnHover>
						</div>
						<AnimationControls />
					</div>
				</div>
			</div>
			<Install />
			<Benefits />
		</>
	);
}

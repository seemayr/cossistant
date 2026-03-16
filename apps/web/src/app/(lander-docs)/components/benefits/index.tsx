import { cn } from "@/lib/utils";
import { AiAgentsGraphic } from "./ai-agents";
import { ContextGraphic } from "./context";
import { HumanAiGraphic } from "./human-ai";
import { PromptToneGraphic } from "./prompt-tone";
import { SelfLearningGraphic } from "./self-learning";
import { CustomToolsGraphic } from "./tools";

export const HEADLINE =
	"Wake up to zero support tickets, Cossistant keeps your users happy while you sleep.";

const benefits = [
	{
		children: HumanAiGraphic,
		className: "lg:col-span-3",
		title: (
			<>
				<span className="group/title text-cossistant-green">Human + AI</span>{" "}
				support
			</>
		),
		description:
			"AI agents don’t just spit answers, they join the conversation like a teammate, talking naturally and handing off smoothly when a human needs to step in.",
	},
	{
		children: AiAgentsGraphic,
		className: "lg:col-span-3",
		title: (
			<>
				24/7 autonomous <span className="text-cossistant-green">AI agents</span>
			</>
		),
		description:
			"Agents handle questions around the clock across time zones, cutting response times to seconds without needing extra staff.",
	},
	{
		children: ContextGraphic,
		className: "lg:col-span-3",
		title: (
			<>
				<span className="text-cossistant-green">Context-aware</span> replies
			</>
		),
		description:
			"Agents read app logs, errors, user actions, past conversations and knowledge base to deliver precise answers—no generic chatbot fluff.",
	},
	{
		children: SelfLearningGraphic,
		className: "lg:col-span-3",
		title: (
			<>
				<span className="text-cossistant-green">Self-learning</span> knowledge
				base
			</>
		),
		description:
			"Cossistant crawls your docs, resources and conversations to auto-build FAQs, improving agents answers as your product and support evolves.",
	},
	{
		children: CustomToolsGraphic,
		className: "lg:col-span-3",
		title: (
			<>
				Default & <span className="text-cossistant-green">Custom</span> tools
			</>
		),
		description:
			"Out-of-the-box support for tools like Linear to log tickets, Stripe to check subscriptions, and Cal.com to book calls, plus the freedom to wire up your own APIs for truly custom actions.",
	},
	{
		children: PromptToneGraphic,
		className: "lg:col-span-3",
		title: (
			<>
				<span className="text-cossistant-green">Control</span> prompt & tone
			</>
		),
		description:
			"Set the model, prompt, and personality of your agent. Make it formal, funny, or straight to the point — you’re in charge.",
	},
] as const;

export const Benefits = () => (
	<section className="mt-40 mb-0 grid gap-6 md:gap-12 lg:my-60">
		<div className="flex flex-col gap-2 px-4">
			<p className="font-mono text-primary/70 text-xs">
				[Support your customers faster with your own AI agent]
			</p>
			<h2 className="w-full max-w-2xl text-pretty font-f37-stout text-4xl sm:text-3xl md:text-balance md:text-4xl">
				{HEADLINE}
			</h2>
		</div>
		<div className="isolate grid gap-0 border-b-0 border-dashed lg:grid-cols-6 lg:border-y">
			{benefits.map((benefit, index) => (
				<div
					className={cn(
						"relative flex flex-col gap-2 overflow-hidden border-dashed p-4 pt-20 sm:p-8 sm:pt-16",
						benefit.className,
						// Add border-right for first column items (index 0, 2, 4)
						index % 2 === 0 && "border-r",
						// Add border-bottom for all items except last row (index 0, 1, 2, 3)
						index < 4 && "border-b"
					)}
					key={benefit.description}
				>
					<div className="relative z-10 h-64 w-full">
						{benefit.children && <benefit.children />}
					</div>
					<h3 className="z-10 mt-4 font-semibold text-xl">{benefit.title}</h3>
					<p className="w-full max-w-lg text-balance text-muted-foreground">
						{benefit.description}
					</p>
				</div>
			))}
		</div>
	</section>
);

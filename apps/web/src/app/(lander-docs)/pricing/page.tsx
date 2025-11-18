import { FEATURE_CONFIG, PLAN_CONFIG } from "@api/lib/plans/config";
import { Check, Sparkles, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	EARLY_BIRD_DISCOUNT_ID,
	formatDiscountOffer,
	isDiscountAvailable,
} from "@/lib/discount-utils";
import { getQueryClient, trpc } from "@/lib/trpc/server";
import { cn } from "@/lib/utils";

export const revalidate = 3600;

export const metadata: Metadata = {
	title: "Pricing | Cossistant",
	description:
		"Pick the Cossistant plan that keeps your support fast — with limits and pricing straight from our live configuration.",
	openGraph: {
		title: "Cossistant Pricing",
		description:
			"Compare Free and Hobby plans, see what's included, and catch our current launch offer.",
	},
};

function formatLimit(value: number | null): string {
	if (value === null) {
		return "Unlimited";
	}
	return value.toLocaleString();
}

function featureValueLabel(
	key: keyof typeof FEATURE_CONFIG,
	value: number | null
): string {
	switch (key) {
		case "conversation-retention":
			return value === null ? "Full history" : `${value} days`;
		case "team-members":
			return value === null ? "Unlimited" : `${value} seats`;
		default:
			return formatLimit(value);
	}
}

export default async function PricingPage() {
	const queryClient = getQueryClient();

	let discount: Awaited<
		ReturnType<typeof trpc.plan.getDiscountInfo.fetch>
	> | null = null;

	try {
		discount = await queryClient.fetchQuery(
			trpc.plan.getDiscountInfo.queryOptions({
				discountId: EARLY_BIRD_DISCOUNT_ID,
			})
		);
	} catch (error) {
		discount = null;
	}

	const hasDiscount = discount && isDiscountAvailable(discount);
	const plans = Object.values(PLAN_CONFIG);
	const features = Object.values(FEATURE_CONFIG);

	return (
		<div className="py-32">
			<section className="space-y-6 text-center">
				<Badge className="gap-2" variant="secondary">
					<Sparkles className="size-4" />
					Transparent pricing, server rendered
				</Badge>
				<h1 className="text-balance font-f37-stout text-4xl leading-[1.1] tracking-tight md:text-5xl">
					Flexible plans built for fast support teams
				</h1>
				<p className="mx-auto max-w-2xl text-balance text-primary/70">
					Pricing and limits stay in sync with our API configuration so what you
					see here is exactly what your workspace gets.
				</p>
				<div className="flex flex-wrap items-center justify-center gap-3">
					<Button asChild className="h-11 px-6">
						<Link href="/sign-up">Get started for free</Link>
					</Button>
					<Button asChild className="h-11 px-6" variant="ghost">
						<Link href="#plans">View plans</Link>
					</Button>
				</div>
			</section>

			{hasDiscount && discount ? (
				<section className="mt-10">
					<div className="relative overflow-hidden rounded-lg border border-cossistant-green/50 bg-cossistant-green/10 p-5">
						<div className="absolute inset-0 bg-gradient-to-r from-cossistant-green/20 via-transparent to-cossistant-green/20" />
						<div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<div className="space-y-2 text-left">
								<p className="flex items-center gap-2 font-mono text-black/80 text-sm">
									<Tag className="size-4" />
									Launch offer
								</p>
								<h2 className="font-semibold text-black text-xl">
									{formatDiscountOffer(discount)}
								</h2>
								<p className="text-black/70 text-sm">
									{discount.redemptionsLeft !== null
										? `${discount.redemptionsLeft} of ${discount.maxRedemptions} redemptions left`
										: "Limited time upgrade pricing"}
								</p>
							</div>
							<Button asChild className="h-11 px-5" variant="secondary">
								<Link href="/sign-up">Upgrade with the offer</Link>
							</Button>
						</div>
					</div>
				</section>
			) : null}

			<section className="mt-16 space-y-10" id="plans">
				<div className="grid gap-6 lg:grid-cols-2">
					{plans.map((plan) => (
						<div
							className={cn(
								"relative flex h-full flex-col gap-6 overflow-hidden rounded-xl border border-primary/15 border-dashed bg-card p-6 text-left shadow-sm",
								plan.name === "hobby" && "ring-2 ring-primary/50"
							)}
							key={plan.name}
						>
							<div className="flex items-center justify-between gap-2">
								<div className="space-y-1">
									<p className="text-primary/60 text-sm uppercase tracking-wide">
										{plan.displayName}
									</p>
									<h3 className="font-semibold text-2xl">
										{plan.displayName} plan
									</h3>
								</div>
								{plan.name === "hobby" && <Badge>Most popular</Badge>}
							</div>
							<div className="flex items-end gap-2 font-semibold text-4xl">
								{plan.price ? `$${plan.price}` : "Free"}
								{plan.price && (
									<span className="font-normal text-base text-primary/60">
										/month
									</span>
								)}
							</div>
							<p className="text-primary/70">
								Built from the live configuration — limits stay in sync with
								what you get in-app.
							</p>
							<Button asChild className="h-11 px-5">
								<Link href="/sign-up">
									{plan.price ? "Upgrade" : "Start for free"}
								</Link>
							</Button>

							<Separator className="bg-primary/10" />

							<ul className="grid gap-3">
								{features.map((feature) => (
									<li
										className="flex items-start gap-3"
										key={`${plan.name}-${feature.key}`}
									>
										<Check className="mt-0.5 size-4 text-primary" />
										<div>
											<p className="font-medium text-sm">{feature.name}</p>
											<p className="text-primary/60 text-sm">
												{featureValueLabel(
													feature.key,
													plan.features[feature.key]
												)}
											</p>
										</div>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</section>

			<section className="mt-16 space-y-6">
				<div className="text-center">
					<h2 className="font-semibold text-3xl">Compare features</h2>
					<p className="text-primary/70">
						Everything below is rendered from the source of truth we use inside
						the product.
					</p>
				</div>
				<div className="overflow-hidden rounded-xl border border-primary/15 border-dashed">
					<div className="grid grid-cols-1 bg-primary/[0.03] font-semibold text-primary/80 text-sm md:grid-cols-[2fr_repeat(2,1fr)]">
						<div className="px-4 py-3 text-left">Feature</div>
						{plans.map((plan) => (
							<div className="px-4 py-3 text-left" key={`heading-${plan.name}`}>
								{plan.displayName}
							</div>
						))}
					</div>
					{features.map((feature) => (
						<div
							className="grid grid-cols-1 items-center border-primary/10 border-t text-sm md:grid-cols-[2fr_repeat(2,1fr)]"
							key={`row-${feature.key}`}
						>
							<div className="px-4 py-4">
								<p className="font-medium">{feature.name}</p>
								<p className="text-primary/60">{feature.description}</p>
							</div>
							{plans.map((plan) => (
								<div
									className="px-4 py-4 font-mono text-primary/80"
									key={`${plan.name}-${feature.key}`}
								>
									{featureValueLabel(feature.key, plan.features[feature.key])}
								</div>
							))}
						</div>
					))}
				</div>
			</section>

			<section className="mt-16 space-y-6">
				<div className="text-center">
					<h2 className="font-semibold text-3xl">Frequently asked questions</h2>
					<p className="text-primary/70">
						Answers pulled straight from how our plans are configured today.
					</p>
				</div>
				<div className="space-y-3">
					<FaqItem
						answer="All values come from our shared plan configuration so updates roll out here automatically."
						question="How is this page kept in sync?"
					/>
					<FaqItem
						answer="Yes. The Hobby plan lifts limits for conversations, messages, and retention while raising contact and team member caps."
						question="Is there an unlimited option?"
					/>
					<FaqItem
						answer="We rely on Polar for checkout. If you are eligible for the launch offer you will see the discounted price applied there."
						question="How do I redeem the launch offer?"
					/>
					<FaqItem
						answer="Free plans include core features with generous limits. When you outgrow them, upgrading keeps your data and conversations intact."
						question="Can I start free and upgrade later?"
					/>
				</div>
			</section>
		</div>
	);
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
	return (
		<div className="rounded-xl border border-primary/15 border-dashed bg-card/50 p-4 text-left">
			<p className="font-semibold">{question}</p>
			<p className="text-primary/70">{answer}</p>
		</div>
	);
}

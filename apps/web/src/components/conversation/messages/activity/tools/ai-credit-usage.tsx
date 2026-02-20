"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ActivityWrapper } from "../activity-wrapper";
import type { ToolActivityProps } from "../types";

type CreditPayload = {
	baseCredits: number;
	modelCredits: number;
	toolCredits: number;
	totalCredits: number;
	billableToolCount: number;
	excludedToolCount: number;
	modelId: string;
	modelIdOriginal?: string;
	modelMigrationApplied?: boolean;
	balanceBefore: number | null;
	balanceAfterEstimate: number | null;
	mode: "normal" | "outage";
	blockedReason?: string;
	ingestStatus?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayload(output: unknown): CreditPayload | null {
	if (!isRecord(output)) {
		return null;
	}
	if (typeof output.totalCredits !== "number") {
		return null;
	}
	return output as unknown as CreditPayload;
}

function shortenModelId(modelId: string): string {
	const slashIndex = modelId.lastIndexOf("/");
	return slashIndex >= 0 ? modelId.slice(slashIndex + 1) : modelId;
}

function DetailRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			<span className="text-right font-medium">{children}</span>
		</div>
	);
}

function CreditIcon() {
	return (
		<div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground text-xs">
			$
		</div>
	);
}

export function AiCreditUsageActivity({
	toolCall,
	timestamp,
	showIcon = true,
}: ToolActivityProps) {
	const [expanded, setExpanded] = useState(false);
	const { state, output } = toolCall;

	if (state === "partial") {
		return (
			<ActivityWrapper
				icon={{ type: "custom", content: <CreditIcon /> }}
				showIcon={showIcon}
				state="partial"
				text="Calculating credits..."
				timestamp={timestamp}
			/>
		);
	}

	const payload = parsePayload(output);

	if (!payload) {
		return (
			<ActivityWrapper
				icon={{ type: "custom", content: <CreditIcon /> }}
				showIcon={showIcon}
				state={state}
				text={toolCall.summaryText}
				timestamp={timestamp}
			/>
		);
	}

	if (payload.blockedReason) {
		return (
			<ActivityWrapper
				icon={{ type: "custom", content: <CreditIcon /> }}
				showIcon={showIcon}
				state="error"
				text={
					<span className="text-destructive/80">
						Credits blocked &mdash; {payload.blockedReason}
					</span>
				}
				timestamp={timestamp}
			/>
		);
	}

	const summaryText = (
		<>
			Used{" "}
			<span className="font-medium text-foreground">
				{payload.totalCredits}
			</span>{" "}
			credits
			{!expanded && (
				<button
					className="ml-1.5 text-muted-foreground/70 text-xs underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-foreground"
					onClick={() => setExpanded(true)}
					type="button"
				>
					Show details
				</button>
			)}
			{expanded && (
				<button
					className="ml-1.5 text-muted-foreground/70 text-xs underline decoration-muted-foreground/30 underline-offset-2 transition-colors hover:text-foreground"
					onClick={() => setExpanded(false)}
					type="button"
				>
					Hide
				</button>
			)}
		</>
	);

	return (
		<ActivityWrapper
			icon={{ type: "custom", content: <CreditIcon /> }}
			showIcon={showIcon}
			state="result"
			text={summaryText}
			timestamp={timestamp}
		>
			{expanded && (
				<div className="mt-1.5 space-y-1 rounded-md border border-border/50 bg-background/70 p-2.5 text-xs">
					<DetailRow label="Base">{payload.baseCredits}</DetailRow>
					<DetailRow label="Model surcharge">{payload.modelCredits}</DetailRow>
					<DetailRow label="Tool costs">
						{payload.toolCredits}
						<span className="ml-1 font-normal text-muted-foreground">
							({payload.billableToolCount} billable
							{payload.excludedToolCount > 0 &&
								`, ${payload.excludedToolCount} excluded`}
							)
						</span>
					</DetailRow>

					<div className="my-1.5 border-border/30 border-t" />

					<DetailRow label="Model">
						<span className="font-mono text-[11px]">
							{payload.modelMigrationApplied && payload.modelIdOriginal ? (
								<>
									{shortenModelId(payload.modelId)}{" "}
									<span className="text-muted-foreground line-through">
										{shortenModelId(payload.modelIdOriginal)}
									</span>
								</>
							) : (
								shortenModelId(payload.modelId)
							)}
						</span>
					</DetailRow>

					{payload.balanceBefore != null &&
						payload.balanceAfterEstimate != null && (
							<DetailRow label="Balance">
								{payload.balanceBefore} &rarr; {payload.balanceAfterEstimate}
							</DetailRow>
						)}

					{payload.mode === "outage" && (
						<DetailRow label="Mode">
							<span
								className={cn(
									"inline-flex items-center rounded border border-dashed px-1 font-medium",
									"border-amber-300/70 bg-amber-100/70 text-amber-900 dark:border-amber-700/70 dark:bg-amber-900/30 dark:text-amber-100"
								)}
							>
								outage
							</span>
						</DetailRow>
					)}

					{payload.ingestStatus && payload.ingestStatus !== "ingested" && (
						<DetailRow label="Ingest">
							<span className="text-muted-foreground">
								{payload.ingestStatus}
							</span>
						</DetailRow>
					)}
				</div>
			)}
		</ActivityWrapper>
	);
}

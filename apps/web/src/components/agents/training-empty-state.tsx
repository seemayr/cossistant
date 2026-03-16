"use client";

import { Facehash } from "facehash";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const EMPTY_TRAINING_FACEHASH_SEED = "training-empty-state";

type TrainingEmptyStateProps = {
	title: string;
	description: string;
	actionLabel: string;
	onAction: () => void;
	className?: string;
};

export function TrainingEmptyState({
	title,
	description,
	actionLabel,
	onAction,
	className,
}: TrainingEmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center rounded-lg px-6 py-12 text-center",
				className
			)}
		>
			<Facehash
				className="rounded-lg border border-primary/20 border-dashed font-bold font-mono text-primary/60"
				colorClasses={["bg-background-100"]}
				enableBlink
				name={EMPTY_TRAINING_FACEHASH_SEED}
				onRenderMouth={() => (
					<span
						aria-hidden="true"
						className="font-bold font-mono text-xl leading-none"
					>
						?
					</span>
				)}
				showInitial={false}
				size={80}
				variant="solid"
			/>
			<p className="mt-6 font-medium text-base">{title}</p>
			<p className="mt-2 max-w-md text-muted-foreground text-sm">
				{description}
			</p>
			<Button
				className="mt-6"
				onClick={onAction}
				size="sm"
				type="button"
				variant="secondary"
			>
				{actionLabel}
			</Button>
		</div>
	);
}

export type { TrainingEmptyStateProps };

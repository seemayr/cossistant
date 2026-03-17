"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "../../ui/logo";
import { ComposerCentralBlock } from "./composer-central-block";

export type EscalationActionProps = {
	reason: string;
	onJoin: () => void;
	isJoining?: boolean;
	joinButtonRef?: React.RefObject<HTMLButtonElement | null>;
	aboveAction?: React.ReactNode;
	layout?: "embedded" | "standalone";
	/**
	 * Called when the container height changes (for dynamic timeline padding).
	 */
	onHeightChange?: (height: number) => void;
};

type EscalationActionCardProps = Pick<
	EscalationActionProps,
	"isJoining" | "joinButtonRef" | "onJoin" | "reason"
> & {
	className?: string;
};

function EscalationActionCard({
	className,
	reason,
	onJoin,
	isJoining = false,
	joinButtonRef,
}: EscalationActionCardProps) {
	return (
		<div
			className={cn(
				"flex flex-col gap-3 rounded border border-cossistant-orange/50 border-dashed bg-cossistant-orange/5 p-4",
				className
			)}
		>
			<div className="flex items-center gap-2">
				<div className="flex h-8 w-8 items-center justify-center rounded border border-cossistant-orange/5 bg-cossistant-orange/10">
					<Logo className="h-4 w-4 text-cossistant-orange" />
				</div>
				<div className="font-medium text-sm">Human help requested by AI</div>
			</div>

			<div className="text-muted-foreground text-sm">Reason: {reason}</div>

			<div className="flex items-center justify-end">
				<Button
					className="bg-cossistant-orange text-white hover:bg-cossistant-orange/90"
					disabled={isJoining}
					onClick={onJoin}
					ref={joinButtonRef}
					size="sm"
					type="button"
				>
					{isJoining ? "Joining..." : "Join the conversation"}
				</Button>
			</div>
		</div>
	);
}

export const EscalationAction: React.FC<EscalationActionProps> = ({
	reason,
	onJoin,
	isJoining = false,
	joinButtonRef,
	aboveAction,
	layout = "standalone",
	onHeightChange,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const isStandalone = layout === "standalone";

	// Report height for dynamic timeline padding
	useEffect(() => {
		if (isStandalone && containerRef.current && onHeightChange) {
			const height = containerRef.current.getBoundingClientRect().height;
			onHeightChange(height);
		}
	}, [aboveAction, isJoining, isStandalone, onHeightChange, reason]);

	if (!isStandalone) {
		return (
			<ComposerCentralBlock className="border-cossistant-orange/50 border-dashed bg-cossistant-orange/5 dark:border-cossistant-orange/40 dark:bg-cossistant-orange/10">
				<EscalationActionCard
					className="rounded-[2px] border-0 bg-transparent p-4"
					isJoining={isJoining}
					joinButtonRef={joinButtonRef}
					onJoin={onJoin}
					reason={reason}
				/>
			</ComposerCentralBlock>
		);
	}

	return (
		<div
			className="absolute right-0 bottom-4 left-0 z-10 mx-auto w-full bg-background px-4 xl:max-w-xl xl:px-0 2xl:max-w-2xl"
			ref={containerRef}
		>
			<div className="flex flex-col gap-3">
				{aboveAction}
				<EscalationActionCard
					isJoining={isJoining}
					joinButtonRef={joinButtonRef}
					onJoin={onJoin}
					reason={reason}
				/>
			</div>
		</div>
	);
};

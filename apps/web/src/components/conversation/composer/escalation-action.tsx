"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";

export type EscalationActionProps = {
	reason: string;
	onJoin: () => void;
	isJoining?: boolean;
	joinButtonRef?: React.RefObject<HTMLButtonElement | null>;
	aboveAction?: React.ReactNode;
	/**
	 * Called when the container height changes (for dynamic timeline padding).
	 */
	onHeightChange?: (height: number) => void;
};

export const EscalationAction: React.FC<EscalationActionProps> = ({
	reason,
	onJoin,
	isJoining = false,
	joinButtonRef,
	aboveAction,
	onHeightChange,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);

	// Report height for dynamic timeline padding
	useEffect(() => {
		if (containerRef.current && onHeightChange) {
			const height = containerRef.current.getBoundingClientRect().height;
			onHeightChange(height);
		}
	}, [aboveAction, isJoining, onHeightChange, reason]);

	return (
		<div
			className="absolute right-0 bottom-4 left-0 z-10 mx-auto w-full bg-background px-4 xl:max-w-xl xl:px-0 2xl:max-w-2xl"
			ref={containerRef}
		>
			<div className="flex flex-col gap-3">
				{aboveAction}
				<div className="flex flex-col gap-3 rounded border border-cossistant-orange/50 border-dashed bg-cossistant-orange/5 p-4">
					{/* Header */}
					<div className="flex items-center gap-2">
						<div className="flex h-8 w-8 items-center justify-center rounded bg-cossistant-orange/20">
							<Icon className="h-4 w-4 text-cossistant-orange" name="agent" />
						</div>
						<div className="font-medium text-sm">
							Human help requested by AI
						</div>
					</div>

					{/* Reason */}
					<div className="text-muted-foreground text-sm">Reason: {reason}</div>

					{/* Action */}
					<div className="flex items-center justify-end">
						<Button
							className="bg-cossistant-orange text-white hover:bg-cossistant-orange/90"
							disabled={isJoining}
							onClick={onJoin}
							ref={joinButtonRef}
							size="sm"
						>
							{isJoining ? <>Joining...</> : <>Join the conversation</>}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
};

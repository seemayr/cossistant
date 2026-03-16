"use client";

import type { ReactNode } from "react";
import { Fragment } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
} from "@/components/ui/select";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AI_PAUSE_STATUS_VALUE, type AiPauseAction } from "./ai-pause-control";

type ComposerBottomBlockProps = {
	children: ReactNode;
	className?: string;
};

type ComposerDefaultBottomBlockProps = {
	onAiPauseAction?: (action: AiPauseAction) => void;
	isAiPauseControlDisabled: boolean;
	aiPauseStatusLabel: string;
	aiPauseMenuActions: AiPauseAction[];
	onAiPauseSelectValueChange: (value: string) => void;
	getAiPauseActionLabel: (action: AiPauseAction) => string;
};

export function ComposerBottomBlock({
	children,
	className,
}: ComposerBottomBlockProps) {
	return (
		<div
			className={cn("flex items-center justify-between pl-3", className)}
			data-composer-bottom-block="true"
		>
			{children}
		</div>
	);
}

export function ComposerDefaultBottomBlock({
	onAiPauseAction,
	isAiPauseControlDisabled,
	aiPauseStatusLabel,
	aiPauseMenuActions,
	onAiPauseSelectValueChange,
	getAiPauseActionLabel,
}: ComposerDefaultBottomBlockProps) {
	return (
		<ComposerBottomBlock>
			{onAiPauseAction ? (
				<Select
					onValueChange={onAiPauseSelectValueChange}
					value={AI_PAUSE_STATUS_VALUE}
				>
					<TooltipOnHover content="Change AI presence in conversation">
						<SelectTrigger
							className="h-6 border-0 bg-transparent px-0 py-0 text-primary text-xs shadow-none hover:cursor-pointer hover:bg-transparent hover:text-primary focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent dark:hover:text-primary [&_svg]:size-3.5 [&_svg]:opacity-70"
							disabled={isAiPauseControlDisabled}
							size="sm"
						>
							<span className="truncate">{aiPauseStatusLabel}</span>
						</SelectTrigger>
					</TooltipOnHover>
					<SelectContent align="start" className="-ml-3">
						<SelectItem className="hidden" value={AI_PAUSE_STATUS_VALUE}>
							{aiPauseStatusLabel}
						</SelectItem>
						{aiPauseMenuActions.map((action, index) => (
							<Fragment key={action}>
								{index === 1 && aiPauseMenuActions[0] === "resume_now" ? (
									<SelectSeparator />
								) : null}
								<SelectItem value={action}>
									{getAiPauseActionLabel(action)}
								</SelectItem>
							</Fragment>
						))}
					</SelectContent>
				</Select>
			) : (
				<div />
			)}
		</ComposerBottomBlock>
	);
}

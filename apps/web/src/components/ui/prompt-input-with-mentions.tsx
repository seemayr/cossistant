"use client";

import { Maximize2 } from "lucide-react";
import { useState } from "react";
import {
	SkillMarkdownEditor,
	type SkillToolMention,
} from "@/components/agents/skills/skill-markdown-editor";
import { Button } from "@/components/ui/button";
import { PromptEditModal } from "@/components/ui/prompt-edit-modal";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type PromptInputWithMentionsProps = {
	value: string;
	onChange: (value: string) => void;
	toolMentions: SkillToolMention[];
	placeholder?: string;
	maxLength?: number;
	disabled?: boolean;
	className?: string;
	label?: string;
	description?: string;
	error?: string;
	rows?: number;
};

export function PromptInputWithMentions({
	value,
	onChange,
	toolMentions,
	placeholder = "Enter your prompt...",
	maxLength = 10_000,
	disabled = false,
	className,
	label,
	description,
	error,
	rows = 8,
}: PromptInputWithMentionsProps) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	const characterCount = value.length;
	const isOverLimit = characterCount > maxLength;
	const isNearLimit = characterCount > maxLength * 0.9;

	return (
		<div className="flex flex-col gap-2">
			{label && <span className="font-medium text-sm">{label}</span>}
			{description && (
				<p className="text-muted-foreground text-sm">{description}</p>
			)}

			<div className="relative">
				<TooltipOnHover content="Expand prompt input" side="right">
					<Button
						className="absolute top-2 right-2 z-10"
						onClick={() => setIsDialogOpen(true)}
						size="icon-small"
						type="button"
						variant="ghost"
					>
						<Maximize2 />
					</Button>
				</TooltipOnHover>
				<SkillMarkdownEditor
					className={cn(
						isOverLimit && "border-destructive",
						error && "border-destructive",
						className
					)}
					disabled={disabled}
					onChange={onChange}
					placeholder={placeholder}
					rows={rows}
					toolMentions={toolMentions}
					value={value}
				/>
			</div>

			<div className="flex items-center justify-between">
				{error ? <p className="text-destructive text-xs">{error}</p> : <div />}
				<span
					className={cn(
						"text-muted-foreground text-xs tabular-nums",
						isNearLimit && "text-amber-500",
						isOverLimit && "text-destructive"
					)}
				>
					{characterCount.toLocaleString()} / {maxLength.toLocaleString()}
				</span>
			</div>

			<PromptEditModal
				footer={
					<span
						className={cn(
							"text-muted-foreground text-sm tabular-nums",
							isNearLimit && "text-amber-500",
							isOverLimit && "text-destructive"
						)}
					>
						{characterCount.toLocaleString()} / {maxLength.toLocaleString()}
					</span>
				}
				onOpenChange={setIsDialogOpen}
				open={isDialogOpen}
				title="Prompt Editor"
			>
				<SkillMarkdownEditor
					disabled={disabled}
					onChange={onChange}
					placeholder={placeholder}
					rows={24}
					toolMentions={toolMentions}
					value={value}
				/>
			</PromptEditModal>
		</div>
	);
}

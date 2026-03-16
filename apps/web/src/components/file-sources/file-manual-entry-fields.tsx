"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type FileManualEntryFieldsProps = {
	title: string;
	summary: string;
	markdown: string;
	disabled?: boolean;
	className?: string;
	onTitleChange: (value: string) => void;
	onSummaryChange: (value: string) => void;
	onMarkdownChange: (value: string) => void;
};

export function FileManualEntryFields({
	title,
	summary,
	markdown,
	disabled = false,
	className,
	onTitleChange,
	onSummaryChange,
	onMarkdownChange,
}: FileManualEntryFieldsProps) {
	return (
		<div className={cn("space-y-4", className)}>
			<div className="space-y-2">
				<Label htmlFor="file-title">Title</Label>
				<Input
					disabled={disabled}
					id="file-title"
					onChange={(event) => onTitleChange(event.target.value)}
					placeholder="Getting Started Guide"
					value={title}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="file-summary">Summary</Label>
				<Input
					disabled={disabled}
					id="file-summary"
					onChange={(event) => onSummaryChange(event.target.value)}
					placeholder="Optional context about what this file covers"
					value={summary}
				/>
				<p className="text-muted-foreground text-xs">
					Optional short context for this entry.
				</p>
			</div>
			<div className="space-y-2">
				<Label htmlFor="file-markdown">Markdown</Label>
				<Textarea
					className="min-h-[320px] font-mono text-sm"
					disabled={disabled}
					id="file-markdown"
					onChange={(event) => onMarkdownChange(event.target.value)}
					placeholder="# Getting started&#10;&#10;Welcome to our documentation..."
					rows={14}
					value={markdown}
				/>
			</div>
		</div>
	);
}

export type { FileManualEntryFieldsProps };

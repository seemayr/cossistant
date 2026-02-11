"use client";

import {
	type Mention,
	type MentionType,
	useTinyMention,
} from "@cossistant/tiny-markdown";
import type { ChangeEvent, KeyboardEvent, SyntheticEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { MentionPopover } from "../../conversation/multimodal-input/mention-popover";
import {
	convertDisplayToMarkdown,
	formatMentionDisplay,
	type MentionStore,
	parseDisplayMentions,
} from "../../conversation/multimodal-input/mention-store";
import { StyledOverlay } from "../../conversation/multimodal-input/styled-overlay";
import { useMentionSearch } from "../../conversation/multimodal-input/use-mention-search";

const MENTION_MARKDOWN_REGEX = /\[@([^\]]+)\]\(mention:([^:]+):([^)]+)\)/g;

export type SkillToolMention = {
	id: string;
	name: string;
	description?: string;
};

type SkillMarkdownEditorProps = {
	value: string;
	onChange: (value: string) => void;
	toolMentions: SkillToolMention[];
	placeholder?: string;
	disabled?: boolean;
	rows?: number;
	className?: string;
};

function toMentionType(value: string): MentionType {
	if (
		value === "ai-agent" ||
		value === "human-agent" ||
		value === "visitor" ||
		value === "tool"
	) {
		return value;
	}

	return "tool";
}

function toDisplayValue(
	markdownValue: string,
	mentionStore: MentionStore
): string {
	mentionStore.clear();

	return markdownValue.replace(
		MENTION_MARKDOWN_REGEX,
		(_, name: string, type: string, id: string) => {
			const mention: Mention = {
				id,
				name,
				type: toMentionType(type),
			};
			mentionStore.set(name, mention);
			return formatMentionDisplay(mention);
		}
	);
}

export function SkillMarkdownEditor({
	value,
	onChange,
	toolMentions,
	placeholder = "Write skill instructions...",
	disabled = false,
	rows = 8,
	className,
}: SkillMarkdownEditorProps) {
	const mentionStoreRef = useRef<MentionStore>(new Map());
	const [displayValue, setDisplayValue] = useState(() =>
		toDisplayValue(value, mentionStoreRef.current)
	);
	const [cursorPosition, setCursorPosition] = useState(0);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);

	const { search: mentionSearch } = useMentionSearch({
		tools: toolMentions,
	});

	useEffect(() => {
		const nextDisplayValue = toDisplayValue(value, mentionStoreRef.current);
		setDisplayValue((currentDisplay) =>
			currentDisplay === nextDisplayValue ? currentDisplay : nextDisplayValue
		);
	}, [value]);

	const handleMentionSelect = useCallback(
		(selectedMention: Mention) => {
			const textarea = textareaRef.current;
			if (!textarea) {
				return;
			}

			const textBeforeCursor = displayValue.slice(0, cursorPosition);
			const triggerIndex = textBeforeCursor.lastIndexOf("@");

			if (triggerIndex === -1) {
				return;
			}

			mentionStoreRef.current.set(selectedMention.name, selectedMention);
			const displayMention = formatMentionDisplay(selectedMention);
			const nextDisplayValue =
				displayValue.slice(0, triggerIndex) +
				displayMention +
				" " +
				displayValue.slice(cursorPosition);

			setDisplayValue(nextDisplayValue);
			onChange(
				convertDisplayToMarkdown(nextDisplayValue, mentionStoreRef.current)
			);

			const nextCursor = triggerIndex + displayMention.length + 1;
			requestAnimationFrame(() => {
				textarea.setSelectionRange(nextCursor, nextCursor);
				textarea.focus();
				setCursorPosition(nextCursor);
			});
		},
		[cursorPosition, displayValue, onChange]
	);

	const mention = useTinyMention({
		textareaRef,
		containerRef,
		value: displayValue,
		cursorPosition,
		onSearch: mentionSearch,
		onSelect: handleMentionSelect,
		trigger: "@",
		debounceMs: 100,
	});

	const hasMentions = useMemo(
		() =>
			parseDisplayMentions(displayValue, mentionStoreRef.current).length > 0,
		[displayValue]
	);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => {
			const nextDisplayValue = event.target.value;
			setDisplayValue(nextDisplayValue);
			onChange(
				convertDisplayToMarkdown(nextDisplayValue, mentionStoreRef.current)
			);
			setCursorPosition(event.target.selectionStart);
		},
		[onChange]
	);

	const handleSelect = useCallback(
		(event: SyntheticEvent<HTMLTextAreaElement>) => {
			setCursorPosition(event.currentTarget.selectionStart);
		},
		[]
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (mention.handleKeyDown(event)) {
				return;
			}
		},
		[mention]
	);

	return (
		<div
			className={cn(
				"relative rounded-md border border-input bg-background-100/40 dark:bg-background-200/70",
				className
			)}
			ref={containerRef}
		>
			<MentionPopover
				caretPosition={mention.caretPosition}
				containerRef={containerRef}
				highlightedIndex={mention.highlightedIndex}
				isActive={mention.isActive}
				isLoading={mention.isLoading}
				onSelect={mention.selectMention}
				results={mention.results}
			/>

			<div className="relative">
				{hasMentions && (
					<StyledOverlay
						className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words p-3 font-mono text-sm"
						mentionStore={mentionStoreRef.current}
						ref={overlayRef}
						value={displayValue}
					/>
				)}
				<textarea
					className={cn(
						"w-full resize-y border-0 bg-transparent p-3 font-mono text-sm outline-none placeholder:text-muted-foreground",
						hasMentions
							? "text-transparent caret-foreground"
							: "text-foreground"
					)}
					disabled={disabled}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					onSelect={handleSelect}
					placeholder={`${placeholder} Type @ to mention tools.`}
					ref={textareaRef}
					rows={rows}
					value={displayValue}
				/>
			</div>
		</div>
	);
}

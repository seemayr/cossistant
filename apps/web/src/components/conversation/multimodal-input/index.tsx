"use client";

import {
	FILE_INPUT_ACCEPT,
	formatFileSize,
	MAX_FILE_SIZE,
	MAX_FILES_PER_MESSAGE,
} from "@cossistant/core";
import type React from "react";
import { useLayoutEffect, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MentionPopover } from "./mention-popover";
import { convertDisplayToMarkdown, type MentionStore } from "./mention-store";
import { StyledOverlay } from "./styled-overlay";
import { useMentionEditor } from "./use-mention-editor";
import {
	type UseMentionSearchOptions,
	useMentionSearch,
} from "./use-mention-search";

export type MessageVisibility = "public" | "private";

export type MultimodalInputProps = {
	className?: string;
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onFileSelect?: (files: File[]) => void;
	placeholder?: string;
	disabled?: boolean;
	isSubmitting?: boolean;
	isUploading?: boolean;
	uploadProgress?: number;
	error?: Error | null;
	files?: File[];
	onRemoveFile?: (index: number) => void;
	maxFiles?: number;
	maxFileSize?: number;
	allowedFileTypes?: string;
	visibility?: MessageVisibility;
	onVisibilityChange?: (visibility: MessageVisibility) => void;
	/**
	 * Render prop for custom attach button.
	 */
	renderAttachButton?: (props: {
		triggerFileInput: () => void;
		disabled: boolean;
	}) => React.ReactNode;
	/**
	 * Mention configuration - pass AI agent, team members, and visitor to enable mentions.
	 */
	mentionConfig?: UseMentionSearchOptions;
	/**
	 * Called with the markdown-formatted value (mentions converted to full format).
	 * Use this to get the value for sending to the server.
	 */
	onMarkdownChange?: (markdownValue: string) => void;
	/**
	 * Called when the input container height changes (for dynamic timeline padding).
	 */
	onHeightChange?: (height: number) => void;
};

export const MultimodalInput: React.FC<MultimodalInputProps> = ({
	className,
	value,
	onChange,
	onSubmit,
	onFileSelect,
	placeholder = "Type your message...",
	disabled = false,
	isSubmitting = false,
	isUploading = false,
	uploadProgress = 0,
	error,
	files = [],
	onRemoveFile,
	maxFiles = MAX_FILES_PER_MESSAGE,
	maxFileSize = MAX_FILE_SIZE,
	allowedFileTypes = FILE_INPUT_ACCEPT,
	visibility = "public",
	onVisibilityChange,
	renderAttachButton,
	mentionConfig,
	onMarkdownChange,
	onHeightChange,
}) => {
	const isPrivate = visibility === "private";
	const fileInputRef = useRef<HTMLInputElement>(null);
	const inputContainerRef = useRef<HTMLDivElement>(null);
	const hasContent = value.trim().length > 0 || files.length > 0;
	const canSubmit = !disabled && hasContent && !isUploading;

	// Mention store - maps display IDs to full mention data
	const mentionStoreRef = useRef<MentionStore>(new Map());

	// Mention search
	const { search: mentionSearch } = useMentionSearch(mentionConfig ?? {});
	const mentionEditor = useMentionEditor({
		value,
		onValueChange: onChange,
		mentionStoreRef,
		mentionSearch,
		onMarkdownChange,
		mentionEnabled: Boolean(mentionConfig),
	});

	// Toggle private mode with "n" shortcut (for "note")
	useHotkeys(
		"n",
		() => {
			onVisibilityChange?.(isPrivate ? "public" : "private");
		},
		{
			enableOnFormTags: false,
			enableOnContentEditable: false,
			preventDefault: true,
		},
		[isPrivate, onVisibilityChange]
	);

	// Track previous container height for auto-scroll
	const previousHeightRef = useRef<number>(0);

	// Auto-resize textarea with max height constraint
	useLayoutEffect(() => {
		const textarea = mentionEditor.textareaRef.current;
		const container = inputContainerRef.current;
		if (!textarea) {
			return;
		}

		// Reset height to auto to get accurate scrollHeight
		textarea.style.height = "auto";

		// Get the scroll height
		const scrollHeight = textarea.scrollHeight;

		textarea.style.height = `${scrollHeight}px`;
		textarea.style.overflowY = "hidden";

		// Sync overlay height
		if (mentionEditor.overlayRef.current) {
			mentionEditor.overlayRef.current.style.height = `${scrollHeight}px`;
		}

		// Report height changes for dynamic timeline padding & auto-scroll
		if (container && typeof document !== "undefined") {
			const currentHeight = container.getBoundingClientRect().height;
			const heightDelta = currentHeight - previousHeightRef.current;

			// Notify parent of height change for dynamic padding
			if (onHeightChange && heightDelta !== 0) {
				onHeightChange(currentHeight);
			}

			// Only auto-scroll if height increased (input is growing)
			if (heightDelta > 0) {
				const timeline = document.getElementById("conversation-timeline");
				if (timeline) {
					const timelineScrollTop = timeline.scrollTop;
					const timelineScrollHeight = timeline.scrollHeight;
					const timelineClientHeight = timeline.clientHeight;
					const distanceFromBottom =
						timelineScrollHeight - timelineScrollTop - timelineClientHeight;

					// If user is near bottom (within 50px), scroll down by the height delta
					if (distanceFromBottom <= 50) {
						timeline.scrollTo({
							top: timelineScrollTop + heightDelta,
							behavior: "smooth",
						});
					}
				}
			}

			previousHeightRef.current = currentHeight;
		}
	}, [
		mentionEditor.overlayRef,
		mentionEditor.textareaRef,
		onHeightChange,
		value,
	]);

	const handleSubmit = () => {
		if (!canSubmit) {
			return;
		}

		onSubmit();
		// Clear mention store on submit
		mentionStoreRef.current.clear();
		// Focus textarea after submission
		mentionEditor.textareaRef.current?.focus();
		requestAnimationFrame(() => {
			mentionEditor.textareaRef.current?.focus();
		});
	};

	const handleFormSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		handleSubmit();
	};

	const triggerFileInput = () => {
		if (files.length < maxFiles) {
			fileInputRef.current?.click();
		}
	};

	const isAttachDisabled = disabled || isSubmitting || files.length >= maxFiles;

	// Handle keyboard events - mentions first, then submit
	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Let mention hook handle its keys first
		if (mentionEditor.handleKeyDown(e)) {
			return;
		}

		// Handle Cmd/Ctrl + Enter to submit
		if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			handleSubmit();
		}
	};

	return (
		<div className="absolute right-0 bottom-4 left-0 z-10 mx-auto w-full px-4 xl:max-w-xl xl:px-0 2xl:max-w-2xl">
			<form
				className="flex max-h-[50vh] flex-col gap-2"
				onSubmit={handleFormSubmit}
			>
				{/* Error message */}
				{error && (
					<div className="rounded-md bg-destructive-muted p-2 text-destructive text-xs">
						{error.message}
					</div>
				)}

				{/* File attachments */}
				{files.length > 0 && (
					<div className="flex flex-col gap-2 p-2">
						{/* Upload progress indicator */}
						{isUploading && (
							<div className="flex items-center gap-2 text-muted-foreground text-xs">
								<div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
									<div
										className="h-full bg-primary transition-all duration-300"
										style={{ width: `${uploadProgress}%` }}
									/>
								</div>
								<span>Uploading {uploadProgress}%</span>
							</div>
						)}
						<div className="flex flex-wrap gap-2">
							{files.map((file, index) => (
								<div
									className={cn(
										"flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs",
										isUploading && "opacity-70"
									)}
									key={`${file.name}-${index}`}
								>
									<Icon className="h-3 w-3" name="attachment" />
									<span className="max-w-[150px] truncate">{file.name}</span>
									<span className="text-muted-foreground">
										{formatFileSize(file.size)}
									</span>
									{onRemoveFile && !isUploading && (
										<TooltipOnHover content="Remove file">
											<Button
												className="ml-1"
												onClick={() => onRemoveFile(index)}
												size="icon-small"
												type="button"
												variant="ghost"
											>
												<Icon className="h-3 w-3" name="x" />
											</Button>
										</TooltipOnHover>
									)}
								</div>
							))}
						</div>
					</div>
				)}

				{/* Input area */}
				<div className="relative" ref={inputContainerRef}>
					{/* Floating private mode banner — slides up from above the input */}
					<div
						className={cn(
							"absolute top-1 right-0 flex items-center justify-center px-3 py-1.5 text-cossistant-yellow-600 text-xs transition-all duration-200",
							isPrivate
								? "opacity-100"
								: "pointer-events-none translate-y-0 opacity-0"
						)}
					>
						Not visible to visitor
					</div>

					<div className="bg-background">
						<div
							className={cn(
								"relative flex h-fit flex-col rounded-xs border drop-shadow-xs",
								isPrivate
									? "border-cossistant-yellow-600/40 border-dashed bg-cossistant-yellow-100/30 dark:border-cossistant-yellow-600/20 dark:bg-cossistant-yellow-100/5"
									: "border-border/50 bg-background-100 dark:border-border/50 dark:bg-background-300"
							)}
						>
							{/* Visibility toggle tabs — inside the input block */}
							{onVisibilityChange && (
								<div className="flex items-center gap-0.5 px-1 pt-1">
									<TooltipOnHover
										content="Send a public reply visible to the visitor"
										shortcuts={["N"]}
									>
										<button
											className={cn(
												"rounded-xs px-3 py-1.5 font-medium text-xs transition-colors",
												isPrivate
													? "text-muted-foreground hover:text-foreground"
													: "bg-background-200 text-foreground dark:bg-background-400"
											)}
											onClick={() => onVisibilityChange("public")}
											type="button"
										>
											Reply
										</button>
									</TooltipOnHover>
									<TooltipOnHover
										content="Send a private note only visible to your team and AI"
										shortcuts={["N"]}
									>
										<button
											className={cn(
												"rounded-xs px-3 py-1.5 font-medium text-xs transition-colors",
												isPrivate
													? "bg-cossistant-yellow-100 text-cossistant-yellow-600 dark:bg-cossistant-yellow-100/25"
													: "text-muted-foreground hover:text-foreground"
											)}
											onClick={() => onVisibilityChange("private")}
											type="button"
										>
											Private note
										</button>
									</TooltipOnHover>
								</div>
							)}

							<div
								className="scrollbar-thin scrollbar-track-fd-overlay scrollbar-thumb-border/30 hover:scrollbar-thumb-border/50 relative max-h-[280px] overflow-y-scroll"
								ref={mentionEditor.mentionViewportRef}
							>
								{/* Mention popover */}
								{mentionConfig && (
									<MentionPopover
										anchorRef={mentionEditor.mentionViewportRef}
										caretPosition={mentionEditor.mention.caretPosition}
										highlightedIndex={mentionEditor.mention.highlightedIndex}
										isActive={mentionEditor.mention.isActive}
										isLoading={mentionEditor.mention.isLoading}
										onSelect={mentionEditor.mention.selectMention}
										results={mentionEditor.mention.results}
									/>
								)}

								{/* Styled overlay - shows formatted content with mention pills */}
								{mentionEditor.hasMentions && (
									<StyledOverlay
										className={cn(
											"pointer-events-none absolute inset-0 min-h-[20px] w-full whitespace-pre-wrap break-words p-3 text-foreground text-sm",
											className
										)}
										mentionStore={mentionStoreRef.current}
										ref={mentionEditor.overlayRef}
										value={value}
									/>
								)}
								<textarea
									aria-describedby={
										error ? "multimodal-input-error" : undefined
									}
									aria-invalid={error ? "true" : undefined}
									autoFocus
									className={cn(
										"min-h-[20px] w-full flex-1 resize-none bg-transparent p-3 text-sm placeholder:text-primary/50 focus-visible:outline-none",
										// When there are mentions, make text transparent so pills show through
										mentionEditor.hasMentions
											? "text-transparent caret-foreground"
											: "text-foreground",
										className
									)}
									disabled={disabled}
									onChange={mentionEditor.handleChange}
									onKeyDown={handleKeyDown}
									onScroll={mentionEditor.handleScroll}
									onSelect={mentionEditor.handleSelect}
									placeholder={
										isPrivate
											? "Write a private note..."
											: mentionConfig
												? `${placeholder} Type @ to mention...`
												: placeholder
									}
									ref={mentionEditor.textareaRef}
									rows={1}
									value={value}
								/>
							</div>
							<div className="flex items-center justify-end pr-1 pb-1 pl-3">
								<div className="flex items-center gap-0.5">
									{/* File attachment button */}
									{onFileSelect && (
										<>
											{renderAttachButton ? (
												// Render custom attach button (e.g., ButtonWithPaywall)
												renderAttachButton({
													triggerFileInput,
													disabled: isAttachDisabled,
												})
											) : (
												<TooltipOnHover content="Attach files">
													<Button
														className={cn(
															files.length >= maxFiles && "opacity-50"
														)}
														disabled={isAttachDisabled}
														onClick={triggerFileInput}
														size="icon"
														type="button"
														variant="ghost"
													>
														<Icon className="h-4 w-4" name="attachment" />
													</Button>
												</TooltipOnHover>
											)}

											<input
												accept={allowedFileTypes}
												className="hidden"
												disabled={isAttachDisabled}
												multiple
												onChange={(e) => {
													const selectedFiles = Array.from(
														e.target.files || []
													);
													if (selectedFiles.length > 0) {
														onFileSelect(selectedFiles);
														// Reset input to allow selecting the same file again
														e.target.value = "";
													}
												}}
												ref={fileInputRef}
												type="file"
											/>
										</>
									)}

									<TooltipOnHover
										content={
											isUploading ? "Uploading files..." : "Send message"
										}
										shortcuts={isUploading ? undefined : ["mod", "enter"]}
									>
										<Button
											className={cn(
												canSubmit
													? isPrivate
														? "[&_svg]:text-cossistant-yellow-600"
														: "[&_svg]:text-primary/90"
													: isPrivate
														? "[&_svg]:text-cossistant-yellow-600/50"
														: "[&_svg]:text-primary/50"
											)}
											disabled={!canSubmit}
											size="icon"
											type="submit"
											variant="ghost"
										>
											{isUploading ? (
												<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
											) : (
												<Icon
													className={cn("size-4")}
													name="send"
													variant={canSubmit ? "filled" : "default"}
												/>
											)}
										</Button>
									</TooltipOnHover>
								</div>
							</div>
						</div>
					</div>
				</div>
			</form>
		</div>
	);
};

export { convertDisplayToMarkdown, type MentionStore } from "./mention-store";
// Re-export types and utilities for parent components
export type { UseMentionSearchOptions } from "./use-mention-search";

"use client";

import type React from "react";
import { forwardRef, useMemo } from "react";
import { MentionPill } from "./mention-pill";
import { type MentionStore, parseDisplayMentions } from "./mention-store";

export type StyledOverlayProps = {
	value: string;
	mentionStore: MentionStore;
	className?: string;
};

/**
 * Renders text with mentions styled as pills.
 * Used as an overlay on top of a transparent textarea.
 */
export const StyledOverlay = forwardRef<HTMLDivElement, StyledOverlayProps>(
	function StyledOverlayInner({ value, mentionStore, className }, ref) {
		const renderedContent = useMemo(() => {
			if (!value) {
				return null;
			}

			const mentions = parseDisplayMentions(value, mentionStore);

			if (mentions.length === 0) {
				// No mentions, render plain text
				return value;
			}

			// Build segments: text and mentions interleaved
			const segments: React.ReactNode[] = [];
			let lastIndex = 0;

			for (const displayMention of mentions) {
				// Add text before this mention
				if (displayMention.start > lastIndex) {
					segments.push(value.slice(lastIndex, displayMention.start));
				}

				// Add the styled mention pill
				// parseDisplayMentions only returns entries where mention is defined
				if (displayMention.mention) {
					segments.push(
						<MentionPill
							key={`mention-${displayMention.name}-${displayMention.start}`}
							mention={displayMention.mention}
						/>
					);
				}

				lastIndex = displayMention.end;
			}

			// Add remaining text after last mention
			if (lastIndex < value.length) {
				segments.push(value.slice(lastIndex));
			}

			return segments;
		}, [value, mentionStore]);

		return (
			<div className={className} ref={ref}>
				{renderedContent}
			</div>
		);
	}
);

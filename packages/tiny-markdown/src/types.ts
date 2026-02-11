import type * as React from "react";

// ============================================================================
// Mention Types
// ============================================================================

export type MentionType = "visitor" | "ai-agent" | "human-agent" | "tool";

export type Mention = {
	id: string;
	name: string;
	type: MentionType;
	avatar?: string;
};

export type ParsedMention = Mention & {
	raw: string;
	startIndex: number;
	endIndex: number;
};

// ============================================================================
// Feature Configuration
// ============================================================================

export type MarkdownFeatures = {
	bold?: boolean;
	italic?: boolean;
	bulletLists?: boolean;
	numberedLists?: boolean;
	headers?: boolean;
	lineBreaks?: boolean;
};

export type MentionFeatures = {
	enabled?: boolean;
	trigger?: string;
	minQueryLength?: number;
	maxResults?: number;
	debounceMs?: number;
};

// ============================================================================
// Token Types (for parsing and rendering)
// ============================================================================

export type TextToken = { type: "text"; content: string };
export type StrongToken = { type: "strong"; children: MarkdownToken[] };
export type EmToken = { type: "em"; children: MarkdownToken[] };
export type CodeToken = {
	type: "code";
	content: string;
	inline: boolean;
	language?: string;
	fileName?: string;
};
export type ParagraphToken = { type: "p"; children: MarkdownToken[] };
export type BlockquoteToken = { type: "blockquote"; children: MarkdownToken[] };
export type UnorderedListToken = { type: "ul"; children: MarkdownToken[] };
export type OrderedListToken = { type: "ol"; children: MarkdownToken[] };
export type ListItemToken = { type: "li"; children: MarkdownToken[] };
export type LinkToken = {
	type: "a";
	href: string;
	children: MarkdownToken[];
};
export type LineBreakToken = { type: "br" };
export type MentionToken = { type: "mention"; mention: ParsedMention };
export type HeaderToken = {
	type: "header";
	level: 1 | 2 | 3;
	children: MarkdownToken[];
};

export type MarkdownToken =
	| TextToken
	| StrongToken
	| EmToken
	| CodeToken
	| ParagraphToken
	| BlockquoteToken
	| UnorderedListToken
	| OrderedListToken
	| ListItemToken
	| LinkToken
	| LineBreakToken
	| MentionToken
	| HeaderToken;

// ============================================================================
// Component Renderers (react-markdown style API)
// ============================================================================

export type MarkdownComponents = {
	strong?: (props: { children: React.ReactNode }) => React.ReactNode;
	em?: (props: { children: React.ReactNode }) => React.ReactNode;
	code?: (props: {
		children: React.ReactNode;
		inline: boolean;
		language?: string;
		fileName?: string;
	}) => React.ReactNode;
	p?: (props: { children: React.ReactNode }) => React.ReactNode;
	blockquote?: (props: { children: React.ReactNode }) => React.ReactNode;
	ul?: (props: { children: React.ReactNode }) => React.ReactNode;
	ol?: (props: { children: React.ReactNode }) => React.ReactNode;
	li?: (props: { children: React.ReactNode }) => React.ReactNode;
	a?: (props: { href: string; children: React.ReactNode }) => React.ReactNode;
	br?: () => React.ReactNode;
	mention?: (props: { mention: ParsedMention }) => React.ReactNode;
	header?: (props: {
		level: 1 | 2 | 3;
		children: React.ReactNode;
	}) => React.ReactNode;
};

// ============================================================================
// Selection State
// ============================================================================

export type SelectionState = {
	start: number;
	end: number;
};

// ============================================================================
// Caret Position
// ============================================================================

export type CaretCoordinates = {
	top: number;
	left: number;
	height: number;
};

// ============================================================================
// useTinyShortcuts Types
// ============================================================================

export type UseTinyShortcutsOptions = {
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	value: string;
	setValue: (value: string) => void;
	features?: MarkdownFeatures;
	onSubmit?: () => void;
};

export type UseTinyShortcutsReturn = {
	handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	toggleBold: () => void;
	toggleItalic: () => void;
	insertBulletList: () => void;
	insertNumberedList: () => void;
	insertHeader: (level?: 1 | 2 | 3) => void;
};

// ============================================================================
// useCaretPosition Types
// ============================================================================

export type UseCaretPositionOptions = {
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	containerRef: React.RefObject<HTMLDivElement | null>;
};

export type UseCaretPositionReturn = {
	getCaretCoordinates: (position?: number) => CaretCoordinates | null;
	getCurrentLine: () => string;
};

// ============================================================================
// useTinyMarkdown Types
// ============================================================================

export type UseTinyMarkdownOptions = {
	value?: string;
	defaultValue?: string;
	onChange?: (value: string) => void;
	onSubmit?: () => void;
	features?: MarkdownFeatures;
	autoResize?: boolean;
	maxHeight?: number;
	components?: MarkdownComponents;
};

export type UseTinyMarkdownReturn = {
	// State
	value: string;
	selection: SelectionState;
	isFocused: boolean;

	// Parsed content
	tokens: MarkdownToken[];

	// Actions
	setValue: (value: string) => void;
	insertText: (text: string, position?: number) => void;
	replaceRange: (start: number, end: number, text: string) => void;

	// Formatting actions
	toggleBold: () => void;
	toggleItalic: () => void;
	insertBulletList: () => void;
	insertNumberedList: () => void;
	insertHeader: (level?: 1 | 2 | 3) => void;

	// Props for container
	containerProps: {
		ref: React.RefCallback<HTMLDivElement>;
		style: React.CSSProperties;
	};

	// Props for hidden textarea
	textareaProps: {
		ref: React.RefCallback<HTMLTextAreaElement>;
		value: string;
		onChange: React.ChangeEventHandler<HTMLTextAreaElement>;
		onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>;
		onSelect: React.ReactEventHandler<HTMLTextAreaElement>;
		onScroll: React.UIEventHandler<HTMLTextAreaElement>;
		onFocus: React.FocusEventHandler<HTMLTextAreaElement>;
		onBlur: React.FocusEventHandler<HTMLTextAreaElement>;
		style: React.CSSProperties;
	};

	// Props for styled overlay
	overlayProps: {
		ref: React.RefCallback<HTMLDivElement>;
		style: React.CSSProperties;
	};

	// Rendered overlay content
	overlayContent: React.ReactNode;

	// Refs for external access
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	containerRef: React.RefObject<HTMLDivElement | null>;
};

// ============================================================================
// useTinyMention Types
// ============================================================================

export type UseTinyMentionOptions = {
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
	containerRef: React.RefObject<HTMLDivElement | null>;
	value: string;
	cursorPosition: number;
	onSearch: (query: string) => Promise<Mention[]> | Mention[];
	onSelect?: (mention: Mention) => void;
	trigger?: string;
	debounceMs?: number;
	minQueryLength?: number;
	maxResults?: number;
};

export type UseTinyMentionReturn = {
	// State
	isActive: boolean;
	query: string;
	results: Mention[];
	highlightedIndex: number;
	isLoading: boolean;
	triggerPosition: number | null;

	// Popover positioning
	caretPosition: CaretCoordinates | null;

	// Actions
	selectMention: (mention: Mention) => void;
	selectHighlighted: () => void;
	highlightNext: () => void;
	highlightPrevious: () => void;
	close: () => void;

	// Keyboard handler
	handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;

	// Helper
	formatMention: (mention: Mention) => string;
};

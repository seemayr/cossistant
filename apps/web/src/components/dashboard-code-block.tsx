"use client";

import { FileIcon } from "lucide-react";
import * as React from "react";
import { useShikiHighlighter } from "react-shiki/web";
import type { ShikiTransformer } from "shiki";

import { SHARED_SHIKI_TRANSFORMERS } from "@/lib/highlight-code";
import { cn } from "@/lib/utils";

import { ComponentCodeReact } from "./component-code";
import { NextJsIcon, ReactIcon } from "./framework-picker";
import { Button } from "./ui/button";

type SupportedFramework = "react" | "nextjs";

/**
 * Parse highlight lines from string or array format
 * Supports: "1,3,5-7" or [1, 3, 5, 6, 7]
 */
function parseHighlightLines(input: number[] | string | undefined): number[] {
	if (!input) {
		return [];
	}

	if (Array.isArray(input)) {
		return input;
	}

	const lines: number[] = [];
	const parts = input.split(",");

	for (const part of parts) {
		const trimmed = part.trim();
		if (trimmed.includes("-")) {
			const rangeParts = trimmed.split("-");
			const start = Number.parseInt(rangeParts[0] ?? "", 10);
			const end = Number.parseInt(rangeParts[1] ?? "", 10);
			const isValidRange = Number.isFinite(start) && Number.isFinite(end);
			if (isValidRange) {
				for (let i = start; i <= end; i++) {
					lines.push(i);
				}
			}
		} else {
			const num = Number.parseInt(trimmed, 10);
			if (Number.isFinite(num)) {
				lines.push(num);
			}
		}
	}

	return lines;
}

/**
 * Create a Shiki transformer for highlighting specific lines
 */
function createHighlightTransformer(
	highlightLines: number[]
): ShikiTransformer {
	return {
		line(node, line) {
			if (highlightLines.includes(line)) {
				node.properties["data-highlighted-line"] = "";
			}
		},
	};
}

type FrameworkCodeExample = {
	code: string;
	comment?: string | React.ReactNode;
	commentClassName?: string;
	highlightLines?: number[] | string;
};

type DashboardCodeBlockProps = React.ComponentProps<"div"> & {
	code: string | Partial<Record<SupportedFramework, FrameworkCodeExample>>;
	language?: string;
	fileName: string;
	highlightLines?: number[] | string;
};

const FRAMEWORK_META: Record<
	SupportedFramework,
	{
		label: string;
		icon: React.ComponentType<{ className?: string }>;
	}
> = {
	react: {
		label: "React",
		icon: ReactIcon,
	},
	nextjs: {
		label: "Next.js",
		icon: NextJsIcon,
	},
};

const COLLAPSED_PREVIEW_HEIGHT = 200;

export function DashboardCodeBlock({
	fileName,
	code,
	language = "tsx",
	className,
	highlightLines,
}: DashboardCodeBlockProps) {
	const frameworkExamples = React.useMemo(() => {
		if (typeof code === "string") {
			return null;
		}

		const entries = (
			Object.entries(code) as [
				SupportedFramework,
				FrameworkCodeExample | undefined,
			][]
		) // type-safe iteration
			.filter(([, value]) => Boolean(value?.code))
			.map(([framework, value]) => ({
				framework,
				code: value?.code ?? "",
				comment: value?.comment,
				commentClassName: value?.commentClassName,
				highlightLines: value?.highlightLines,
			}));

		if (!entries.length) {
			return null;
		}

		const order: SupportedFramework[] = ["nextjs", "react"];
		entries.sort(
			(a, b) => order.indexOf(a.framework) - order.indexOf(b.framework)
		);

		return entries;
	}, [code]);

	const [selectedFramework, setSelectedFramework] =
		React.useState<SupportedFramework | null>(
			frameworkExamples?.[0]?.framework ?? null
		);

	React.useEffect(() => {
		if (frameworkExamples?.length) {
			setSelectedFramework(frameworkExamples[0]?.framework ?? null);
			return;
		}

		setSelectedFramework(null);
	}, [frameworkExamples]);

	const activeExample = React.useMemo(() => {
		if (!frameworkExamples?.length) {
			return null;
		}

		const currentFramework =
			selectedFramework ?? frameworkExamples[0]?.framework ?? null;
		return (
			frameworkExamples.find(
				(example) => example.framework === currentFramework
			) ?? frameworkExamples[0]
		);
	}, [frameworkExamples, selectedFramework]);

	const activeCode =
		typeof code === "string" ? code : (activeExample?.code ?? "");
	const activeComment =
		typeof code === "string" ? undefined : activeExample?.comment;
	const activeCommentClassName =
		typeof code === "string" ? undefined : activeExample?.commentClassName;
	const activeHighlightLines =
		typeof code === "string" ? highlightLines : activeExample?.highlightLines;

	const parsedHighlightLines = React.useMemo(
		() => parseHighlightLines(activeHighlightLines),
		[activeHighlightLines]
	);

	const transformers = React.useMemo(() => {
		const baseTransformers = [...SHARED_SHIKI_TRANSFORMERS];
		if (parsedHighlightLines.length > 0) {
			baseTransformers.push(createHighlightTransformer(parsedHighlightLines));
		}
		return baseTransformers;
	}, [parsedHighlightLines]);

	const highlighted = useShikiHighlighter(
		activeCode,
		language,
		{
			light: "github-light",
			dark: "github-dark",
		},
		{
			defaultColor: false,
			cssVariablePrefix: "--shiki-",
			transformers,
		}
	);

	const showFrameworkSwitcher = Boolean(
		frameworkExamples && frameworkExamples.length > 1
	);
	const codeContainerRef = React.useRef<HTMLDivElement>(null);
	const [isExpandable, setIsExpandable] = React.useState(false);
	const [isExpanded, setIsExpanded] = React.useState(false);

	const isCollapsed = isExpandable && !isExpanded;

	React.useEffect(() => {
		setIsExpanded(false);
	}, [activeCode, fileName, selectedFramework]);

	React.useEffect(() => {
		const codeContainer = codeContainerRef.current;
		if (!codeContainer) {
			setIsExpandable(false);
			return;
		}

		let rafId: number | null = null;

		const updateExpandableState = () => {
			const preElement = codeContainer.querySelector("pre");
			const measuredHeight =
				preElement?.scrollHeight ?? codeContainer.scrollHeight;
			setIsExpandable(measuredHeight > COLLAPSED_PREVIEW_HEIGHT);
		};

		const scheduleUpdate = () => {
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
			}

			rafId = requestAnimationFrame(() => {
				updateExpandableState();
				rafId = null;
			});
		};

		updateExpandableState();

		const resizeObserver = new ResizeObserver(scheduleUpdate);
		resizeObserver.observe(codeContainer);

		const preElement = codeContainer.querySelector("pre");
		if (preElement) {
			resizeObserver.observe(preElement);
		}

		const mutationObserver = new MutationObserver(scheduleUpdate);
		mutationObserver.observe(codeContainer, {
			childList: true,
			subtree: true,
			characterData: true,
		});

		return () => {
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
			}
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	}, [activeCode, highlighted, selectedFramework]);

	return (
		<div className="flex flex-col">
			<div
				className={cn(
					"relative overflow-clip rounded border bg-background-200 pt-6",
					className
				)}
			>
				{showFrameworkSwitcher ? (
					<div className="absolute top-0 left-0 flex items-center gap-0">
						{frameworkExamples?.map(({ framework }) => {
							const meta = FRAMEWORK_META[framework];

							return (
								<Button
									className={cn(
										"h-9 gap-3 rounded-none border-0 border-transparent border-b has-[>svg]:px-3",
										selectedFramework === framework
											? "border-primary/20 text-primary"
											: "border-transparent opacity-70 hover:opacity-100"
									)}
									key={framework}
									onClick={() => setSelectedFramework(framework)}
									size="sm"
									type="button"
									variant="ghost"
								>
									<meta.icon className="size-3.5 fill-primary" />
									{meta.label}
								</Button>
							);
						})}
					</div>
				) : null}
				<div
					className={cn(
						"absolute top-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2",
						{
							"right-6": showFrameworkSwitcher,
							"left-0": !showFrameworkSwitcher,
						}
					)}
				>
					<div className="flex items-center gap-2 text-muted-foreground text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:translate-y-px [&_svg]:opacity-70">
						<FileIcon />
						<span>{fileName}</span>
					</div>
				</div>
				<div
					className={cn({
						"max-h-[200px] overflow-hidden": isCollapsed,
					})}
					ref={codeContainerRef}
				>
					<ComponentCodeReact code={activeCode}>
						{highlighted}
					</ComponentCodeReact>
				</div>
				{isCollapsed ? (
					<div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background-200 via-background-200/95 to-transparent" />
				) : null}
				{isExpandable ? (
					isCollapsed ? (
						<div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center px-4 pb-3">
							<Button
								className="pointer-events-auto h-8"
								onClick={() => setIsExpanded(true)}
								size="sm"
								type="button"
								variant="secondary"
							>
								Expand
							</Button>
						</div>
					) : (
						<div className="flex items-center justify-center border-t px-4 py-2">
							<Button
								className="h-7"
								onClick={() => setIsExpanded(false)}
								size="xs"
								type="button"
								variant="ghost"
							>
								Collapse
							</Button>
						</div>
					)
				) : null}
			</div>
			{activeComment ? (
				<div
					className={cn(
						"py-2 text-muted-foreground text-sm",
						activeCommentClassName
					)}
				>
					{activeComment}
				</div>
			) : null}
		</div>
	);
}

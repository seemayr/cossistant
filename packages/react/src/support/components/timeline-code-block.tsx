import type React from "react";
import {
	TimelineCodeBlock as PrimitiveTimelineCodeBlock,
	type TimelineCodeBlockProps as PrimitiveTimelineCodeBlockProps,
} from "../../primitives/timeline-code-block";
import { CoButton } from "./button";

export type TimelineCodeBlockProps = PrimitiveTimelineCodeBlockProps;

export function TimelineCodeBlock({
	code,
	language,
	fileName,
	className,
}: TimelineCodeBlockProps): React.ReactElement {
	return (
		<PrimitiveTimelineCodeBlock
			className={`mt-1 w-full overflow-hidden rounded border border-co-border bg-co-background-200 text-co-foreground ${className ?? ""}`.trim()}
			code={code}
			fileName={fileName}
			language={language}
		>
			{({
				code: content,
				codeClassName,
				fileName: resolvedFileName,
				languageLabel,
				hasCopied,
				onCopy,
			}) => (
				<>
					<div className="flex items-center justify-between gap-2 px-2 py-1.5 text-co-muted-foreground">
						<div className="flex min-w-0 items-center gap-2">
							{resolvedFileName ? (
								<span className="truncate font-medium text-co-foreground/80 text-xs">
									{resolvedFileName}
								</span>
							) : null}
							<span className="rounded border border-co-border/70 bg-co-background-500 px-1.5 py-0.5 font-medium text-[10px] text-co-muted-foreground uppercase tracking-wide">
								{languageLabel}
							</span>
						</div>

						<CoButton
							onClick={() => {
								void onCopy();
							}}
							size="small"
							type="button"
							variant="ghost"
						>
							{hasCopied ? "Copied" : "Copy"}
						</CoButton>
					</div>

					<pre className="no-scrollbar overflow-x-auto p-3 font-co-mono text-co-foreground text-xs leading-relaxed">
						<code
							className={[codeClassName, "font-co-mono text-co-foreground"]
								.filter(Boolean)
								.join(" ")}
						>
							{content}
						</code>
					</pre>
				</>
			)}
		</PrimitiveTimelineCodeBlock>
	);
}

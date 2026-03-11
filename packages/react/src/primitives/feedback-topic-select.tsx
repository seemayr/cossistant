import * as React from "react";
import { Icon } from "../support/components/icons";
import { cn } from "../support/utils";

export type FeedbackTopicSelectProps = Omit<
	React.SelectHTMLAttributes<HTMLSelectElement>,
	"children" | "onChange" | "value"
> & {
	options: string[];
	value: string;
	onValueChange?: (value: string) => void;
	placeholder?: string;
	invalid?: boolean;
	wrapperClassName?: string;
	iconClassName?: string;
};

export function FeedbackTopicSelectView(
	{
		options,
		value,
		onValueChange,
		placeholder = "Select a topic...",
		invalid = false,
		className,
		wrapperClassName,
		iconClassName,
		...props
	}: FeedbackTopicSelectProps,
	ref: React.Ref<HTMLSelectElement>
): React.ReactElement {
	return (
		<div
			className={cn("relative", wrapperClassName)}
			data-feedback-topic-select="true"
		>
			<select
				{...props}
				className={cn(
					"h-14 w-full appearance-none rounded-[18px] border bg-co-background px-4 pr-12 text-base text-co-foreground outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
					invalid
						? "border-co-destructive"
						: "border-co-border hover:border-co-foreground/25 focus:border-co-primary",
					className
				)}
				data-feedback-topic-select-control="true"
				onChange={(event) => onValueChange?.(event.target.value)}
				ref={ref}
				value={value}
			>
				<option value="">{placeholder}</option>
				{options.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
			</select>
			<Icon
				className={cn(
					"-translate-y-1/2 pointer-events-none absolute top-1/2 right-4 h-4 w-4 text-co-muted-foreground",
					iconClassName
				)}
				name="chevron-down"
			/>
		</div>
	);
}

export const FeedbackTopicSelect = React.forwardRef<
	HTMLSelectElement,
	FeedbackTopicSelectProps
>(FeedbackTopicSelectView);

FeedbackTopicSelect.displayName = "FeedbackTopicSelect";

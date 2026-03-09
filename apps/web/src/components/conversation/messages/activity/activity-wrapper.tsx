import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import type React from "react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ToolCallState } from "./types";

export type ActivityIcon =
	| { type: "logo" }
	| { type: "spinner" }
	| { type: "avatar"; name: string; image?: string | null }
	| {
			type: "icon";
			Icon: LucideIcon;
			iconKey: string;
	  }
	| { type: "custom"; content: React.ReactNode };

function ActivityIconRenderer({ icon }: { icon: ActivityIcon }) {
	switch (icon.type) {
		case "spinner":
			return (
				<div className="flex size-5 shrink-0 items-center justify-center">
					<Spinner className="size-4" size={20} />
				</div>
			);
		case "avatar":
			return (
				<Avatar
					className="size-5 shrink-0 overflow-clip"
					fallbackName={icon.name}
					url={icon.image}
				/>
			);
		case "icon": {
			const Icon = icon.Icon;
			return (
				<div className="flex size-5 shrink-0 items-center justify-center">
					<Icon
						aria-hidden
						className="size-4 text-muted-foreground"
						data-activity-icon={icon.iconKey}
					/>
				</div>
			);
		}
		case "custom":
			return <>{icon.content}</>;
		default:
			return (
				<div className="flex size-5 shrink-0 items-center justify-center">
					<Logo className="size-4 text-primary/90" />
				</div>
			);
	}
}

function resolveIcon(
	icon: ActivityIcon | undefined,
	state?: ToolCallState
): ActivityIcon {
	if (icon) {
		return icon;
	}
	if (state === "partial") {
		return { type: "spinner" };
	}
	return { type: "logo" };
}

function ActivityStateIndicator({ state }: { state: ToolCallState }) {
	return (
		<span
			aria-hidden="true"
			className="ml-2 flex min-h-6 w-5 shrink-0 items-start justify-center"
			data-tool-execution-indicator-slot="true"
		>
			{state === "partial" ? (
				<span className="mt-1 shrink-0" data-tool-execution-indicator="spinner">
					<Spinner className="text-primary/70" size={12} />
				</span>
			) : (
				<span
					className={cn(
						"font-mono text-sm leading-6",
						state === "error" ? "text-destructive/70" : "text-muted-foreground"
					)}
					data-tool-execution-indicator="arrow"
				>
					{"->"}
				</span>
			)}
		</span>
	);
}

export function ActivityWrapper({
	state,
	text,
	timestamp,
	icon,
	showIcon = true,
	showStateIndicator = false,
	className,
	children,
}: {
	state: ToolCallState;
	text: React.ReactNode;
	timestamp: string;
	icon?: ActivityIcon;
	showIcon?: boolean;
	showStateIndicator?: boolean;
	className?: string;
	children?: React.ReactNode;
}) {
	const isError = state === "error";
	const resolvedIcon = resolveIcon(icon, state);

	return (
		<motion.div
			animate={{ opacity: 1, y: 0 }}
			className={cn(
				"group/activity flex w-full",
				showIcon ? "gap-2" : "gap-0",
				className
			)}
			data-tool-display-state={showStateIndicator ? state : undefined}
			initial={{ opacity: 0, y: 6 }}
			transition={{ duration: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
		>
			{showIcon ? <ActivityIconRenderer icon={resolvedIcon} /> : null}
			<div className="flex min-w-0 flex-1 flex-col">
				<div
					className={cn(
						"flex min-h-6 gap-2 text-muted-foreground text-sm",
						showStateIndicator ? "items-start" : "items-center",
						isError && "text-destructive/70"
					)}
				>
					{showStateIndicator ? <ActivityStateIndicator state={state} /> : null}
					<span className="min-w-0 break-words">{text}</span>
					<time className="text-xs opacity-0 transition-opacity group-hover/activity:opacity-100">
						[{timestamp}]
					</time>
				</div>
				{children}
			</div>
		</motion.div>
	);
}

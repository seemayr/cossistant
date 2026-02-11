"use client";

import { X } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type PromptEditModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title?: string;
	children: React.ReactNode;
	footer?: React.ReactNode;
	contentClassName?: string;
};

export function PromptEditModal({
	open,
	onOpenChange,
	title = "Prompt Editor",
	children,
	footer,
	contentClassName,
}: PromptEditModalProps) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent
				className="h-screen w-screen gap-0 rounded-none p-0 md:max-w-none"
				showCloseButton={false}
			>
				<DialogHeader className="flex-row items-center justify-between px-6 py-4">
					<DialogTitle className="text-md">{title}</DialogTitle>
					<Button
						onClick={() => onOpenChange(false)}
						size="icon-small"
						type="button"
						variant="ghost"
					>
						<X />
					</Button>
				</DialogHeader>

				<ScrollArea
					className={cn("h-[calc(100vh-180px)] flex-1 p-3", contentClassName)}
					orientation="vertical"
					scrollMask
				>
					{children}
				</ScrollArea>

				<div className="flex items-center justify-end px-6 py-4">{footer}</div>
			</DialogContent>
		</Dialog>
	);
}

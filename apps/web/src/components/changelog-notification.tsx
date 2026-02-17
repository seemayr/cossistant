"use client";

import { format } from "date-fns";
import { XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useChangelogDismissed } from "@/hooks/use-changelog-dismissed";
import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

type ChangelogNotificationProps = {
	version: string;
	description: string;
	tinyExcerpt: string;
	date: string;
	children?: React.ReactNode;
};

export function ChangelogNotification({
	version,
	description,
	tinyExcerpt,
	date,
	children,
}: ChangelogNotificationProps) {
	const { isDismissed, dismiss } = useChangelogDismissed();
	const [modalOpen, setModalOpen] = useState(false);

	if (isDismissed(version)) {
		return null;
	}

	return (
		<>
			<div className="flex items-center gap-1.5">
				<button
					className="flex items-center gap-2 px-1 py-0.5 font-mono text-primary/80 text-xs transition-colors hover:bg-background-300 hover:text-primary"
					onClick={() => setModalOpen(true)}
					type="button"
				>
					<span className="rounded-xs bg-background-400 px-1.5 py-0.5 font-semibold text-[10px] leading-none">
						v{version}
					</span>
					<span className="hidden max-w-48 truncate sm:inline">
						{tinyExcerpt}
					</span>
				</button>
				<button
					className="rounded-sm p-0.5 text-primary/40 transition-colors hover:bg-background-300 hover:text-primary/80"
					onClick={(e) => {
						e.stopPropagation();
						dismiss(version);
					}}
					type="button"
				>
					<XIcon className="size-3" />
				</button>
			</div>

			<Dialog onOpenChange={setModalOpen} open={modalOpen}>
				<DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
					<DialogHeader>
						<div className="flex items-center gap-3">
							<span className="inline-flex items-center rounded-sm bg-background-300 px-2.5 py-1 font-mono text-sm">
								v{version}
							</span>
							<time className="text-muted-foreground text-sm" dateTime={date}>
								{format(new Date(date), "MMM d, yyyy")}
							</time>
						</div>
						<DialogTitle className="text-xl">{description}</DialogTitle>
						<DialogDescription className="sr-only">
							Changelog for version {version}
						</DialogDescription>
					</DialogHeader>

					<ScrollArea className="flex-1">
						<div className="prose prose-sm dark:prose-invert max-w-none">
							{children}
						</div>
					</ScrollArea>

					<DialogFooter>
						<Button asChild size="sm" variant="outline">
							<Link href="/changelog">View full changelog</Link>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

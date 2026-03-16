"use client";

import type { FaqKnowledgePayload, KnowledgeResponse } from "@cossistant/types";
import {
	BotIcon,
	EditIcon,
	EyeIcon,
	EyeOffIcon,
	MoreHorizontalIcon,
	Trash2Icon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type FaqListItemProps = {
	faq: KnowledgeResponse;
	onEdit: (faq: KnowledgeResponse) => void;
	onDeepen: (faq: KnowledgeResponse) => void;
	onDelete: (id: string) => void;
	onToggleIncluded: (id: string, isIncluded: boolean) => void;
	isDeleting?: boolean;
	isToggling?: boolean;
};

export function FaqListItem({
	faq,
	onEdit,
	onDeepen,
	onDelete,
	onToggleIncluded,
	isDeleting,
	isToggling,
}: FaqListItemProps) {
	const payload = faq.payload as FaqKnowledgePayload;

	return (
		<div
			className={cn(
				"group rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50",
				!faq.isIncluded && "opacity-60"
			)}
		>
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h4 className="truncate font-medium">{payload.question}</h4>
						{!faq.isIncluded && (
							<Badge className="shrink-0" variant="secondary">
								Excluded
							</Badge>
						)}
					</div>
					<p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
						{payload.answer}
					</p>
					{payload.categories && payload.categories.length > 0 && (
						<div className="mt-2 flex flex-wrap gap-1">
							{payload.categories.map((category) => (
								<Badge key={category} variant="outline">
									{category}
								</Badge>
							))}
						</div>
					)}
				</div>

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							className="h-8 w-8 opacity-0 group-hover:opacity-100"
							size="icon"
							variant="ghost"
						>
							<MoreHorizontalIcon className="h-4 w-4" />
							<span className="sr-only">Open menu</span>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => onEdit(faq)}>
							<EditIcon className="mr-2 h-4 w-4" />
							Edit
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => onDeepen(faq)}>
							<BotIcon className="mr-2 h-4 w-4" />
							Deepen with AI
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={isToggling}
							onClick={() => onToggleIncluded(faq.id, !faq.isIncluded)}
						>
							{faq.isIncluded ? (
								<>
									<EyeOffIcon className="mr-2 h-4 w-4" />
									Exclude from training
								</>
							) : (
								<>
									<EyeIcon className="mr-2 h-4 w-4" />
									Include in training
								</>
							)}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="text-destructive focus:text-destructive"
							disabled={isDeleting}
							onClick={() => onDelete(faq.id)}
						>
							<Trash2Icon className="mr-2 h-4 w-4" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

export type { FaqListItemProps };

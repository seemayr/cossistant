"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/lib/trpc/client";

type DeleteWebsiteDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	websiteSlug: string;
	websiteName: string;
};

const CONFIRMATION_TEXT = "delete";

export function DeleteWebsiteDialog({
	open,
	onOpenChange,
	websiteSlug,
	websiteName,
}: DeleteWebsiteDialogProps) {
	const [confirmationInput, setConfirmationInput] = useState("");
	const router = useRouter();
	const trpc = useTRPC();

	const isConfirmed =
		confirmationInput.toLowerCase() === CONFIRMATION_TEXT.toLowerCase();

	const { mutateAsync: deleteWebsite, isPending } = useMutation(
		trpc.website.delete.mutationOptions({
			onSuccess: () => {
				toast.success("Website deleted successfully.");
				onOpenChange(false);
				router.replace("/select");
			},
			onError: (error) => {
				toast.error(error.message || "Failed to delete website.");
			},
		})
	);

	const handleDelete = async () => {
		if (!isConfirmed) {
			return;
		}

		await deleteWebsite({
			websiteSlug,
		});
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setConfirmationInput("");
		}
		onOpenChange(nextOpen);
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete Website</DialogTitle>
					<DialogDescription>
						This action is permanent and cannot be undone.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
						<p className="font-medium text-destructive text-sm">
							Warning: Deleting this website will permanently remove:
						</p>
						<ul className="mt-2 list-inside list-disc space-y-1 text-destructive text-sm">
							<li>
								All support data for{" "}
								<span className="font-medium text-destructive">
									{websiteName}
								</span>
							</li>
							<li>All conversations, contacts, visitors, and analytics data</li>
							<li>All AI agents, knowledge base entries, and API keys</li>
						</ul>
					</div>

					<div className="space-y-2">
						<label
							className="font-medium text-sm"
							htmlFor="website-delete-confirmation"
						>
							Type <span className="font-mono">delete</span> to confirm
						</label>
						<Input
							autoComplete="off"
							disabled={isPending}
							id="website-delete-confirmation"
							onChange={(event) => setConfirmationInput(event.target.value)}
							placeholder="delete"
							value={confirmationInput}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						disabled={isPending}
						onClick={() => handleOpenChange(false)}
						type="button"
						variant="outline"
					>
						Cancel
					</Button>
					<Button
						disabled={!isConfirmed || isPending}
						onClick={handleDelete}
						type="button"
						variant="destructive"
					>
						{isPending ? "Deleting..." : "Delete Website"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

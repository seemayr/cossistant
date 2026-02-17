"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, MailPlusIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

type TeamInviteModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	websiteSlug: string;
};

type InviteRole = "member" | "admin";

type InviteResult = {
	email: string;
	status:
		| "invited"
		| "already-member"
		| "already-invited"
		| "invalid-email"
		| "plan-limit"
		| "failed";
	message?: string;
};

function parseEmails(raw: string): string[] {
	return [
		...new Set(
			raw
				.split(/[\n,;]+/g)
				.map((item) => item.trim().toLowerCase())
				.filter(Boolean)
		),
	];
}

function statusLabel(status: InviteResult["status"]): string {
	switch (status) {
		case "invited":
			return "Invited";
		case "already-member":
			return "Already has access";
		case "already-invited":
			return "Already invited";
		case "invalid-email":
			return "Invalid email";
		case "plan-limit":
			return "Plan limit";
		default:
			return "Failed";
	}
}

function statusVariant(
	status: InviteResult["status"]
): "default" | "secondary" {
	return status === "invited" ? "default" : "secondary";
}

export function TeamInviteModal({
	open,
	onOpenChange,
	websiteSlug,
}: TeamInviteModalProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [emailsInput, setEmailsInput] = useState("");
	const [role, setRole] = useState<InviteRole>("member");
	const [results, setResults] = useState<InviteResult[]>([]);

	const parsedEmails = useMemo(() => parseEmails(emailsInput), [emailsInput]);

	const { data: teamSettings } = useQuery(
		trpc.team.getSettings.queryOptions({ websiteSlug })
	);

	const { mutateAsync: inviteMany, isPending } = useMutation(
		trpc.team.inviteMany.mutationOptions({
			onSuccess: async (data) => {
				setResults(data.results);
				await Promise.all([
					queryClient.invalidateQueries({
						queryKey: trpc.team.getSettings.queryKey({ websiteSlug }),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.user.getWebsiteMembers.queryKey({ websiteSlug }),
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.plan.getPlanInfo.queryKey({ websiteSlug }),
					}),
				]);
			},
			onError: (error) => {
				toast.error(error.message || "Failed to send invitations.");
			},
		})
	);

	useEffect(() => {
		if (!open) {
			setEmailsInput("");
			setRole("member");
			setResults([]);
		}
	}, [open]);

	const atSeatLimit =
		typeof teamSettings?.seats.remaining === "number" &&
		teamSettings.seats.remaining <= 0;
	const canManageTeam = teamSettings?.canManageTeam ?? false;

	const hasPlanLimitResult = results.some(
		(result) => result.status === "plan-limit"
	);

	const handleSubmit = async () => {
		if (!canManageTeam) {
			toast.error("Only admins and owners can invite team members.");
			return;
		}

		if (parsedEmails.length === 0) {
			toast.error("Please add at least one email.");
			return;
		}

		const response = await inviteMany({
			websiteSlug,
			emails: parsedEmails,
			role,
		});

		if (response.summary.invited > 0) {
			toast.success(
				`${response.summary.invited} invitation${
					response.summary.invited === 1 ? "" : "s"
				} sent.`
			);
		}
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-[640px]">
				<DialogHeader>
					<DialogTitle>Invite team members</DialogTitle>
					<DialogDescription>
						Add one or more emails. You can separate entries with commas, new
						lines, or semicolons.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="invite-emails">Emails</Label>
						<Textarea
							id="invite-emails"
							onChange={(event) => setEmailsInput(event.target.value)}
							placeholder={"alice@company.com\nbob@company.com"}
							rows={6}
							value={emailsInput}
						/>
						<p className="text-muted-foreground text-xs">
							{parsedEmails.length} unique email
							{parsedEmails.length === 1 ? "" : "s"} ready to invite.
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="invite-role">Role</Label>
						<Select
							onValueChange={(value) => setRole(value as InviteRole)}
							value={role}
						>
							<SelectTrigger id="invite-role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="member">Member</SelectItem>
								<SelectItem value="admin">Admin</SelectItem>
							</SelectContent>
						</Select>
					</div>

					<div className="rounded border border-primary/10 bg-background-100 px-3 py-2 text-xs">
						<span className="font-medium">
							Seats: {teamSettings?.seats.used ?? 0}
						</span>
						{" + "}
						<span className="font-medium">
							{teamSettings?.seats.reserved ?? 0}
						</span>
						{" reserved / "}
						<span className="font-medium">
							{teamSettings?.seats.limit === null
								? "Unlimited"
								: (teamSettings?.seats.limit ?? 0)}
						</span>
					</div>

					{atSeatLimit && (
						<div className="rounded border border-cossistant-orange/30 bg-cossistant-orange/10 px-3 py-2 text-xs">
							<p className="font-medium text-cossistant-orange">
								You've reached your seat limit.
							</p>
							<p className="mt-1 text-muted-foreground">
								Upgrade your plan to invite more teammates.
							</p>
						</div>
					)}

					{teamSettings && !canManageTeam && (
						<div className="rounded border border-primary/10 bg-background-100 px-3 py-2 text-muted-foreground text-xs">
							Only organization admins and owners can send invitations.
						</div>
					)}

					{results.length > 0 && (
						<div className="max-h-50 space-y-2 overflow-y-auto rounded border border-primary/10 bg-background-100 p-2">
							{results.map((result) => (
								<div
									className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-sm"
									key={`${result.email}-${result.status}`}
								>
									<div className="min-w-0">
										<p className="truncate font-medium">{result.email}</p>
										{result.message ? (
											<p className="truncate text-muted-foreground text-xs">
												{result.message}
											</p>
										) : null}
									</div>
									<Badge variant={statusVariant(result.status)}>
										{statusLabel(result.status)}
									</Badge>
								</div>
							))}
						</div>
					)}

					{hasPlanLimitResult && (
						<div className="flex items-center justify-between rounded border border-cossistant-orange/30 bg-cossistant-orange/10 px-3 py-2">
							<p className="text-cossistant-orange text-xs">
								Some invites were blocked by your plan limit.
							</p>
							<Button asChild size="sm" variant="outline">
								<Link href={`/${websiteSlug}/settings/plan`}>Upgrade</Link>
							</Button>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Close
					</Button>
					<Button
						className={cn(atSeatLimit && "opacity-60")}
						disabled={!canManageTeam || isPending || parsedEmails.length === 0}
						onClick={handleSubmit}
					>
						{isPending ? (
							<>
								<Loader2Icon className="mr-2 size-4 animate-spin" />
								Sending...
							</>
						) : (
							<>
								<MailPlusIcon className="mr-2 size-4" />
								Send invites
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

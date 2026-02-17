"use client";

import type { RouterOutputs } from "@cossistant/api/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
	Loader2Icon,
	MailIcon,
	MoreHorizontalIcon,
	RefreshCwIcon,
	Trash2Icon,
	UserPlusIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useInviteTeamModal } from "@/hooks/use-invite-team-modal";
import { useTRPC } from "@/lib/trpc/client";

type TeamSettings = RouterOutputs["team"]["getSettings"];
type TeamMember = TeamSettings["members"][number];
type TeamInvitation = TeamSettings["invitations"][number];

type TeamSettingsClientProps = {
	websiteSlug: string;
	currentUserId: string;
};

function normalizeRole(
	role: string | null | undefined
): "owner" | "admin" | "member" | "unknown" {
	if (!role) {
		return "unknown";
	}

	const normalizedRoles = role
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean);

	if (normalizedRoles.includes("owner")) {
		return "owner";
	}
	if (normalizedRoles.includes("admin")) {
		return "admin";
	}
	if (normalizedRoles.includes("member")) {
		return "member";
	}

	return "unknown";
}

function roleLabel(role: ReturnType<typeof normalizeRole>): string {
	switch (role) {
		case "owner":
			return "Owner";
		case "admin":
			return "Admin";
		case "member":
			return "Member";
		default:
			return "Unknown";
	}
}

function invitationStatusLabel(invitation: TeamInvitation): string {
	if (invitation.isExpired) {
		return "Expired";
	}

	switch (invitation.status) {
		case "pending":
			return "Pending";
		case "accepted":
			return "Accepted";
		case "rejected":
			return "Declined";
		case "canceled":
			return "Canceled";
		default:
			return invitation.status;
	}
}

function invitationStatusVariant(
	invitation: TeamInvitation
): "default" | "secondary" {
	if (invitation.status === "accepted") {
		return "default";
	}
	return "secondary";
}

export function TeamSettingsClient({
	websiteSlug,
	currentUserId,
}: TeamSettingsClientProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { openInviteTeamModal } = useInviteTeamModal();
	const [updatingRoleMemberId, setUpdatingRoleMemberId] = useState<
		string | null
	>(null);
	const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
	const [resendingInvitationId, setResendingInvitationId] = useState<
		string | null
	>(null);
	const [cancelingInvitationId, setCancelingInvitationId] = useState<
		string | null
	>(null);
	const [pendingRemoveMember, setPendingRemoveMember] =
		useState<TeamMember | null>(null);
	const [pendingCancelInvitation, setPendingCancelInvitation] =
		useState<TeamInvitation | null>(null);

	const settingsQuery = useQuery(
		trpc.team.getSettings.queryOptions({
			websiteSlug,
		})
	);

	const invalidateTeamViews = async () => {
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
	};

	const { mutateAsync: updateMemberRole } = useMutation(
		trpc.team.updateMemberRole.mutationOptions({
			onSuccess: async () => {
				await invalidateTeamViews();
			},
		})
	);

	const { mutateAsync: removeMemberAccess } = useMutation(
		trpc.team.removeMemberAccess.mutationOptions({
			onSuccess: async () => {
				await invalidateTeamViews();
			},
		})
	);

	const { mutateAsync: resendInvitation } = useMutation(
		trpc.team.resendInvitation.mutationOptions({
			onSuccess: async () => {
				await invalidateTeamViews();
			},
		})
	);

	const { mutateAsync: cancelInvitation } = useMutation(
		trpc.team.cancelInvitation.mutationOptions({
			onSuccess: async () => {
				await invalidateTeamViews();
			},
		})
	);

	const handleRoleChange = async (
		target: TeamMember,
		nextRole: "member" | "admin"
	) => {
		if (!target.memberId) {
			toast.error("This member can't be updated from this page.");
			return;
		}

		setUpdatingRoleMemberId(target.memberId);
		try {
			await updateMemberRole({
				websiteSlug,
				memberId: target.memberId,
				role: nextRole,
			});
			toast.success(`Role updated to ${nextRole}.`);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to update role.";
			toast.error(message);
		} finally {
			setUpdatingRoleMemberId(null);
		}
	};

	const handleRemoveMember = (target: TeamMember) => {
		if (!target.memberId) {
			toast.error("This member can't be removed from this page.");
			return;
		}

		setPendingRemoveMember(target);
	};

	const handleConfirmRemoveMember = async () => {
		const target = pendingRemoveMember;
		if (!target?.memberId) {
			return;
		}

		setRemovingMemberId(target.memberId);
		try {
			await removeMemberAccess({
				websiteSlug,
				memberId: target.memberId,
			});
			toast.success("Access removed.");
			setPendingRemoveMember(null);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to remove access.";
			toast.error(message);
		} finally {
			setRemovingMemberId(null);
		}
	};

	const handleResendInvitation = async (invitationId: string) => {
		setResendingInvitationId(invitationId);
		try {
			await resendInvitation({
				websiteSlug,
				invitationId,
			});
			toast.success("Invitation resent.");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to resend invitation.";
			toast.error(message);
		} finally {
			setResendingInvitationId(null);
		}
	};

	const handleCancelInvitation = (invitation: TeamInvitation) => {
		setPendingCancelInvitation(invitation);
	};

	const handleConfirmCancelInvitation = async () => {
		const invitationId = pendingCancelInvitation?.id;
		if (!invitationId) {
			return;
		}

		setCancelingInvitationId(invitationId);
		try {
			await cancelInvitation({
				websiteSlug,
				invitationId,
			});
			toast.success("Invitation canceled.");
			setPendingCancelInvitation(null);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to cancel invitation.";
			toast.error(message);
		} finally {
			setCancelingInvitationId(null);
		}
	};

	if (settingsQuery.isPending) {
		return (
			<div className="flex items-center gap-2 p-4 text-muted-foreground text-sm">
				<Loader2Icon className="size-4 animate-spin" />
				Loading team settings...
			</div>
		);
	}

	if (settingsQuery.isError || !settingsQuery.data) {
		return (
			<div className="flex flex-col gap-3 p-4">
				<p className="text-destructive text-sm">
					{settingsQuery.error?.message ?? "Failed to load team settings."}
				</p>
				<Button
					className="w-fit"
					onClick={() => settingsQuery.refetch()}
					variant="outline"
				>
					<RefreshCwIcon className="size-4" />
					Retry
				</Button>
			</div>
		);
	}

	const settings = settingsQuery.data;
	const atSeatLimit =
		settings.seats.remaining !== null && settings.seats.remaining <= 0;

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3 border-primary/10 border-b p-4">
				<div className="space-y-1">
					<p className="font-medium text-sm">
						Seats: {settings.seats.used} + {settings.seats.reserved} reserved /{" "}
						{settings.seats.limit ?? "Unlimited"}
					</p>
					<p className="text-muted-foreground text-xs">
						Current plan limits how many people can access this website.
					</p>
				</div>
				<div className="flex items-center gap-2">
					{settings.canManageTeam && (
						<Button onClick={() => void openInviteTeamModal()} size="sm">
							<UserPlusIcon className="size-4" />
							Invite members
						</Button>
					)}
				</div>
			</div>

			{atSeatLimit && (
				<div className="mx-4 flex flex-wrap items-center justify-between gap-3 rounded border border-cossistant-orange/30 bg-cossistant-orange/10 px-3 py-2">
					<p className="text-cossistant-orange text-xs">
						You've reached your seat limit. Upgrade to add more teammates.
					</p>
					<Button asChild size="sm" variant="outline">
						<Link href={`/${websiteSlug}/settings/plan`}>Upgrade plan</Link>
					</Button>
				</div>
			)}

			<div className="mx-4 overflow-hidden rounded border border-primary/10">
				<div className="border-primary/10 border-b px-3 py-2">
					<p className="font-medium text-sm">Members with access</p>
				</div>
				<div className="divide-y divide-primary/10">
					{settings.members.map((member) => {
						const normalizedRole = normalizeRole(member.role);
						const isSelf = member.userId === currentUserId;
						const canManageThisMember =
							settings.canManageTeam &&
							Boolean(member.memberId) &&
							!isSelf &&
							normalizedRole !== "owner";
						const isUpdating = member.memberId === updatingRoleMemberId;
						const isRemoving = member.memberId === removingMemberId;

						return (
							<div
								className="group flex items-center gap-3 px-2 py-2 text-sm"
								key={member.userId}
							>
								<Avatar
									className="size-8"
									fallbackName={member.name ?? member.email}
									lastOnlineAt={member.lastSeenAt}
									url={member.image}
								/>

								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<p className="truncate font-medium">
											{member.name ?? member.email.split("@")[0]}
										</p>
										{isSelf && <Badge variant="secondary">You</Badge>}
										{member.accessSource !== "team" && (
											<Badge variant="secondary">Org-wide access</Badge>
										)}
									</div>
									<p className="truncate text-muted-foreground text-xs">
										{member.email}
									</p>
								</div>

								<div className="flex items-center gap-2">
									<Badge
										variant={
											normalizedRole === "member" ? "secondary" : "default"
										}
									>
										{roleLabel(normalizedRole)}
									</Badge>

									{canManageThisMember && (
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button size="icon-small" variant="ghost">
													<MoreHorizontalIcon className="size-4" />
													<span className="sr-only">Member actions</span>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem
													disabled={isUpdating || normalizedRole === "admin"}
													onSelect={() =>
														void handleRoleChange(member, "admin")
													}
												>
													Make admin
												</DropdownMenuItem>
												<DropdownMenuItem
													disabled={isUpdating || normalizedRole === "member"}
													onSelect={() =>
														void handleRoleChange(member, "member")
													}
												>
													Make member
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													disabled={isRemoving}
													onSelect={() => void handleRemoveMember(member)}
													variant="destructive"
												>
													<Trash2Icon className="size-4" />
													Remove access
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div className="mx-4 overflow-hidden rounded border border-primary/10">
				<div className="border-primary/10 border-b px-3 py-2">
					<p className="font-medium text-sm">Invitations</p>
				</div>
				{settings.invitations.length === 0 ? (
					<p className="p-4 text-muted-foreground text-sm">
						No invitations yet.
					</p>
				) : (
					<div className="max-h-80 divide-y divide-primary/10 overflow-y-auto">
						{settings.invitations.map((invitation) => {
							const expiresAt = new Date(invitation.expiresAt);
							const isPending =
								invitation.status === "pending" && !invitation.isExpired;
							const isResending = resendingInvitationId === invitation.id;
							const isCanceling = cancelingInvitationId === invitation.id;

							return (
								<div
									className="group flex items-center gap-3 px-2 py-2 text-sm"
									key={invitation.id}
								>
									<div className="flex size-8 items-center justify-center rounded border border-primary/10 bg-background-100">
										<MailIcon className="size-4 text-muted-foreground" />
									</div>

									<div className="min-w-0 flex-1">
										<p className="truncate font-medium">{invitation.email}</p>
										<p className="truncate text-muted-foreground text-xs">
											{invitation.inviterName
												? `Invited by ${invitation.inviterName}`
												: "Invitation sent"}{" "}
											•{" "}
											{invitation.isExpired
												? `Expired ${formatDistanceToNow(expiresAt, {
														addSuffix: true,
													})}`
												: `Expires ${formatDistanceToNow(expiresAt, {
														addSuffix: true,
													})}`}
										</p>
									</div>

									<div className="flex items-center gap-2">
										<Badge variant={invitationStatusVariant(invitation)}>
											{invitationStatusLabel(invitation)}
										</Badge>

										{settings.canManageTeam && isPending && (
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button size="icon-small" variant="ghost">
														<MoreHorizontalIcon className="size-4" />
														<span className="sr-only">Invitation actions</span>
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														disabled={isResending}
														onSelect={() =>
															void handleResendInvitation(invitation.id)
														}
													>
														<RefreshCwIcon className="size-4" />
														Resend invitation
													</DropdownMenuItem>
													<DropdownMenuItem
														disabled={isCanceling}
														onSelect={() => handleCancelInvitation(invitation)}
														variant="destructive"
													>
														<Trash2Icon className="size-4" />
														Cancel invitation
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										)}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			<Dialog
				onOpenChange={(open) => {
					if (!(open || removingMemberId)) {
						setPendingRemoveMember(null);
					}
				}}
				open={Boolean(pendingRemoveMember)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove member access</DialogTitle>
						<DialogDescription>
							{pendingRemoveMember
								? `This will remove ${pendingRemoveMember.email} from this ${
										pendingRemoveMember.accessSource === "team"
											? "website team"
											: "organization (all websites)"
									}.`
								: "Remove member access."}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							disabled={Boolean(removingMemberId)}
							onClick={() => setPendingRemoveMember(null)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={Boolean(removingMemberId)}
							onClick={() => void handleConfirmRemoveMember()}
							variant="destructive"
						>
							{removingMemberId ? "Removing..." : "Remove access"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				onOpenChange={(open) => {
					if (!(open || cancelingInvitationId)) {
						setPendingCancelInvitation(null);
					}
				}}
				open={Boolean(pendingCancelInvitation)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Cancel invitation</DialogTitle>
						<DialogDescription>
							{pendingCancelInvitation
								? `Cancel the pending invitation for ${pendingCancelInvitation.email}?`
								: "Cancel this invitation?"}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							disabled={Boolean(cancelingInvitationId)}
							onClick={() => setPendingCancelInvitation(null)}
							variant="outline"
						>
							Keep invitation
						</Button>
						<Button
							disabled={Boolean(cancelingInvitationId)}
							onClick={() => void handleConfirmCancelInvitation()}
							variant="destructive"
						>
							{cancelingInvitationId ? "Canceling..." : "Cancel invitation"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

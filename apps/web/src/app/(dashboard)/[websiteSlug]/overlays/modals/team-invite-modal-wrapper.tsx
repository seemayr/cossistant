"use client";

import { TeamInviteModal } from "@/components/modals/team-invite-modal";
import { useWebsite } from "@/contexts/website";
import { useInviteTeamModal } from "@/hooks/use-invite-team-modal";

export function TeamInviteModalWrapper() {
	const website = useWebsite();
	const { isOpen, closeInviteTeamModal } = useInviteTeamModal();

	if (!isOpen) {
		return null;
	}

	return (
		<TeamInviteModal
			onOpenChange={(open) => {
				if (!open) {
					void closeInviteTeamModal();
				}
			}}
			open={isOpen}
			websiteSlug={website.slug}
		/>
	);
}

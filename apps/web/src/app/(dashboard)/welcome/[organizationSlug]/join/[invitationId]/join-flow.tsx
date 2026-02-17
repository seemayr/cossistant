"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { signOut } from "@/lib/auth/client";
import { buildInviteAuthPath } from "@/lib/auth/invite-state";
import { JoinShell } from "./components/join-shell";
import { JoinStatusContent } from "./components/join-status-content";
import {
	type InvitationStatus,
	useJoinAcceptance,
} from "./hooks/use-join-acceptance";

type JoinFlowProps = {
	invitationId: string;
	invitationStatus: InvitationStatus;
	isInvitationValid: boolean;
	invitedEmail: string | null;
	isSignedInEmailMatchingInvitation: boolean | null;
	signedInEmail: string | null;
	organizationName: string;
	organizationSlug: string;
	organizationLogoUrl: string | null;
	websiteName: string | null;
	websiteLogoUrl: string | null;
};

export default function JoinFlow({
	invitationId,
	invitationStatus,
	isInvitationValid,
	invitedEmail,
	isSignedInEmailMatchingInvitation,
	signedInEmail,
	organizationName,
	organizationSlug,
	organizationLogoUrl,
	websiteName,
	websiteLogoUrl,
}: JoinFlowProps) {
	const router = useRouter();
	const inviteTarget = websiteName ?? organizationName;
	const callbackPath = `/welcome/${organizationSlug}/join/${invitationId}`;
	const switchAccountPath = useMemo(
		() =>
			buildInviteAuthPath("/login", {
				callbackPath,
				inviteEmail: invitedEmail,
				inviteTarget,
			}),
		[callbackPath, inviteTarget, invitedEmail]
	);

	const { state, errorMessage, retry } = useJoinAcceptance({
		invitationId,
		invitationStatus,
		isInvitationValid,
		isSignedInEmailMatchingInvitation,
		organizationName,
	});

	const handleSwitchAccount = async () => {
		try {
			await signOut();
		} finally {
			router.replace(switchAccountPath);
		}
	};

	return (
		<JoinShell
			organizationLogoUrl={organizationLogoUrl}
			organizationName={organizationName}
			websiteLogoUrl={websiteLogoUrl}
			websiteName={websiteName}
		>
			<JoinStatusContent
				canSwitchAccount={Boolean(signedInEmail)}
				errorMessage={errorMessage}
				invitationStatus={invitationStatus}
				invitedEmail={invitedEmail}
				onRetry={retry}
				onSwitchAccount={handleSwitchAccount}
				signedInEmail={signedInEmail}
				state={state}
			/>
		</JoinShell>
	);
}

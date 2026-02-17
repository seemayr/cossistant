import { notFound, redirect } from "next/navigation";
import { buildInviteAuthPath } from "@/lib/auth/invite-state";
import { getQueryClient, trpc } from "@/lib/trpc/server";
import JoinFlow from "./join-flow";

type JoinPageProps = {
	params: Promise<{
		organizationSlug: string;
		invitationId: string;
	}>;
};

export default async function JoinPage({ params }: JoinPageProps) {
	const { organizationSlug, invitationId } = await params;
	const queryClient = getQueryClient();
	const joinRouteState = await queryClient.fetchQuery(
		trpc.team.getJoinRouteState.queryOptions({
			organizationSlug,
			invitationId,
		})
	);

	if (!joinRouteState) {
		notFound();
	}

	const joinFlowProps = {
		invitationId,
		invitationStatus: joinRouteState.invitationStatus,
		invitedEmail: joinRouteState.invitedEmail,
		isInvitationValid: joinRouteState.isInvitationValid,
		isSignedInEmailMatchingInvitation:
			joinRouteState.isSignedInEmailMatchingInvitation,
		organizationLogoUrl: joinRouteState.organizationLogoUrl,
		organizationName: joinRouteState.organizationName,
		organizationSlug,
		signedInEmail: joinRouteState.signedInEmail,
		websiteLogoUrl: joinRouteState.websiteLogoUrl,
		websiteName: joinRouteState.websiteName,
	};

	if (!joinRouteState.isInvitationValid) {
		return (
			<div className="flex w-full justify-center">
				<JoinFlow {...joinFlowProps} />
			</div>
		);
	}

	if (!joinRouteState.isAuthenticated) {
		const callbackPath = `/welcome/${organizationSlug}/join/${invitationId}`;
		const authPath =
			joinRouteState.recommendedAuthAction === "sign-up"
				? "/sign-up"
				: "/login";
		redirect(
			buildInviteAuthPath(authPath, {
				callbackPath,
				inviteEmail: joinRouteState.invitedEmail,
				inviteTarget:
					joinRouteState.websiteName ?? joinRouteState.organizationName,
			})
		);
	}

	if (joinRouteState.isAlreadyMember) {
		redirect("/select");
	}

	return (
		<div className="flex w-full justify-center">
			<JoinFlow {...joinFlowProps} />
		</div>
	);
}

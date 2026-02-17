"use client";

import { parseAsString, useQueryState } from "nuqs";

const INVITE_PARAM_KEY = "invite";
const TEAM_INVITE_PARAM_VALUE = "team";

export function useInviteTeamModal() {
	const [inviteParam, setInviteParam] = useQueryState(
		INVITE_PARAM_KEY,
		parseAsString
	);

	return {
		isOpen: inviteParam === TEAM_INVITE_PARAM_VALUE,
		openInviteTeamModal: () => setInviteParam(TEAM_INVITE_PARAM_VALUE),
		closeInviteTeamModal: () => setInviteParam(null),
	};
}

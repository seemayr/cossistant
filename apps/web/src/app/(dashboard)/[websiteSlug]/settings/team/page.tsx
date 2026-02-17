import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
} from "@/components/ui/layout/settings-layout";
import { ensureWebsiteAccess } from "@/lib/auth/website-access";
import { TeamSettingsClient } from "./team-settings-client";

type TeamSettingsPageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
};

export default async function TeamSettingsPage({
	params,
}: TeamSettingsPageProps) {
	const { websiteSlug } = await params;
	const { user, website } = await ensureWebsiteAccess(websiteSlug);

	return (
		<SettingsPage>
			<SettingsHeader>Team</SettingsHeader>
			<PageContent className="py-30">
				<SettingsRow
					description="Manage who can access this website, pending invites, and seat usage for your current plan."
					title="Team members"
				>
					<TeamSettingsClient
						currentUserId={user.id}
						websiteSlug={website.slug}
					/>
				</SettingsRow>
			</PageContent>
		</SettingsPage>
	);
}

import { and, db, eq } from "@api/db";
import { member } from "@api/db/schema";
import { getPlanForWebsite } from "@api/lib/plans/access";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
} from "@/components/ui/layout/settings-layout";
import { ensureWebsiteAccess } from "@/lib/auth/website-access";
import { DefaultParticipantsForm } from "./default-participants-form";
import { DeleteWebsiteSection } from "./delete-website-section";
import { LanguageSettingsForm } from "./language-settings-form";
import { UserProfileForm } from "./user-profile-form";
import { WebsiteInformationForm } from "./website-information-form";

type GeneralSettingsPageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
};

export default async function GeneralSettingsPage({
	params,
}: GeneralSettingsPageProps) {
	const { websiteSlug } = await params;
	const { user, website } = await ensureWebsiteAccess(websiteSlug);
	const planInfo = await getPlanForWebsite(website);
	const [membership] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(
				eq(member.organizationId, website.organizationId),
				eq(member.userId, user.id)
			)
		)
		.limit(1);
	const isOwner = membership?.role === "owner";

	return (
		<SettingsPage>
			<SettingsHeader>General</SettingsHeader>
			<PageContent className="py-30">
				<SettingsRow
					description="Manage the information your visitors see across the widget and emails."
					title="Website information"
				>
					<WebsiteInformationForm
						initialContactEmail={website.contactEmail}
						initialDomain={website.domain}
						initialLogoUrl={website.logoUrl}
						initialName={website.name}
						organizationId={website.organizationId}
						websiteId={website.id}
						websiteSlug={website.slug}
					/>
				</SettingsRow>
				<SettingsRow
					description="Control how your name and avatar appear to teammates across Cossistant."
					title="Your profile"
				>
					<UserProfileForm
						initialAvatarUrl={user.image}
						initialName={user.name ?? ""}
						organizationId={website.organizationId}
						userId={user.id}
						websiteId={website.id}
					/>
				</SettingsRow>
				<SettingsRow
					description="Choose your website's default language and control when Cossistant translates messages and titles."
					title="Language & translation"
				>
					<LanguageSettingsForm
						currentPlan={{
							name: planInfo.planName,
							displayName: planInfo.displayName,
							price: planInfo.price,
							features: planInfo.features,
						}}
						initialAutoTranslateEnabled={website.autoTranslateEnabled}
						initialDefaultLanguage={website.defaultLanguage}
						organizationId={website.organizationId}
						websiteId={website.id}
						websiteSlug={website.slug}
					/>
				</SettingsRow>
				<SettingsRow
					description="Choose which team members are automatically added to new conversations."
					title="Default conversation participants"
				>
					<DefaultParticipantsForm
						initialDefaultParticipantIds={website.defaultParticipantIds}
						organizationId={website.organizationId}
						websiteId={website.id}
						websiteSlug={website.slug}
					/>
				</SettingsRow>
				{isOwner ? (
					<DeleteWebsiteSection
						websiteName={website.name}
						websiteSlug={website.slug}
					/>
				) : null}
			</PageContent>
		</SettingsPage>
	);
}

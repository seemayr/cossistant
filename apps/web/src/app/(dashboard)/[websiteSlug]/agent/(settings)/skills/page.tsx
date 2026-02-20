import { redirect } from "next/navigation";

type SkillsRedirectPageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
};

export default async function SkillsRedirectPage({
	params,
}: SkillsRedirectPageProps) {
	const { websiteSlug } = await params;
	redirect(`/${websiteSlug}/agent/tools`);
}

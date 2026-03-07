import { redirect } from "next/navigation";
import { utilityNoindex } from "@/lib/metadata";
import { getLandingBaseUrl } from "@/lib/url";

type tParams = Promise<{ uniqueReferralCode: string }>;

export const metadata = utilityNoindex({
	title: "Referral redirect",
});

export default async function Page({ params }: { params: tParams }) {
	const url = new URL(getLandingBaseUrl());

	const { uniqueReferralCode } = await params;

	url.searchParams.set("from", uniqueReferralCode);

	// This page only redirect to the landing page
	redirect(url.toString());
}

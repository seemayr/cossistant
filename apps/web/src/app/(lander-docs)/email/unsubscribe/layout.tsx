import { utilityNoindex } from "@/lib/metadata";

export const metadata = utilityNoindex({
	title: "Unsubscribe from our mailing list",
	path: "/email/unsubscribe",
});

export const dynamic = "force-dynamic";

export default function ResetPasswordLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <>{children}</>;
}

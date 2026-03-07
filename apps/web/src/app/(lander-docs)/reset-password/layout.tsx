import { utilityNoindex } from "@/lib/metadata";

export const metadata = utilityNoindex({
	title: "Reset your password",
	path: "/reset-password",
});

export const dynamic = "force-dynamic";

export default function ResetPasswordLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <>{children}</>;
}

import { utilityNoindex } from "@/lib/metadata";

export const metadata = utilityNoindex({
	title: "Forgot your password?",
	path: "/forgot-password",
});

export const dynamic = "force-dynamic";

export default function ForgotPasswordLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <>{children}</>;
}

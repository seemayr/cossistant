"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TopbarButton } from "@/components/ui/topbar-button";
import { authClient } from "@/lib/auth/client";
import { CtaButton } from "./cta-button";

const dashboardButtonClassName = "h-auto px-2 py-1.5";

export function DashboardButtonSkeleton() {
	return (
		<Button className={dashboardButtonClassName} variant="ghost">
			Dashboard
		</Button>
	);
}

export function DashboardButton() {
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return <DashboardButtonSkeleton />;
	}

	if (!session?.user) {
		return (
			<>
				<TopbarButton
					href="/login"
					shortcuts={["l"]}
					tooltip="Login"
					withBrackets={false}
				>
					Login
				</TopbarButton>
				<CtaButton />
			</>
		);
	}

	return (
		<Link href="/select">
			<Button className={dashboardButtonClassName} variant="ghost">
				Dashboard
			</Button>
		</Link>
	);
}

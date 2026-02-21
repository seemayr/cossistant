"use client";

import Link from "next/link";

import { Avatar } from "@/components/ui/avatar";

import { Button } from "@/components/ui/button";
import { TopbarButton } from "@/components/ui/topbar-button";
import { authClient } from "@/lib/auth/client";
import { CtaButton } from "./cta-button";

const dashboardButtonClassName = "h-auto w-[126px] pl-0 pr-1 py-1.5";

export function DashboardButtonSkeleton() {
	return (
		<Button className={dashboardButtonClassName} variant="ghost">
			<Avatar
				className="size-5 rounded bg-background-400 ring-0 ring-offset-0"
				fallbackName={"User"}
				url={null}
			/>
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
				<Avatar
					className="size-5 rounded bg-background-400 ring-0 ring-offset-0"
					fallbackName={session.user.name}
					url={session.user.image}
				/>
				Dashboard
			</Button>
		</Link>
	);
}

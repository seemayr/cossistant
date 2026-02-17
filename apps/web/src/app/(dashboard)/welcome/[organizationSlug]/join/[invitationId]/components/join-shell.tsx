import type { ReactNode } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { JoinBrand } from "./join-brand";

type JoinShellProps = {
	organizationName: string;
	organizationLogoUrl: string | null;
	websiteName: string | null;
	websiteLogoUrl: string | null;
	children: ReactNode;
};

export function JoinShell({
	organizationName,
	organizationLogoUrl,
	websiteName,
	websiteLogoUrl,
	children,
}: JoinShellProps) {
	const targetName = websiteName ?? organizationName;

	return (
		<Card className="w-full max-w-xl">
			<CardHeader>
				<CardTitle className="text-xl">Join {targetName}</CardTitle>
				<CardDescription>
					You&apos;re almost in. We&apos;ll verify your invitation and finish
					setup.
				</CardDescription>
				<JoinBrand
					organizationLogoUrl={organizationLogoUrl}
					organizationName={organizationName}
					websiteLogoUrl={websiteLogoUrl}
					websiteName={websiteName}
				/>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

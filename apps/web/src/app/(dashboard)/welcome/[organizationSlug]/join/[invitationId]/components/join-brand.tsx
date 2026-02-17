import { WebsiteImage } from "@/components/ui/website-image";

type JoinBrandProps = {
	organizationName: string;
	organizationLogoUrl: string | null;
	websiteName: string | null;
	websiteLogoUrl: string | null;
};

export function JoinBrand({
	organizationName,
	organizationLogoUrl,
	websiteName,
	websiteLogoUrl,
}: JoinBrandProps) {
	const targetName = websiteName ?? organizationName;
	const targetLogoUrl = websiteLogoUrl ?? organizationLogoUrl;

	return (
		<div className="flex items-center gap-3 rounded border border-primary/10 bg-background-100 px-3 py-2">
			<WebsiteImage
				className="size-10 rounded-md"
				logoUrl={targetLogoUrl}
				name={targetName}
			/>
			<div className="min-w-0">
				<p className="truncate font-medium text-sm">{targetName}</p>
				<p className="truncate text-muted-foreground text-xs">
					{websiteName
						? `A website in ${organizationName}`
						: "Your organization on Cossistant"}
				</p>
			</div>
		</div>
	);
}

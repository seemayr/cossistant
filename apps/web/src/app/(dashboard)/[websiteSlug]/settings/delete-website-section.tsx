"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingsRow } from "@/components/ui/layout/settings-layout";
import { DeleteWebsiteDialog } from "./delete-website-dialog";

type DeleteWebsiteSectionProps = {
	websiteSlug: string;
	websiteName: string;
};

export function DeleteWebsiteSection({
	websiteSlug,
	websiteName,
}: DeleteWebsiteSectionProps) {
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);

	return (
		<>
			<SettingsRow
				description="Permanently delete this website and all associated data. This action cannot be undone."
				title="Danger Zone"
				variant="danger"
			>
				<div className="flex items-center justify-between p-4">
					<div className="space-y-1">
						<p className="font-medium text-sm">Delete Website</p>
						<p className="text-muted-foreground text-xs">
							This will permanently remove your website, support data, and AI
							agent configuration.
						</p>
					</div>
					<Button
						onClick={() => setShowDeleteDialog(true)}
						type="button"
						variant="destructive"
					>
						Delete Website
					</Button>
				</div>
			</SettingsRow>

			<DeleteWebsiteDialog
				onOpenChange={setShowDeleteDialog}
				open={showDeleteDialog}
				websiteName={websiteName}
				websiteSlug={websiteSlug}
			/>
		</>
	);
}

"use client";

import { parseAsString, useQueryState } from "nuqs";
import { KnowledgePreviewModal } from "@/components/modals/knowledge-preview-modal";
import { useWebsite } from "@/contexts/website";
import { TeamInviteModalWrapper } from "./modals";
import { ContactSheetWrapper } from "./sheets/contact-sheet-wrapper";

/**
 * Global overlays orchestrator for the dashboard.
 *
 * This component listens to URL parameters via nuqs and renders
 * the appropriate sheet or modal. Add new overlays by:
 * 1. Creating a wrapper component in ./sheets/ or ./modals/
 * 2. Adding a new useQueryState hook for the URL param
 * 3. Conditionally rendering the wrapper based on the param
 */
export function ModalsAndSheets() {
	const website = useWebsite();
	const [contactId, setContactId] = useQueryState("contact", parseAsString);
	const [knowledgeId, setKnowledgeId] = useQueryState(
		"knowledge",
		parseAsString
	);

	const handleContactSheetClose = () => {
		void setContactId(null);
	};

	const handleKnowledgeModalClose = () => {
		void setKnowledgeId(null);
	};

	return (
		<>
			{/* Contact Sheet */}
			{contactId && (
				<ContactSheetWrapper
					contactId={contactId}
					onClose={handleContactSheetClose}
				/>
			)}

			{/* Knowledge Preview Modal */}
			{knowledgeId && (
				<KnowledgePreviewModal
					knowledgeId={knowledgeId}
					onOpenChange={(open) => {
						if (!open) {
							handleKnowledgeModalClose();
						}
					}}
					open
					websiteSlug={website.slug}
				/>
			)}

			<TeamInviteModalWrapper />
		</>
	);
}

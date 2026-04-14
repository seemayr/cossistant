import { createTestUiPageMetadata } from "@/components/test-ui/metadata";
import { ComposerUiTestPage } from "./composer-ui-test-page";

export const metadata = createTestUiPageMetadata("composer");

export default function ComposerUiTestRoute() {
	return <ComposerUiTestPage />;
}

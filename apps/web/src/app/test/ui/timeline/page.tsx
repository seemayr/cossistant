import { createTestUiPageMetadata } from "@/components/test-ui/metadata";
import { TimelineUiTestPage } from "./timeline-ui-test-page";

export const metadata = createTestUiPageMetadata("timeline");

export default function TimelineUiTestRoute() {
	return <TimelineUiTestPage />;
}

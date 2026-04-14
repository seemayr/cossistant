"use client";

import { Support } from "@cossistant/react";
import { SupportDocsProvider } from "../docs-demo/provider";
import { SupportDemoStage } from "../docs-demo/stage";

function CossistantSupport() {
	return (
		<SupportDocsProvider>
			<SupportDemoStage variant="panel">
				<Support
					mode="responsive"
					quickOptions={[
						"How do I add the widget?",
						"Can I customize the home page?",
						"How do slots work?",
					]}
					slotProps={{
						content: {
							className:
								"border border-border bg-background shadow-sm md:rounded-[24px]",
						},
					}}
				/>
			</SupportDemoStage>
		</SupportDocsProvider>
	);
}

export default CossistantSupport;

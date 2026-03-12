"use client";

import { FakeSupportWidget } from "@/components/landing/fake-support-widget";
import { Background } from "@/components/ui/background";

function CossistantLandingSupport() {
	return (
		<div className="cossistant relative h-full w-full">
			<Background asciiOpacity={0.5} fieldOpacity={0.14} />
			<FakeSupportWidget />
		</div>
	);
}

export default CossistantLandingSupport;

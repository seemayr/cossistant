"use client";

import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useLandingAnimationStore } from "@/stores/landing-animation-store";

export function AnimationControls() {
	const currentView = useLandingAnimationStore((state) => state.currentView);
	const isPlaying = useLandingAnimationStore((state) => state.isPlaying);
	const selectView = useLandingAnimationStore((state) => state.selectView);
	const play = useLandingAnimationStore((state) => state.play);
	const pause = useLandingAnimationStore((state) => state.pause);

	const handleInboxClick = () => {
		selectView("inbox");
		play();
	};

	const handleConversationClick = () => {
		selectView("conversation");
		play();
	};

	const handlePlayPauseClick = () => {
		if (isPlaying) {
			pause();
		} else {
			play();
		}
	};

	return (
		<div className="hidden w-max gap-2 lg:flex">
			<Button
				className={cn(
					"rounded border-dashed bg-background-200 dark:bg-background",
					currentView === "inbox" &&
						"ring-1 ring-primary/10 ring-offset-2 ring-offset-background"
				)}
				onClick={handleInboxClick}
				size="sm"
				type="button"
				variant="outline"
			>
				Support inbox
			</Button>
			<Button
				className={cn(
					"rounded border-dashed bg-background-200 dark:bg-background",
					currentView === "conversation" &&
						"ring-1 ring-primary/10 ring-offset-2 ring-offset-background"
				)}
				onClick={handleConversationClick}
				size="sm"
				type="button"
				variant="ghost"
			>
				Real-time conversation
			</Button>
			<Button
				className="size-8 rounded dark:bg-background"
				onClick={handlePlayPauseClick}
				size="icon"
				type="button"
				variant="outline"
			>
				<Icon
					className="size-4"
					filledOnHover
					name={isPlaying ? "pause" : "play"}
				/>
			</Button>
		</div>
	);
}

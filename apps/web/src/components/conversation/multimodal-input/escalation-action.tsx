"use client";

import type React from "react";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";

export type EscalationActionProps = {
	reason: string;
	onJoin: () => void;
	isJoining?: boolean;
};

export const EscalationAction: React.FC<EscalationActionProps> = ({
	reason,
	onJoin,
	isJoining = false,
}) => {
	return (
		<div className="absolute right-0 bottom-4 left-0 z-10 mx-auto w-full px-4 xl:max-w-xl xl:px-0 2xl:max-w-2xl">
			<div className="flex flex-col gap-3 rounded-lg border-2 border-cossistant-orange bg-cossistant-orange/10 p-4">
				{/* Header */}
				<div className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-full bg-cossistant-orange/20">
						<Icon className="h-4 w-4 text-cossistant-orange" name="agent" />
					</div>
					<div className="font-medium text-sm">Human help requested</div>
				</div>

				{/* Reason */}
				<div className="text-muted-foreground text-sm">{reason}</div>

				{/* Action */}
				<Button
					className="w-full bg-cossistant-orange text-white hover:bg-cossistant-orange/90"
					disabled={isJoining}
					onClick={onJoin}
				>
					{isJoining ? (
						<>
							<div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
							Joining...
						</>
					) : (
						<>
							<Icon className="mr-2 h-4 w-4" name="arrow-right" />
							Join the conversation
						</>
					)}
				</Button>
			</div>
		</div>
	);
};

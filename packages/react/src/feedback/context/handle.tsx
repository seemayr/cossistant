"use client";

import * as React from "react";
import { useFeedbackConfig } from "./widget";

export type FeedbackHandle = {
	open: () => void;
	close: () => void;
	toggle: () => void;
};

const FeedbackHandleContext = React.createContext<FeedbackHandle | null>(null);

export type FeedbackHandleProviderProps = {
	forwardedRef?: React.Ref<FeedbackHandle>;
	children: React.ReactNode;
};

export const FeedbackHandleProvider: React.FC<FeedbackHandleProviderProps> = ({
	forwardedRef,
	children,
}) => {
	const { open, close, toggle } = useFeedbackConfig();

	const handle = React.useMemo<FeedbackHandle>(
		() => ({
			open,
			close,
			toggle,
		}),
		[open, close, toggle]
	);

	React.useImperativeHandle(forwardedRef, () => handle, [handle]);

	return (
		<FeedbackHandleContext.Provider value={handle}>
			{children}
		</FeedbackHandleContext.Provider>
	);
};

export function useFeedbackHandle(): FeedbackHandle | null {
	return React.useContext(FeedbackHandleContext);
}

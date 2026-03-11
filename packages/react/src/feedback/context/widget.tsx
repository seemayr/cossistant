"use client";

import * as React from "react";
import { useControlledState } from "./controlled-state";

export type FeedbackWidgetContextValue = {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	toggle: () => void;
};

const FeedbackWidgetContext =
	React.createContext<FeedbackWidgetContextValue | null>(null);

export type FeedbackWidgetProviderProps = {
	defaultOpen?: boolean;
	children: React.ReactNode;
};

export const FeedbackWidgetProvider: React.FC<FeedbackWidgetProviderProps> = ({
	defaultOpen = false,
	children,
}) => {
	const controlledState = useControlledState();
	const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
	const isControlled = controlledState?.isControlled ?? false;
	const controlledOpen = controlledState?.open ?? false;

	React.useEffect(() => {
		if (!isControlled) {
			setUncontrolledOpen(defaultOpen);
		}
	}, [defaultOpen, isControlled]);

	const setOpen = React.useCallback(
		(nextOpen: boolean) => {
			if (isControlled) {
				controlledState?.onOpenChange?.(nextOpen);
				return;
			}

			setUncontrolledOpen(nextOpen);
		},
		[controlledState, isControlled]
	);

	const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

	const value = React.useMemo<FeedbackWidgetContextValue>(
		() => ({
			isOpen,
			open: () => setOpen(true),
			close: () => setOpen(false),
			toggle: () => setOpen(!isOpen),
		}),
		[isOpen, setOpen]
	);

	return (
		<FeedbackWidgetContext.Provider value={value}>
			{children}
		</FeedbackWidgetContext.Provider>
	);
};

export function useFeedbackConfig(): FeedbackWidgetContextValue {
	const context = React.useContext(FeedbackWidgetContext);

	if (!context) {
		throw new Error(
			"useFeedbackConfig must be used within a FeedbackWidgetProvider"
		);
	}

	return context;
}

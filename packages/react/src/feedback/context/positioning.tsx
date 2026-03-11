"use client";

import * as React from "react";

export type TriggerRefContextValue = {
	triggerElement: HTMLElement | null;
	setTriggerElement: (element: HTMLElement | null) => void;
};

const TriggerRefContext = React.createContext<TriggerRefContextValue | null>(
	null
);

export type TriggerRefProviderProps = {
	children: React.ReactNode;
};

export const TriggerRefProvider: React.FC<TriggerRefProviderProps> = ({
	children,
}) => {
	const [triggerElement, setTriggerElement] =
		React.useState<HTMLElement | null>(null);

	const value = React.useMemo<TriggerRefContextValue>(
		() => ({
			triggerElement,
			setTriggerElement,
		}),
		[triggerElement]
	);

	return (
		<TriggerRefContext.Provider value={value}>
			{children}
		</TriggerRefContext.Provider>
	);
};

export function useTriggerRef(): TriggerRefContextValue | null {
	return React.useContext(TriggerRefContext);
}

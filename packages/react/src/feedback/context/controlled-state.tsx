"use client";

import * as React from "react";

export type ControlledStateContextValue = {
	open: boolean | undefined;
	onOpenChange: ((open: boolean) => void) | undefined;
	isControlled: boolean;
};

const ControlledStateContext =
	React.createContext<ControlledStateContextValue | null>(null);

export type ControlledStateProviderProps = {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: React.ReactNode;
};

export const ControlledStateProvider: React.FC<
	ControlledStateProviderProps
> = ({ open, onOpenChange, children }) => {
	const value = React.useMemo<ControlledStateContextValue>(
		() => ({
			open,
			onOpenChange,
			isControlled: open !== undefined,
		}),
		[open, onOpenChange]
	);

	return (
		<ControlledStateContext.Provider value={value}>
			{children}
		</ControlledStateContext.Provider>
	);
};

export function useControlledState(): ControlledStateContextValue | null {
	return React.useContext(ControlledStateContext);
}

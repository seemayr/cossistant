"use client";

import { createContext, useContext, useMemo, useState } from "react";

type IdentificationState = {
	/**
	 * Whether an identification request is currently in progress.
	 * When true, the identification form should not be shown.
	 */
	isIdentifying: boolean;
	/**
	 * Set the identifying state (used internally by IdentifySupportVisitor).
	 */
	setIsIdentifying: (value: boolean) => void;
};

const IdentificationContext = createContext<IdentificationState | null>(null);

type IdentificationProviderProps = {
	children: React.ReactNode;
};

/**
 * Provider for tracking visitor identification state.
 * This is used internally to prevent showing the identification form
 * while an identification request is in progress.
 */
export function IdentificationProvider({
	children,
}: IdentificationProviderProps) {
	const [isIdentifying, setIsIdentifying] = useState(false);

	const value = useMemo(
		() => ({
			isIdentifying,
			setIsIdentifying,
		}),
		[isIdentifying]
	);

	return (
		<IdentificationContext.Provider value={value}>
			{children}
		</IdentificationContext.Provider>
	);
}

/**
 * Hook to access the identification state.
 * Returns null if used outside of IdentificationProvider.
 */
export function useIdentificationState(): IdentificationState | null {
	return useContext(IdentificationContext);
}

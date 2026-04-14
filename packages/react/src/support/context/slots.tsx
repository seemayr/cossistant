"use client";

import * as React from "react";

// =============================================================================
// Slot Types
// =============================================================================

export type SlotContextValue = {
	/**
	 * Custom header slot content
	 */
	header: React.ReactNode | null;
	/**
	 * Custom footer slot content
	 */
	footer: React.ReactNode | null;
	/**
	 * Whether to use the custom header
	 */
	hasCustomHeader: boolean;
	/**
	 * Whether to use the custom footer
	 */
	hasCustomFooter: boolean;
};

type SlotRegistration = {
	registerHeader: (content: React.ReactNode) => void;
	registerFooter: (content: React.ReactNode) => void;
	unregisterHeader: () => void;
	unregisterFooter: () => void;
};

const SlotContext = React.createContext<SlotContextValue>({
	header: null,
	footer: null,
	hasCustomHeader: false,
	hasCustomFooter: false,
});

const SlotRegistrationContext = React.createContext<SlotRegistration | null>(
	null
);

// =============================================================================
// Provider
// =============================================================================

export type SlotProviderProps = {
	children: React.ReactNode;
};

/**
 * Provider for slot-based customization.
 * Allows children to register custom header/footer content.
 */
export const SlotProvider: React.FC<SlotProviderProps> = ({ children }) => {
	const [header, setHeader] = React.useState<React.ReactNode | null>(null);
	const [footer, setFooter] = React.useState<React.ReactNode | null>(null);

	const registration = React.useMemo<SlotRegistration>(
		() => ({
			registerHeader: (content) => setHeader(content),
			registerFooter: (content) => setFooter(content),
			unregisterHeader: () => setHeader(null),
			unregisterFooter: () => setFooter(null),
		}),
		[]
	);

	const value = React.useMemo<SlotContextValue>(
		() => ({
			header,
			footer,
			hasCustomHeader: header !== null,
			hasCustomFooter: footer !== null,
		}),
		[header, footer]
	);

	return (
		<SlotRegistrationContext.Provider value={registration}>
			<SlotContext.Provider value={value}>{children}</SlotContext.Provider>
		</SlotRegistrationContext.Provider>
	);
};

// =============================================================================
// Hooks
// =============================================================================

/**
 * Access slot values (for content component)
 */
export function useSlots(): SlotContextValue {
	return React.useContext(SlotContext);
}

/**
 * Access slot registration (for slot components)
 */
function useSlotRegistration(): SlotRegistration | null {
	return React.useContext(SlotRegistrationContext);
}

// =============================================================================
// Slot Components
// =============================================================================

export type SlotProps = {
	/**
	 * Content to render in the slot.
	 */
	children: React.ReactNode;
};

/**
 * Header slot component.
 * Use inside Support.Content to replace the default header.
 *
 * @example
 * <Support.Content>
 *   <Support.Header>
 *     <MyCustomHeader />
 *   </Support.Header>
 *   <Support.Router />
 * </Support.Content>
 *
 */
export const HeaderSlot: React.FC<SlotProps> = ({ children }) => {
	const registration = useSlotRegistration();

	React.useEffect(() => {
		if (registration) {
			registration.registerHeader(children);
			return () => registration.unregisterHeader();
		}
	}, [registration, children]);

	// This component doesn't render anything directly
	// It registers its children as the header slot
	return null;
};

(HeaderSlot as React.FC & { displayName?: string }).displayName =
	"Support.Header";

/**
 * Footer slot component.
 * Use inside Support.Content to replace the default footer.
 *
 * @example
 * <Support.Content>
 *   <Support.Router />
 *   <Support.Footer>
 *     <MyCustomFooter />
 *   </Support.Footer>
 * </Support.Content>
 *
 */
export const FooterSlot: React.FC<SlotProps> = ({ children }) => {
	const registration = useSlotRegistration();

	React.useEffect(() => {
		if (registration) {
			registration.registerFooter(children);
			return () => registration.unregisterFooter();
		}
	}, [registration, children]);

	// This component doesn't render anything directly
	// It registers its children as the footer slot
	return null;
};

(FooterSlot as React.FC & { displayName?: string }).displayName =
	"Support.Footer";

import { useEffect, useRef, useState } from "react";

type UseViewportVisibilityOptions = {
	threshold?: number;
	rootMargin?: string;
	enabled?: boolean;
	initialVisibility?: boolean;
};

/**
 * Hook to detect if an element is visible in the viewport using Intersection Observer.
 * Useful for pausing animations when content is not visible.
 *
 * @param options - Configuration options
 * @returns A tuple of [ref, isVisible] where ref should be attached to the element and isVisible indicates visibility
 */
export function useViewportVisibility<T extends HTMLElement = HTMLElement>(
	options: UseViewportVisibilityOptions = {}
): [React.RefObject<T>, boolean] {
	const {
		threshold = 0,
		rootMargin = "0px",
		enabled = true,
		initialVisibility = false,
	} = options;
	const [isVisible, setIsVisible] = useState(initialVisibility);
	const elementRef = useRef<T | null>(null);

	useEffect(() => {
		if (!enabled) {
			setIsVisible(initialVisibility);
			return;
		}

		if (!elementRef.current) {
			return;
		}

		const element = elementRef.current;
		if (typeof IntersectionObserver === "undefined") {
			setIsVisible(true);
			return;
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				setIsVisible(entry?.isIntersecting ?? false);
			},
			{
				threshold,
				rootMargin,
			}
		);

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, [threshold, rootMargin, enabled, initialVisibility]);

	return [elementRef as React.RefObject<T>, isVisible];
}

"use client";

import type { RefObject } from "react";
import { useEffect, useLayoutEffect } from "react";

type UseComposerTextareaLayoutOptions = {
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	overlayRef: RefObject<HTMLDivElement | null>;
	value: string;
};

function syncTextareaLayout(
	textarea: HTMLTextAreaElement | null,
	overlay: HTMLDivElement | null
) {
	if (!textarea) {
		return;
	}

	textarea.style.height = "auto";

	const scrollHeight = textarea.scrollHeight;
	textarea.style.height = `${scrollHeight}px`;
	textarea.style.overflowY = "hidden";

	if (overlay) {
		overlay.style.height = `${scrollHeight}px`;
	}
}

export function useComposerTextareaLayout({
	textareaRef,
	overlayRef,
	value,
}: UseComposerTextareaLayoutOptions) {
	useLayoutEffect(() => {
		syncTextareaLayout(textareaRef.current, overlayRef.current);
	}, [overlayRef, textareaRef, value]);

	useEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea || typeof ResizeObserver === "undefined") {
			return;
		}

		const resizeObserver = new ResizeObserver(() => {
			syncTextareaLayout(textareaRef.current, overlayRef.current);
		});

		resizeObserver.observe(textarea);

		return () => {
			resizeObserver.disconnect();
		};
	}, [overlayRef, textareaRef]);
}

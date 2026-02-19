"use client";

import type { DefaultMessage } from "@cossistant/types";
import * as React from "react";
import { useSupport } from "./provider";

export type SupportConfigProps = {
	defaultMessages?: DefaultMessage[];
	quickOptions?: string[];
};

/**
 * Component exposed by Cossistant allowing you to change the support widget default messages and quick response whenever rendered.
 */
export const SupportConfig = ({
	defaultMessages,
	quickOptions,
}: SupportConfigProps): React.ReactElement | null => {
	const { setDefaultMessages, setQuickOptions } = useSupport();

	React.useEffect(() => {
		if (defaultMessages !== undefined) {
			setDefaultMessages(defaultMessages);
		}
	}, [defaultMessages, setDefaultMessages]);

	React.useEffect(() => {
		if (quickOptions !== undefined) {
			setQuickOptions(quickOptions);
		}
	}, [quickOptions, setQuickOptions]);

	return null;
};

SupportConfig.displayName = "SupportConfig";

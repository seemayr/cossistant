import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type ChangelogDismissedState = {
	dismissedVersion: string | null;
	dismiss: (version: string) => void;
	isDismissed: (version: string) => boolean;
};

export const useChangelogDismissed = create<ChangelogDismissedState>()(
	persist(
		(set, get) => ({
			dismissedVersion: null,
			dismiss: (version) => set({ dismissedVersion: version }),
			isDismissed: (version) => get().dismissedVersion === version,
		}),
		{
			name: "changelog-dismissed",
			storage: createJSONStorage(() => localStorage),
		}
	)
);

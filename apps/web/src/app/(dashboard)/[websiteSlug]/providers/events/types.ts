import type { useQueryNormalizer } from "@normy/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { TrainingControls } from "@/hooks/use-training-controls";

type WebsiteContext = {
	id: string;
	slug: string;
};

type QueryNormalizer = ReturnType<typeof useQueryNormalizer>;

export type DashboardRealtimeContext = {
	queryClient: QueryClient;
	queryNormalizer: QueryNormalizer;
	website: WebsiteContext;
	userId: string | null;
	training?: TrainingControls;
};

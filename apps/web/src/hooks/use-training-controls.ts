"use client";

import * as ReactQuery from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useTRPC } from "@/lib/trpc/client";

export type TrainingControls = {
	canAutoStartTraining: boolean;
	canRequestTraining: boolean;
	isTrainingActive: boolean;
	requestTraining: () => Promise<boolean>;
	startTrainingIfAllowed: () => Promise<boolean>;
};

type UseTrainingControlsOptions = {
	websiteSlug: string;
	aiAgentId: string | null;
	onBlocked?: () => void;
};

export function useTrainingControls({
	websiteSlug,
	aiAgentId,
	onBlocked,
}: UseTrainingControlsOptions): TrainingControls {
	const trpc = useTRPC();
	const queryClient = ReactQuery.useQueryClient();

	const { data: readiness } = ReactQuery.useQuery(
		trpc.aiAgent.getTrainingReadiness.queryOptions({
			websiteSlug,
		})
	);
	const { data: trainingStatus } = ReactQuery.useQuery({
		...trpc.aiAgent.getTrainingStatus.queryOptions({
			websiteSlug,
		}),
		enabled: aiAgentId != null,
	});

	const invalidateTrainingQueries = useCallback(async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: trpc.aiAgent.get.queryKey({
					websiteSlug,
				}),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.aiAgent.getTrainingStatus.queryKey({
					websiteSlug,
				}),
			}),
			queryClient.invalidateQueries({
				queryKey: trpc.aiAgent.getTrainingReadiness.queryKey({
					websiteSlug,
				}),
			}),
		]);
	}, [queryClient, trpc, websiteSlug]);

	const startTrainingMutation = ReactQuery.useMutation(
		trpc.aiAgent.startTraining.mutationOptions({
			onSettled: async () => {
				await invalidateTrainingQueries();
			},
		})
	);

	const isTrainingActive =
		startTrainingMutation.isPending ||
		trainingStatus?.trainingStatus === "pending" ||
		trainingStatus?.trainingStatus === "training";
	const canAutoStartTraining =
		Boolean(aiAgentId) && readiness?.canTrainAt == null && !isTrainingActive;
	const canRequestTraining = Boolean(aiAgentId) && !isTrainingActive;

	const latestStateRef = useRef({
		aiAgentId,
		canAutoStartTraining,
		canTrainAt: readiness?.canTrainAt ?? null,
		isTrainingActive,
	});

	useEffect(() => {
		latestStateRef.current = {
			aiAgentId,
			canAutoStartTraining,
			canTrainAt: readiness?.canTrainAt ?? null,
			isTrainingActive,
		};
	}, [
		aiAgentId,
		canAutoStartTraining,
		isTrainingActive,
		readiness?.canTrainAt,
	]);

	const runTraining = useCallback(async () => {
		const currentAiAgentId = latestStateRef.current.aiAgentId;
		if (!currentAiAgentId) {
			return false;
		}

		try {
			await startTrainingMutation.mutateAsync({
				websiteSlug,
				aiAgentId: currentAiAgentId,
			});
			return true;
		} catch {
			return false;
		}
	}, [startTrainingMutation, websiteSlug]);

	const startTrainingIfAllowed = useCallback(async () => {
		if (!latestStateRef.current.canAutoStartTraining) {
			return false;
		}

		return runTraining();
	}, [runTraining]);

	const requestTraining = useCallback(async () => {
		const {
			aiAgentId: currentAiAgentId,
			canTrainAt,
			isTrainingActive: currentTrainingActive,
		} = latestStateRef.current;

		if (!currentAiAgentId || currentTrainingActive) {
			return false;
		}

		if (canTrainAt != null) {
			onBlocked?.();
			return false;
		}

		return runTraining();
	}, [onBlocked, runTraining]);

	return {
		canAutoStartTraining,
		canRequestTraining,
		isTrainingActive,
		requestTraining,
		startTrainingIfAllowed,
	};
}

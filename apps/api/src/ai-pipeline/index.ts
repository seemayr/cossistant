export {
	type BackgroundPipelineInput,
	type BackgroundPipelineResult,
	runBackgroundPipeline,
} from "./background-pipeline";
export {
	type PrimaryPipelineInput,
	type PrimaryPipelineResult,
	runPrimaryPipeline,
} from "./primary-pipeline";

export type AiAgentPipelineInput =
	import("./primary-pipeline").PrimaryPipelineInput;
export type AiAgentPipelineResult =
	import("./primary-pipeline").PrimaryPipelineResult;

import { runPrimaryPipeline } from "./primary-pipeline";
export const runAiAgentPipeline = runPrimaryPipeline;

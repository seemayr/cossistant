import type { CapturedFinalAction } from "../generation/contracts";
import type { PipelineToolContext, ToolRuntimeError } from "./contracts";

export function setFinalAction(
	ctx: PipelineToolContext,
	action: CapturedFinalAction
): void {
	ctx.runtimeState.finalAction = action;
}

export function setToolError(
	ctx: PipelineToolContext,
	error: ToolRuntimeError
): void {
	ctx.runtimeState.lastToolError = error;
}

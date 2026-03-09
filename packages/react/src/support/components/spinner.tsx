import * as React from "react";
import { cn } from "../utils";

const GRID_SIZE = 3;
const AUTO_VARIANTS = ["orbit", "wave", "pulse"] as const;
const ORBIT_DELAYS_MS = [0, 90, 180, 630, 720, 270, 540, 450, 360] as const;

type SpinnerVariant = "auto" | (typeof AUTO_VARIANTS)[number];

export type SpinnerProps = {
	className?: string;
	size?: number;
	variant?: SpinnerVariant;
};

function hashString(value: string): number {
	let hash = 0;

	for (const char of value) {
		hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	}

	return hash;
}

function resolveSpinnerVariant(
	reactId: string,
	variant: SpinnerVariant
): (typeof AUTO_VARIANTS)[number] {
	if (variant !== "auto") {
		return variant;
	}

	const resolvedVariant =
		AUTO_VARIANTS[hashString(reactId) % AUTO_VARIANTS.length];

	return resolvedVariant ?? AUTO_VARIANTS[0];
}

function getCellDelayMs(params: {
	index: number;
	row: number;
	column: number;
	variant: (typeof AUTO_VARIANTS)[number];
}): number {
	const { index, row, column, variant } = params;

	switch (variant) {
		case "orbit":
			return ORBIT_DELAYS_MS[index] ?? 0;
		case "wave":
			return (row + column) * 90;
		case "pulse":
			return (Math.abs(row - 1) + Math.abs(column - 1)) * 80;
		default:
			return 0;
	}
}

export function Spinner({
	className,
	size = 16,
	variant = "auto",
}: SpinnerProps): React.ReactElement {
	const reactId = React.useId();
	const resolvedVariant = resolveSpinnerVariant(reactId, variant);
	const gap = Math.max(Math.round(size / 8), 1);
	const radius = Math.max(Math.round(size / 7), 1);

	const spinnerStyle = {
		"--co-spinner-size": `${size}px`,
		"--co-spinner-gap": `${gap}px`,
		"--co-spinner-radius": `${radius}px`,
	} as React.CSSProperties;

	return (
		<span
			aria-hidden="true"
			className={cn("co-spinner", className)}
			data-co-spinner="true"
			data-co-spinner-variant={resolvedVariant}
			style={spinnerStyle}
		>
			{Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
				const row = Math.floor(index / GRID_SIZE);
				const column = index % GRID_SIZE;
				const driftX = (column - 1) * 18;
				const driftY = (row - 1) * 18;
				const cellStyle = {
					"--co-spinner-delay": `${getCellDelayMs({
						column,
						index,
						row,
						variant: resolvedVariant,
					})}ms`,
					"--co-spinner-orbit-start-x": `${driftX * -0.2}%`,
					"--co-spinner-orbit-start-y": `${driftY * -0.2}%`,
					"--co-spinner-orbit-peak-x": `${driftX * 0.22}%`,
					"--co-spinner-orbit-peak-y": `${driftY * 0.22}%`,
					"--co-spinner-wave-start-x": `${driftX * -0.38}%`,
					"--co-spinner-wave-start-y": `${driftY * -0.38}%`,
					"--co-spinner-wave-peak-x": `${driftX * 0.9}%`,
					"--co-spinner-wave-peak-y": `${driftY * 0.9}%`,
					"--co-spinner-pulse-peak-x": `${driftX * 0.55}%`,
					"--co-spinner-pulse-peak-y": `${driftY * 0.55}%`,
				} as React.CSSProperties;

				return (
					<span
						className="co-spinner__cell"
						data-co-spinner-cell="true"
						key={index}
						style={cellStyle}
					/>
				);
			})}
		</span>
	);
}

Spinner.displayName = "Spinner";

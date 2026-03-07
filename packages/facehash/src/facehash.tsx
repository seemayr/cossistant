import * as React from "react";
import { createFacehashScene, type Intensity3D, type Variant } from "./core";
import { FacehashSceneSvg } from "./facehash-scene-svg";

export type { Intensity3D, Variant } from "./core";

export interface FacehashProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
	/**
	 * String to generate a deterministic face from.
	 * Same string always produces the same face.
	 */
	name: string;

	/**
	 * Size in pixels or CSS units.
	 * @default 40
	 */
	size?: number | string;

	/**
	 * Background style.
	 * - "gradient": Adds gradient overlay (default)
	 * - "solid": Plain background color
	 * @default "gradient"
	 */
	variant?: Variant;

	/**
	 * 3D effect intensity.
	 * @default "dramatic"
	 */
	intensity3d?: Intensity3D;

	/**
	 * Enable hover interaction.
	 * When true, face "looks straight" on hover.
	 * @default true
	 */
	interactive?: boolean;

	/**
	 * Show first letter of name below the face.
	 * @default true
	 */
	showInitial?: boolean;

	/**
	 * Hex color array for inline styles.
	 * Use this OR colorClasses, not both.
	 */
	colors?: string[];

	/**
	 * Tailwind class array for background colors.
	 * Example: ["bg-pink-500 dark:bg-pink-600", "bg-blue-500 dark:bg-blue-600"]
	 * Use this OR colors, not both.
	 */
	colorClasses?: string[];

	/**
	 * Custom gradient overlay class (Tailwind).
	 * When provided, replaces the default pure CSS gradient.
	 * Only used when variant="gradient".
	 */
	gradientOverlayClass?: string;

	/**
	 * Custom mouth renderer. When provided, replaces the initial letter.
	 * Useful for showing loading spinners, custom icons, etc.
	 */
	onRenderMouth?: () => React.ReactNode;

	/**
	 * Enable random eye blinking animation.
	 * Pure CSS animation with deterministic timing per eye.
	 * @default false
	 */
	enableBlink?: boolean;
}

function sanitizeId(value: string): string {
	return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export const Facehash = React.forwardRef<HTMLDivElement, FacehashProps>(
	(
		{
			name,
			size = 40,
			variant = "gradient",
			intensity3d = "dramatic",
			interactive = true,
			showInitial = true,
			colors,
			colorClasses,
			gradientOverlayClass,
			onRenderMouth,
			enableBlink = false,
			className,
			style,
			onMouseEnter,
			onMouseLeave,
			...props
		},
		ref
	) => {
		const [isHovered, setIsHovered] = React.useState(false);
		const reactId = React.useId();

		const colorsLength = colorClasses?.length ?? colors?.length ?? 1;
		const scene = React.useMemo(
			() =>
				createFacehashScene({
					name,
					colorsLength,
					intensity3d,
					pose: isHovered && interactive ? "front" : "seed",
				}),
			[name, colorsLength, intensity3d, isHovered, interactive]
		);

		const colorIndex = scene.data.colorIndex;
		const backgroundClass = colorClasses?.[colorIndex];
		const backgroundColor = colors?.[colorIndex];
		const sizeValue = typeof size === "number" ? `${size}px` : size;
		const svgIdPrefix = React.useMemo(
			() => sanitizeId(`facehash-${reactId}-${name}`),
			[reactId, name]
		);

		const handleMouseEnter = React.useCallback(
			(e: React.MouseEvent<HTMLDivElement>) => {
				if (interactive) {
					setIsHovered(true);
				}
				onMouseEnter?.(e);
			},
			[interactive, onMouseEnter]
		);

		const handleMouseLeave = React.useCallback(
			(e: React.MouseEvent<HTMLDivElement>) => {
				if (interactive) {
					setIsHovered(false);
				}
				onMouseLeave?.(e);
			},
			[interactive, onMouseLeave]
		);

		return (
			// biome-ignore lint/a11y/noNoninteractiveElementInteractions: Hover effect is cosmetic
			// biome-ignore lint/a11y/noStaticElementInteractions: This is a decorative avatar component
			<div
				className={["facehash", backgroundClass, className]
					.filter(Boolean)
					.join(" ")}
				data-facehash=""
				data-interactive={interactive || undefined}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={handleMouseLeave}
				ref={ref}
				style={{
					position: "relative",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					overflow: "hidden",
					width: sizeValue,
					height: sizeValue,
					...(backgroundColor && !backgroundClass
						? { backgroundColor }
						: undefined),
					...style,
				}}
				{...props}
			>
				<FacehashSceneSvg
					backgroundColor={
						backgroundClass ? "transparent" : (backgroundColor ?? "transparent")
					}
					enableBlink={enableBlink}
					height="100%"
					idPrefix={svgIdPrefix}
					scene={scene}
					showInitial={showInitial && !onRenderMouth}
					style={{
						color: "inherit",
					}}
					variant={gradientOverlayClass ? "solid" : variant}
					width="100%"
					withAnimatedProjection={interactive}
				/>

				{variant === "gradient" && gradientOverlayClass && (
					<div
						className={gradientOverlayClass}
						data-facehash-gradient=""
						style={{
							position: "absolute",
							inset: 0,
							pointerEvents: "none",
							zIndex: 1,
						}}
					/>
				)}

				{onRenderMouth && (
					<div
						data-facehash-mouth=""
						style={{
							position: "absolute",
							left: "50%",
							top: "70%",
							zIndex: 2,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							transform: "translate(-50%, -50%)",
						}}
					>
						{onRenderMouth()}
					</div>
				)}
			</div>
		);
	}
);

Facehash.displayName = "Facehash";

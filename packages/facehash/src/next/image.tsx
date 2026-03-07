import type { FacehashScene, Variant } from "../core";
import { sceneUnitToPixels, toSatoriProjectionTransform } from "./projection";

export type FacehashImageProps = {
	/** Shared facehash scene */
	scene: FacehashScene;
	/** Background color (hex) */
	backgroundColor: string;
	/** Image size in pixels */
	size: number;
	/** Background style variant */
	variant: Variant;
	/** Show initial letter */
	showInitial: boolean;
};

const PNG_FOREGROUND_COLOR = "#000000";

function renderFaceGeometryPaths(paths: readonly string[], fill: string) {
	return paths.map((path) => <path d={path} fill={fill} key={path} />);
}

function getGradientBackground(scene: FacehashScene): string {
	return `radial-gradient(circle at ${scene.gradientCenter.x}% ${scene.gradientCenter.y}%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 60%)`;
}

/**
 * Shared Facehash image component for use with ImageResponse.
 * Uses a dedicated Satori-safe foreground scene so eyes and initial share one
 * projected coordinate system.
 */
export function FacehashImage({
	scene,
	backgroundColor,
	size,
	variant,
	showInitial,
}: FacehashImageProps) {
	const faceBox = {
		x: sceneUnitToPixels(scene.faceBox.x, size),
		y: sceneUnitToPixels(scene.faceBox.y, size),
		width: sceneUnitToPixels(scene.faceBox.width, size),
		height: sceneUnitToPixels(scene.faceBox.height, size),
	};
	const initialPoint = {
		x: sceneUnitToPixels(scene.initialLayout.x, size),
		y: sceneUnitToPixels(scene.initialLayout.y, size),
		fontSize: sceneUnitToPixels(scene.initialLayout.fontSize, size),
	};
	const initialBoxSize = sceneUnitToPixels(32, size);
	const initialBox = {
		x: initialPoint.x - initialBoxSize / 2,
		y: initialPoint.y - initialBoxSize / 2,
	};
	const projectionTransform = toSatoriProjectionTransform(
		scene.projection,
		size
	);

	return (
		<div
			style={{
				width: size,
				height: size,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				position: "relative",
				overflow: "hidden",
				backgroundColor,
			}}
		>
			{variant === "gradient" && (
				<div
					style={{
						position: "absolute",
						inset: 0,
						display: "flex",
						background: getGradientBackground(scene),
					}}
				/>
			)}

			<div
				data-facehash-png-projection=""
				style={{
					position: "absolute",
					inset: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					transform: projectionTransform,
					transformOrigin: "50% 50%",
				}}
			>
				<div
					data-facehash-png-canvas=""
					style={{
						position: "relative",
						width: size,
						height: size,
						display: "flex",
					}}
				>
					<svg
						aria-hidden="true"
						data-facehash-png-eyes=""
						fill="none"
						height={faceBox.height}
						preserveAspectRatio="none"
						style={{
							position: "absolute",
							left: faceBox.x,
							top: faceBox.y,
							display: "block",
						}}
						viewBox={`0 0 ${scene.faceGeometry.viewBox.width} ${scene.faceGeometry.viewBox.height}`}
						width={faceBox.width}
						xmlns="http://www.w3.org/2000/svg"
					>
						<g>
							{renderFaceGeometryPaths(
								scene.faceGeometry.leftEyePaths,
								PNG_FOREGROUND_COLOR
							)}
						</g>
						<g>
							{renderFaceGeometryPaths(
								scene.faceGeometry.rightEyePaths,
								PNG_FOREGROUND_COLOR
							)}
						</g>
					</svg>

					{showInitial && (
						<div
							data-facehash-png-initial=""
							style={{
								position: "absolute",
								left: initialBox.x,
								top: initialBox.y,
								width: initialBoxSize,
								height: initialBoxSize,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: initialPoint.fontSize,
								lineHeight: 1,
								fontFamily: "monospace",
								fontWeight: 700,
								color: PNG_FOREGROUND_COLOR,
							}}
						>
							{scene.data.initial}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

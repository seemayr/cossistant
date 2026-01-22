import { formatFileSize } from "@cossistant/core";
import {
	extractFileParts,
	extractImageParts,
	TimelineItem as PrimitiveTimelineItem,
	TimelineItemContent,
	TimelineItemTimestamp,
} from "@cossistant/next/primitives";
import type { TimelineItem } from "@cossistant/types/api/timeline-item";
import type React from "react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import Icon from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type TimelineMessageItemProps = {
	item: TimelineItem;
	isLast?: boolean;
	isSentByViewer?: boolean;
};

export function TimelineMessageItem({
	item,
	isLast = false,
	isSentByViewer = false,
}: TimelineMessageItemProps) {
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const [lightboxIndex, setLightboxIndex] = useState(0);

	// Extract image and file parts
	const images = extractImageParts(item.parts);
	const files = extractFileParts(item.parts);
	const hasAttachments = images.length > 0 || files.length > 0;
	const hasText = item.text && item.text.trim().length > 0;

	const openLightbox = (index: number) => {
		setLightboxIndex(index);
		setLightboxOpen(true);
	};

	const currentImage = images[lightboxIndex];

	return (
		<>
			<PrimitiveTimelineItem item={item}>
				{({ isAI, timestamp }) => (
					<div
						className={cn(
							"flex w-full gap-2",
							isSentByViewer && "flex-row-reverse",
							!isSentByViewer && "flex-row"
						)}
					>
						<div
							className={cn(
								"flex w-full min-w-0 flex-1 flex-col gap-2",
								isSentByViewer && "items-end"
							)}
						>
							{/* Text content */}
							{hasText && (
								<TimelineItemContent
									className={cn(
										"block w-fit min-w-0 max-w-full whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm md:max-w-[420px]",
										{
											"bg-background-300 text-foreground dark:bg-background-600":
												!isSentByViewer,
											"bg-primary text-primary-foreground": isSentByViewer,
											"rounded-br-[2px]":
												isLast && isSentByViewer && !hasAttachments,
											"rounded-bl-[2px]":
												isLast && !isSentByViewer && !hasAttachments,
										}
									)}
									renderMarkdown
									text={item.text}
								/>
							)}

							{/* Image attachments */}
							{images.length > 0 && (
								<div
									className={cn(
										"flex flex-wrap gap-2",
										isSentByViewer && "justify-end"
									)}
								>
									{images.map((image, index) => (
										<button
											className="group relative overflow-hidden rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
											key={image.url}
											onClick={() => openLightbox(index)}
											type="button"
										>
											{/* biome-ignore lint/performance/noImgElement: User-uploaded images from S3, not optimizable */}
											{/* biome-ignore lint/nursery/useImageSize: Dynamic image dimensions not known at render time */}
											<img
												alt={image.filename || `Image ${index + 1}`}
												className="max-h-[200px] max-w-[300px] cursor-pointer rounded-lg object-cover transition-transform group-hover:scale-105"
												loading="lazy"
												src={image.url}
											/>
										</button>
									))}
								</div>
							)}

							{/* File attachments */}
							{files.length > 0 && (
								<div className="flex flex-col gap-1">
									{files.map((file) => (
										<a
											className={cn(
												"flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors",
												{
													"bg-background-300 text-foreground hover:bg-background-400 dark:bg-background-600 dark:hover:bg-background-500":
														!isSentByViewer,
													"bg-primary/80 text-primary-foreground hover:bg-primary":
														isSentByViewer,
												}
											)}
											download={file.filename}
											href={file.url}
											key={file.url}
											rel="noopener noreferrer"
											target="_blank"
										>
											<Icon className="h-4 w-4 shrink-0" name="attachment" />
											<span className="flex-1 truncate font-medium">
												{file.filename || "Download file"}
											</span>
											{file.size && (
												<span className="text-muted-foreground opacity-70">
													{formatFileSize(file.size)}
												</span>
											)}
										</a>
									))}
								</div>
							)}

							{isLast && (
								<TimelineItemTimestamp
									className="px-1 text-muted-foreground text-xs"
									timestamp={timestamp}
								>
									{() => (
										<>
											{timestamp.toLocaleTimeString([], {
												hour: "2-digit",
												minute: "2-digit",
											})}
											{isAI && " • AI agent"}
										</>
									)}
								</TimelineItemTimestamp>
							)}
						</div>
					</div>
				)}
			</PrimitiveTimelineItem>

			{/* Lightbox dialog for images */}
			{images.length > 0 && (
				<Dialog onOpenChange={setLightboxOpen} open={lightboxOpen}>
					<DialogContent className="flex max-h-[90vh] max-w-[90vw] items-center justify-center border-none bg-black/90 p-4 [&>button]:hidden">
						<DialogTitle className="sr-only">
							{currentImage?.filename || `Image ${lightboxIndex + 1}`}
						</DialogTitle>

						{/* Close button */}
						<button
							aria-label="Close lightbox"
							className="absolute top-4 right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
							onClick={() => setLightboxOpen(false)}
							type="button"
						>
							<Icon className="h-6 w-6" name="x" />
						</button>

						{/* biome-ignore lint/performance/noImgElement: User-uploaded images from S3, not optimizable */}
						{/* biome-ignore lint/nursery/useImageSize: Dynamic image dimensions not known at render time */}
						<img
							alt={currentImage?.filename || `Image ${lightboxIndex + 1}`}
							className="max-h-[85vh] max-w-[85vw] object-contain"
							src={currentImage?.url}
						/>

						{/* Navigation for multiple images */}
						{images.length > 1 && (
							<>
								<button
									aria-label="Previous image"
									className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
									onClick={() =>
										setLightboxIndex((prev) =>
											prev > 0 ? prev - 1 : images.length - 1
										)
									}
									type="button"
								>
									<Icon className="h-6 w-6" name="arrow-left" />
								</button>
								<button
									aria-label="Next image"
									className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
									onClick={() =>
										setLightboxIndex((prev) =>
											prev < images.length - 1 ? prev + 1 : 0
										)
									}
									type="button"
								>
									<Icon className="h-6 w-6" name="arrow-right" />
								</button>
								<div className="-translate-x-1/2 absolute bottom-4 left-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
									{lightboxIndex + 1} / {images.length}
								</div>
							</>
						)}
					</DialogContent>
				</Dialog>
			)}
		</>
	);
}

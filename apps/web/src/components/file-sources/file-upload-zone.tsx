"use client";

import { FileTextIcon, UploadIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

type FileUploadZoneProps = {
	onUpload: (files: File[]) => Promise<void>;
	isUploading: boolean;
	disabled?: boolean;
};

const ACCEPTED_EXTENSIONS = [".md", ".txt"];
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export function FileUploadZone({
	onUpload,
	isUploading,
	disabled,
}: FileUploadZoneProps) {
	const [isDragOver, setIsDragOver] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const validateFile = (file: File): string | null => {
		const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;
		if (!ACCEPTED_EXTENSIONS.includes(extension)) {
			return `Invalid file type: ${extension}. Only .md and .txt files are supported.`;
		}
		if (file.size > MAX_FILE_SIZE) {
			return `File too large: ${(file.size / 1024).toFixed(1)}KB. Maximum size is 1MB.`;
		}
		return null;
	};

	const handleFiles = useCallback(
		async (files: FileList | null) => {
			if (!files || files.length === 0) {
				return;
			}

			setError(null);
			const validFiles: File[] = [];

			for (const file of Array.from(files)) {
				const validationError = validateFile(file);
				if (validationError) {
					setError(validationError);
					return;
				}
				validFiles.push(file);
			}

			if (validFiles.length > 0) {
				await onUpload(validFiles);
			}
		},
		[onUpload]
	);

	const handleDrop = useCallback(
		async (e: React.DragEvent<HTMLElement>) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragOver(false);

			if (disabled || isUploading) {
				return;
			}

			await handleFiles(e.dataTransfer.files);
		},
		[handleFiles, disabled, isUploading]
	);

	const handleDragOver = useCallback(
		(e: React.DragEvent<HTMLElement>) => {
			e.preventDefault();
			e.stopPropagation();
			if (!(disabled || isUploading)) {
				setIsDragOver(true);
			}
		},
		[disabled, isUploading]
	);

	const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
	}, []);

	const handleInputChange = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			await handleFiles(e.target.files);
			// Reset input so the same file can be selected again
			e.target.value = "";
		},
		[handleFiles]
	);

	return (
		<div className="space-y-2">
			<button
				className={cn(
					"relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
					isDragOver && !disabled && "border-primary bg-primary/5",
					!(isDragOver || disabled) && "border-muted-foreground/25",
					disabled && "cursor-not-allowed opacity-50",
					isUploading && "pointer-events-none"
				)}
				disabled={disabled || isUploading}
				onDragLeave={handleDragLeave}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
				type="button"
			>
				<input
					accept=".md,.txt"
					className="absolute inset-0 cursor-pointer opacity-0"
					disabled={disabled || isUploading}
					multiple
					onChange={handleInputChange}
					type="file"
				/>

				{isUploading ? (
					<>
						<div className="mb-4 h-12 w-12 animate-pulse rounded-full bg-muted" />
						<p className="font-medium">Uploading...</p>
					</>
				) : (
					<>
						<div className="mb-4 flex items-center justify-center">
							<UploadIcon className="h-8 w-8 text-muted-foreground" />
						</div>
						<p className="mb-1 font-medium">
							{isDragOver ? "Drop files here" : "Drag & drop files here"}
						</p>
						<p className="mb-4 text-muted-foreground text-sm">
							or click to browse
						</p>
						<div className="flex items-center gap-2 text-muted-foreground text-xs">
							<FileTextIcon className="h-4 w-4" />
							<span>Supported: .md, .txt (max 1MB)</span>
						</div>
					</>
				)}
			</button>

			{error && <p className="text-destructive text-sm">{error}</p>}
		</div>
	);
}

export type { FileUploadZoneProps };

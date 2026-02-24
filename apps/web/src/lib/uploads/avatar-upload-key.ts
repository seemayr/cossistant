const MAX_FILE_NAME_LENGTH = 128;
const MAX_FILE_EXTENSION_LENGTH = 16;

const MIME_EXTENSION_MAP: Record<string, string> = {
	"image/avif": "avif",
	"image/gif": "gif",
	"image/heic": "heic",
	"image/heif": "heif",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/png": "png",
	"image/svg+xml": "svg",
	"image/webp": "webp",
};

function sanitizeBaseName(name: string): string {
	return name
		.trim()
		.replace(/[^a-zA-Z0-9_.-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-._]+|[-._]+$/g, "");
}

function sanitizeExtension(extension?: string): string | undefined {
	if (!extension) {
		return;
	}

	const sanitized = extension
		.trim()
		.replace(/[^a-zA-Z0-9]/g, "")
		.toLowerCase()
		.slice(0, MAX_FILE_EXTENSION_LENGTH);

	return sanitized.length > 0 ? sanitized : undefined;
}

function stripFileExtension(name: string): string {
	const lastDot = name.lastIndexOf(".");
	if (lastDot <= 0) {
		return name;
	}

	return name.slice(0, lastDot);
}

function extractExtensionFromName(name: string): string | undefined {
	const lastDot = name.lastIndexOf(".");
	if (lastDot <= 0 || lastDot === name.length - 1) {
		return;
	}

	return sanitizeExtension(name.slice(lastDot + 1));
}

function resolveFileExtension(file: File): string | undefined {
	const fromName = extractExtensionFromName(file.name);
	if (fromName) {
		return fromName;
	}

	return sanitizeExtension(MIME_EXTENSION_MAP[file.type.toLowerCase()]);
}

function generateUniqueSuffix() {
	const timestamp = Date.now().toString(36);
	const randomPart =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
			: Math.random().toString(36).slice(2, 12);

	return `${timestamp}-${randomPart}`;
}

export function buildUniqueUploadIdentity(file: File): {
	fileName: string;
	fileExtension?: string;
} {
	const extension = resolveFileExtension(file);
	const uniqueSuffix = generateUniqueSuffix();
	const sanitizedBase = sanitizeBaseName(stripFileExtension(file.name));
	const maxBaseLength = Math.max(
		0,
		MAX_FILE_NAME_LENGTH - uniqueSuffix.length - 1
	);
	const baseName = sanitizedBase.slice(0, maxBaseLength);
	const fileName =
		baseName.length > 0 ? `${baseName}-${uniqueSuffix}` : uniqueSuffix;

	return {
		fileName: fileName.slice(0, MAX_FILE_NAME_LENGTH),
		fileExtension: extension,
	};
}

export type RegistrySourceDescriptor = {
	code?: string;
	path: string;
	sourcePath?: string;
};

export function resolveRegistrySourceDescriptor(item: RegistrySourceDescriptor):
	| {
			type: "inline";
			code: string;
	  }
	| {
			type: "file";
			path: string;
	  } {
	if (item.code) {
		return {
			type: "inline",
			code: item.code,
		};
	}

	return {
		type: "file",
		path: item.sourcePath ?? item.path,
	};
}

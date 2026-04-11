import { env } from "@api/env";
import { Polar } from "@polar-sh/sdk";

type PolarClient = InstanceType<typeof Polar>;

let polarClientSingleton: PolarClient | null = null;

function createPolarClient(): PolarClient {
	if (!env.POLAR_ACCESS_TOKEN) {
		throw new Error(
			"POLAR_ACCESS_TOKEN is required when Polar billing is enabled."
		);
	}

	return new Polar({
		accessToken: env.POLAR_ACCESS_TOKEN,
		server: env.NODE_ENV === "production" ? "production" : "sandbox",
	});
}

export function getPolarClient(): PolarClient {
	if (!polarClientSingleton) {
		polarClientSingleton = createPolarClient();
	}

	return polarClientSingleton;
}

const polarClient = new Proxy({} as PolarClient, {
	get(_target, property) {
		return Reflect.get(getPolarClient(), property);
	},
});

export default polarClient;

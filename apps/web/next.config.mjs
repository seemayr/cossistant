import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const nextConfig = {
	/* config options here */
	reactStrictMode: true,
	reactCompiler: true,
	transpilePackages: [
		"@cossistant/api",
		"@cossistant/core",
		"@cossistant/globe",
		"@cossistant/location",
		"@cossistant/react",
		"@cossistant/next",
		"@cossistant/transactional",
		"@cossistant/types",
	],
	typescript: {
		ignoreBuildErrors: true,
	},
	images: {
		remotePatterns: [
			new URL("https://cdn.cossistant.com/**"),
			new URL("https://pbs.twimg.com/**"),
			new URL("https://www.facehash.dev/**"),
		],
		qualities: [70, 80, 85, 90],
	},
	experimental: {
		useCache: true,
		turbopackFileSystemCacheForDev: true,
	},
	devIndicators: false,
	async rewrites() {
		return [
			{
				source: "/docs/:path*.mdx",
				destination: "/llms.mdx/:path*",
			},
		];
	},
	async headers() {
		return [
			{
				// Security headers for the service worker
				source: "/sw.js",
				headers: [
					{
						key: "Content-Type",
						value: "application/javascript; charset=utf-8",
					},
					{
						key: "Cache-Control",
						value: "no-cache, no-store, must-revalidate",
					},
					{
						key: "Service-Worker-Allowed",
						value: "/",
					},
				],
			},
		];
	},
};

export default withMDX(nextConfig);

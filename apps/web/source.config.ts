import {
	defineCollections,
	defineConfig,
	defineDocs,
	frontmatterSchema,
	metaSchema,
} from "fumadocs-mdx/config";
import rehypePrettyCode from "rehype-pretty-code";
import { z } from "zod";

import { transformers } from "@/lib/highlight-code";

const searchKindSchema = z.enum([
	"guide",
	"component",
	"hook",
	"type",
	"concept",
	"article",
	"release",
]);

export default defineConfig({
	mdxOptions: {
		rehypePlugins: (plugins) => {
			plugins.shift();
			plugins.push([
				rehypePrettyCode,
				{
					theme: {
						dark: "github-dark",
						light: "github-light-default",
					},
					transformers,
				},
			]);

			return plugins;
		},
	},
});

export const docs = defineDocs({
	dir: "content/docs",
	docs: {
		schema: frontmatterSchema.extend({
			preview: z.string().optional(),
			index: z.boolean().default(false),
			search: z
				.object({
					kind: searchKindSchema.optional(),
					tags: z.array(z.string()).optional(),
					aliases: z.array(z.string()).optional(),
				})
				.optional(),
			/**
			 * API routes only
			 */
			method: z.string().optional(),
		}),
		postprocess: {
			includeProcessedMarkdown: true,
		},
	},
	meta: {
		schema: metaSchema.extend({
			description: z.string().optional(),
		}),
	},
});

export const blog = defineCollections({
	type: "doc",
	dir: "./content/blog",
	schema: z.object({
		title: z.string(),
		description: z.string(),
		date: z.string(),
		author: z.string(),
		tags: z.array(z.string()),
		image: z.string().optional(),
		published: z.boolean().default(true),
		canonical: z.string().optional(),
		/** Featured article eligible for hero display */
		top: z.boolean().default(false),
		/** Slugs of related articles for cross-linking */
		related: z.array(z.string()).optional(),
		/** Custom URL slug override */
		slug: z.string().optional(),
	}),
});

export const changelog = defineCollections({
	type: "doc",
	dir: "./content/changelog",
	schema: z.object({
		version: z.string().optional(),
		description: z.string(),
		"tiny-excerpt": z.string().optional(),
		date: z.string(),
		author: z.string(),
	}),
});

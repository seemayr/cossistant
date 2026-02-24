import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { type NextRequest, NextResponse } from "next/server";

const { rewrite: rewriteDocs } = rewritePath(
	"/docs{/*path}",
	"/llms.mdx/docs{/*path}"
);
const { rewrite: rewriteBlog } = rewritePath(
	"/blog{/*path}",
	"/llms.mdx/blog{/*path}"
);
const { rewrite: rewriteChangelog } = rewritePath(
	"/changelog{/*path}",
	"/llms.mdx/changelog{/*path}"
);

export default function proxy(request: NextRequest) {
	if (isMarkdownPreferred(request)) {
		const pathname = request.nextUrl.pathname;
		const result =
			rewriteDocs(pathname) ||
			rewriteBlog(pathname) ||
			rewriteChangelog(pathname);

		if (result) {
			return NextResponse.rewrite(new URL(result, request.nextUrl));
		}
	}

	return NextResponse.next();
}

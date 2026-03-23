import { Logos } from "../../../components/ui/logos";
import { MovingUsersFacehashes } from "./moving-users-facehashes";

function CossistantIs() {
	return (
		<section className="flex flex-col gap-6 px-4 py-40">
			<h2 className="mx-auto max-w-2xl text-pretty text-center font-f37-stout text-2xl text-primary/70 leading-relaxed md:text-left md:text-[34px]">
				<span className="text-primary">
					Support isn't just about answering questions. It's about keeping users{" "}
					<MovingUsersFacehashes /> moving.
				</span>
				<br />
				<br />
				Cossistant answers the common questions, covers your team when you
				can't, and learns from the people who know your product best:{" "}
				<span className="text-primary">you.</span>
				<br />
				<br />
				Every answer you add makes it better.{" "}
				<span className="text-primary">
					Every fix you make makes the next conversation easier.
				</span>
				<br />
				<br />
				<span className="text-primary">
					Built for React{" "}
					<span className="inline-flex items-center justify-center rounded-md border border-border border-dashed p-1 align-middle">
						<Logos.react className="size-5" />
					</span>{" "}
					and Next.js{" "}
					<span className="inline-flex items-center justify-center rounded-md border border-border border-dashed p-1 align-middle">
						<Logos.nextjs className="size-5" />
					</span>
				</span>
				, so it feels like part of your product not someone else's.
			</h2>
		</section>
	);
}

export default CossistantIs;

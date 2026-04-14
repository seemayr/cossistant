import type React from "react";
import { Header } from "../components/header";
import { NavigationTab } from "../components/navigation-tab";

type ArticlesPageProps = {
	params?: undefined;
};

export const ArticlesPage: React.FC<ArticlesPageProps> = (_props = {}) => (
	<div
		className="flex h-full flex-col"
		data-page="ARTICLES"
		data-slot="articles-page"
	>
		<Header page="ARTICLES">
			<NavigationTab />
		</Header>
		<div className="flex flex-1 flex-col p-2">
			<div className="flex flex-col gap-5">
				<div>
					<h3 className="mb-2 font-medium text-base text-co-primary">
						How do I start a conversation?
					</h3>
					<p className="text-co-primary/60 text-sm leading-relaxed">
						Click the "Start New Conversation" button on the home page to begin
						chatting with our support team.
					</p>
				</div>
				<div>
					<h3 className="mb-2 font-medium text-base text-co-primary">
						Can I view previous conversations?
					</h3>
					<p className="text-co-primary/60 text-sm leading-relaxed">
						Yes! Navigate to the Conversation History page to see all your past
						conversations.
					</p>
				</div>
				<div>
					<h3 className="mb-2 font-medium text-base text-co-primary">
						How quickly will I get a response?
					</h3>
					<p className="text-co-primary/60 text-sm leading-relaxed">
						Our team typically responds within a few minutes during business
						hours.
					</p>
				</div>
			</div>
		</div>
	</div>
);

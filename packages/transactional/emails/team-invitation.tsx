import {
	Body,
	Button,
	Container,
	Head,
	Html,
	Img,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";
import React from "react";
import { LOGO_URL } from "../constants";

type TeamInvitationEmailProps = {
	organizationName: string;
	inviterName?: string | null;
	joinUrl: string;
	recipientEmail: string;
};

export const TeamInvitationEmail = ({
	organizationName,
	inviterName,
	joinUrl,
	recipientEmail,
}: TeamInvitationEmailProps) => (
	<Html dir="ltr" lang="en">
		<Tailwind>
			<Head />
			<Body className="py-[40px] font-sans">
				<Container className="mx-auto max-w-[600px] px-[40px] py-[40px]">
					<Img
						alt="Cossistant Logo"
						className="mb-[40px] h-auto w-[120px] object-cover"
						src={LOGO_URL}
					/>

					<Text className="mt-0 mb-[24px] font-bold text-[24px]">
						Join {organizationName} on Cossistant
					</Text>

					<Text className="mt-0 mb-[16px] text-[16px]">
						Hi {recipientEmail},
					</Text>

					<Text className="mt-0 mb-[16px] text-[16px]">
						{inviterName ? `${inviterName} invited you` : "You were invited"} to
						join <strong>{organizationName}</strong> on Cossistant.
					</Text>

					<Section className="my-[32px]">
						<Button
							className="inline-block rounded-[6px] bg-black px-[24px] py-[12px] text-center font-medium text-white no-underline"
							href={joinUrl}
						>
							Join team
						</Button>
					</Section>

					<Text className="mt-0 mb-[8px] text-[14px] text-gray-600">
						If the button does not work, copy and paste this URL in your
						browser:
					</Text>
					<Text className="mt-0 mb-[16px] break-all text-[14px] text-gray-600">
						{joinUrl}
					</Text>

					<Text className="mt-0 mb-[16px] text-[14px] text-gray-600">
						If you did not expect this invitation, you can ignore this email.
					</Text>
				</Container>
			</Body>
		</Tailwind>
	</Html>
);

export default TeamInvitationEmail;

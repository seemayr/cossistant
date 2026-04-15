"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { FakeDashboard } from "./index";
import "./fake-dashboard.css";

type FakeDashboardClientOnlyProps = ComponentProps<typeof FakeDashboard>;

const FakeDashboardNoSSR = dynamic(
	() => import("./index").then((mod) => mod.FakeDashboard),
	{
		loading: () => <FakeDashboardLoadingState />,
		ssr: false,
	}
);

function FakeDashboardLoadingState() {
	return (
		<div
			aria-hidden="true"
			className="h-full w-full bg-background-100 dark:bg-background"
		/>
	);
}

export function FakeDashboardClientOnly(props: FakeDashboardClientOnlyProps) {
	return <FakeDashboardNoSSR {...props} />;
}

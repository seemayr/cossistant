import * as React from "react";

import { cn } from "@/lib/utils";

const Table = React.forwardRef<
	HTMLTableElement,
	React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
	<table
		className={cn("w-full caption-bottom text-sm", className)}
		ref={ref}
		{...props}
	/>
));

Table.displayName = "Table";

const TableHeader = React.forwardRef<
	HTMLTableSectionElement,
	React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
	<thead
		className={cn("border-transparent [&_tr]:border-primary/5", className)}
		ref={ref}
		{...props}
	/>
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
	HTMLTableSectionElement,
	React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
	<tbody
		className={cn("[&_tr:last-child]:border-0", className)}
		ref={ref}
		{...props}
	/>
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
	HTMLTableSectionElement,
	React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
	<tfoot
		className={cn(
			"border-t bg-background-secondary/50 font-medium text-muted-foreground [&>tr]:last:border-b-0",
			className
		)}
		ref={ref}
		{...props}
	/>
));
TableFooter.displayName = "TableFooter";

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
	disableHover?: boolean;
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
	({ className, disableHover = false, ...props }, ref) => (
		<tr
			className={cn(
				"rounded-lg border-b transition-colors data-[state=selected]:bg-background-secondary",
				!disableHover && "hover:bg-background-secondary/50",
				className
			)}
			ref={ref}
			{...props}
		/>
	)
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
	HTMLTableCellElement,
	React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
	<th
		className={cn(
			"h-10 px-2 text-left align-middle font-medium text-md text-primary/80",
			className
		)}
		ref={ref}
		{...props}
	/>
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
	HTMLTableCellElement,
	React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
	<td
		className={cn("px-2 py-3 align-middle text-sm", className)}
		ref={ref}
		{...props}
	/>
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
	HTMLTableCaptionElement,
	React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
	<caption
		className={cn("mt-4 text-muted-foreground text-sm", className)}
		ref={ref}
		{...props}
	/>
));
TableCaption.displayName = "TableCaption";

export {
	Table,
	TableHeader,
	TableBody,
	TableFooter,
	TableRow,
	TableHead,
	TableCell,
	TableCaption,
};

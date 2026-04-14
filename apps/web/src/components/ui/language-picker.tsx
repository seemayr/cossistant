"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { filterLanguageOptions, getLanguageOption } from "@/lib/language";
import { cn } from "@/lib/utils";

type LanguagePickerProps = {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	id?: string;
	placeholder?: string;
	className?: string;
};

export function LanguagePicker({
	value,
	onChange,
	disabled,
	id,
	placeholder = "Select a language",
	className,
}: LanguagePickerProps) {
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	const selectedOption = getLanguageOption(value);
	const filteredOptions = useMemo(
		() => filterLanguageOptions(searchQuery),
		[searchQuery]
	);
	const popularOptions = filteredOptions.filter((option) => option.isPopular);
	const otherOptions = filteredOptions.filter((option) => !option.isPopular);

	const handleOpenChange = (nextOpen: boolean) => {
		setOpen(nextOpen);

		if (!nextOpen) {
			setSearchQuery("");
		}
	};

	const handleSelect = (nextValue: string) => {
		onChange(nextValue);
		handleOpenChange(false);
	};

	return (
		<Popover onOpenChange={handleOpenChange} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-expanded={open}
					className={cn(
						"w-full justify-between font-normal",
						!selectedOption && "text-muted-foreground",
						className
					)}
					data-slot="language-picker-trigger"
					disabled={disabled}
					id={id}
					role="combobox"
					type="button"
					variant="outline"
				>
					<span className="truncate">
						{selectedOption?.label ?? placeholder}
					</span>
					<ChevronsUpDown className="size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[320px] p-0"
				data-slot="language-picker-content"
			>
				<Command shouldFilter={false}>
					<CommandInput
						onValueChange={setSearchQuery}
						placeholder="Search languages..."
						value={searchQuery}
					/>
					<CommandList>
						{filteredOptions.length === 0 ? (
							<CommandEmpty>No language found.</CommandEmpty>
						) : null}
						{popularOptions.length > 0 ? (
							<CommandGroup heading="Popular languages">
								{popularOptions.map((option) => (
									<CommandItem
										key={option.value}
										onSelect={() => handleSelect(option.value)}
										value={option.searchText}
									>
										<div className="flex flex-1 items-center justify-between gap-3">
											<span>{option.label}</span>
											<span className="text-muted-foreground text-xs">
												{option.value}
											</span>
										</div>
										<Check
											className={cn(
												"ml-auto size-4",
												selectedOption?.value === option.value
													? "opacity-100"
													: "opacity-0"
											)}
										/>
									</CommandItem>
								))}
							</CommandGroup>
						) : null}
						{otherOptions.length > 0 ? (
							<CommandGroup
								heading={
									popularOptions.length > 0 ? "All languages" : "Languages"
								}
							>
								{otherOptions.map((option) => (
									<CommandItem
										key={option.value}
										onSelect={() => handleSelect(option.value)}
										value={option.searchText}
									>
										<div className="flex flex-1 items-center justify-between gap-3">
											<span>{option.label}</span>
											<span className="text-muted-foreground text-xs">
												{option.value}
											</span>
										</div>
										<Check
											className={cn(
												"ml-auto size-4",
												selectedOption?.value === option.value
													? "opacity-100"
													: "opacity-0"
											)}
										/>
									</CommandItem>
								))}
							</CommandGroup>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

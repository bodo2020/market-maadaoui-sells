
import React, { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface MultiSelectProps {
  options: { label: string; value: string }[];
  value?: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export const MultiSelect = ({
  options = [],
  value = [],
  onChange,
  placeholder = "Select items",
  className,
}: MultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Ensure options and value are arrays to prevent "not iterable" errors
  const safeOptions = Array.isArray(options) ? options : [];
  const safeValue = Array.isArray(value) ? value : [];
  
  // Only calculate selected if we have both valid options and values
  const selected = safeOptions.length > 0 
    ? safeOptions.filter(option => safeValue.includes(option.value))
    : [];
  
  const handleUnselect = (valueToRemove: string) => {
    onChange(safeValue.filter((item) => item !== valueToRemove));
  };

  const handleSelect = (valueToSelect: string) => {
    if (safeValue.includes(valueToSelect)) {
      onChange(safeValue.filter((v) => v !== valueToSelect));
    } else {
      onChange([...safeValue, valueToSelect]);
    }
  };
  
  const filteredOptions = search.length > 0 && safeOptions.length > 0
    ? safeOptions.filter((option) =>
        option.label.toLowerCase().includes(search.toLowerCase())
      )
    : safeOptions;

  // If we don't have valid options, don't render the component
  if (!Array.isArray(options) || options.length === 0) {
    console.warn('MultiSelect: options is not an array or is empty');
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between text-right",
            selected.length > 0 ? "h-auto" : "",
            className
          )}
        >
          <div className="flex flex-wrap gap-1 items-center">
            {selected.length > 0 ? (
              selected.map((option) => (
                <Badge
                  variant="secondary"
                  key={option.value}
                  className="flex items-center gap-1 px-2"
                >
                  {option.label}
                  <button
                    type="button"
                    className="rounded-full outline-none focus:ring-2 focus:ring-offset-2"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleUnselect(option.value);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 ml-2 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command className="w-full">
          <CommandInput 
            placeholder={`${placeholder}...`} 
            onValueChange={setSearch} 
            value={search}
            className="py-3"
          />
          <CommandEmpty>لا توجد نتائج.</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-y-auto">
            {filteredOptions.map((option) => (
              <CommandItem
                key={option.value}
                onSelect={() => handleSelect(option.value)}
                className="cursor-pointer flex items-center justify-between"
              >
                {option.label}
                {safeValue.includes(option.value) && <Check className="h-4 w-4" />}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

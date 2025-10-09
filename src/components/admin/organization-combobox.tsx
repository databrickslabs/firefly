"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

interface Organization {
  id: string;
  name: string;
  slug: string | null;
}

interface OrganizationComboboxProps {
  organizations: Organization[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function OrganizationCombobox({
  organizations,
  value,
  onValueChange,
  disabled = false,
}: OrganizationComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedOrg = organizations.find((org) => org.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {selectedOrg ? (
              <>
                {selectedOrg.name}
                {selectedOrg.slug && (
                  <span className="text-muted-foreground">
                    (@{selectedOrg.slug})
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">
                Select organization...
              </span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder="Search organizations..." />
          <CommandList>
            <CommandEmpty>No organization found.</CommandEmpty>
            <CommandGroup>
              {organizations.map((org) => (
                <CommandItem
                  key={org.id}
                  value={`${org.name} ${org.slug || ""}`}
                  onSelect={() => {
                    onValueChange(org.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === org.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex items-center gap-2">
                    {org.name}
                    {org.slug && (
                      <span className="text-muted-foreground text-xs">
                        @{org.slug}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

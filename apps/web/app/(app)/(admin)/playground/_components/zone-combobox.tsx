"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import type { ZoneSummary } from "@/lib/playground/types";

type ZoneComboboxProps = {
  disabled?: boolean;
  items: ZoneSummary[];
  selectedZoneId: string | null;
  onSelect: (zoneId: string | null) => void;
};

export function ZoneCombobox({
  disabled = false,
  items,
  selectedZoneId,
  onSelect,
}: ZoneComboboxProps) {
  const selectedZone = items.find((item) => item.id === selectedZoneId) ?? null;

  return (
    <Combobox
      items={items}
      value={selectedZone}
      itemToStringValue={(item) => item.name}
      onValueChange={(value) => onSelect(value?.id ?? null)}
    >
      <ComboboxInput
        className="w-full h-10 [&>div]:w-full border-none"
        inputClass="bg-[#f7f7f8] dark:bg-[#171719] rounded-lg w-full h-10"
        disabled={disabled}
        placeholder="Select a zone"
        showClear
      />
      <ComboboxContent>
        <ComboboxEmpty>No zones found.</ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item.id} value={item}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{item.name}</span>
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

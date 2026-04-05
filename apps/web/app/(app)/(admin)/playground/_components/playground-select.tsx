"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type PlaygroundSelectOption<Value extends string> = {
  label: string
  value: Value
}

type PlaygroundSelectProps<Value extends string> = {
  disabled?: boolean
  id: string
  onValueChange: (value: Value) => void
  options: ReadonlyArray<PlaygroundSelectOption<Value>>
  placeholder?: string
  value: Value
}

export function PlaygroundSelect<Value extends string>({
  disabled = false,
  id,
  onValueChange,
  options,
  placeholder,
  value,
}: PlaygroundSelectProps<Value>) {
  return (
    <Select
      disabled={disabled}
      id={id}
      items={options}
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue !== null) {
          onValueChange(nextValue as Value)
        }
      }}
    >
      <SelectTrigger id={id} size="lg">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value === "" ? `${id}-empty` : option.value}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}


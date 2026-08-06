'use client'

import { Input, Label } from '@/components/ui/input'

interface ToolInfo {
  id: string
  name: string
  quantity: number
  isRequired: boolean
}

export function ToolCountFields({
  tools,
  values,
  onChange,
}: {
  tools: ToolInfo[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
}) {
  if (tools.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-950 dark:text-white">
        Kiểm đếm dụng cụ
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {tools.map((tool) => (
          <div key={tool.id}>
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={`tool-${tool.id}`}>
                {tool.name}
                {tool.isRequired && <span className="ml-1 text-red-500">*</span>}
              </Label>
              {tool.quantity > 0 && (
                <span className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">
                  Chuẩn: {tool.quantity}
                </span>
              )}
            </div>
            <Input
              id={`tool-${tool.id}`}
              type="number"
              min={0}
              value={values[tool.id] ?? ''}
              onChange={(event) => onChange({ ...values, [tool.id]: event.target.value })}
              placeholder="0"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

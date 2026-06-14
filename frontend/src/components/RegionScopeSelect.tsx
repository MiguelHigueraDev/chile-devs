import { ALL_CHILE_SLUG } from '../lib/all-chile-location'
import type { SearchFacets } from '../types/api'

type RegionScopeSelectProps = {
  value: string
  facets: SearchFacets | undefined
  onChange: (slug: string) => void
  id?: string
}

export function RegionScopeSelect({
  value,
  facets,
  onChange,
  id = 'region-scope',
}: RegionScopeSelectProps) {
  const regions =
    facets?.locations.filter((location) => location.kind === 'region') ?? []

  return (
    <div
      className="pt-2"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <label htmlFor={id} className="text-muted-foreground mb-1.5 block text-xs">
        Region
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
      >
        <option value={ALL_CHILE_SLUG}>All Chile</option>
        {regions.map((region) => (
          <option key={region.slug} value={region.slug}>
            {region.name}
          </option>
        ))}
      </select>
    </div>
  )
}

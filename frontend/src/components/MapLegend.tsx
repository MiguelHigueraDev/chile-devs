import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const LEGEND_ITEMS = [
  { color: '#dc2626', label: '1–20 devs' },
  { color: '#ea580c', label: '21–75 devs' },
  { color: '#ca8a04', label: '76–200 devs' },
  { color: '#65a30d', label: '201–499 devs' },
  { color: '#16a34a', label: '500+ devs' },
]

export function MapLegend() {
  return (
    <Card className="absolute bottom-6 left-4 z-10 hidden w-44 gap-3 border-border/60 bg-card/90 py-4 shadow-lg backdrop-blur-sm sm:block">
      <CardHeader className="px-4 py-0">
        <CardTitle className="text-xs font-medium tracking-wide uppercase">
          Developer density
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4 py-0">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-full border border-white/40"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground text-xs">{item.label}</span>
          </div>
        ))}
        <p className="text-muted-foreground pt-1 text-[10px] leading-snug">
          Click clusters to zoom in. Click a city for details.
        </p>
      </CardContent>
    </Card>
  )
}

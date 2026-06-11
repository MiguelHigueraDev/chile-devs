import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fetchLocationDevelopers } from '../api/client'
import type { DeveloperSummary, MapLocation } from '../types/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

type LocationPanelProps = {
  location: MapLocation | null
  onClose: () => void
}

function LocationDevelopersList({ slug }: { slug: string }) {
  const [developers, setDevelopers] = useState<DeveloperSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchLocationDevelopers(slug)
      .then((data) => {
        if (cancelled) return
        setDevelopers(data.developers)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) {
    return (
      <div className="space-y-3 py-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-32" />
            </div>
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="text-destructive py-4 text-sm">{error}</p>
  }

  if (developers.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-sm">
        No developers found for this location.
      </p>
    )
  }

  return (
    <>
      <ul className="divide-border divide-y">
        {developers.map((dev) => (
          <li key={dev.login} className="flex items-center gap-3 py-3">
            <Avatar className="size-8">
              <AvatarImage src={dev.avatarUrl} alt={dev.login} />
              <AvatarFallback>
                {dev.login.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <a
                href={dev.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-foreground hover:text-foreground/80 inline-flex items-center gap-1 text-sm font-medium transition-colors"
              >
                {dev.login}
                <ExternalLink className="size-3 opacity-60" />
              </a>
              {dev.name && (
                <p className="text-muted-foreground truncate text-xs">
                  {dev.name}
                </p>
              )}
            </div>
            <span className="text-foreground shrink-0 text-sm font-semibold tabular-nums">
              {dev.contributions.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground pt-2 text-xs">
        Showing top {developers.length} developers by contributions
      </p>
    </>
  )
}

export function LocationPanel({ location, onClose }: LocationPanelProps) {
  return (
    <Sheet
      open={!!location}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      modal={false}
    >
      <SheetContent
        side="right"
        showOverlay={false}
        className="border-border/60 bg-background/95 w-full backdrop-blur-md sm:max-w-md"
        onInteractOutside={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        {location && (
          <>
            <SheetHeader className="border-b pb-4">
              <SheetTitle className="text-lg">{location.name}</SheetTitle>
              <SheetDescription>
                Top contributors in this location
              </SheetDescription>
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="secondary">
                  {location.devCount.toLocaleString()} developers
                </Badge>
                <Badge variant="muted">
                  {location.totalContributions.toLocaleString()} contributions
                </Badge>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 px-4">
              <LocationDevelopersList
                key={location.slug}
                slug={location.slug}
              />
            </ScrollArea>

            <Separator />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

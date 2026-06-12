import { useEffect, useRef, useState } from 'react'
import { LogIn, LogOut, Pencil, SlidersHorizontal, User } from 'lucide-react'
import { useMe, useLogoutMutation, useStats } from '../api/queries'
import { getGitHubAuthUrl } from '../api/client'
import { getGitHubAvatarUrl } from '../lib/github'
import { toSafeHttpsUrl } from '../lib/safe-url'
import { createAllChileLocation } from '../lib/all-chile-location'
import type { MapLocation } from '../types/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type StatsHeaderProps = {
  onViewAllDevelopers: (location: MapLocation) => void
  onOpenFilters: () => void
  activeFilterCount?: number
  onOpenMyProfile: (login: string) => void
  onEditMyProfile: (login: string) => void
}

export function StatsHeader({
  onViewAllDevelopers,
  onOpenFilters,
  activeFilterCount = 0,
  onOpenMyProfile,
  onEditMyProfile,
}: StatsHeaderProps) {
  const { data: stats } = useStats()
  const { data: me } = useMe()
  const logoutMutation = useLogoutMutation()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const avatarUrl =
    toSafeHttpsUrl(me?.avatarUrl) ??
    (me?.login ? getGitHubAvatarUrl(me.login) : null)

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [menuOpen])

  return (
    <header className="border-border/60 bg-background/80 z-10 flex shrink-0 flex-col gap-3 border-b px-3 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm leading-none font-semibold tracking-tight sm:text-base">
            Chile Devs Map
          </h1>
          {stats && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2.5 text-xs"
              onClick={() => onViewAllDevelopers(createAllChileLocation(stats))}
            >
              View all
            </Button>
          )}
        </div>
        <p className="text-muted-foreground mt-1 hidden text-xs leading-none sm:block">
          GitHub contributions from developers across Chile
        </p>
      </div>

      <div className="flex w-full items-center gap-2 sm:max-w-md sm:shrink-0 sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 min-w-0 flex-1 sm:flex-none"
          onClick={onOpenFilters}
        >
          <SlidersHorizontal className="size-3.5 shrink-0" />
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {me ? (
          <div className="relative shrink-0" ref={menuRef}>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Avatar className="size-6">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={me.login} />
                ) : null}
                <AvatarFallback className="text-[10px]">
                  {me.login.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Button>

            {menuOpen && (
              <div className="border-border bg-background absolute top-full right-0 z-20 mt-2 w-44 rounded-md border py-1 shadow-md">
                <button
                  type="button"
                  className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenMyProfile(me.login)
                  }}
                >
                  <User className="size-3.5" />
                  My profile
                </button>
                {me.hasProfile && (
                  <button
                    type="button"
                    className="hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                    onClick={() => {
                      setMenuOpen(false)
                      onEditMyProfile(me.login)
                    }}
                  >
                    <Pencil className="size-3.5" />
                    Edit profile
                  </button>
                )}
                <button
                  type="button"
                  className="hover:bg-accent text-destructive flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                  onClick={() => {
                    setMenuOpen(false)
                    logoutMutation.mutate()
                  }}
                >
                  <LogOut className="size-3.5" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              window.location.href = getGitHubAuthUrl()
            }}
          >
            <LogIn className="size-3.5" />
            <span className="hidden sm:inline">Sign in</span>
          </Button>
        )}
      </div>
    </header>
  )
}

import { ExternalLink, GitFork, Star } from 'lucide-react'
import { getGitHubAvatarUrl } from '../lib/github'
import { toSafeHttpsUrl } from '../lib/safe-url'
import { formatNumber } from '../lib/utils'
import type { MapRepo } from '../types/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type RepoPanelProps = {
  repo: MapRepo | null
  onClose: () => void
}

export function RepoPanel({ repo, onClose }: RepoPanelProps) {
  const avatarUrl =
    toSafeHttpsUrl(repo?.owner.avatarUrl) ??
    (repo?.owner.login ? getGitHubAvatarUrl(repo.owner.login) : null)

  return (
    <Sheet open={repo != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        {repo && (
          <>
            <SheetHeader className="border-border/60 space-y-3 border-b px-5 py-5 text-left">
              <div className="flex items-start gap-3">
                <Avatar className="size-10 shrink-0">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={repo.owner.login} />
                  ) : null}
                  <AvatarFallback>
                    {repo.owner.login.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate text-base">
                    {repo.name}
                  </SheetTitle>
                  <SheetDescription className="truncate">
                    {repo.nameWithOwner}
                  </SheetDescription>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">
                  {repo.scope === 'regional' ? 'Regional pick' : 'National pick'}
                </Badge>
                {repo.region && (
                  <Badge variant="outline">{repo.region.name}</Badge>
                )}
                {repo.primaryLanguage && (
                  <Badge variant="outline">{repo.primaryLanguage}</Badge>
                )}
              </div>

              <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Star className="size-3.5" />
                  {formatNumber(repo.stars)} stars
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <GitFork className="size-3.5" />
                  {formatNumber(repo.forks)} forks
                </span>
              </div>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
              {repo.description ? (
                <p className="text-sm leading-relaxed">{repo.description}</p>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  No description provided.
                </p>
              )}

              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Owner: </span>
                  <a
                    href={repo.owner.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium hover:underline"
                  >
                    {repo.owner.name ?? repo.owner.login}
                  </a>
                </p>
                {repo.regionRank != null && (
                  <p>
                    <span className="text-muted-foreground">Regional rank: </span>
                    #{repo.regionRank}
                  </p>
                )}
                {repo.countryRank != null && (
                  <p>
                    <span className="text-muted-foreground">National rank: </span>
                    #{repo.countryRank}
                  </p>
                )}
              </div>

              <Button asChild className="mt-auto w-full">
                <a href={repo.url} target="_blank" rel="noreferrer">
                  Open on GitHub
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

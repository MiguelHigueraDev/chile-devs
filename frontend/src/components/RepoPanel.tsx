import { ExternalLink, GitFork, Star } from 'lucide-react'
import { useRepo } from '../api/queries'
import { getGitHubAvatarUrl } from '../lib/github'
import { toSafeHttpsUrl } from '../lib/safe-url'
import { formatNumber } from '../lib/utils'
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
import { Skeleton } from '@/components/ui/skeleton'

type RepoPanelProps = {
  nameWithOwner: string | null
  onClose: () => void
}

function RepoPanelSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-auto h-10 w-full" />
    </div>
  )
}

export function RepoPanel({ nameWithOwner, onClose }: RepoPanelProps) {
  const { data: repo, error, isPending } = useRepo(nameWithOwner)
  const avatarUrl =
    toSafeHttpsUrl(repo?.owner.avatarUrl) ??
    (repo?.owner.login ? getGitHubAvatarUrl(repo.owner.login) : null)
  const ownerProfileUrl = toSafeHttpsUrl(repo?.owner.profileUrl)
  const repoUrl = toSafeHttpsUrl(repo?.url)

  return (
    <Sheet
      open={nameWithOwner != null}
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="border-border/60 bg-background/98 z-60 flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {nameWithOwner && (
          <>
            <SheetHeader className="border-border/60 space-y-3 border-b px-5 py-5 text-left">
              {(isPending && !repo) || error ? (
                <>
                  <SheetTitle className="sr-only">{nameWithOwner}</SheetTitle>
                  <SheetDescription className="sr-only">
                    {error
                      ? 'Failed to load repository details'
                      : 'Loading repository details'}
                  </SheetDescription>
                </>
              ) : null}

              {isPending && !repo && !error ? (
                <>
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-32" />
                </>
              ) : null}

              {repo ? (
                <>
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
                </>
              ) : null}
            </SheetHeader>

            {isPending && !repo && !error ? <RepoPanelSkeleton /> : null}

            {error ? (
              <div className="px-5 py-5">
                <p className="text-destructive text-sm">{error.message}</p>
              </div>
            ) : null}

            {repo ? (
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
                    {ownerProfileUrl ? (
                      <a
                        href={ownerProfileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                      >
                        {repo.owner.name ?? repo.owner.login}
                      </a>
                    ) : (
                      <span className="font-medium">
                        {repo.owner.name ?? repo.owner.login}
                      </span>
                    )}
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

                {repoUrl ? (
                  <Button asChild className="mt-auto w-full">
                    <a href={repoUrl} target="_blank" rel="noreferrer">
                      Open on GitHub
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

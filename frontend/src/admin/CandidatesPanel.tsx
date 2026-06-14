import { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  RefreshCw,
  Star,
  Undo2,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import { toSafeHttpsUrl } from '../lib/safe-url';
import {
  useCandidates,
  usePromoteCandidateMutation,
  useRefreshCandidatesMutation,
  useRejectCandidateMutation,
  useResetCandidateMutation,
  useSearchFacets,
} from '../api/queries';
import type {
  Candidate,
  CandidateScope,
  CandidateSortKey,
  CandidatesQuery,
  CandidateStatus,
} from '../types/api';

type StatusFilter = CandidateStatus | 'all';
type ScopeFilter = CandidateScope | 'all';

const STATUS_TABS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'candidate', label: 'Candidates' },
  { id: 'promoted', label: 'Promoted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

const SCOPE_OPTIONS: Array<{ id: ScopeFilter; label: string }> = [
  { id: 'all', label: 'Any scope' },
  { id: 'region', label: 'Regional picks' },
  { id: 'country', label: 'National picks' },
];

const SORT_OPTIONS: Array<{ id: CandidateSortKey; label: string }> = [
  { id: 'stars', label: 'Stars (high to low)' },
  { id: 'regionRank', label: 'Region rank' },
  { id: 'countryRank', label: 'Country rank' },
];

const STATUS_BADGE: Record<
  CandidateStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  candidate: { label: 'Candidate', variant: 'secondary' },
  promoted: { label: 'Promoted', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

const selectClassName =
  'h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

function CandidateRow({ candidate }: { candidate: Candidate }) {
  const promote = usePromoteCandidateMutation();
  const reject = useRejectCandidateMutation();
  const reset = useResetCandidateMutation();

  const profileUrl = toSafeHttpsUrl(candidate.profileUrl);
  const avatarUrl = toSafeHttpsUrl(candidate.avatarUrl);
  const statusBadge = STATUS_BADGE[candidate.status];
  const isMutating =
    promote.isPending || reject.isPending || reset.isPending;

  return (
    <li className="flex items-center gap-3 border-border border-t px-4 py-3 first:border-t-0">
      <Avatar className="size-9">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={candidate.login} /> : null}
        <AvatarFallback>
          {candidate.login.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="inline-flex flex-wrap items-center gap-1.5">
          <span className="text-foreground text-sm font-medium">
            {candidate.login}
          </span>
          {profileUrl ? (
            <a
              href={profileUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${candidate.login} on GitHub`}
              className="text-muted-foreground hover:text-foreground inline-flex transition-colors"
            >
              <ExternalLink className="size-3" />
            </a>
          ) : null}
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        </div>
        {candidate.name ? (
          <p className="text-muted-foreground truncate text-xs">
            {candidate.name}
          </p>
        ) : null}
        <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-foreground inline-flex items-center gap-1 font-medium tabular-nums">
            <Star className="size-3 fill-amber-400 text-amber-400" />
            {formatNumber(candidate.totalStars)}
          </span>
          <span>{candidate.location.name}</span>
          {candidate.regionRank != null ? (
            <Badge variant="outline">#{candidate.regionRank} region</Badge>
          ) : null}
          {candidate.countryRank != null ? (
            <Badge variant="outline">#{candidate.countryRank} CL</Badge>
          ) : null}
        </div>
        {candidate.status === 'promoted' && candidate.promotedAt ? (
          <p className="text-muted-foreground mt-1 text-[11px]">
            Promoted {formatDateTime(candidate.promotedAt)}
            {candidate.promotedByLogin
              ? ` by ${candidate.promotedByLogin}`
              : ''}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {candidate.status === 'candidate' ? (
          <>
            <Button
              size="sm"
              onClick={() => promote.mutate(candidate.login)}
              disabled={isMutating}
            >
              <Check className="size-3.5" />
              Promote
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => reject.mutate(candidate.login)}
              disabled={isMutating}
            >
              <X className="size-3.5" />
              Reject
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => reset.mutate(candidate.login)}
            disabled={isMutating}
          >
            <Undo2 className="size-3.5" />
            {candidate.status === 'promoted' ? 'Unpromote' : 'Restore'}
          </Button>
        )}
      </div>
    </li>
  );
}

export function CandidatesPanel() {
  const [status, setStatus] = useState<StatusFilter>('candidate');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [region, setRegion] = useState<string>('');
  const [sort, setSort] = useState<CandidateSortKey>('stars');

  const facets = useSearchFacets();
  const regions = useMemo(
    () => facets.data?.locations.filter((loc) => loc.kind === 'region') ?? [],
    [facets.data],
  );

  const query: CandidatesQuery = useMemo(
    () => ({
      status: status === 'all' ? undefined : status,
      scope: scope === 'all' ? undefined : scope,
      region: region || undefined,
      sort,
      limit: 200,
    }),
    [status, scope, region, sort],
  );

  const candidates = useCandidates(query);
  const refresh = useRefreshCandidatesMutation();
  const summary = refresh.data;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-foreground text-lg font-semibold">
            Candidate discovery
          </h1>
          <p className="text-muted-foreground text-sm">
            Top developers by stars per region and nationwide. Promote
            candidates to surface them later.
          </p>
        </div>
        <Button
          onClick={() => refresh.mutate({})}
          disabled={refresh.isPending}
          size="sm"
        >
          <RefreshCw
            className={cn('size-3.5', refresh.isPending && 'animate-spin')}
          />
          {refresh.isPending ? 'Refreshing…' : 'Refresh candidates'}
        </Button>
      </header>

      {refresh.isError ? (
        <p className="text-destructive text-sm">
          Failed to refresh candidates. Please try again.
        </p>
      ) : null}
      {summary ? (
        <p className="text-muted-foreground rounded-md border border-border bg-card px-3 py-2 text-xs">
          Selected {formatNumber(summary.totalSelected)} developers (
          {formatNumber(summary.regionPicks)} regional,{' '}
          {formatNumber(summary.countryPicks)} national) · top{' '}
          {summary.perRegion}/region, top {summary.perCountry} nationwide ·{' '}
          {formatNumber(summary.promotedRetained)} promoted retained.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border p-0.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatus(tab.id)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                status === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <select
          aria-label="Filter by region"
          className={selectClassName}
          value={region}
          onChange={(event) => setRegion(event.target.value)}
        >
          <option value="">All regions</option>
          {regions.map((loc) => (
            <option key={loc.slug} value={loc.slug}>
              {loc.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by scope"
          className={selectClassName}
          value={scope}
          onChange={(event) => setScope(event.target.value as ScopeFilter)}
        >
          {SCOPE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort candidates"
          className={selectClassName}
          value={sort}
          onChange={(event) => setSort(event.target.value as CandidateSortKey)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {candidates.isPending ? (
          <ul>
            {Array.from({ length: 6 }).map((_, index) => (
              <li
                key={index}
                className="flex items-center gap-3 border-border border-t px-4 py-3 first:border-t-0"
              >
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-8 w-20" />
              </li>
            ))}
          </ul>
        ) : candidates.isError ? (
          <p className="text-destructive px-4 py-8 text-center text-sm">
            Failed to load candidates.
          </p>
        ) : candidates.data && candidates.data.candidates.length > 0 ? (
          <ul>
            {candidates.data.candidates.map((candidate) => (
              <CandidateRow key={candidate.login} candidate={candidate} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            No candidates match these filters. Try refreshing candidates.
          </p>
        )}
      </div>

      {candidates.data ? (
        <p className="text-muted-foreground text-xs">
          Showing {formatNumber(candidates.data.candidates.length)} of{' '}
          {formatNumber(candidates.data.total)} matching.
        </p>
      ) : null}
    </div>
  );
}

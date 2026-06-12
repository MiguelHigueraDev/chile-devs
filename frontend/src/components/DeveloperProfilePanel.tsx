import { useState } from "react";
import { ExternalLink, Globe, LogIn, Pencil } from "lucide-react";
import {
  useDeveloper,
  useMe,
  useUpdateProfileMutation,
} from "../api/queries";
import { getGitHubAuthUrl } from "../api/client";
import { formatNumber } from "../lib/utils";
import { toSafeHttpsUrl } from "../lib/safe-url";
import type { DeveloperDetail } from "../types/api";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ExternalLinkWarningDialog } from "./ExternalLinkWarningDialog";
import { TopLanguagesBar } from "./TopLanguagesBar";
import { RankBadge } from "./RankBadge";
import { hasRankData, RANK_SECTION_LABEL, formatCountryRank, formatLocationRank } from "../lib/rank";

type DeveloperProfilePanelProps = {
  login: string | null;
  onClose: () => void;
  editMode?: boolean;
  onEditModeChange?: (editing: boolean) => void;
};

type ProfileFormState = {
  portfolioUrl: string;
  role: string;
  description: string;
};

function toFormState(developer: DeveloperDetail): ProfileFormState {
  return {
    portfolioUrl: developer.portfolioUrl ?? "",
    role: developer.role ?? "",
    description: developer.description ?? "",
  };
}

function ProfileStats({ developer }: { developer: DeveloperDetail }) {
  const stats = [
    { label: "Contributions", value: developer.contributions },
    { label: "Followers", value: developer.followers },
    { label: "Stars", value: developer.totalStars },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="border-border/60 bg-muted/30 rounded-md border px-3 py-2 text-center"
        >
          <p className="text-foreground text-sm font-semibold tabular-nums">
            {formatNumber(stat.value)}
          </p>
          <p className="text-muted-foreground text-xs">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

function ProfileView({
  developer,
  isOwner,
  onEdit,
}: {
  developer: DeveloperDetail;
  isOwner: boolean;
  onEdit: () => void;
}) {
  const [portfolioWarningOpen, setPortfolioWarningOpen] = useState(false);
  const profileUrl = toSafeHttpsUrl(developer.profileUrl);
  const avatarUrl = toSafeHttpsUrl(developer.avatarUrl);
  const portfolioUrl = toSafeHttpsUrl(developer.portfolioUrl);
  const locationRank = formatLocationRank(
    developer.rankLocation,
    developer.locationName,
    developer.locationKind,
  );
  const countryRank = formatCountryRank(developer.rankCountry);

  return (
    <div className="space-y-5 px-4 py-4">
      <div className="flex items-start gap-4">
        <Avatar className="size-16">
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={developer.login} />
          ) : null}
          <AvatarFallback>
            {developer.login.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{developer.login}</h2>
            {developer.claimed && (
              <Badge variant="secondary">Claimed</Badge>
            )}
          </div>
          {developer.name && (
            <p className="text-muted-foreground text-sm">{developer.name}</p>
          )}
          {developer.role && (
            <p className="text-foreground mt-1 text-sm font-medium">
              {developer.role}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{developer.locationName}</Badge>
        {developer.rawLocation && (
          <Badge variant="outline">{developer.rawLocation}</Badge>
        )}
      </div>

      {developer.description && (
        <p className="text-foreground/90 text-sm leading-relaxed whitespace-pre-wrap">
          {developer.description}
        </p>
      )}

      <ProfileStats developer={developer} />

      {hasRankData(developer) && (
        <div className="space-y-3 text-center">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {RANK_SECTION_LABEL}
          </p>
          <RankBadge
            developer={developer}
            showPercentile
            locationRank={locationRank}
            countryRank={countryRank}
            size="lg"
            centered
          />
        </div>
      )}

      {developer.topLanguages.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Top languages
          </p>
          <TopLanguagesBar languages={developer.topLanguages} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {profileUrl ? (
          <Button variant="outline" size="sm" asChild>
            <a
              href={profileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5"
            >
              GitHub profile
              <ExternalLink className="size-3 opacity-60" />
            </a>
          </Button>
        ) : null}
        {portfolioUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="inline-flex items-center gap-1.5"
            onClick={() => setPortfolioWarningOpen(true)}
          >
            <Globe className="size-3.5" />
            Portfolio
            <ExternalLink className="size-3 opacity-60" />
          </Button>
        ) : null}
      </div>

      {portfolioUrl ? (
        <ExternalLinkWarningDialog
          open={portfolioWarningOpen}
          onOpenChange={setPortfolioWarningOpen}
          url={portfolioUrl}
          developerLogin={developer.login}
        />
      ) : null}

      {isOwner && (
        <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" />
          Edit profile
        </Button>
      )}
    </div>
  );
}

function ProfileEditForm({
  developer,
  onCancel,
}: {
  developer: DeveloperDetail;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ProfileFormState>(() =>
    toFormState(developer),
  );
  const updateProfile = useUpdateProfileMutation();

  return (
    <form
      className="space-y-4 px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        updateProfile.mutate(
          {
            portfolioUrl: form.portfolioUrl.trim() || null,
            role: form.role.trim() || null,
            description: form.description.trim() || null,
          },
          { onSuccess: () => onCancel() },
        );
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="portfolio-url">Portfolio URL</Label>
        <Input
          id="portfolio-url"
          type="url"
          placeholder="https://yoursite.com"
          value={form.portfolioUrl}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              portfolioUrl: event.target.value,
            }))
          }
        />
        <p className="text-muted-foreground text-xs">Must use HTTPS.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Input
          id="role"
          placeholder="Senior Backend Engineer"
          maxLength={80}
          value={form.role}
          onChange={(event) =>
            setForm((current) => ({ ...current, role: event.target.value }))
          }
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Tell people what you work on..."
          maxLength={500}
          value={form.description}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
        <p className="text-muted-foreground text-xs">
          {form.description.length}/500 characters
        </p>
      </div>

      {updateProfile.error && (
        <p className="text-destructive text-sm">{updateProfile.error.message}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={updateProfile.isPending}>
          {updateProfile.isPending ? "Saving..." : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={updateProfile.isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function DeveloperProfilePanel({
  login,
  onClose,
  editMode = false,
  onEditModeChange,
}: DeveloperProfilePanelProps) {
  const { data: developer, error, isPending } = useDeveloper(login);
  const { data: me } = useMe();

  const isEditing = editMode;
  const isOwner = !!login && me?.login === login;
  const canEditProfile = isOwner && !!me?.hasProfile;
  const showClaimCta = !developer?.claimed && !me;

  return (
    <Sheet
      open={!!login}
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="border-border/60 bg-background/98 z-60 flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {login && (
          <>
            <SheetHeader className="shrink-0 border-b pb-4">
              <SheetTitle className="text-lg">Developer profile</SheetTitle>
              <SheetDescription>Public GitHub stats and profile</SheetDescription>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              {isPending && (
                <div className="space-y-4 px-4 py-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="size-16 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              )}

              {error && !isPending && (
                <p className="text-destructive px-4 py-4 text-sm">
                  {error.message}
                </p>
              )}

              {developer && !isPending && (
                <>
                  {isOwner && !me?.hasProfile && (
                    <p className="text-muted-foreground border-b px-4 py-3 text-sm">
                      Your GitHub account is connected, but your profile is not
                      indexed yet. Check back after the next sync.
                    </p>
                  )}

                  {canEditProfile && isEditing ? (
                    <ProfileEditForm
                      key={developer.login}
                      developer={developer}
                      onCancel={() => onEditModeChange?.(false)}
                    />
                  ) : (
                    <ProfileView
                      developer={developer}
                      isOwner={canEditProfile}
                      onEdit={() => onEditModeChange?.(true)}
                    />
                  )}

                  {showClaimCta && (
                    <div className="border-border/60 bg-muted/20 mx-4 mb-4 rounded-md border px-4 py-3">
                      <p className="text-sm font-medium">Is this you?</p>
                      <p className="text-muted-foreground mt-1 text-sm">
                        Sign in with GitHub to claim this profile and add your
                        portfolio, role, and description.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          window.location.href = getGitHubAuthUrl();
                        }}
                      >
                        <LogIn className="size-3.5" />
                        Sign in with GitHub
                      </Button>
                    </div>
                  )}
                </>
              )}
            </ScrollArea>

            <Separator className="shrink-0" />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

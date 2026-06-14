import { LogIn, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, getGitHubAuthUrl } from '../api/client';
import { useAdminMe } from '../api/queries';
import { CandidatesPanel } from './CandidatesPanel';

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        {children}
      </div>
    </div>
  );
}

export function AdminApp() {
  const adminMe = useAdminMe();

  if (adminMe.isPending) {
    return (
      <CenteredMessage>
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
        <p className="text-muted-foreground text-sm">Checking access…</p>
      </CenteredMessage>
    );
  }

  if (adminMe.isError) {
    const status =
      adminMe.error instanceof ApiError ? adminMe.error.status : 0;

    if (status === 401) {
      return (
        <CenteredMessage>
          <h1 className="text-foreground text-lg font-semibold">
            Admin sign in
          </h1>
          <p className="text-muted-foreground text-sm">
            Sign in with the GitHub account that has admin access to manage
            candidates.
          </p>
          <Button onClick={() => (window.location.href = getGitHubAuthUrl())}>
            <LogIn className="size-4" />
            Sign in with GitHub
          </Button>
        </CenteredMessage>
      );
    }

    return (
      <CenteredMessage>
        <ShieldAlert className="text-destructive size-7" />
        <h1 className="text-foreground text-lg font-semibold">
          Not authorized
        </h1>
        <p className="text-muted-foreground text-sm">
          Your account does not have admin access. Ask an administrator to add
          your GitHub login to the admins list.
        </p>
      </CenteredMessage>
    );
  }

  return <CandidatesPanel />;
}

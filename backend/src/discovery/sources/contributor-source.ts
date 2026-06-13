import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GithubService } from '../../sync/github.service';
import type { NewCandidate } from '../candidate-queue.service';
import { CHILEAN_ORG_SEEDS, CHILEAN_REPO_SEEDS } from '../seeds.data';
import { parsePositiveIntOrFallback } from '../utils';

const DEFAULT_ORG_MEMBER_PAGES = 2;
const DEFAULT_REPO_CONTRIBUTOR_PAGES = 1;

/**
 * Contributor scraping: pulls members of curated Chilean GitHub organizations
 * (companies, universities, communities) and contributors of notable Chilean
 * open-source repositories. See seeds.data.ts for the curated lists.
 */
@Injectable()
export class ContributorSource {
  private readonly logger = new Logger(ContributorSource.name);

  constructor(
    private readonly github: GithubService,
    private readonly config: ConfigService,
  ) {}

  async collect(): Promise<NewCandidate[]> {
    const orgPages = parsePositiveIntOrFallback(
      this.config,
      'DISCOVERY_ORG_MEMBER_PAGES',
      DEFAULT_ORG_MEMBER_PAGES,
    );
    const repoPages = parsePositiveIntOrFallback(
      this.config,
      'DISCOVERY_REPO_CONTRIBUTOR_PAGES',
      DEFAULT_REPO_CONTRIBUTOR_PAGES,
    );

    const byGithubId = new Map<string, NewCandidate>();

    for (const org of CHILEAN_ORG_SEEDS) {
      try {
        const members = await this.github.fetchOrgMembers(org.login, orgPages);
        for (const member of members) {
          if (!byGithubId.has(member.githubId)) {
            byGithubId.set(member.githubId, {
              githubId: member.githubId,
              login: member.login,
              source: 'org_contributor',
              discoveredVia: org.login,
            });
          }
        }
        this.logger.log(`Org ${org.login}: ${members.length} members.`);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch members of org ${org.login}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    for (const repo of CHILEAN_REPO_SEEDS) {
      try {
        const contributors = await this.github.fetchRepoContributors(
          repo,
          repoPages,
        );
        for (const contributor of contributors) {
          if (!byGithubId.has(contributor.githubId)) {
            byGithubId.set(contributor.githubId, {
              githubId: contributor.githubId,
              login: contributor.login,
              source: 'repo_contributor',
              discoveredVia: repo,
            });
          }
        }
        this.logger.log(`Repo ${repo}: ${contributors.length} contributors.`);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch contributors of repo ${repo}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return [...byGithubId.values()];
  }
}

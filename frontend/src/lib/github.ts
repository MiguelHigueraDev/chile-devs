export const GITHUB_REPO_URL = "https://github.com/MiguelHigueraDev/chile-devs";
export const GITHUB_REPO_SLUG = "MiguelHigueraDev/chile-devs";

export function getGitHubAvatarUrl(login: string): string {
  return `https://github.com/${login}.png`;
}

type GithubRepoResponse = {
  stargazers_count: number;
};

export async function fetchGithubStars(): Promise<number> {
  const response = await fetch(
    "https://api.github.com/repos/MiguelHigueraDev/chile-devs",
  );
  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}`);
  }
  const data = (await response.json()) as GithubRepoResponse;
  return data.stargazers_count;
}

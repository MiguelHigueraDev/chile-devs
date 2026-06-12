# Roadmap (in no particular order, and not commited to any)

## Likely

- FIX: Filter out people who are from places outside Chile (e.g. "Los Angeles, California", "Valparaiso, Brazil", "Los Ríos, Ecuador").
- FIX: Keep location/search results scroll position when closing a profile.
- FEAT: Show recent commits made by the user (maybe 3-5). We could try doing this client side to avoid hitting rate limits as a poc, then implement it in the backend.
- FEAT: Add more regions/cities/towns? to the seeder.
- FEAT: Show national and regional/local (if available) percentile.
- FEAT: Allow logged in users to highlight their top repos up to 3-6.
- FEAT: Improve UI/UX, making it more tactile.
- FEAT: Adding more stats like language distribution and contributions over time displayed in charts.
- FEAT: Showing each user's commit streak.
- PERF: Optimize search, maybe use a strutured filter format instead of relying on an LLM to do the interpretation.


## Unlikely

- FEAT: Rank users by code quality + formula based on followers, contributions (commits, PRs, issues, external contributions, etc.), giving them a grade from S to F.
The formula seems very likely and it could be implemented, but judging code quality/project originality/etc seems very expensive to do because it would rely on an LLM burning through millions of tokens.
- FEAT: Adding more countries. This could be implemented but it would require to make cache updates take weeks/month(s) instead of a few hours to do it without hitting rate limits.
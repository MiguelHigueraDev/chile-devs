# Roadmap (in no particular order, and not committed to any)

## Likely

- [ ] **FIX:** Filter out people who are from places outside Chile (e.g. "Los Angeles, California", "Valparaiso, Brazil", "Los Ríos, Ecuador").
  - *Note: A prior attempt was made and reverted. Current sync classifies by location seed terms, but there is no hard foreign-location filter yet.*
- [x] **FIX:** Keep location/search results scroll position when closing a profile.
- [ ] **FEAT:** Show recent commits made by the user (maybe 3–5). We could try doing this client side to avoid hitting rate limits as a PoC, then implement it in the backend.
- [ ] **FEAT:** Add more regions/cities/towns to the seeder.
- [x] **FEAT:** Show national and regional/local (if available) percentile.
- [ ] **FEAT:** Allow logged in users to highlight their top repos up to 3–6.
- [ ] **FEAT:** Improve UI/UX, making it more tactile.
- [~] **FEAT:** Adding more stats like language distribution and contributions over time displayed in charts.
  - *Partially done: Contribution activity graph and repo commit activity chart are implemented. Language distribution charts are not.*
- [ ] **FEAT:** Showing each user's commit streak.
- [x] **PERF:** Optimize search, maybe use a structured filter format instead of relying on an LLM to do the interpretation.
  - *Done: Natural-language search was replaced with structured parametric filters.*

## Unlikely

- [~] **FEAT:** Rank users by code quality + formula based on followers, contributions (commits, PRs, issues, external contributions, etc.), giving them a grade from S to F.
  - *Partially done: The formula-based grade (S–C) and percentiles are live. Judging code quality/project originality via LLM is explicitly out of scope due to token cost.*
- [ ] **FEAT:** Adding more countries. This could be implemented but it would require making cache updates take weeks/month(s) instead of a few hours to do it without hitting rate limits.

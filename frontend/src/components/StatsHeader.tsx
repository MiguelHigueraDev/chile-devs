import { useEffect, useState } from 'react';
import { fetchStats } from '../api/client';
import type { StatsResponse } from '../types/api';

export function StatsHeader() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <header className="stats-header">
      <div className="stats-header__brand">
        <h1>Chile Devs Map</h1>
        <p>GitHub contributions from developers across Chile</p>
      </div>
      <div className="stats-header__metrics">
        {error && <span className="stats-header__error">{error}</span>}
        {stats && (
          <>
            <div className="metric">
              <span className="metric__value">
                {stats.totalDevs.toLocaleString()}
              </span>
              <span className="metric__label">Developers</span>
            </div>
            <div className="metric">
              <span className="metric__value">
                {stats.totalContributions.toLocaleString()}
              </span>
              <span className="metric__label">Contributions (1y)</span>
            </div>
            <div className="metric">
              <span className="metric__value">
                {stats.locationsWithDevs.toLocaleString()}
              </span>
              <span className="metric__label">Locations</span>
            </div>
            <div className="metric metric--muted">
              <span className="metric__value">
                {stats.countryLevelDevs.toLocaleString()}
              </span>
              <span className="metric__label">Country-level only</span>
            </div>
          </>
        )}
        {!stats && !error && (
          <span className="stats-header__loading">Loading stats…</span>
        )}
      </div>
    </header>
  );
}

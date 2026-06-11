import type { DeveloperSummary } from '../types/api';

type LocationPopupProps = {
  locationName: string;
  devCount: number;
  totalContributions: number;
  developers: DeveloperSummary[];
  loading: boolean;
  error: string | null;
};

export function LocationPopup({
  locationName,
  devCount,
  totalContributions,
  developers,
  loading,
  error,
}: LocationPopupProps) {
  return (
    <div className="location-popup">
      <h3>{locationName}</h3>
      <div className="location-popup__summary">
        <span>{devCount.toLocaleString()} developers</span>
        <span>{totalContributions.toLocaleString()} contributions</span>
      </div>

      {loading && <p className="location-popup__loading">Loading developers…</p>}
      {error && <p className="location-popup__error">{error}</p>}

      {!loading && !error && developers.length > 0 && (
        <ul className="developer-list">
          {developers.map((dev) => (
            <li key={dev.login} className="developer-list__item">
              <img src={dev.avatarUrl} alt="" className="developer-list__avatar" />
              <div className="developer-list__info">
                <a
                  href={dev.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="developer-list__login"
                >
                  {dev.login}
                </a>
                {dev.name && (
                  <span className="developer-list__name">{dev.name}</span>
                )}
              </div>
              <span className="developer-list__contributions">
                {dev.contributions.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

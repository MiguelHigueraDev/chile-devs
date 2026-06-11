import { getLanguageColor } from '../lib/language-colors';
import type { TopLanguage } from '../types/api';
import { cn } from '@/lib/utils';

type TopLanguagesBarProps = {
  languages: TopLanguage[];
  className?: string;
};

export function TopLanguagesBar({ languages, className }: TopLanguagesBarProps) {
  if (languages.length === 0) {
    return null;
  }

  const totalShare = languages.reduce((sum, language) => sum + language.share, 0);

  return (
    <div className={cn('space-y-1', className)}>
      <div
        className="bg-muted/60 flex h-1.5 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={languages
          .map((language) => `${language.name} ${language.share}%`)
          .join(', ')}
      >
        {languages.map((language) => (
          <span
            key={language.name}
            className="h-full shrink-0 first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${totalShare > 0 ? (language.share / totalShare) * 100 : 0}%`,
              backgroundColor: getLanguageColor(language.name),
            }}
          />
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-2.5 gap-y-0.5">
        {languages.map((language) => (
          <li
            key={language.name}
            className="text-muted-foreground inline-flex min-w-0 items-center gap-1 text-[10px] leading-none"
          >
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: getLanguageColor(language.name) }}
              aria-hidden
            />
            <span className="truncate">
              {language.name}{' '}
              <span className="tabular-nums">{language.share}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

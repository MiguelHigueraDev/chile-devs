import { google } from '@ai-sdk/google';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateObject, generateText } from 'ai';
import { LOCATION_CATALOG, LOCATION_SLUGS } from './geo.data';
import { parsedQuerySchema, type ParsedQuery } from './search.types';

const GEMMA_MODEL = 'gemma-4-26b-a4b-it';
const CACHE_MAX_ENTRIES = 200;
const LLM_REQUESTS_PER_MINUTE = 14;

const SYSTEM_PROMPT = `You translate natural-language developer search queries into structured JSON filters for a Chilean GitHub developer directory.

Canonical location slugs (use only these in locationSlugs):
${LOCATION_CATALOG.map((location) => `- ${location.slug} (${location.name}, ${location.kind})`).join('\n')}

Rules:
- languages: programming language names in lowercase (e.g. typescript, rust, javascript). Empty array means no language filter.
- languageMode: "all" when the query requires every listed language (e.g. "both TypeScript and Rust"), otherwise "any".
- locationSlugs: match region/city slugs from the list above. Empty array means no explicit location.
- zone: use "south" for "sur de Chile", "south of Chile", etc.; "north" for norte; "central" for centro. null if not mentioned.
- sort: default "contributions" for "top developers" unless stars/followers are explicitly requested.
  Use "stars" for most stars / starred repos.
  Use "followers" for most followers.
  Use "languageShare" when ranking by highest share of a specific language (set shareLanguage too).
- shareLanguage: lowercase language name when sort is languageShare, otherwise null.
- "whole country" or no location => locationSlugs: [], zone: null.
- Spanish and English queries are both supported.`;

@Injectable()
export class QueryParserService {
  private readonly logger = new Logger(QueryParserService.name);
  private readonly cache = new Map<string, ParsedQuery>();
  private readonly requestTimestamps: number[] = [];

  constructor(private readonly config: ConfigService) {}

  async parseQuery(rawQuery: string): Promise<ParsedQuery> {
    const normalized = rawQuery.trim().toLowerCase().replace(/\s+/g, ' ');
    const cached = this.cache.get(normalized);
    if (cached) {
      return cached;
    }

    const apiKey = this.config.get<string>('GOOGLE_GENERATIVE_AI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Search is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY in backend/.env',
      );
    }

    this.enforceRateLimit();

    const parsed = await this.parseWithLlm(rawQuery);
    this.rememberCache(normalized, parsed);
    return parsed;
  }

  private enforceRateLimit(): void {
    const now = Date.now();
    const windowStart = now - 60_000;
    while (
      this.requestTimestamps.length > 0 &&
      this.requestTimestamps[0] < windowStart
    ) {
      this.requestTimestamps.shift();
    }

    if (this.requestTimestamps.length >= LLM_REQUESTS_PER_MINUTE) {
      throw new ServiceUnavailableException(
        'Search is temporarily rate-limited. Please try again in a minute.',
      );
    }

    this.requestTimestamps.push(now);
  }

  private rememberCache(key: string, parsed: ParsedQuery): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, parsed);
  }

  private async parseWithLlm(rawQuery: string): Promise<ParsedQuery> {
    const model = google(GEMMA_MODEL);

    try {
      const { object } = await generateObject({
        model,
        schema: parsedQuerySchema,
        system: SYSTEM_PROMPT,
        prompt: rawQuery,
        temperature: 0.2,
      });

      return this.normalizeParsedQuery(object);
    } catch (error) {
      this.logger.warn(
        `generateObject failed, falling back to generateText: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    const { text } = await generateText({
      model,
      system: `${SYSTEM_PROMPT}\n\nRespond with JSON only. No markdown.`,
      prompt: rawQuery,
      temperature: 0.2,
    });

    const jsonText = text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '');

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonText) as unknown;
    } catch {
      throw new ServiceUnavailableException(
        'Could not understand the search query. Try rephrasing it.',
      );
    }

    const result = parsedQuerySchema.safeParse(parsedJson);
    if (!result.success) {
      throw new ServiceUnavailableException(
        'Could not understand the search query. Try rephrasing it.',
      );
    }

    return this.normalizeParsedQuery(result.data);
  }

  private normalizeParsedQuery(parsed: ParsedQuery): ParsedQuery {
    const validSlugs = new Set(LOCATION_SLUGS);

    return {
      languages: parsed.languages.map((language) => language.toLowerCase()),
      languageMode: parsed.languageMode,
      locationSlugs: parsed.locationSlugs.filter((slug) =>
        validSlugs.has(slug),
      ),
      zone: parsed.zone,
      sort: parsed.sort,
      shareLanguage: parsed.shareLanguage?.toLowerCase() ?? null,
    };
  }
}

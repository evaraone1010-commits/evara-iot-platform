/**
 * useThingSpeakFields
 *
 * A reusable hook that fetches channel feed data directly from the ThingSpeak
 * public API and derives the list of non-null fields present in the channel.
 *
 * Key design decisions:
 *  - Uses react-query v5 (queryKey as first arg, queryFn as second in options).
 *  - The query is manually controlled via `enabled: false` + `refetch()` so
 *    the user explicitly triggers fetching (not on mount).
 *  - A stable `queryKey` is derived from the current channelId + readApiKey.
 *    Changing either resets the cache automatically.
 *  - axios is used for the HTTP request so we can inspect response status codes
 *    and surface meaningful error messages.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios, { AxiosError } from 'axios';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ThingSpeakFeed {
  entry_id: number;
  created_at: string;
  field1?: string | null;
  field2?: string | null;
  field3?: string | null;
  field4?: string | null;
  field5?: string | null;
  field6?: string | null;
  field7?: string | null;
  field8?: string | null;
}

export interface ThingSpeakChannel {
  id: number;
  name: string;
  field1?: string;
  field2?: string;
  field3?: string;
  field4?: string;
  field5?: string;
  field6?: string;
  field7?: string;
  field8?: string;
}

export interface ThingSpeakResponse {
  channel: ThingSpeakChannel;
  feeds: ThingSpeakFeed[];
}

export interface ThingSpeakField {
  key: string;        // e.g. "field1"
  label: string;      // e.g. "Voltage" (from channel metadata) or "Field 1" fallback
}

export interface UseThingSpeakFieldsReturn {
  /** Derived list of non-null fields from the last successful fetch. */
  availableFields: ThingSpeakField[];
  /** True while the API fetch is in progress. */
  isFetching: boolean;
  /** Error message if the last fetch failed. */
  error: string | null;
  /** Call this to trigger / re-trigger a fetch with the current ids. */
  fetchFields: (channelId: string, readApiKey: string) => Promise<void>;
  /** Reset all derived state (call when channel / key inputs change). */
  reset: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const THINGSPEAK_FIELD_KEYS = [
  'field1', 'field2', 'field3', 'field4',
  'field5', 'field6', 'field7', 'field8',
] as const;

function deriveAvailableFields(response: ThingSpeakResponse): ThingSpeakField[] {
  const { channel, feeds } = response;

  return THINGSPEAK_FIELD_KEYS.filter((key) => {
    // A field is "available" if at least one feed entry has a non-null value for it.
    return feeds.some((feed) => feed[key] != null && feed[key] !== '');
  }).map((key) => ({
    key,
    // Prefer the channel's human-readable label (e.g. "Temperature"), then fallback.
    label: channel[key] ? (channel[key] as string) : `Field ${key.replace('field', '')}`,
  }));
}

function parseApiError(err: unknown): string {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    if (status === 401 || status === 400) return 'Invalid API key or channel ID.';
    if (status === 404) return 'Channel not found. Check the Channel ID.';
    if (status === 429) return 'Rate limit exceeded. Please wait and try again.';
    if (!err.response) return 'Network error. Check your internet connection.';
    return `API error (${status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return 'An unknown error occurred.';
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useThingSpeakFields(): UseThingSpeakFieldsReturn {
  const queryClient = useQueryClient();

  // The stable coords for the current fetch. Stored in a ref so fetchFields
  // can be a stable callback without triggering re-renders on every keystroke.
  const [queryCoords, setQueryCoords] = useState<{ channelId: string; readApiKey: string } | null>(null);
  const [derivedFields, setDerivedFields] = useState<ThingSpeakField[]>([]);
  const [derivedError, setDerivedError] = useState<string | null>(null);

  // Abort controller ref to cancel in-flight requests on rapid re-fetch.
  const abortRef = useRef<AbortController | null>(null);

  const queryKey = queryCoords
    ? ['thingspeak-fields', queryCoords.channelId, queryCoords.readApiKey]
    : ['thingspeak-fields', '__idle__'];

  const { isFetching, refetch } = useQuery<ThingSpeakResponse>({
    queryKey,
    queryFn: async ({ signal }) => {
      if (!queryCoords) throw new Error('No channel configured.');
      const { channelId, readApiKey } = queryCoords;
      const url = `https://api.thingspeak.com/channels/${channelId}/feeds.json`;
      const response = await axios.get<ThingSpeakResponse>(url, {
        params: { api_key: readApiKey, results: 1 },
        signal,
      });
      return response.data;
    },
    enabled: false,          // Never auto-fetch; user must trigger explicitly.
    retry: 1,
    staleTime: 0,            // Always re-fetch when user clicks the button.
    gcTime: 0,               // Don't cache stale field data across sessions.
  });

  const fetchFields = useCallback(async (channelId: string, readApiKey: string) => {
    setDerivedError(null);
    setDerivedFields([]);

    // Cancel any pending request.
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    // Setting new coords changes the queryKey, ensuring a fresh fetch.
    setQueryCoords({ channelId, readApiKey });

    // Use a small tick to let React commit the new state before refetching.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    try {
      // Invalidate so react-query treats the new key as stale.
      await queryClient.invalidateQueries({
        queryKey: ['thingspeak-fields', channelId, readApiKey],
      });

      const result = await refetch();

      if (result.error) {
        setDerivedError(parseApiError(result.error));
        return;
      }

      const data = result.data;
      if (!data) {
        setDerivedError('No data returned from ThingSpeak.');
        return;
      }

      const fields = deriveAvailableFields(data);
      if (fields.length === 0) {
        setDerivedError('No active fields found in this channel.');
        return;
      }

      setDerivedFields(fields);
    } catch (err) {
      setDerivedError(parseApiError(err));
    }
  }, [queryClient, refetch]);

  const reset = useCallback(() => {
    setDerivedFields([]);
    setDerivedError(null);
    setQueryCoords(null);
  }, []);

  return {
    availableFields: derivedFields,
    isFetching,
    error: derivedError,
    fetchFields,
    reset,
  };
}

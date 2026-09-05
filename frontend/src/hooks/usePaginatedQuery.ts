import { useSearchParams } from 'react-router-dom';
import type { ListResponse } from '../types';
import { useApi } from './useApi';

export type Filters = Record<string, string>;

export interface PaginatedQuery<T> {
  data: T[] | undefined;
  meta: ListResponse<T>['meta'] | undefined;
  error: unknown;
  isLoading: boolean;
  reload: () => void;
  /** Current filter values (URL value or default). */
  filters: Filters;
  setFilter: (key: string, value: string) => void;
  setFilters: (patch: Filters) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  page: number;
  setPage: (page: number) => void;
}

/**
 * List-page state synced to the URL search params: every key in `defaults` is a filter, plus `page`.
 * Changing a filter resets to page 1. Values equal to their default are removed from the URL.
 */
export function usePaginatedQuery<T>(fetcher: (params: Record<string, string>) => Promise<ListResponse<T>>, defaults: Filters): PaginatedQuery<T> {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: Filters = {};
  for (const key of Object.keys(defaults)) filters[key] = searchParams.get(key) ?? defaults[key];
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const params: Record<string, string> = { page: String(page) };
  for (const [key, value] of Object.entries(filters)) if (value !== '') params[key] = value;

  const result = useApi(() => fetcher(params), [params]);

  const apply = (patch: Filters, resetPage: boolean) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === '' || value === defaults[key]) next.delete(key);
      else next.set(key, value);
    }
    if (resetPage) next.delete('page');
    setSearchParams(next);
  };

  return {
    data: result.data?.data,
    meta: result.data?.meta,
    error: result.error,
    isLoading: result.isLoading,
    reload: result.reload,
    filters,
    setFilter: (key, value) => apply({ [key]: value }, true),
    setFilters: (patch) => apply(patch, true),
    clearFilters: () => setSearchParams(new URLSearchParams()),
    hasActiveFilters: Object.keys(defaults).some((key) => filters[key] !== defaults[key]),
    page,
    setPage: (p) => {
      const next = new URLSearchParams(searchParams);
      if (p <= 1) next.delete('page');
      else next.set('page', String(p));
      setSearchParams(next);
    },
  };
}

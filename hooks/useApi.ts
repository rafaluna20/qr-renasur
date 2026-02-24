/**
 * Hook: useApi
 * 
 * Hook personalizado para hacer requests a la API con manejo
 * automático de loading, error, y success states.
 */

import { useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

interface UseApiOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  onFinally?: () => void;
}

interface UseApiReturn<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  execute: (...args: any[]) => Promise<T | null>;
  reset: () => void;
}

/**
 * Hook para ejecutar API requests con manejo de estados
 */
export function useApi<T = any>(
  apiFunction: (...args: any[]) => Promise<T>,
  options: UseApiOptions<T> = {}
): UseApiReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(
    async (...args: any[]): Promise<T | null> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiFunction(...args);
        setData(result);
        options.onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        options.onError?.(error);
        logger.error('API request failed', error, { args });
        return null;
      } finally {
        setLoading(false);
        options.onFinally?.();
      }
    },
    [apiFunction, options]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, error, loading, execute, reset };
}

/**
 * Hook para fetch simple con estados
 */
export function useFetch<T = any>(
  url: string,
  options?: RequestInit
): UseApiReturn<T> {
  const apiFunction = useCallback(async () => {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }, [url, options]);

  return useApi<T>(apiFunction);
}

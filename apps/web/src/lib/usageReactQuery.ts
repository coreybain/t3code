import { queryOptions, useQuery } from "@tanstack/react-query";

import { ensureLocalApi } from "../localApi";

export const codexUsageQueryKeys = {
  all: ["server", "usage", "codex"] as const,
};

export function codexUsageQueryOptions() {
  return queryOptions({
    queryKey: codexUsageQueryKeys.all,
    queryFn: () => ensureLocalApi().server.getUsage(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}

export function useCodexUsage(options: { enabled?: boolean } = {}) {
  return useQuery({
    ...codexUsageQueryOptions(),
    enabled: options.enabled ?? true,
  });
}

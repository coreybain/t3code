import type {
  EnvironmentId,
  TicketArchiveInput,
  TicketCreateInput,
  TicketMilestoneArchiveInput,
  TicketMilestoneCreateInput,
  TicketMilestonesListInput,
  TicketsListInput,
  TicketUpdateInput,
  TicketMilestoneUpdateInput,
} from "@t3tools/contracts";
import { queryOptions, type QueryClient } from "@tanstack/react-query";

import { ensureEnvironmentApi } from "../environmentApi";

export const ticketQueryKeys = {
  all: ["tickets"] as const,
  lists: (environmentId: EnvironmentId | null) =>
    [...ticketQueryKeys.all, "list", environmentId ?? null] as const,
  list: (environmentId: EnvironmentId | null, filters: TicketsListInput) =>
    [
      ...ticketQueryKeys.lists(environmentId),
      filters.projectId ?? "all",
      filters.includeArchived ?? false,
    ] as const,
  milestoneLists: (environmentId: EnvironmentId | null) =>
    [...ticketQueryKeys.all, "milestones", environmentId ?? null] as const,
  milestoneList: (environmentId: EnvironmentId | null, filters: TicketMilestonesListInput) =>
    [
      ...ticketQueryKeys.milestoneLists(environmentId),
      filters.projectId ?? "all",
      filters.includeArchived ?? false,
    ] as const,
};

export function ticketsListQueryOptions(input: {
  environmentId: EnvironmentId | null;
  filters?: TicketsListInput;
}) {
  const filters = input.filters ?? {};
  return queryOptions({
    queryKey: ticketQueryKeys.list(input.environmentId, filters),
    queryFn: async () => {
      if (!input.environmentId) {
        throw new Error("Ticket data is unavailable.");
      }
      return ensureEnvironmentApi(input.environmentId).tickets.list(filters);
    },
    enabled: input.environmentId !== null,
    staleTime: 10_000,
    placeholderData: (previous) => previous ?? { tickets: [] },
  });
}

export function ticketMilestonesListQueryOptions(input: {
  environmentId: EnvironmentId | null;
  filters?: TicketMilestonesListInput;
}) {
  const filters = input.filters ?? {};
  return queryOptions({
    queryKey: ticketQueryKeys.milestoneList(input.environmentId, filters),
    queryFn: async () => {
      if (!input.environmentId) {
        throw new Error("Ticket project data is unavailable.");
      }
      return ensureEnvironmentApi(input.environmentId).ticketMilestones.list(filters);
    },
    enabled: input.environmentId !== null,
    staleTime: 10_000,
    placeholderData: (previous) => previous ?? { milestones: [] },
  });
}

export async function createTicket(input: {
  environmentId: EnvironmentId;
  payload: TicketCreateInput;
  queryClient: QueryClient;
}) {
  const result = await ensureEnvironmentApi(input.environmentId).tickets.create(input.payload);
  await input.queryClient.invalidateQueries({
    queryKey: ticketQueryKeys.lists(input.environmentId),
  });
  return result.ticket;
}

export async function updateTicket(input: {
  environmentId: EnvironmentId;
  payload: TicketUpdateInput;
  queryClient: QueryClient;
}) {
  const result = await ensureEnvironmentApi(input.environmentId).tickets.update(input.payload);
  await input.queryClient.invalidateQueries({
    queryKey: ticketQueryKeys.lists(input.environmentId),
  });
  return result.ticket;
}

export async function archiveTicket(input: {
  environmentId: EnvironmentId;
  payload: TicketArchiveInput;
  queryClient: QueryClient;
}) {
  const result = await ensureEnvironmentApi(input.environmentId).tickets.archive(input.payload);
  await input.queryClient.invalidateQueries({
    queryKey: ticketQueryKeys.lists(input.environmentId),
  });
  return result.ticket;
}

export async function createTicketMilestone(input: {
  environmentId: EnvironmentId;
  payload: TicketMilestoneCreateInput;
  queryClient: QueryClient;
}) {
  const result = await ensureEnvironmentApi(input.environmentId).ticketMilestones.create(
    input.payload,
  );
  await input.queryClient.invalidateQueries({
    queryKey: ticketQueryKeys.milestoneLists(input.environmentId),
  });
  return result.milestone;
}

export async function updateTicketMilestone(input: {
  environmentId: EnvironmentId;
  payload: TicketMilestoneUpdateInput;
  queryClient: QueryClient;
}) {
  const result = await ensureEnvironmentApi(input.environmentId).ticketMilestones.update(
    input.payload,
  );
  await input.queryClient.invalidateQueries({
    queryKey: ticketQueryKeys.milestoneLists(input.environmentId),
  });
  return result.milestone;
}

export async function archiveTicketMilestone(input: {
  environmentId: EnvironmentId;
  payload: TicketMilestoneArchiveInput;
  queryClient: QueryClient;
}) {
  const result = await ensureEnvironmentApi(input.environmentId).ticketMilestones.archive(
    input.payload,
  );
  await input.queryClient.invalidateQueries({
    queryKey: ticketQueryKeys.milestoneLists(input.environmentId),
  });
  return result.milestone;
}

import type { EnvironmentId, Ticket, TicketPriority, TicketStatus } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { ArchiveIcon, GitBranchIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { buildThreadRouteParams } from "../../threadRoutes";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import { ticketPriorityLabel, ticketStatusLabel } from "./TicketCard";

const STATUS_OPTIONS: TicketStatus[] = [
  "triage",
  "backlog",
  "pending",
  "in_progress",
  "review",
  "done",
  "canceled",
];
const PRIORITY_OPTIONS: TicketPriority[] = ["none", "low", "medium", "high", "urgent"];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function TicketDetailPanel(props: {
  ticket: Ticket | null;
  environmentId: EnvironmentId;
  projectName: string;
  onUpdate: (input: Partial<Pick<Ticket, "title" | "description" | "status" | "priority">>) => void;
  onArchive: (ticket: Ticket) => void;
}) {
  const { ticket, environmentId, projectName, onUpdate, onArchive } = props;
  const [draftTitle, setDraftTitle] = useState(ticket?.title ?? "");
  const [draftDescription, setDraftDescription] = useState(ticket?.description ?? "");

  useEffect(() => {
    setDraftTitle(ticket?.title ?? "");
    setDraftDescription(ticket?.description ?? "");
  }, [ticket?.id, ticket?.title, ticket?.description]);

  if (!ticket) {
    return (
      <aside className="flex min-h-0 flex-1 items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        No ticket selected
      </aside>
    );
  }

  return (
    <aside className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-border border-b px-4">
        <div className="min-w-0 text-sm text-muted-foreground">{projectName}</div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2"
          onClick={() => onArchive(ticket)}
        >
          <ArchiveIcon className="size-3.5" />
          Archive
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <Input
          className="h-auto border-0 bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          onBlur={() => {
            const next = draftTitle.trim();
            if (next && next !== ticket.title) {
              onUpdate({ title: next });
            }
          }}
        />
        <Textarea
          className="mt-4 min-h-36 resize-none border-0 bg-transparent px-0 text-base leading-relaxed shadow-none focus-visible:ring-0"
          placeholder="Add a description..."
          value={draftDescription}
          onChange={(event) => setDraftDescription(event.target.value)}
          onBlur={() => {
            if (draftDescription !== ticket.description) {
              onUpdate({ description: draftDescription });
            }
          }}
        />
        <div className="mt-6 grid gap-3 border-border border-t pt-5 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <Select
              value={ticket.status}
              onValueChange={(value) => onUpdate({ status: value as TicketStatus })}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {ticketStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Priority</span>
            <Select
              value={ticket.priority}
              onValueChange={(value) => onUpdate({ priority: value as TicketPriority })}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {PRIORITY_OPTIONS.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {ticketPriorityLabel(priority)}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </label>
        </div>
        <dl className="mt-6 grid gap-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Created</dt>
            <dd>{formatDateTime(ticket.createdAt)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Updated</dt>
            <dd>{formatDateTime(ticket.updatedAt)}</dd>
          </div>
          {ticket.sourceThreadId ? (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Source</dt>
              <dd>
                <Link
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  to="/$environmentId/$threadId"
                  params={buildThreadRouteParams({
                    environmentId,
                    threadId: ticket.sourceThreadId,
                  })}
                >
                  <GitBranchIcon className="size-3.5" />
                  Thread
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </aside>
  );
}

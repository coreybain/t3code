import type { TicketMilestone } from "@t3tools/contracts";
import { BoxIcon } from "lucide-react";

const LANES: TicketMilestone["status"][] = ["planned", "active", "completed"];
const LABELS: Record<TicketMilestone["status"], string> = {
  planned: "Planned",
  active: "Active",
  completed: "Completed",
  paused: "Paused",
};

export function TicketProjectsPlaceholder(props: { milestones: readonly TicketMilestone[] }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center border-border border-b px-4">
        <h1 className="text-sm font-medium text-foreground">Projects</h1>
      </div>
      <div className="grid min-h-0 flex-1 gap-0 overflow-x-auto md:grid-cols-3">
        {LANES.map((lane) => {
          const milestones = props.milestones.filter((milestone) => milestone.status === lane);
          return (
            <section key={lane} className="min-w-72 border-border border-r">
              <div className="flex h-11 items-center justify-between border-border border-b px-3">
                <h2 className="text-sm font-medium">{LABELS[lane]}</h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {milestones.length}
                </span>
              </div>
              <div className="space-y-2 p-2">
                {milestones.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                    <BoxIcon className="size-3.5" />
                    No projects
                  </div>
                ) : (
                  milestones.map((milestone) => (
                    <article
                      key={milestone.id}
                      className="rounded-md border border-border bg-card px-3 py-2.5"
                    >
                      <h3 className="truncate text-sm font-medium text-foreground">
                        {milestone.title}
                      </h3>
                      {milestone.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {milestone.description}
                        </p>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

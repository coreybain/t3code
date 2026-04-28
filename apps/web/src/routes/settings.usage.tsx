import { createFileRoute } from "@tanstack/react-router";

import { UsageSettingsPanel } from "../components/usage/UsageLimitViews";

export const Route = createFileRoute("/settings/usage")({
  component: UsageSettingsPanel,
});

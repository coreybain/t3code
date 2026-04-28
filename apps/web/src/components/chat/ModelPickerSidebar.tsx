import { type ProviderKind, type ServerProvider } from "@t3tools/contracts";
import { memo } from "react";
import { SparklesIcon, StarIcon } from "lucide-react";
import { AVAILABLE_PROVIDER_OPTIONS, PROVIDER_ICON_BY_PROVIDER } from "./providerIconUtils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { getProviderSnapshot } from "../../providerModels";

const SELECTED_BUTTON_CLASS = "bg-background text-foreground shadow-sm";
const SELECTED_INDICATOR_CLASS =
  "pointer-events-none absolute -right-1 top-1/2 z-10 h-5 w-0.5 -translate-y-1/2 rounded-l-full bg-primary";
const BADGE_BASE_CLASS =
  "pointer-events-none absolute -right-0.5 top-0.5 z-10 flex size-3.5 items-center justify-center rounded-full bg-transparent shadow-sm ";
const NEW_BADGE_CLASS = `${BADGE_BASE_CLASS} text-amber-600  dark:text-amber-300 `;

/** Opens toward the rail so the list stays readable (not over the model names). */
const PICKER_TOOLTIP_SIDE = "left" as const;
const PICKER_TOOLTIP_CLASS = "max-w-64 text-balance font-normal leading-snug";

export const ModelPickerSidebar = memo(function ModelPickerSidebar(props: {
  selectedProvider: ProviderKind | "favorites";
  onSelectProvider: (provider: ProviderKind | "favorites") => void;
  showFavorites: boolean;
  providers?: ReadonlyArray<ServerProvider>;
}) {
  const handleProviderClick = (provider: ProviderKind | "favorites") => {
    props.onSelectProvider(provider);
  };

  return (
    <div className="flex flex-col w-12 border-r bg-muted/30  p-1 overflow-y-auto gap-1">
      {props.showFavorites && (
        <div className="pb-1 mb-1 border-b">
          <div className="relative w-full">
            {props.selectedProvider === "favorites" && <div className={SELECTED_INDICATOR_CLASS} />}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    className={cn(
                      "relative isolate flex w-full cursor-pointer aspect-square items-center justify-center rounded transition-colors hover:bg-muted",
                      props.selectedProvider === "favorites" && SELECTED_BUTTON_CLASS,
                    )}
                    onClick={() => handleProviderClick("favorites")}
                    type="button"
                    data-model-picker-provider="favorites"
                    aria-label="Favorites"
                  >
                    <StarIcon className="size-5 fill-current shrink-0" aria-hidden />
                  </button>
                }
              />
              <TooltipPopup
                side={PICKER_TOOLTIP_SIDE}
                align="center"
                className={PICKER_TOOLTIP_CLASS}
              >
                Favorites
              </TooltipPopup>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Provider buttons */}
      {AVAILABLE_PROVIDER_OPTIONS.map((option) => {
        const OptionIcon = PROVIDER_ICON_BY_PROVIDER[option.value];
        const liveProvider = props.providers
          ? getProviderSnapshot(props.providers, option.value)
          : undefined;

        if (liveProvider?.status === "disabled") {
          return null;
        }

        const isSelected = props.selectedProvider === option.value;
        const badge = option.pickerSidebarBadge;

        const providerTooltip = badge === "new" ? `${option.label} — New` : option.label;

        return (
          <div key={option.value} className="relative w-full">
            {isSelected && <div className={SELECTED_INDICATOR_CLASS} />}
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    data-model-picker-provider={option.value}
                    className={cn(
                      "relative isolate flex w-full cursor-pointer aspect-square items-center justify-center rounded transition-colors hover:bg-muted",
                      isSelected && SELECTED_BUTTON_CLASS,
                    )}
                    onClick={() => handleProviderClick(option.value)}
                    type="button"
                    aria-label={badge === "new" ? `${option.label}, new` : option.label}
                  >
                    <OptionIcon className="size-5 shrink-0" aria-hidden />
                    {badge === "new" && (
                      <span className={NEW_BADGE_CLASS} aria-hidden>
                        <SparklesIcon className="size-2" />
                      </span>
                    )}
                  </button>
                }
              />
              <TooltipPopup
                side={PICKER_TOOLTIP_SIDE}
                align="center"
                className={PICKER_TOOLTIP_CLASS}
              >
                {providerTooltip}
              </TooltipPopup>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
});

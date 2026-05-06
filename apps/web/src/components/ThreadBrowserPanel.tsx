import type { BrowserPanelState } from "@t3tools/contracts";
import { ArrowLeftIcon, ArrowRightIcon, BugIcon, GlobeIcon, RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";

const DEFAULT_BROWSER_URL = "https://www.google.com";

function getBrowserBridge() {
  return typeof window === "undefined" ? undefined : window.desktopBridge?.browserPanel;
}

function boundsForElement(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

export default function ThreadBrowserPanel(props: { panelId: string }) {
  const bridge = getBrowserBridge();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<BrowserPanelState>({
    url: "",
    title: "",
    loading: false,
    canGoBack: false,
    canGoForward: false,
  });
  const [urlInput, setUrlInput] = useState(DEFAULT_BROWSER_URL);

  const attach = useCallback(() => {
    if (!bridge || !viewportRef.current) {
      return;
    }
    void bridge.attach({
      panelId: props.panelId,
      bounds: boundsForElement(viewportRef.current),
    });
  }, [bridge, props.panelId]);

  useEffect(() => {
    if (!bridge) {
      return;
    }
    void bridge.create({ panelId: props.panelId }).then(async () => {
      const nextState = await bridge.getState({ panelId: props.panelId });
      setState(nextState);
      if (!nextState.url) {
        await bridge.navigate({ panelId: props.panelId, url: DEFAULT_BROWSER_URL });
      } else {
        setUrlInput(nextState.url);
      }
    });
    const unsubscribe = bridge.onState({ panelId: props.panelId }, (nextState) => {
      setState(nextState);
      if (nextState.url) {
        setUrlInput(nextState.url);
      }
    });
    return () => {
      unsubscribe();
      void bridge.detach({ panelId: props.panelId });
    };
  }, [bridge, props.panelId]);

  useLayoutEffect(() => {
    if (!bridge || !viewportRef.current) {
      return;
    }
    attach();
    const resizeObserver = new ResizeObserver(attach);
    resizeObserver.observe(viewportRef.current);
    window.addEventListener("resize", attach);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", attach);
      void bridge.detach({ panelId: props.panelId });
    };
  }, [attach, bridge, props.panelId]);

  const navigate = useCallback(() => {
    if (!bridge) return;
    void bridge.navigate({ panelId: props.panelId, url: urlInput });
  }, [bridge, props.panelId, urlInput]);

  if (!bridge) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
        <GlobeIcon className="size-6 text-muted-foreground/70" />
        <p>Browser is available in the desktop app.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={!state.canGoBack}
          onClick={() => void bridge.goBack({ panelId: props.panelId })}
          aria-label="Go back"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={!state.canGoForward}
          onClick={() => void bridge.goForward({ panelId: props.panelId })}
          aria-label="Go forward"
        >
          <ArrowRightIcon className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={() => void bridge.reload({ panelId: props.panelId })}
          aria-label="Reload"
        >
          <RefreshCwIcon className="size-4" />
        </Button>
        <form
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          <Input
            size="sm"
            value={urlInput}
            onChange={(event) => setUrlInput(event.currentTarget.value)}
            aria-label="Browser URL"
          />
        </form>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={() => void bridge.openDevTools({ panelId: props.panelId })}
          aria-label="Open browser inspector"
        >
          <BugIcon className="size-4" />
        </Button>
      </div>
      {state.errorMessage ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {state.errorMessage}
        </div>
      ) : null}
      <div ref={viewportRef} className="min-h-0 flex-1 bg-background" />
    </div>
  );
}

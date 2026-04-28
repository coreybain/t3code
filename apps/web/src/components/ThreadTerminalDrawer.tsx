import { FitAddon } from "@xterm/addon-fit";
import {
  Check,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  SquareSplitHorizontal,
  TerminalSquare,
  Trash2,
  XIcon,
} from "lucide-react";
import {
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
  type TerminalEvent,
  type TerminalSessionSnapshot,
  type ThreadId,
} from "@t3tools/contracts";
import { Terminal, type ITheme } from "@xterm/xterm";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { type TerminalContextSelection } from "~/lib/terminalContext";
import { openInPreferredEditor } from "../editorPreferences";
import {
  collectWrappedTerminalLinkLine,
  extractTerminalLinks,
  isTerminalLinkActivation,
  resolvePathLinkTarget,
  resolveWrappedTerminalLinkRange,
  wrappedTerminalLinkRangeIntersectsBufferLine,
} from "../terminal-links";
import {
  isDiffToggleShortcut,
  isTerminalClearShortcut,
  isTerminalCloseShortcut,
  isTerminalNewShortcut,
  isTerminalSplitShortcut,
  isTerminalToggleShortcut,
  terminalDeleteShortcutData,
  terminalNavigationShortcutData,
} from "../keybindings";
import {
  DEFAULT_THREAD_TERMINAL_HEIGHT,
  DEFAULT_THREAD_TERMINAL_ID,
  MAX_TERMINALS_PER_GROUP,
  type ThreadTerminalGroup,
} from "../types";
import { readEnvironmentApi } from "~/environmentApi";
import { readLocalApi } from "~/localApi";
import { selectTerminalEventEntries, useTerminalStateStore } from "../terminalStateStore";

const MIN_DRAWER_HEIGHT = 180;
const MAX_DRAWER_HEIGHT_RATIO = 0.75;
const MULTI_CLICK_SELECTION_ACTION_DELAY_MS = 260;

function maxDrawerHeight(): number {
  if (typeof window === "undefined") return DEFAULT_THREAD_TERMINAL_HEIGHT;
  return Math.max(MIN_DRAWER_HEIGHT, Math.floor(window.innerHeight * MAX_DRAWER_HEIGHT_RATIO));
}

function clampDrawerHeight(height: number): number {
  const safeHeight = Number.isFinite(height) ? height : DEFAULT_THREAD_TERMINAL_HEIGHT;
  const maxHeight = maxDrawerHeight();
  return Math.min(Math.max(Math.round(safeHeight), MIN_DRAWER_HEIGHT), maxHeight);
}

function writeSystemMessage(terminal: Terminal, message: string): void {
  terminal.write(`\r\n[terminal] ${message}\r\n`);
}

function writeTerminalSnapshot(terminal: Terminal, snapshot: TerminalSessionSnapshot): void {
  terminal.write("\u001bc");
  if (snapshot.history.length > 0) {
    terminal.write(snapshot.history);
  }
}

export function selectTerminalEventEntriesAfterSnapshot(
  entries: ReadonlyArray<{ id: number; event: TerminalEvent }>,
  snapshotUpdatedAt: string,
): ReadonlyArray<{ id: number; event: TerminalEvent }> {
  return entries.filter((entry) => entry.event.createdAt > snapshotUpdatedAt);
}

export function selectPendingTerminalEventEntries(
  entries: ReadonlyArray<{ id: number; event: TerminalEvent }>,
  lastAppliedTerminalEventId: number,
): ReadonlyArray<{ id: number; event: TerminalEvent }> {
  return entries.filter((entry) => entry.id > lastAppliedTerminalEventId);
}

function normalizeComputedColor(value: string | null | undefined, fallback: string): string {
  const normalizedValue = value?.trim().toLowerCase();
  if (
    !normalizedValue ||
    normalizedValue === "transparent" ||
    normalizedValue === "rgba(0, 0, 0, 0)" ||
    normalizedValue === "rgba(0 0 0 / 0)"
  ) {
    return fallback;
  }
  return value ?? fallback;
}

function terminalThemeFromApp(mountElement?: HTMLElement | null): ITheme {
  const isDark = document.documentElement.classList.contains("dark");
  const fallbackBackground = isDark ? "rgb(14, 18, 24)" : "rgb(255, 255, 255)";
  const fallbackForeground = isDark ? "rgb(237, 241, 247)" : "rgb(28, 33, 41)";
  const drawerSurface =
    mountElement?.closest(".thread-terminal-drawer") ??
    document.querySelector(".thread-terminal-drawer") ??
    document.body;
  const drawerStyles = getComputedStyle(drawerSurface);
  const bodyStyles = getComputedStyle(document.body);
  const background = normalizeComputedColor(
    drawerStyles.backgroundColor,
    normalizeComputedColor(bodyStyles.backgroundColor, fallbackBackground),
  );
  const foreground = normalizeComputedColor(
    drawerStyles.color,
    normalizeComputedColor(bodyStyles.color, fallbackForeground),
  );

  if (isDark) {
    return {
      background,
      foreground,
      cursor: "rgb(180, 203, 255)",
      selectionBackground: "rgba(180, 203, 255, 0.25)",
      scrollbarSliderBackground: "rgba(255, 255, 255, 0.1)",
      scrollbarSliderHoverBackground: "rgba(255, 255, 255, 0.18)",
      scrollbarSliderActiveBackground: "rgba(255, 255, 255, 0.22)",
      black: "rgb(24, 30, 38)",
      red: "rgb(255, 122, 142)",
      green: "rgb(134, 231, 149)",
      yellow: "rgb(244, 205, 114)",
      blue: "rgb(137, 190, 255)",
      magenta: "rgb(208, 176, 255)",
      cyan: "rgb(124, 232, 237)",
      white: "rgb(210, 218, 230)",
      brightBlack: "rgb(110, 120, 136)",
      brightRed: "rgb(255, 168, 180)",
      brightGreen: "rgb(176, 245, 186)",
      brightYellow: "rgb(255, 224, 149)",
      brightBlue: "rgb(174, 210, 255)",
      brightMagenta: "rgb(229, 203, 255)",
      brightCyan: "rgb(167, 244, 247)",
      brightWhite: "rgb(244, 247, 252)",
    };
  }

  return {
    background,
    foreground,
    cursor: "rgb(38, 56, 78)",
    selectionBackground: "rgba(37, 63, 99, 0.2)",
    scrollbarSliderBackground: "rgba(0, 0, 0, 0.15)",
    scrollbarSliderHoverBackground: "rgba(0, 0, 0, 0.25)",
    scrollbarSliderActiveBackground: "rgba(0, 0, 0, 0.3)",
    black: "rgb(44, 53, 66)",
    red: "rgb(191, 70, 87)",
    green: "rgb(60, 126, 86)",
    yellow: "rgb(146, 112, 35)",
    blue: "rgb(72, 102, 163)",
    magenta: "rgb(132, 86, 149)",
    cyan: "rgb(53, 127, 141)",
    white: "rgb(210, 215, 223)",
    brightBlack: "rgb(112, 123, 140)",
    brightRed: "rgb(212, 95, 112)",
    brightGreen: "rgb(85, 148, 111)",
    brightYellow: "rgb(173, 133, 45)",
    brightBlue: "rgb(91, 124, 194)",
    brightMagenta: "rgb(153, 107, 172)",
    brightCyan: "rgb(70, 149, 164)",
    brightWhite: "rgb(236, 240, 246)",
  };
}

function getTerminalSelectionRect(mountElement: HTMLElement): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const commonAncestor = range.commonAncestorContainer;
  const selectionRoot =
    commonAncestor instanceof Element ? commonAncestor : commonAncestor.parentElement;
  if (!(selectionRoot instanceof Element) || !mountElement.contains(selectionRoot)) {
    return null;
  }

  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  if (rects.length > 0) {
    return rects[rects.length - 1] ?? null;
  }

  const boundingRect = range.getBoundingClientRect();
  return boundingRect.width > 0 || boundingRect.height > 0 ? boundingRect : null;
}

export function resolveTerminalSelectionActionPosition(options: {
  bounds: { left: number; top: number; width: number; height: number };
  selectionRect: { right: number; bottom: number } | null;
  pointer: { x: number; y: number } | null;
  viewport?: { width: number; height: number } | null;
}): { x: number; y: number } {
  const { bounds, selectionRect, pointer, viewport } = options;
  const viewportWidth =
    viewport?.width ??
    (typeof window === "undefined" ? bounds.left + bounds.width + 8 : window.innerWidth);
  const viewportHeight =
    viewport?.height ??
    (typeof window === "undefined" ? bounds.top + bounds.height + 8 : window.innerHeight);
  const drawerLeft = Math.round(bounds.left);
  const drawerTop = Math.round(bounds.top);
  const drawerRight = Math.round(bounds.left + bounds.width);
  const drawerBottom = Math.round(bounds.top + bounds.height);
  const preferredX =
    selectionRect !== null
      ? Math.round(selectionRect.right)
      : pointer === null
        ? Math.round(bounds.left + bounds.width - 140)
        : Math.max(drawerLeft, Math.min(Math.round(pointer.x), drawerRight));
  const preferredY =
    selectionRect !== null
      ? Math.round(selectionRect.bottom + 4)
      : pointer === null
        ? Math.round(bounds.top + 12)
        : Math.max(drawerTop, Math.min(Math.round(pointer.y), drawerBottom));
  return {
    x: Math.max(8, Math.min(preferredX, Math.max(viewportWidth - 8, 8))),
    y: Math.max(8, Math.min(preferredY, Math.max(viewportHeight - 8, 8))),
  };
}

export function terminalSelectionActionDelayForClickCount(clickCount: number): number {
  return clickCount >= 2 ? MULTI_CLICK_SELECTION_ACTION_DELAY_MS : 0;
}

export function shouldHandleTerminalSelectionMouseUp(
  selectionGestureActive: boolean,
  button: number,
): boolean {
  return selectionGestureActive && button === 0;
}

interface TerminalViewportProps {
  threadRef: ScopedThreadRef;
  threadId: ThreadId;
  terminalId: string;
  terminalLabel: string;
  cwd: string;
  worktreePath?: string | null;
  runtimeEnv?: Record<string, string>;
  onSessionExited: () => void;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
  focusRequestId: number;
  autoFocus: boolean;
  resizeEpoch: number;
  drawerHeight: number;
  keybindings: ResolvedKeybindingsConfig;
}

export function TerminalViewport({
  threadRef,
  threadId,
  terminalId,
  terminalLabel,
  cwd,
  worktreePath,
  runtimeEnv,
  onSessionExited,
  onAddTerminalContext,
  focusRequestId,
  autoFocus,
  resizeEpoch,
  drawerHeight,
  keybindings,
}: TerminalViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const environmentId = threadRef.environmentId;
  const hasHandledExitRef = useRef(false);
  const selectionPointerRef = useRef<{ x: number; y: number } | null>(null);
  const selectionGestureActiveRef = useRef(false);
  const selectionActionRequestIdRef = useRef(0);
  const selectionActionOpenRef = useRef(false);
  const selectionActionTimerRef = useRef<number | null>(null);
  const keybindingsRef = useRef(keybindings);
  const lastAppliedTerminalEventIdRef = useRef(0);
  const terminalHydratedRef = useRef(false);
  const handleSessionExited = useEffectEvent(() => {
    onSessionExited();
  });
  const handleAddTerminalContext = useEffectEvent((selection: TerminalContextSelection) => {
    onAddTerminalContext(selection);
  });
  const readTerminalLabel = useEffectEvent(() => terminalLabel);

  useEffect(() => {
    keybindingsRef.current = keybindings;
  }, [keybindings]);

  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    let disposed = false;
    const api = readEnvironmentApi(environmentId);
    const localApi = readLocalApi();
    if (!api || !localApi) return;

    const fitAddon = new FitAddon();
    const terminal = new Terminal({
      cursorBlink: true,
      lineHeight: 1.2,
      fontSize: 12,
      scrollback: 5_000,
      fontFamily: '"SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
      theme: terminalThemeFromApp(mount),
    });
    terminal.loadAddon(fitAddon);
    terminal.open(mount);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const clearSelectionAction = () => {
      selectionActionRequestIdRef.current += 1;
      if (selectionActionTimerRef.current !== null) {
        window.clearTimeout(selectionActionTimerRef.current);
        selectionActionTimerRef.current = null;
      }
    };

    const readSelectionAction = (): {
      position: { x: number; y: number };
      selection: TerminalContextSelection;
    } | null => {
      const activeTerminal = terminalRef.current;
      const mountElement = containerRef.current;
      if (!activeTerminal || !mountElement || !activeTerminal.hasSelection()) {
        return null;
      }
      const selectionText = activeTerminal.getSelection();
      const selectionPosition = activeTerminal.getSelectionPosition();
      const normalizedText = selectionText.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
      if (!selectionPosition || normalizedText.length === 0) {
        return null;
      }
      const lineStart = selectionPosition.start.y + 1;
      const lineCount = normalizedText.split("\n").length;
      const lineEnd = Math.max(lineStart, lineStart + lineCount - 1);
      const bounds = mountElement.getBoundingClientRect();
      const selectionRect = getTerminalSelectionRect(mountElement);
      const position = resolveTerminalSelectionActionPosition({
        bounds,
        selectionRect:
          selectionRect === null
            ? null
            : { right: selectionRect.right, bottom: selectionRect.bottom },
        pointer: selectionPointerRef.current,
      });
      return {
        position,
        selection: {
          terminalId,
          terminalLabel: readTerminalLabel(),
          lineStart,
          lineEnd,
          text: normalizedText,
        },
      };
    };

    const showSelectionAction = async () => {
      if (selectionActionOpenRef.current) {
        return;
      }
      const nextAction = readSelectionAction();
      if (!nextAction) {
        clearSelectionAction();
        return;
      }
      const requestId = ++selectionActionRequestIdRef.current;
      selectionActionOpenRef.current = true;
      try {
        const clicked = await localApi.contextMenu.show(
          [{ id: "add-to-chat", label: "Add to chat" }],
          nextAction.position,
        );
        if (requestId !== selectionActionRequestIdRef.current || clicked !== "add-to-chat") {
          return;
        }
        handleAddTerminalContext(nextAction.selection);
        terminalRef.current?.clearSelection();
        terminalRef.current?.focus();
      } finally {
        selectionActionOpenRef.current = false;
      }
    };

    const sendTerminalInput = async (data: string, fallbackError: string) => {
      const activeTerminal = terminalRef.current;
      if (!activeTerminal) return;
      try {
        await api.terminal.write({ threadId, terminalId, data });
      } catch (error) {
        writeSystemMessage(activeTerminal, error instanceof Error ? error.message : fallbackError);
      }
    };

    terminal.attachCustomKeyEventHandler((event) => {
      const currentKeybindings = keybindingsRef.current;
      const options = { context: { terminalFocus: true, terminalOpen: true } };
      if (
        isTerminalToggleShortcut(event, currentKeybindings, options) ||
        isTerminalSplitShortcut(event, currentKeybindings, options) ||
        isTerminalNewShortcut(event, currentKeybindings, options) ||
        isTerminalCloseShortcut(event, currentKeybindings, options) ||
        isDiffToggleShortcut(event, currentKeybindings, options)
      ) {
        return false;
      }

      const navigationData = terminalNavigationShortcutData(event);
      if (navigationData !== null) {
        event.preventDefault();
        event.stopPropagation();
        void sendTerminalInput(navigationData, "Failed to move cursor");
        return false;
      }

      const deleteData = terminalDeleteShortcutData(event);
      if (deleteData !== null) {
        event.preventDefault();
        event.stopPropagation();
        void sendTerminalInput(deleteData, "Failed to delete terminal input");
        return false;
      }

      if (!isTerminalClearShortcut(event)) return true;
      event.preventDefault();
      event.stopPropagation();
      void sendTerminalInput("\u000c", "Failed to clear terminal");
      return false;
    });

    const terminalLinksDisposable = terminal.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const activeTerminal = terminalRef.current;
        if (!activeTerminal) {
          callback(undefined);
          return;
        }

        const wrappedLine = collectWrappedTerminalLinkLine(bufferLineNumber, (bufferLineIndex) =>
          activeTerminal.buffer.active.getLine(bufferLineIndex),
        );
        if (!wrappedLine) {
          callback(undefined);
          return;
        }

        const links = extractTerminalLinks(wrappedLine.text)
          .map((match) => ({
            match,
            range: resolveWrappedTerminalLinkRange(wrappedLine, match),
          }))
          .filter(({ range }) =>
            wrappedTerminalLinkRangeIntersectsBufferLine(range, bufferLineNumber),
          );
        if (links.length === 0) {
          callback(undefined);
          return;
        }

        callback(
          links.map(({ match, range }) => ({
            text: match.text,
            range,
            activate: (event: MouseEvent) => {
              if (!isTerminalLinkActivation(event)) return;

              const latestTerminal = terminalRef.current;
              if (!latestTerminal) return;

              if (match.kind === "url") {
                void localApi.shell.openExternal(match.text).catch((error: unknown) => {
                  writeSystemMessage(
                    latestTerminal,
                    error instanceof Error ? error.message : "Unable to open link",
                  );
                });
                return;
              }

              const target = resolvePathLinkTarget(match.text, cwd);
              void openInPreferredEditor(localApi, target).catch((error) => {
                writeSystemMessage(
                  latestTerminal,
                  error instanceof Error ? error.message : "Unable to open path",
                );
              });
            },
          })),
        );
      },
    });

    const inputDisposable = terminal.onData((data) => {
      void api.terminal
        .write({ threadId, terminalId, data })
        .catch((err) =>
          writeSystemMessage(
            terminal,
            err instanceof Error ? err.message : "Terminal write failed",
          ),
        );
    });

    const selectionDisposable = terminal.onSelectionChange(() => {
      if (terminalRef.current?.hasSelection()) {
        return;
      }
      clearSelectionAction();
    });

    const handleMouseUp = (event: MouseEvent) => {
      const shouldHandle = shouldHandleTerminalSelectionMouseUp(
        selectionGestureActiveRef.current,
        event.button,
      );
      selectionGestureActiveRef.current = false;
      if (!shouldHandle) {
        return;
      }
      selectionPointerRef.current = { x: event.clientX, y: event.clientY };
      const delay = terminalSelectionActionDelayForClickCount(event.detail);
      selectionActionTimerRef.current = window.setTimeout(() => {
        selectionActionTimerRef.current = null;
        window.requestAnimationFrame(() => {
          void showSelectionAction();
        });
      }, delay);
    };
    const handlePointerDown = (event: PointerEvent) => {
      clearSelectionAction();
      selectionGestureActiveRef.current = event.button === 0;
    };
    window.addEventListener("mouseup", handleMouseUp);
    mount.addEventListener("pointerdown", handlePointerDown);

    const themeObserver = new MutationObserver(() => {
      const activeTerminal = terminalRef.current;
      if (!activeTerminal) return;
      activeTerminal.options.theme = terminalThemeFromApp(containerRef.current);
      activeTerminal.refresh(0, activeTerminal.rows - 1);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    const applyTerminalEvent = (event: TerminalEvent) => {
      const activeTerminal = terminalRef.current;
      if (!activeTerminal) {
        return;
      }

      if (event.type === "activity") {
        return;
      }

      if (event.type === "output") {
        activeTerminal.write(event.data);
        clearSelectionAction();
        return;
      }

      if (event.type === "started" || event.type === "restarted") {
        hasHandledExitRef.current = false;
        clearSelectionAction();
        writeTerminalSnapshot(activeTerminal, event.snapshot);
        return;
      }

      if (event.type === "cleared") {
        clearSelectionAction();
        activeTerminal.clear();
        activeTerminal.write("\u001bc");
        return;
      }

      if (event.type === "error") {
        writeSystemMessage(activeTerminal, event.message);
        return;
      }

      const details = [
        typeof event.exitCode === "number" ? `code ${event.exitCode}` : null,
        typeof event.exitSignal === "number" ? `signal ${event.exitSignal}` : null,
      ]
        .filter((value): value is string => value !== null)
        .join(", ");
      writeSystemMessage(
        activeTerminal,
        details.length > 0 ? `Process exited (${details})` : "Process exited",
      );
      if (hasHandledExitRef.current) {
        return;
      }
      hasHandledExitRef.current = true;
      window.setTimeout(() => {
        if (!hasHandledExitRef.current) {
          return;
        }
        handleSessionExited();
      }, 0);
    };
    const applyPendingTerminalEvents = (
      terminalEventEntries: ReadonlyArray<{ id: number; event: TerminalEvent }>,
    ) => {
      const pendingEntries = selectPendingTerminalEventEntries(
        terminalEventEntries,
        lastAppliedTerminalEventIdRef.current,
      );
      if (pendingEntries.length === 0) {
        return;
      }
      for (const entry of pendingEntries) {
        applyTerminalEvent(entry.event);
      }
      lastAppliedTerminalEventIdRef.current =
        pendingEntries.at(-1)?.id ?? lastAppliedTerminalEventIdRef.current;
    };

    const unsubscribeTerminalEvents = useTerminalStateStore.subscribe((state, previousState) => {
      if (!terminalHydratedRef.current) {
        return;
      }

      const previousLastEntryId =
        selectTerminalEventEntries(
          previousState.terminalEventEntriesByKey,
          threadRef,
          terminalId,
        ).at(-1)?.id ?? 0;
      const nextEntries = selectTerminalEventEntries(
        state.terminalEventEntriesByKey,
        threadRef,
        terminalId,
      );
      const nextLastEntryId = nextEntries.at(-1)?.id ?? 0;
      if (nextLastEntryId === previousLastEntryId) {
        return;
      }

      applyPendingTerminalEvents(nextEntries);
    });

    const openTerminal = async () => {
      try {
        const activeTerminal = terminalRef.current;
        const activeFitAddon = fitAddonRef.current;
        if (!activeTerminal || !activeFitAddon) return;
        activeFitAddon.fit();
        const snapshot = await api.terminal.open({
          threadId,
          terminalId,
          cwd,
          ...(worktreePath !== undefined ? { worktreePath } : {}),
          cols: activeTerminal.cols,
          rows: activeTerminal.rows,
          ...(runtimeEnv ? { env: runtimeEnv } : {}),
        });
        if (disposed) return;
        writeTerminalSnapshot(activeTerminal, snapshot);
        const bufferedEntries = selectTerminalEventEntries(
          useTerminalStateStore.getState().terminalEventEntriesByKey,
          threadRef,
          terminalId,
        );
        const replayEntries = selectTerminalEventEntriesAfterSnapshot(
          bufferedEntries,
          snapshot.updatedAt,
        );
        for (const entry of replayEntries) {
          applyTerminalEvent(entry.event);
        }
        lastAppliedTerminalEventIdRef.current = bufferedEntries.at(-1)?.id ?? 0;
        terminalHydratedRef.current = true;
        if (autoFocus) {
          window.requestAnimationFrame(() => {
            activeTerminal.focus();
          });
        }
      } catch (err) {
        if (disposed) return;
        writeSystemMessage(
          terminal,
          err instanceof Error ? err.message : "Failed to open terminal",
        );
      }
    };

    const fitTimer = window.setTimeout(() => {
      const activeTerminal = terminalRef.current;
      const activeFitAddon = fitAddonRef.current;
      if (!activeTerminal || !activeFitAddon) return;
      const wasAtBottom =
        activeTerminal.buffer.active.viewportY >= activeTerminal.buffer.active.baseY;
      activeFitAddon.fit();
      if (wasAtBottom) {
        activeTerminal.scrollToBottom();
      }
      void api.terminal
        .resize({
          threadId,
          terminalId,
          cols: activeTerminal.cols,
          rows: activeTerminal.rows,
        })
        .catch(() => undefined);
    }, 30);
    void openTerminal();

    return () => {
      disposed = true;
      terminalHydratedRef.current = false;
      lastAppliedTerminalEventIdRef.current = 0;
      unsubscribeTerminalEvents();
      window.clearTimeout(fitTimer);
      inputDisposable.dispose();
      selectionDisposable.dispose();
      terminalLinksDisposable.dispose();
      if (selectionActionTimerRef.current !== null) {
        window.clearTimeout(selectionActionTimerRef.current);
      }
      window.removeEventListener("mouseup", handleMouseUp);
      mount.removeEventListener("pointerdown", handlePointerDown);
      themeObserver.disconnect();
      terminalRef.current = null;
      fitAddonRef.current = null;
      terminal.dispose();
    };
    // autoFocus is intentionally omitted;
    // it is only read at mount time and must not trigger terminal teardown/recreation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, environmentId, runtimeEnv, terminalId, threadId]);

  useEffect(() => {
    if (!autoFocus) return;
    const terminal = terminalRef.current;
    if (!terminal) return;
    const frame = window.requestAnimationFrame(() => {
      terminal.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [autoFocus, focusRequestId]);

  useEffect(() => {
    const api = readEnvironmentApi(environmentId);
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!api || !terminal || !fitAddon) return;
    const wasAtBottom = terminal.buffer.active.viewportY >= terminal.buffer.active.baseY;
    const frame = window.requestAnimationFrame(() => {
      fitAddon.fit();
      if (wasAtBottom) {
        terminal.scrollToBottom();
      }
      void api.terminal
        .resize({
          threadId,
          terminalId,
          cols: terminal.cols,
          rows: terminal.rows,
        })
        .catch(() => undefined);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [drawerHeight, environmentId, resizeEpoch, terminalId, threadId]);
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-[4px] bg-background"
    />
  );
}

interface ThreadTerminalDrawerProps {
  threadRef: ScopedThreadRef;
  threadId: ThreadId;
  projectName: string;
  cwd: string;
  worktreePath?: string | null;
  runtimeEnv?: Record<string, string>;
  visible?: boolean;
  height: number;
  terminalPanelOpen: boolean;
  terminalIds: string[];
  terminalLabelsById: Record<string, string>;
  runningTerminalIds: string[];
  externalTerminalSections: TerminalPanelThreadSection[];
  activeTerminalId: string;
  terminalGroups: ThreadTerminalGroup[];
  activeTerminalGroupId: string;
  focusRequestId: number;
  onSplitTerminal: () => void;
  onNewTerminal: () => void;
  splitShortcutLabel?: string | undefined;
  newShortcutLabel?: string | undefined;
  closeShortcutLabel?: string | undefined;
  onActiveTerminalChange: (terminalId: string) => void;
  onTerminalRename: (terminalId: string, label: string) => void;
  onTerminalPanelOpenChange: (open: boolean) => void;
  onExternalTerminalClose: (threadRef: ScopedThreadRef, terminalId: string) => void;
  onExternalTerminalReturn: (
    threadKey: string,
    threadRef: ScopedThreadRef,
    terminalId: string,
  ) => void;
  onExternalTerminalRename: (
    threadKey: string,
    threadRef: ScopedThreadRef,
    terminalId: string,
  ) => void;
  onExternalTerminalLabelChange: (
    threadRef: ScopedThreadRef,
    terminalId: string,
    label: string,
  ) => void;
  onCloseTerminal: (terminalId: string) => void;
  onHeightChange: (height: number) => void;
  onLiveHeightChange?: ((height: number) => void) | undefined;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
  terminalRenameRequest?: { terminalId: string; requestId: number } | undefined;
  keybindings: ResolvedKeybindingsConfig;
}

export interface TerminalPanelThreadSection {
  threadKey: string;
  threadRef: ScopedThreadRef;
  title: string;
  projectName: string;
  terminalIds: string[];
  terminalGroups: ThreadTerminalGroup[];
  terminalLabelsById: Record<string, string>;
  runningTerminalIds: string[];
  activeTerminalId: string;
}

interface TerminalActionButtonProps {
  label: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}

function TerminalActionButton({ label, className, onClick, children }: TerminalActionButtonProps) {
  const [suppressTooltip, setSuppressTooltip] = useState(false);
  const handleClick = useCallback(() => {
    setSuppressTooltip(true);
    onClick();
  }, [onClick]);

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        render={
          <button
            type="button"
            className={className}
            onClick={handleClick}
            onPointerLeave={() => setSuppressTooltip(false)}
            aria-label={label}
          />
        }
      >
        {children}
      </PopoverTrigger>
      {!suppressTooltip && (
        <PopoverPopup
          tooltipStyle
          side="bottom"
          sideOffset={6}
          align="center"
          className="pointer-events-none select-none"
        >
          {label}
        </PopoverPopup>
      )}
    </Popover>
  );
}

export default function ThreadTerminalDrawer({
  threadRef,
  threadId,
  projectName,
  cwd,
  worktreePath,
  runtimeEnv,
  visible = true,
  height,
  terminalPanelOpen,
  terminalIds,
  terminalLabelsById,
  runningTerminalIds,
  externalTerminalSections,
  activeTerminalId,
  terminalGroups,
  activeTerminalGroupId,
  focusRequestId,
  onSplitTerminal,
  onNewTerminal,
  splitShortcutLabel,
  newShortcutLabel,
  closeShortcutLabel,
  onActiveTerminalChange,
  onTerminalRename,
  onTerminalPanelOpenChange,
  onExternalTerminalClose,
  onExternalTerminalReturn,
  onExternalTerminalRename,
  onExternalTerminalLabelChange,
  onCloseTerminal,
  onHeightChange,
  onLiveHeightChange,
  onAddTerminalContext,
  terminalRenameRequest,
  keybindings,
}: ThreadTerminalDrawerProps) {
  const [drawerHeight, setDrawerHeight] = useState(() => clampDrawerHeight(height));
  const [resizeEpoch, setResizeEpoch] = useState(0);
  const [renamingTerminalId, setRenamingTerminalId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renamingExternalTerminal, setRenamingExternalTerminal] = useState<{
    threadKey: string;
    threadRef: ScopedThreadRef;
    terminalId: string;
  } | null>(null);
  const [externalRenameDraft, setExternalRenameDraft] = useState("");
  const drawerHeightRef = useRef(drawerHeight);
  const lastSyncedHeightRef = useRef(clampDrawerHeight(height));
  const onHeightChangeRef = useRef(onHeightChange);
  const onLiveHeightChangeRef = useRef(onLiveHeightChange);
  const lastHandledRenameRequestIdRef = useRef(0);
  const terminalNameClickTimeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const resizeStateRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  const didResizeDuringDragRef = useRef(false);

  const normalizedTerminalIds = useMemo(() => {
    const cleaned = [...new Set(terminalIds.map((id) => id.trim()).filter((id) => id.length > 0))];
    return cleaned.length > 0 ? cleaned : [DEFAULT_THREAD_TERMINAL_ID];
  }, [terminalIds]);

  const resolvedActiveTerminalId = normalizedTerminalIds.includes(activeTerminalId)
    ? activeTerminalId
    : (normalizedTerminalIds[0] ?? DEFAULT_THREAD_TERMINAL_ID);

  const resolvedTerminalGroups = useMemo(() => {
    const validTerminalIdSet = new Set(normalizedTerminalIds);
    const assignedTerminalIds = new Set<string>();
    const usedGroupIds = new Set<string>();
    const nextGroups: ThreadTerminalGroup[] = [];

    const assignUniqueGroupId = (groupId: string): string => {
      if (!usedGroupIds.has(groupId)) {
        usedGroupIds.add(groupId);
        return groupId;
      }
      let suffix = 2;
      while (usedGroupIds.has(`${groupId}-${suffix}`)) {
        suffix += 1;
      }
      const uniqueGroupId = `${groupId}-${suffix}`;
      usedGroupIds.add(uniqueGroupId);
      return uniqueGroupId;
    };

    for (const terminalGroup of terminalGroups) {
      const nextTerminalIds = [
        ...new Set(terminalGroup.terminalIds.map((id) => id.trim()).filter((id) => id.length > 0)),
      ].filter((terminalId) => {
        if (!validTerminalIdSet.has(terminalId)) return false;
        if (assignedTerminalIds.has(terminalId)) return false;
        return true;
      });
      if (nextTerminalIds.length === 0) continue;

      for (const terminalId of nextTerminalIds) {
        assignedTerminalIds.add(terminalId);
      }

      const baseGroupId =
        terminalGroup.id.trim().length > 0
          ? terminalGroup.id.trim()
          : `group-${nextTerminalIds[0] ?? DEFAULT_THREAD_TERMINAL_ID}`;
      nextGroups.push({
        id: assignUniqueGroupId(baseGroupId),
        terminalIds: nextTerminalIds,
      });
    }

    for (const terminalId of normalizedTerminalIds) {
      if (assignedTerminalIds.has(terminalId)) continue;
      nextGroups.push({
        id: assignUniqueGroupId(`group-${terminalId}`),
        terminalIds: [terminalId],
      });
    }

    if (nextGroups.length > 0) {
      return nextGroups;
    }

    return [
      {
        id: `group-${resolvedActiveTerminalId}`,
        terminalIds: [resolvedActiveTerminalId],
      },
    ];
  }, [normalizedTerminalIds, resolvedActiveTerminalId, terminalGroups]);

  const resolvedActiveGroupIndex = useMemo(() => {
    const indexById = resolvedTerminalGroups.findIndex(
      (terminalGroup) => terminalGroup.id === activeTerminalGroupId,
    );
    if (indexById >= 0) return indexById;
    const indexByTerminal = resolvedTerminalGroups.findIndex((terminalGroup) =>
      terminalGroup.terminalIds.includes(resolvedActiveTerminalId),
    );
    return indexByTerminal >= 0 ? indexByTerminal : 0;
  }, [activeTerminalGroupId, resolvedActiveTerminalId, resolvedTerminalGroups]);

  const visibleTerminalIds = resolvedTerminalGroups[resolvedActiveGroupIndex]?.terminalIds ?? [
    resolvedActiveTerminalId,
  ];
  const terminalPanelTerminalCount =
    normalizedTerminalIds.length +
    externalTerminalSections.reduce((count, section) => count + section.terminalIds.length, 0);
  const isSplitView = visibleTerminalIds.length > 1;
  const hasReachedSplitLimit = visibleTerminalIds.length >= MAX_TERMINALS_PER_GROUP;
  const terminalLabelById = useMemo(
    () =>
      new Map(
        normalizedTerminalIds.map((terminalId, index) => [
          terminalId,
          terminalLabelsById[terminalId]?.trim() ||
            (terminalId === DEFAULT_THREAD_TERMINAL_ID
              ? `Terminal ${index + 1}`
              : projectName.trim() || `Terminal ${index + 1}`),
        ]),
      ),
    [normalizedTerminalIds, projectName, terminalLabelsById],
  );
  const runningTerminalIdSet = useMemo(() => new Set(runningTerminalIds), [runningTerminalIds]);
  const resolveTerminalLabel = useCallback(
    (options: {
      terminalId: string;
      index: number;
      projectName: string;
      labelsById: Record<string, string>;
    }) =>
      options.labelsById[options.terminalId]?.trim() ||
      (options.terminalId === DEFAULT_THREAD_TERMINAL_ID
        ? `Terminal ${options.index + 1}`
        : options.projectName.trim() || `Terminal ${options.index + 1}`),
    [],
  );
  const splitTerminalActionLabel = hasReachedSplitLimit
    ? `Split Terminal (max ${MAX_TERMINALS_PER_GROUP} per group)`
    : splitShortcutLabel
      ? `Split Terminal (${splitShortcutLabel})`
      : "Split Terminal";
  const newTerminalActionLabel = newShortcutLabel
    ? `New Terminal (${newShortcutLabel})`
    : "New Terminal";
  const closeTerminalActionLabel = closeShortcutLabel
    ? `Close Terminal (${closeShortcutLabel})`
    : "Close Terminal";
  const onSplitTerminalAction = useCallback(() => {
    if (hasReachedSplitLimit) return;
    onSplitTerminal();
  }, [hasReachedSplitLimit, onSplitTerminal]);
  const onNewTerminalAction = useCallback(() => {
    onNewTerminal();
  }, [onNewTerminal]);
  const startRenamingTerminal = useCallback(
    (terminalId: string) => {
      setRenamingTerminalId(terminalId);
      setRenameDraft(terminalLabelById.get(terminalId) ?? "");
    },
    [terminalLabelById],
  );
  const cancelTerminalRename = useCallback(() => {
    setRenamingTerminalId(null);
    setRenameDraft("");
  }, []);
  const startRenamingExternalTerminal = useCallback(
    (section: TerminalPanelThreadSection, terminalId: string, label: string) => {
      setRenamingExternalTerminal({
        threadKey: section.threadKey,
        threadRef: section.threadRef,
        terminalId,
      });
      setExternalRenameDraft(label);
    },
    [],
  );
  const cancelExternalTerminalRename = useCallback(() => {
    setRenamingExternalTerminal(null);
    setExternalRenameDraft("");
  }, []);
  const submitTerminalRename = useCallback(
    (terminalId: string) => {
      onTerminalRename(terminalId, renameDraft);
      setRenamingTerminalId(null);
      setRenameDraft("");
    },
    [onTerminalRename, renameDraft],
  );
  const submitExternalTerminalRename = useCallback(() => {
    if (!renamingExternalTerminal) return;
    onExternalTerminalLabelChange(
      renamingExternalTerminal.threadRef,
      renamingExternalTerminal.terminalId,
      externalRenameDraft,
    );
    setRenamingExternalTerminal(null);
    setExternalRenameDraft("");
  }, [externalRenameDraft, onExternalTerminalLabelChange, renamingExternalTerminal]);
  const handleRenameDraftChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setRenameDraft(event.target.value);
  }, []);
  const handleExternalRenameDraftChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setExternalRenameDraft(event.target.value);
  }, []);
  const handleRenameInputKeyDown = useCallback(
    (terminalId: string, event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitTerminalRename(terminalId);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelTerminalRename();
      }
    },
    [cancelTerminalRename, submitTerminalRename],
  );
  const handleExternalRenameInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitExternalTerminalRename();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        cancelExternalTerminalRename();
      }
    },
    [cancelExternalTerminalRename, submitExternalTerminalRename],
  );
  const clearTerminalNameClickTimeout = useCallback((clickKey: string) => {
    const timeout = terminalNameClickTimeoutsRef.current.get(clickKey);
    if (!timeout) return;
    clearTimeout(timeout);
    terminalNameClickTimeoutsRef.current.delete(clickKey);
  }, []);
  const handleTerminalNameClick = useCallback(
    (
      event: ReactMouseEvent<HTMLSpanElement>,
      clickKey: string,
      onSingleClick: () => void,
      onDoubleClick: () => void,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.detail >= 2) {
        clearTerminalNameClickTimeout(clickKey);
        onDoubleClick();
        return;
      }

      clearTerminalNameClickTimeout(clickKey);
      const timeout = setTimeout(() => {
        terminalNameClickTimeoutsRef.current.delete(clickKey);
        onSingleClick();
      }, 220);
      terminalNameClickTimeoutsRef.current.set(clickKey, timeout);
    },
    [clearTerminalNameClickTimeout],
  );

  useEffect(() => {
    if (!visible || !terminalRenameRequest) return;
    if (lastHandledRenameRequestIdRef.current === terminalRenameRequest.requestId) return;
    if (!normalizedTerminalIds.includes(terminalRenameRequest.terminalId)) return;
    lastHandledRenameRequestIdRef.current = terminalRenameRequest.requestId;
    startRenamingTerminal(terminalRenameRequest.terminalId);
  }, [normalizedTerminalIds, startRenamingTerminal, terminalRenameRequest, visible]);

  useEffect(() => {
    onHeightChangeRef.current = onHeightChange;
  }, [onHeightChange]);

  useEffect(() => {
    onLiveHeightChangeRef.current = onLiveHeightChange;
  }, [onLiveHeightChange]);

  useEffect(
    () => () => {
      for (const timeout of terminalNameClickTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
      terminalNameClickTimeoutsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    drawerHeightRef.current = drawerHeight;
  }, [drawerHeight]);

  const syncHeight = useCallback((nextHeight: number) => {
    const clampedHeight = clampDrawerHeight(nextHeight);
    if (lastSyncedHeightRef.current === clampedHeight) return;
    lastSyncedHeightRef.current = clampedHeight;
    onHeightChangeRef.current(clampedHeight);
  }, []);

  useEffect(() => {
    const clampedHeight = clampDrawerHeight(height);
    setDrawerHeight(clampedHeight);
    drawerHeightRef.current = clampedHeight;
    lastSyncedHeightRef.current = clampedHeight;
    onLiveHeightChangeRef.current?.(clampedHeight);
  }, [height, threadId]);

  const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    didResizeDuringDragRef.current = false;
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: drawerHeightRef.current,
    };
  }, []);

  const handleResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) return;
    event.preventDefault();
    const clampedHeight = clampDrawerHeight(
      resizeState.startHeight + (resizeState.startY - event.clientY),
    );
    if (clampedHeight === drawerHeightRef.current) {
      return;
    }
    didResizeDuringDragRef.current = true;
    drawerHeightRef.current = clampedHeight;
    setDrawerHeight(clampedHeight);
    onLiveHeightChangeRef.current?.(clampedHeight);
  }, []);

  const handleResizePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== event.pointerId) return;
      resizeStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (!didResizeDuringDragRef.current) {
        return;
      }
      syncHeight(drawerHeightRef.current);
      setResizeEpoch((value) => value + 1);
    },
    [syncHeight],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    const onWindowResize = () => {
      const clampedHeight = clampDrawerHeight(drawerHeightRef.current);
      const changed = clampedHeight !== drawerHeightRef.current;
      if (changed) {
        setDrawerHeight(clampedHeight);
        drawerHeightRef.current = clampedHeight;
        onLiveHeightChangeRef.current?.(clampedHeight);
      }
      if (!resizeStateRef.current) {
        syncHeight(clampedHeight);
      }
      setResizeEpoch((value) => value + 1);
    };
    window.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("resize", onWindowResize);
    };
  }, [syncHeight, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setResizeEpoch((value) => value + 1);
  }, [visible]);

  useEffect(() => {
    if (renamingTerminalId !== null && !normalizedTerminalIds.includes(renamingTerminalId)) {
      cancelTerminalRename();
    }
  }, [cancelTerminalRename, normalizedTerminalIds, renamingTerminalId]);

  useEffect(() => {
    return () => {
      syncHeight(drawerHeightRef.current);
    };
  }, [syncHeight]);

  return (
    <aside
      className="thread-terminal-drawer relative flex min-w-0 shrink-0 flex-col overflow-hidden border-t border-border/80 bg-background"
      style={{ height: `${drawerHeight}px` }}
    >
      <div
        className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize"
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerEnd}
        onPointerCancel={handleResizePointerEnd}
      />

      <div className="pointer-events-none absolute right-2 top-2 z-40">
        <div className="pointer-events-auto inline-flex items-center overflow-hidden rounded-md border border-border/80 bg-background/70 backdrop-blur">
          <TerminalActionButton
            className={`p-1 text-foreground/90 transition-colors ${
              hasReachedSplitLimit
                ? "cursor-not-allowed opacity-45 hover:bg-transparent"
                : "hover:bg-accent"
            }`}
            onClick={onSplitTerminalAction}
            label={splitTerminalActionLabel}
          >
            <SquareSplitHorizontal className="size-3.25" />
          </TerminalActionButton>
          <div className="h-4 w-px bg-border/80" />
          <TerminalActionButton
            className="p-1 text-foreground/90 transition-colors hover:bg-accent"
            onClick={onNewTerminalAction}
            label={newTerminalActionLabel}
          >
            <Plus className="size-3.25" />
          </TerminalActionButton>
          <div className="h-4 w-px bg-border/80" />
          <TerminalActionButton
            className="p-1 text-foreground/90 transition-colors hover:bg-accent"
            onClick={() => onCloseTerminal(resolvedActiveTerminalId)}
            label={closeTerminalActionLabel}
          >
            <Trash2 className="size-3.25" />
          </TerminalActionButton>
          <div className="h-4 w-px bg-border/80" />
          <TerminalActionButton
            className={`p-1 text-foreground/90 transition-colors hover:bg-accent ${
              terminalPanelOpen ? "bg-accent" : ""
            }`}
            onClick={() => onTerminalPanelOpenChange(!terminalPanelOpen)}
            label={terminalPanelOpen ? "Hide terminal list" : "Show terminal list"}
          >
            {terminalPanelOpen ? (
              <PanelRightClose className="size-3.25" />
            ) : (
              <PanelRightOpen className="size-3.25" />
            )}
          </TerminalActionButton>
        </div>
      </div>

      <div className="min-h-0 w-full flex-1">
        <div className="flex h-full min-h-0">
          <div className="min-w-0 flex-1">
            {isSplitView ? (
              <div
                className="grid h-full w-full min-w-0 gap-0 overflow-hidden"
                style={{
                  gridTemplateColumns: `repeat(${visibleTerminalIds.length}, minmax(0, 1fr))`,
                }}
              >
                {visibleTerminalIds.map((terminalId) => (
                  <div
                    key={terminalId}
                    className={`min-h-0 min-w-0 border-l first:border-l-0 ${
                      terminalId === resolvedActiveTerminalId ? "border-border" : "border-border/70"
                    }`}
                    onMouseDown={() => {
                      if (terminalId !== resolvedActiveTerminalId) {
                        onActiveTerminalChange(terminalId);
                      }
                    }}
                  >
                    <div className="h-full p-1">
                      <TerminalViewport
                        threadRef={threadRef}
                        threadId={threadId}
                        terminalId={terminalId}
                        terminalLabel={terminalLabelById.get(terminalId) ?? "Terminal"}
                        cwd={cwd}
                        {...(worktreePath !== undefined ? { worktreePath } : {})}
                        {...(runtimeEnv ? { runtimeEnv } : {})}
                        onSessionExited={() => onCloseTerminal(terminalId)}
                        onAddTerminalContext={onAddTerminalContext}
                        focusRequestId={focusRequestId}
                        autoFocus={terminalId === resolvedActiveTerminalId}
                        resizeEpoch={resizeEpoch}
                        drawerHeight={drawerHeight}
                        keybindings={keybindings}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full p-1">
                <TerminalViewport
                  key={resolvedActiveTerminalId}
                  threadRef={threadRef}
                  threadId={threadId}
                  terminalId={resolvedActiveTerminalId}
                  terminalLabel={terminalLabelById.get(resolvedActiveTerminalId) ?? "Terminal"}
                  cwd={cwd}
                  {...(worktreePath !== undefined ? { worktreePath } : {})}
                  {...(runtimeEnv ? { runtimeEnv } : {})}
                  onSessionExited={() => onCloseTerminal(resolvedActiveTerminalId)}
                  onAddTerminalContext={onAddTerminalContext}
                  focusRequestId={focusRequestId}
                  autoFocus
                  resizeEpoch={resizeEpoch}
                  drawerHeight={drawerHeight}
                  keybindings={keybindings}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-y-0 right-0 z-30 flex justify-end overflow-hidden">
        <aside
          className={`pointer-events-auto flex h-full min-w-64 w-[min(25vw,360px)] flex-col border-l border-border/80 bg-background/95 shadow-xl backdrop-blur transition-transform duration-200 ease-out ${
            terminalPanelOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex min-h-10 items-center justify-between border-b border-border/80 px-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Terminals</div>
              <div className="text-xs text-muted-foreground">
                {terminalPanelTerminalCount} active
              </div>
            </div>
            <button
              type="button"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={() => onTerminalPanelOpenChange(false)}
              aria-label="Close terminal list"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
            {resolvedTerminalGroups.map((terminalGroup, groupIndex) => {
              const isGroupActive = terminalGroup.terminalIds.includes(resolvedActiveTerminalId);
              const groupActiveTerminalId = isGroupActive
                ? resolvedActiveTerminalId
                : (terminalGroup.terminalIds[0] ?? resolvedActiveTerminalId);
              const isSplitGroup = terminalGroup.terminalIds.length > 1;
              const splitGroupNumber = resolvedTerminalGroups
                .slice(0, groupIndex + 1)
                .filter((group) => group.terminalIds.length > 1).length;

              return (
                <div key={terminalGroup.id} className="pb-0.5">
                  {isSplitGroup && (
                    <button
                      type="button"
                      className={`mb-0.5 flex w-full items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${
                        isGroupActive
                          ? "bg-accent/70 text-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      }`}
                      onClick={() => onActiveTerminalChange(groupActiveTerminalId)}
                    >
                      {`Split ${splitGroupNumber}`}
                    </button>
                  )}

                  <div className={isSplitGroup ? "border-l border-border/60 pl-2" : ""}>
                    {terminalGroup.terminalIds.map((terminalId) => {
                      const isActive = terminalId === resolvedActiveTerminalId;
                      const isRunning = runningTerminalIdSet.has(terminalId);
                      const label = terminalLabelById.get(terminalId) ?? "Terminal";
                      const closeTerminalLabel = `Close ${label}${
                        isActive && closeShortcutLabel ? ` (${closeShortcutLabel})` : ""
                      }`;
                      const isRenaming = renamingTerminalId === terminalId;
                      return (
                        <div
                          key={terminalId}
                          className={`group flex items-center gap-2 rounded-md px-2 py-0.5 text-sm ${
                            isActive
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          }`}
                        >
                          {isRenaming ? (
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <TerminalSquare className="size-4 shrink-0" />
                              <input
                                autoFocus
                                className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
                                value={renameDraft}
                                onBlur={() => submitTerminalRename(terminalId)}
                                onChange={handleRenameDraftChange}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => handleRenameInputKeyDown(terminalId, event)}
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              onClick={() => onActiveTerminalChange(terminalId)}
                            >
                              <TerminalSquare className="size-4 shrink-0" />
                              <span
                                className="min-w-0 flex-1 truncate"
                                onClick={(event) =>
                                  handleTerminalNameClick(
                                    event,
                                    `current:${terminalId}`,
                                    () => onActiveTerminalChange(terminalId),
                                    () => startRenamingTerminal(terminalId),
                                  )
                                }
                              >
                                {label}
                              </span>
                              {isRunning && (
                                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                              )}
                            </button>
                          )}

                          {isRenaming ? (
                            <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                              <button
                                type="button"
                                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => submitTerminalRename(terminalId)}
                                aria-label={`Save ${label} name`}
                              >
                                <Check className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={cancelTerminalRename}
                                aria-label="Cancel terminal rename"
                              >
                                <XIcon className="size-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                              <button
                                type="button"
                                className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                onClick={() => startRenamingTerminal(terminalId)}
                                aria-label={`Rename ${label}`}
                              >
                                <Pencil className="size-3.25" />
                              </button>
                              {normalizedTerminalIds.length > 1 && (
                                <button
                                  type="button"
                                  className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                  onClick={() => onCloseTerminal(terminalId)}
                                  aria-label={closeTerminalLabel}
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {externalTerminalSections.map((section) => {
              const runningExternalTerminalIds = new Set(section.runningTerminalIds);
              return (
                <div key={section.threadKey} className="border-t border-border/70 pt-1 pb-0.5">
                  <div className="truncate px-1.5 pb-0.5 text-xs font-medium text-foreground">
                    {section.projectName}
                    <span className="font-normal text-muted-foreground"> / {section.title}</span>
                  </div>

                  {section.terminalGroups.map((terminalGroup, groupIndex) => {
                    const isGroupActive = terminalGroup.terminalIds.includes(
                      section.activeTerminalId,
                    );
                    const groupActiveTerminalId = isGroupActive
                      ? section.activeTerminalId
                      : (terminalGroup.terminalIds[0] ?? section.activeTerminalId);
                    const isSplitGroup = terminalGroup.terminalIds.length > 1;
                    const splitGroupNumber = section.terminalGroups
                      .slice(0, groupIndex + 1)
                      .filter((group) => group.terminalIds.length > 1).length;

                    return (
                      <div key={`${section.threadKey}:${terminalGroup.id}`} className="pb-0.5">
                        {isSplitGroup && (
                          <button
                            type="button"
                            className={`mb-0.5 flex w-full items-center rounded px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] ${
                              isGroupActive
                                ? "bg-accent/70 text-foreground"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            }`}
                            onClick={() =>
                              onExternalTerminalReturn(
                                section.threadKey,
                                section.threadRef,
                                groupActiveTerminalId,
                              )
                            }
                          >
                            {`Split ${splitGroupNumber}`}
                          </button>
                        )}

                        <div className={isSplitGroup ? "border-l border-border/60 pl-2" : ""}>
                          {terminalGroup.terminalIds.map((terminalId) => {
                            const terminalIndex = section.terminalIds.indexOf(terminalId);
                            const label = resolveTerminalLabel({
                              terminalId,
                              index: terminalIndex >= 0 ? terminalIndex : 0,
                              projectName: section.projectName,
                              labelsById: section.terminalLabelsById,
                            });
                            const isRunning = runningExternalTerminalIds.has(terminalId);
                            const isActive = terminalId === section.activeTerminalId;
                            const externalRenameKey = `external:${section.threadKey}:${terminalId}`;
                            const isExternalRenaming =
                              renamingExternalTerminal?.threadKey === section.threadKey &&
                              renamingExternalTerminal.terminalId === terminalId;
                            return (
                              <div
                                key={`${section.threadKey}:${terminalId}`}
                                className={`group flex items-center gap-2 rounded-md px-2 py-0.5 text-sm ${
                                  isActive
                                    ? "bg-accent text-foreground"
                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                }`}
                                onClick={() =>
                                  onExternalTerminalReturn(
                                    section.threadKey,
                                    section.threadRef,
                                    terminalId,
                                  )
                                }
                              >
                                {isExternalRenaming ? (
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <TerminalSquare className="size-4 shrink-0" />
                                    <input
                                      autoFocus
                                      className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-ring"
                                      value={externalRenameDraft}
                                      onBlur={submitExternalTerminalRename}
                                      onChange={handleExternalRenameDraftChange}
                                      onClick={(event) => event.stopPropagation()}
                                      onKeyDown={handleExternalRenameInputKeyDown}
                                    />
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onExternalTerminalReturn(
                                        section.threadKey,
                                        section.threadRef,
                                        terminalId,
                                      );
                                    }}
                                  >
                                    <TerminalSquare className="size-4 shrink-0" />
                                    <span
                                      className="min-w-0 flex-1 truncate"
                                      onClick={(event) =>
                                        handleTerminalNameClick(
                                          event,
                                          externalRenameKey,
                                          () =>
                                            onExternalTerminalReturn(
                                              section.threadKey,
                                              section.threadRef,
                                              terminalId,
                                            ),
                                          () =>
                                            onExternalTerminalRename(
                                              section.threadKey,
                                              section.threadRef,
                                              terminalId,
                                            ),
                                        )
                                      }
                                    >
                                      {label}
                                    </span>
                                    {isRunning && (
                                      <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                                    )}
                                  </button>
                                )}

                                {isExternalRenaming ? (
                                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                                    <button
                                      type="button"
                                      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        submitExternalTerminalRename();
                                      }}
                                      aria-label={`Save ${label} name`}
                                    >
                                      <Check className="size-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        cancelExternalTerminalRename();
                                      }}
                                      aria-label="Cancel terminal rename"
                                    >
                                      <XIcon className="size-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                                    <button
                                      type="button"
                                      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        clearTerminalNameClickTimeout(externalRenameKey);
                                        startRenamingExternalTerminal(section, terminalId, label);
                                      }}
                                      aria-label={`Rename ${label}`}
                                    >
                                      <Pencil className="size-3.25" />
                                    </button>
                                    <button
                                      type="button"
                                      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onExternalTerminalReturn(
                                          section.threadKey,
                                          section.threadRef,
                                          terminalId,
                                        );
                                      }}
                                      aria-label={`Back to ${section.title}`}
                                    >
                                      <MessageSquare className="size-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        onExternalTerminalClose(section.threadRef, terminalId);
                                      }}
                                      aria-label={`Close ${label}`}
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </aside>
  );
}

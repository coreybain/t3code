import type { EnvironmentId } from "@t3tools/contracts";
import { EditorState, Compartment } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from "@codemirror/search";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { yaml } from "@codemirror/lang-yaml";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SaveIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { readEnvironmentApi } from "../environmentApi";
import { useTheme } from "../hooks/useTheme";
import { cn } from "../lib/utils";
import ChatMarkdown from "./ChatMarkdown";
import { VscodeEntryIcon } from "./chat/VscodeEntryIcon";
import { Button } from "./ui/button";
import { Toggle } from "./ui/toggle";
import { stackedThreadToast, toastManager } from "./ui/toast";

const themeCompartment = new Compartment();
const languageCompartment = new Compartment();

function getExtension(relativePath: string): string {
  const basename = relativePath.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  if (basename.startsWith(".env")) return "env";
  const index = basename.lastIndexOf(".");
  return index >= 0 ? basename.slice(index + 1) : "";
}

function isMarkdownFile(relativePath: string): boolean {
  return ["md", "mdx", "markdown", "mdc"].includes(getExtension(relativePath));
}

function languageForPath(relativePath: string) {
  switch (getExtension(relativePath)) {
    case "ts":
      return javascript({ typescript: true });
    case "tsx":
      return javascript({ typescript: true, jsx: true });
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "jsx":
      return javascript({ jsx: true });
    case "json":
    case "jsonc":
      return json();
    case "md":
    case "mdx":
    case "markdown":
    case "mdc":
      return markdown();
    case "sql":
      return sql();
    case "css":
    case "scss":
    case "less":
      return css();
    case "html":
    case "xml":
    case "svg":
      return html();
    case "yaml":
    case "yml":
      return yaml();
    case "py":
      return python();
    default:
      return [];
  }
}

function hasBinaryMarker(contents: string): boolean {
  return contents.includes("\0");
}

export default function ThreadFilePanel(props: {
  cwd: string | null;
  environmentId: EnvironmentId;
  relativePath: string;
}) {
  const { cwd, environmentId, relativePath } = props;
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const [contents, setContents] = useState("");
  const [savedContents, setSavedContents] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [previewMarkdown, setPreviewMarkdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = contents !== savedContents;
  const markdownFile = isMarkdownFile(relativePath);
  const readQuery = useQuery({
    queryKey: ["project-read-file", environmentId, cwd, relativePath],
    queryFn: async () => {
      const api = readEnvironmentApi(environmentId);
      if (!api || !cwd) {
        throw new Error("Project file API is unavailable.");
      }
      return api.projects.readFile({ cwd, relativePath });
    },
    enabled: cwd !== null,
  });
  const binary = hasBinaryMarker(readQuery.data?.contents ?? "");
  const languageExtension = useMemo(() => languageForPath(relativePath), [relativePath]);

  useEffect(() => {
    if (!readQuery.data || binary) {
      return;
    }
    setContents(readQuery.data.contents);
    setSavedContents(readQuery.data.contents);
    setStatus(null);
  }, [binary, readQuery.data]);

  useEffect(() => {
    if (
      !editorHostRef.current ||
      readQuery.isLoading ||
      readQuery.error ||
      binary ||
      previewMarkdown
    ) {
      return;
    }

    const view = new EditorView({
      parent: editorHostRef.current,
      state: EditorState.create({
        doc: readQuery.data?.contents ?? "",
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          dropCursor(),
          indentOnInput(),
          bracketMatching(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          languageCompartment.of(languageExtension),
          themeCompartment.of(theme === "dark" ? oneDark : []),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setContents(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              backgroundColor: "var(--background)",
              color: "var(--foreground)",
            },
            ".cm-scroller": {
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
              fontSize: "12px",
              lineHeight: "1.55",
            },
            ".cm-focused": { outline: "none" },
          }),
        ],
      }),
    });
    editorViewRef.current = view;

    return () => {
      editorViewRef.current = null;
      view.destroy();
    };
  }, [
    binary,
    languageExtension,
    previewMarkdown,
    readQuery.data?.contents,
    readQuery.error,
    readQuery.isLoading,
    theme,
  ]);

  useEffect(() => {
    editorViewRef.current?.dispatch({
      effects: [
        languageCompartment.reconfigure(languageExtension),
        themeCompartment.reconfigure(theme === "dark" ? oneDark : []),
      ],
    });
  }, [languageExtension, theme]);

  const save = useCallback(async () => {
    const api = readEnvironmentApi(environmentId);
    if (!api || !cwd || saving || binary) return;
    setSaving(true);
    setStatus(null);
    try {
      await api.projects.writeFile({ cwd, relativePath, contents });
      setSavedContents(contents);
      setStatus("Saved");
      await queryClient.invalidateQueries({
        queryKey: ["project-read-file", environmentId, cwd, relativePath],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save file.";
      setStatus(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Unable to save file",
          description: message,
        }),
      );
    } finally {
      setSaving(false);
    }
  }, [binary, contents, cwd, environmentId, queryClient, relativePath, saving]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const primaryModifier = event.metaKey || event.ctrlKey;
    if (!primaryModifier) return;
    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
      return;
    }
    if (event.key.toLowerCase() === "f") {
      const view = editorViewRef.current;
      if (!view) return;
      event.preventDefault();
      openSearchPanel(view);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" onKeyDown={handleKeyDown}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <VscodeEntryIcon pathValue={relativePath} kind="file" theme={theme} className="size-4" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={relativePath}>
          {relativePath}
        </span>
        {dirty ? <span className="text-xs text-muted-foreground">Unsaved</span> : null}
        {status ? (
          <span className="max-w-40 truncate text-xs text-muted-foreground">{status}</span>
        ) : null}
        {markdownFile ? (
          <Toggle
            pressed={previewMarkdown}
            onPressedChange={setPreviewMarkdown}
            size="sm"
            variant="outline"
          >
            Preview
          </Toggle>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void save()}
          disabled={!dirty || saving || binary}
        >
          <SaveIcon className="size-4" />
          Save
        </Button>
      </div>
      {readQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading file...
        </div>
      ) : readQuery.error instanceof Error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
          <p>{readQuery.error.message}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void readQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : binary ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          Binary files cannot be edited here.
        </div>
      ) : previewMarkdown && markdownFile ? (
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <ChatMarkdown text={contents} cwd={cwd ?? undefined} />
        </div>
      ) : (
        <div
          ref={editorHostRef}
          className={cn("min-h-0 flex-1 overflow-hidden", theme === "dark" && "bg-[#282c34]")}
        />
      )}
    </div>
  );
}

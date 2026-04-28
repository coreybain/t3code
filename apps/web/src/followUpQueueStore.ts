import { scopedThreadKey } from "@t3tools/client-runtime";
import type {
  FollowUpSendMode,
  ModelSelection,
  ProviderInteractionMode,
  ProviderKind,
  RuntimeMode,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  ComposerImageAttachment,
  PersistedComposerImageAttachment,
} from "./composerDraftStore";
import type { TerminalContextDraft } from "./lib/terminalContext";
import { createMemoryStorage } from "./lib/storage";
import { randomUUID } from "./lib/utils";

export const FOLLOW_UP_QUEUE_STORAGE_KEY = "t3code:follow-up-queue:v1";
const FOLLOW_UP_QUEUE_STORAGE_VERSION = 1;

export type FollowUpSubmitMode = FollowUpSendMode;

export interface QueuedFollowUpMessage {
  id: string;
  threadKey: string;
  createdAt: string;
  prompt: string;
  attachments: PersistedComposerImageAttachment[];
  terminalContexts: TerminalContextDraft[];
  modelSelection: ModelSelection;
  selectedProvider: ProviderKind;
  selectedModel: string;
  selectedPromptEffort: string | null;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
}

export interface ParkedComposerDraft {
  threadKey: string;
  createdAt: string;
  originalQueueIndex: number;
  editedQueueMessage: QueuedFollowUpMessage;
  composerSnapshot: QueuedFollowUpMessage;
}

interface FollowUpQueueStoreState {
  queueByThreadKey: Record<string, QueuedFollowUpMessage[]>;
  parkedDraftByThreadKey: Record<string, ParkedComposerDraft>;
  enqueue: (threadRef: ScopedThreadRef, message: QueuedFollowUpMessage) => void;
  dequeueNext: (threadRef: ScopedThreadRef) => QueuedFollowUpMessage | null;
  remove: (threadRef: ScopedThreadRef, id: string) => QueuedFollowUpMessage | null;
  moveUp: (threadRef: ScopedThreadRef, id: string) => void;
  moveDown: (threadRef: ScopedThreadRef, id: string) => void;
  replaceAt: (threadRef: ScopedThreadRef, index: number, message: QueuedFollowUpMessage) => void;
  parkComposerDraft: (threadRef: ScopedThreadRef, draft: ParkedComposerDraft) => void;
  clearParkedDraft: (threadRef: ScopedThreadRef) => void;
  getQueue: (threadRef: ScopedThreadRef) => QueuedFollowUpMessage[];
  getParkedDraft: (threadRef: ScopedThreadRef) => ParkedComposerDraft | null;
  resetForTests: () => void;
}

function threadKeyForRef(threadRef: ScopedThreadRef): string {
  return scopedThreadKey(threadRef);
}

export function newQueuedFollowUpMessageId(): string {
  return randomUUID();
}

function cloneMessageForThread(
  threadKey: string,
  message: QueuedFollowUpMessage,
): QueuedFollowUpMessage {
  return {
    ...message,
    threadKey,
    attachments: message.attachments.map((attachment) => ({ ...attachment })),
    terminalContexts: message.terminalContexts.map((context) => ({ ...context })),
    modelSelection: {
      ...message.modelSelection,
      ...(message.modelSelection.options
        ? { options: message.modelSelection.options.map((option) => ({ ...option })) }
        : {}),
    },
  };
}

function normalizeIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) {
    return length;
  }
  return Math.max(0, Math.min(length, Math.floor(index)));
}

function hydratePersistedComposerImageAttachment(
  attachment: PersistedComposerImageAttachment,
): File | null {
  const commaIndex = attachment.dataUrl.indexOf(",");
  const header = commaIndex === -1 ? attachment.dataUrl : attachment.dataUrl.slice(0, commaIndex);
  const payload = commaIndex === -1 ? "" : attachment.dataUrl.slice(commaIndex + 1);
  if (payload.length === 0) {
    return null;
  }
  try {
    const isBase64 = header.includes(";base64");
    if (!isBase64) {
      const decodedText = decodeURIComponent(payload);
      const inferredMimeType =
        header.startsWith("data:") && header.includes(";")
          ? header.slice("data:".length, header.indexOf(";"))
          : attachment.mimeType;
      return new File([decodedText], attachment.name, {
        type: inferredMimeType || attachment.mimeType,
      });
    }
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], attachment.name, { type: attachment.mimeType });
  } catch {
    return null;
  }
}

export function hydrateFollowUpMessageImages(
  attachments: ReadonlyArray<PersistedComposerImageAttachment>,
): ComposerImageAttachment[] {
  return attachments.flatMap((attachment) => {
    const file = hydratePersistedComposerImageAttachment(attachment);
    if (!file) return [];
    return [
      {
        type: "image" as const,
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        previewUrl: attachment.dataUrl,
        file,
      },
    ];
  });
}

function createFollowUpQueueStorage() {
  return typeof localStorage === "undefined" ? createMemoryStorage() : localStorage;
}

const EMPTY_QUEUE: QueuedFollowUpMessage[] = [];

export const useFollowUpQueueStore = create<FollowUpQueueStoreState>()(
  persist(
    (set, get) => ({
      queueByThreadKey: {},
      parkedDraftByThreadKey: {},
      enqueue: (threadRef, message) => {
        const threadKey = threadKeyForRef(threadRef);
        set((state) => ({
          queueByThreadKey: {
            ...state.queueByThreadKey,
            [threadKey]: [
              ...(state.queueByThreadKey[threadKey] ?? EMPTY_QUEUE),
              cloneMessageForThread(threadKey, message),
            ],
          },
        }));
      },
      dequeueNext: (threadRef) => {
        const threadKey = threadKeyForRef(threadRef);
        const queue = get().queueByThreadKey[threadKey] ?? EMPTY_QUEUE;
        const [next, ...rest] = queue;
        if (!next) return null;
        set((state) => {
          const nextQueueByThreadKey = { ...state.queueByThreadKey };
          if (rest.length === 0) {
            delete nextQueueByThreadKey[threadKey];
          } else {
            nextQueueByThreadKey[threadKey] = rest;
          }
          return { queueByThreadKey: nextQueueByThreadKey };
        });
        return next;
      },
      remove: (threadRef, id) => {
        const threadKey = threadKeyForRef(threadRef);
        const queue = get().queueByThreadKey[threadKey] ?? EMPTY_QUEUE;
        const removed = queue.find((message) => message.id === id) ?? null;
        if (!removed) return null;
        const nextQueue = queue.filter((message) => message.id !== id);
        set((state) => {
          const nextQueueByThreadKey = { ...state.queueByThreadKey };
          if (nextQueue.length === 0) {
            delete nextQueueByThreadKey[threadKey];
          } else {
            nextQueueByThreadKey[threadKey] = nextQueue;
          }
          return { queueByThreadKey: nextQueueByThreadKey };
        });
        return removed;
      },
      moveUp: (threadRef, id) => {
        const threadKey = threadKeyForRef(threadRef);
        set((state) => {
          const queue = state.queueByThreadKey[threadKey] ?? EMPTY_QUEUE;
          const index = queue.findIndex((message) => message.id === id);
          if (index <= 0) return state;
          const nextQueue = [...queue];
          const current = nextQueue[index]!;
          nextQueue[index] = nextQueue[index - 1]!;
          nextQueue[index - 1] = current;
          return { queueByThreadKey: { ...state.queueByThreadKey, [threadKey]: nextQueue } };
        });
      },
      moveDown: (threadRef, id) => {
        const threadKey = threadKeyForRef(threadRef);
        set((state) => {
          const queue = state.queueByThreadKey[threadKey] ?? EMPTY_QUEUE;
          const index = queue.findIndex((message) => message.id === id);
          if (index < 0 || index >= queue.length - 1) return state;
          const nextQueue = [...queue];
          const current = nextQueue[index]!;
          nextQueue[index] = nextQueue[index + 1]!;
          nextQueue[index + 1] = current;
          return { queueByThreadKey: { ...state.queueByThreadKey, [threadKey]: nextQueue } };
        });
      },
      replaceAt: (threadRef, index, message) => {
        const threadKey = threadKeyForRef(threadRef);
        set((state) => {
          const queue = state.queueByThreadKey[threadKey] ?? EMPTY_QUEUE;
          const nextQueue = [...queue];
          nextQueue.splice(
            normalizeIndex(index, nextQueue.length),
            0,
            cloneMessageForThread(threadKey, message),
          );
          return { queueByThreadKey: { ...state.queueByThreadKey, [threadKey]: nextQueue } };
        });
      },
      parkComposerDraft: (threadRef, draft) => {
        const threadKey = threadKeyForRef(threadRef);
        set((state) => ({
          parkedDraftByThreadKey: {
            ...state.parkedDraftByThreadKey,
            [threadKey]: {
              ...draft,
              threadKey,
              editedQueueMessage: cloneMessageForThread(threadKey, draft.editedQueueMessage),
              composerSnapshot: cloneMessageForThread(threadKey, draft.composerSnapshot),
            },
          },
        }));
      },
      clearParkedDraft: (threadRef) => {
        const threadKey = threadKeyForRef(threadRef);
        set((state) => {
          if (!state.parkedDraftByThreadKey[threadKey]) return state;
          const nextParkedDraftByThreadKey = { ...state.parkedDraftByThreadKey };
          delete nextParkedDraftByThreadKey[threadKey];
          return { parkedDraftByThreadKey: nextParkedDraftByThreadKey };
        });
      },
      getQueue: (threadRef) => get().queueByThreadKey[threadKeyForRef(threadRef)] ?? EMPTY_QUEUE,
      getParkedDraft: (threadRef) =>
        get().parkedDraftByThreadKey[threadKeyForRef(threadRef)] ?? null,
      resetForTests: () => set({ queueByThreadKey: {}, parkedDraftByThreadKey: {} }),
    }),
    {
      name: FOLLOW_UP_QUEUE_STORAGE_KEY,
      version: FOLLOW_UP_QUEUE_STORAGE_VERSION,
      storage: createJSONStorage(createFollowUpQueueStorage),
      partialize: (state) => ({
        queueByThreadKey: state.queueByThreadKey,
        parkedDraftByThreadKey: state.parkedDraftByThreadKey,
      }),
    },
  ),
);

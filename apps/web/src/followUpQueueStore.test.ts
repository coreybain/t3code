import { scopeThreadRef } from "@t3tools/client-runtime";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { beforeEach, describe, expect, it } from "vitest";

import {
  FOLLOW_UP_QUEUE_STORAGE_KEY,
  hydrateFollowUpMessageImages,
  type QueuedFollowUpMessage,
  useFollowUpQueueStore,
} from "./followUpQueueStore";

const threadRef = scopeThreadRef(
  EnvironmentId.make("environment-follow-up-test"),
  ThreadId.make("thread-follow-up-test"),
);

function message(id: string, prompt = id): QueuedFollowUpMessage {
  return {
    id,
    threadKey: "unused",
    createdAt: "2026-04-28T00:00:00.000Z",
    prompt,
    attachments: [],
    terminalContexts: [],
    modelSelection: createModelSelection("codex", "gpt-5.4"),
    selectedProvider: "codex",
    selectedModel: "gpt-5.4",
    selectedPromptEffort: null,
    runtimeMode: "full-access",
    interactionMode: "default",
  };
}

beforeEach(() => {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(FOLLOW_UP_QUEUE_STORAGE_KEY);
  }
  useFollowUpQueueStore.getState().resetForTests();
});

describe("followUpQueueStore", () => {
  it("enqueues and dequeues in order", () => {
    const store = useFollowUpQueueStore.getState();
    store.enqueue(threadRef, message("one"));
    store.enqueue(threadRef, message("two"));

    expect(store.getQueue(threadRef).map((entry) => entry.id)).toEqual(["one", "two"]);
    expect(useFollowUpQueueStore.getState().dequeueNext(threadRef)?.id).toBe("one");
    expect(useFollowUpQueueStore.getState().dequeueNext(threadRef)?.id).toBe("two");
    expect(useFollowUpQueueStore.getState().dequeueNext(threadRef)).toBeNull();
  });

  it("moves queued messages within boundaries", () => {
    const store = useFollowUpQueueStore.getState();
    store.enqueue(threadRef, message("one"));
    store.enqueue(threadRef, message("two"));
    store.enqueue(threadRef, message("three"));

    useFollowUpQueueStore.getState().moveUp(threadRef, "one");
    expect(
      useFollowUpQueueStore
        .getState()
        .getQueue(threadRef)
        .map((entry) => entry.id),
    ).toEqual(["one", "two", "three"]);

    useFollowUpQueueStore.getState().moveDown(threadRef, "one");
    expect(
      useFollowUpQueueStore
        .getState()
        .getQueue(threadRef)
        .map((entry) => entry.id),
    ).toEqual(["two", "one", "three"]);

    useFollowUpQueueStore.getState().moveUp(threadRef, "three");
    expect(
      useFollowUpQueueStore
        .getState()
        .getQueue(threadRef)
        .map((entry) => entry.id),
    ).toEqual(["two", "three", "one"]);
  });

  it("deletes queued messages", () => {
    const store = useFollowUpQueueStore.getState();
    store.enqueue(threadRef, message("one"));
    store.enqueue(threadRef, message("two"));

    expect(useFollowUpQueueStore.getState().remove(threadRef, "one")?.id).toBe("one");
    expect(
      useFollowUpQueueStore
        .getState()
        .getQueue(threadRef)
        .map((entry) => entry.id),
    ).toEqual(["two"]);
  });

  it("hydrates persisted image attachments", async () => {
    const dataUrl = `data:text/plain;base64,${Buffer.from("hello", "utf8").toString("base64")}`;
    const images = hydrateFollowUpMessageImages([
      {
        id: "image-1",
        name: "hello.txt",
        mimeType: "text/plain",
        sizeBytes: 5,
        dataUrl,
      },
    ]);

    expect(images).toHaveLength(1);
    expect(images[0]?.name).toBe("hello.txt");
    await expect(images[0]?.file.text()).resolves.toBe("hello");
  });

  it("preserves terminal context text and parked drafts", () => {
    const queued = {
      ...message("context"),
      terminalContexts: [
        {
          id: "ctx-1",
          threadId: threadRef.threadId,
          createdAt: "2026-04-28T00:00:00.000Z",
          terminalId: "default",
          terminalLabel: "Terminal",
          lineStart: 1,
          lineEnd: 1,
          text: "npm run build",
        },
      ],
    };
    const store = useFollowUpQueueStore.getState();
    store.enqueue(threadRef, queued);
    store.parkComposerDraft(threadRef, {
      threadKey: "unused",
      createdAt: "2026-04-28T00:00:00.000Z",
      originalQueueIndex: 0,
      editedQueueMessage: queued,
      composerSnapshot: message("draft"),
    });

    expect(useFollowUpQueueStore.getState().getQueue(threadRef)[0]?.terminalContexts[0]?.text).toBe(
      "npm run build",
    );
    expect(useFollowUpQueueStore.getState().getParkedDraft(threadRef)?.composerSnapshot.id).toBe(
      "draft",
    );
  });
});

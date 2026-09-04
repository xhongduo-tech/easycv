type DocxWorkerRequest = { arrayBuffer: ArrayBuffer };
export type DocxWorkerResponse =
  | { ok: true; html: string; messages: string[] }
  | { ok: false; error: string };

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<DocxWorkerRequest>) => void) | null;
  postMessage: (message: DocxWorkerResponse) => void;
};

workerScope.onmessage = async (event) => {
  try {
    const mammothModule = await import("mammoth");
    const result = await mammothModule.convertToHtml(
      { arrayBuffer: event.data.arrayBuffer },
      {
        includeEmbeddedStyleMap: false,
        externalFileAccess: false,
        convertImage: mammothModule.images.imgElement(async () => ({ src: "" })),
      },
    );
    if (result.value.length > 500_000) throw new Error("转换后的 Word 内容超过候选稿上限");
    const messages = result.messages
      .slice(0, 10)
      .map((message) => String(message.message ?? "").trim().slice(0, 300))
      .filter(Boolean);
    workerScope.postMessage({ ok: true, html: result.value, messages });
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 300) : "Word 转换失败",
    });
  }
};

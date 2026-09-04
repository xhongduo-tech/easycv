import {
  AsyncInflate,
  Unzip,
  UnzipInflate,
  type AsyncFlateStreamHandler,
} from "fflate";

const MAX_DOCX_ENTRY_COUNT = 256;
const MAX_DOCX_UNCOMPRESSED_BYTES = 24_000_000;
const MAX_DOCX_SINGLE_ENTRY_BYTES = 16_000_000;
const MAX_DOCX_DOCUMENT_XML_BYTES = 4_000_000;
const MAX_DOCX_XML_MARKERS = 120_000;
const DOCX_STREAM_CHUNK_BYTES = 8_192;
const DOCX_PREFLIGHT_TIMEOUT_MS = 15_000;
const MAX_IMAGE_DIMENSION = 12_000;
const MAX_IMAGE_PIXELS = 24_000_000;

/**
 * fflate's built-in AsyncUnzipInflate handles small compressed entries on the
 * caller thread. DOCX files are untrusted local input, so always move DEFLATE
 * work into its worker and clone chunks before their buffers are transferred.
 */
class WorkerOnlyUnzipInflate {
  static compression = UnzipInflate.compression;

  ondata: AsyncFlateStreamHandler = () => undefined;

  private readonly inflater = new AsyncInflate((error, data, final) => {
    this.ondata(error, data, final);
  });

  push(chunk: Uint8Array, final: boolean) {
    this.inflater.push(chunk.slice(), final);
  }

  terminate = () => {
    this.inflater.terminate();
  };
}

export async function assertSafeLocalDocx(arrayBuffer: ArrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let entryCount = 0;
  let uncompressedBytes = 0;
  let xmlMarkers = 0;
  let hasDocumentXml = false;
  let failure: Error | null = null;
  let releaseAbort: (() => void) | undefined;
  const aborted = new Promise<void>((resolve) => { releaseAbort = resolve; });
  const fileJobs: Array<() => Promise<void>> = [];
  const activeFiles = new Set<{ terminate: () => void }>();
  const entryNames = new Set<string>();

  const fail = (error: Error) => {
    if (failure) return;
    failure = error;
    for (const file of activeFiles) file.terminate();
    releaseAbort?.();
  };

  const unzipper = new Unzip((file) => {
    entryCount += 1;
    const name = file.name.replaceAll("\\", "/");
    if (name.startsWith("/") || name.split("/").includes("..")) {
      throw new Error("Word 文件包含不安全的内部路径");
    }
    if (entryNames.has(name)) throw new Error("Word 文件包含重复的内部路径");
    entryNames.add(name);
    if (entryCount > MAX_DOCX_ENTRY_COUNT) {
      throw new Error("Word 文件包含过多内部条目，请移除大型内嵌媒体后重试");
    }
    const entryLimit = docxEntryLimit(name);
    const isXml = /\.(?:xml|rels)$/i.test(name);
    if (typeof file.originalSize === "number" && file.originalSize > entryLimit) {
      throw new Error("Word 文件解压后的体积异常，请移除大型内嵌媒体后重试");
    }
    if (name === "word/document.xml") hasDocumentXml = true;

    fileJobs.push(() => new Promise<void>((resolve) => {
      let entryBytes = 0;
      activeFiles.add(file);
      file.ondata = (error, chunk, final) => {
        if (failure) return;
        if (error) {
          activeFiles.delete(file);
          resolve();
          fail(new Error("Word 文件损坏、加密或使用了不支持的压缩方式"));
          return;
        }
        entryBytes += chunk.byteLength;
        uncompressedBytes += chunk.byteLength;
        if (isXml) {
          for (const byte of chunk) if (byte === 0x3c) xmlMarkers += 1;
        }
        if (entryBytes > entryLimit || uncompressedBytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
          activeFiles.delete(file);
          resolve();
          fail(new Error("Word 文件解压后的体积异常，请移除大型内嵌媒体后重试"));
          return;
        }
        if (xmlMarkers > MAX_DOCX_XML_MARKERS) {
          activeFiles.delete(file);
          resolve();
          fail(new Error("Word 文件内部结构过于复杂，请另存为精简的 DOCX 后重试"));
          return;
        }
        if (final) {
          activeFiles.delete(file);
          resolve();
        }
      };
      try {
        file.start();
      } catch {
        activeFiles.delete(file);
        resolve();
        fail(new Error("Word 文件损坏、加密或使用了不支持的压缩方式"));
      }
    }));
  });
  unzipper.register(WorkerOnlyUnzipInflate);

  const timeout = setTimeout(() => {
    fail(new Error("Word 文件解析时间过长，请移除大型内嵌媒体后重试"));
  }, DOCX_PREFLIGHT_TIMEOUT_MS);

  try {
    for (let offset = 0; offset < bytes.length; offset += DOCX_STREAM_CHUNK_BYTES) {
      const end = Math.min(offset + DOCX_STREAM_CHUNK_BYTES, bytes.length);
      unzipper.push(bytes.subarray(offset, end), end === bytes.length);
      if (failure) break;
    }
    if (failure) throw failure;
    for (const runFileJob of fileJobs) {
      await Promise.race([runFileJob(), aborted]);
      if (failure) break;
    }
    if (failure) throw failure;
    if (!hasDocumentXml) throw new Error("文件不是有效的 DOCX 简历");
  } catch (error) {
    for (const file of activeFiles) file.terminate();
    if (error instanceof Error && (error.message.startsWith("Word 文件") || error.message.startsWith("文件不是"))) {
      throw error;
    }
    throw new Error("Word 文件损坏、加密或不是有效的 DOCX");
  } finally {
    clearTimeout(timeout);
  }
}

function docxEntryLimit(name: string) {
  if (name === "word/document.xml") return MAX_DOCX_DOCUMENT_XML_BYTES;
  if (name === "word/styles.xml") return 1_000_000;
  if (name === "word/numbering.xml" || /\.rels$/i.test(name)) return 512_000;
  if (/^word\/(?:footnotes|endnotes|comments|header\d*|footer\d*)\.xml$/i.test(name)) return 1_000_000;
  if (/\.xml$/i.test(name)) return 2_000_000;
  return MAX_DOCX_SINGLE_ENTRY_BYTES;
}

export function assertSafeLocalImage(arrayBuffer: ArrayBuffer, declaredType: string) {
  const bytes = new Uint8Array(arrayBuffer);
  const detected = detectImage(bytes);
  if (!detected) throw new Error("图片文件损坏或实际格式不是 JPEG、PNG、WebP");
  if (declaredType && detected.type !== declaredType) throw new Error("图片扩展名、MIME 类型与实际内容不一致");
  const { width, height } = detected;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error("无法确认图片尺寸");
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new Error("图片像素尺寸过大，请先缩小到 2400 万像素以内");
  }
  return detected;
}

function detectImage(bytes: Uint8Array) {
  if (bytes.length >= 24
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    && bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { type: "image/png", width: view.getUint32(16), height: view.getUint32(20) } as const;
  }
  if (bytes.length >= 30
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return detectWebp(bytes);
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return detectJpeg(bytes);
  }
  return null;
}

function detectJpeg(bytes: Uint8Array) {
  const sizeMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (sizeMarkers.has(marker) && segmentLength >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return { type: "image/jpeg", width, height } as const;
    }
    offset += segmentLength;
  }
  return null;
}

function detectWebp(bytes: Uint8Array) {
  const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunkType === "VP8X" && bytes.length >= 30) {
    return {
      type: "image/webp",
      width: 1 + readUint24(bytes, 24),
      height: 1 + readUint24(bytes, 27),
    } as const;
  }
  if (chunkType === "VP8 " && bytes.length >= 30
    && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      type: "image/webp",
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    } as const;
  }
  if (chunkType === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      type: "image/webp",
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    } as const;
  }
  return null;
}

function readUint24(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

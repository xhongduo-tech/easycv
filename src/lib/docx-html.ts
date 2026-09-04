type DocxSection = "preamble" | "summary" | "education" | "experience" | "projects" | "extras";
type HtmlNode = { tag: string; children: Array<HtmlNode | string> };
type Block = { kind: "paragraph" | "heading" | "bullet" | "row"; text: string; bold?: boolean; leadingBold?: boolean };

const sectionAliases = new Map<string, DocxSection>([
  ...["个人简介", "个人总结", "自我评价", "summary", "profile"].map((key) => [key, "summary"] as const),
  ...["教育经历", "教育背景", "education"].map((key) => [key, "education"] as const),
  ...["工作与实践", "工作经历", "实习经历", "实践经历", "experience", "work experience"].map((key) => [key, "experience"] as const),
  ...["项目经历", "项目经验", "projects"].map((key) => [key, "projects"] as const),
  ...["技能", "专业技能", "skills", "语言", "语言能力", "languages", "奖项", "奖项与证书", "奖项与荣誉", "荣誉", "证书", "awards"].map((key) => [key, "extras"] as const),
]);
const dateRangePattern = /((?:19|20)\d{2}(?:[./年-]\d{1,2}(?!\d)月?)?)\s*(?:—|–|-|至|到)\s*((?:19|20)\d{2}(?:[./年-]\d{1,2}(?!\d)月?)?|至今|现在|present|current)/i;

/** Interpret Mammoth's block semantics without mounting imported HTML or decoding text twice. */
export function normalizeMammothHtml(html: string) {
  if (html.length > 500_000) throw new Error("转换后的 Word 内容超过候选稿上限");
  const blocks = collectBlocks(parseHtmlSubset(html));
  const output: string[] = [];
  let section: DocxSection = "preamble";
  let awaitingMetadata = false;
  for (const block of blocks) {
    const text = cleanText(block.text);
    if (!text) continue;
    const detected = sectionAliases.get(text.replace(/[:：]$/, "").trim().toLowerCase());
    if (detected) {
      section = detected;
      output.push(text);
      awaitingMetadata = false;
      continue;
    }
    if (block.kind === "bullet") {
      output.push(`- ${text}`);
      awaitingMetadata = false;
      continue;
    }
    const structured = section === "education" || section === "experience" || section === "projects";
    // Only dated, unstyled metadata may extend a preceding company/school title.
    // Ordinary prose stays a detail rather than silently becoming a role.
    if (structured && awaitingMetadata && block.kind === "paragraph" && !block.bold
      && dateRangePattern.test(text) && text.length <= 200) {
      const header = output.at(-1)!.split("|").map(cleanText);
      const meta = metadataParts(text);
      output[output.length - 1] = [header[0], meta[0], meta[1], meta[2]].join(" | ");
      awaitingMetadata = false;
      continue;
    }
    const looksLikeHeader = block.kind === "heading" || block.kind === "row"
      || (block.bold && text.length <= 160 && !/[。！？!?]/.test(text))
      || (text.includes("|") && (block.leadingBold || dateRangePattern.test(text)));
    if (structured && looksLikeHeader) {
      output.push(entryHeader(text));
      awaitingMetadata = !text.includes("|") && !dateRangePattern.test(text);
      continue;
    }
    if (section === "experience" || section === "projects") output.push(`- ${text}`);
    else output.push(text);
    awaitingMetadata = false;
  }
  return output.join("\n").trim();
}

function entryHeader(text: string) {
  if (text.includes("|")) {
    const parts = text.split("|").map(cleanText);
    const secondDate = parts[1]?.match(dateRangePattern);
    if (secondDate && secondDate[0] === parts[1]) parts.splice(1, 0, "");
    if (parts[2]) parts[2] = canonicalDates(parts[2]);
    return parts.join(" | ");
  }
  const date = text.match(dateRangePattern);
  const before = trimSeparators(date?.index === undefined ? text : text.slice(0, date.index));
  const identity = before.split(/\s+[·•]\s+/).map(cleanText);
  const after = date?.index === undefined ? "" : trimSeparators(text.slice(date.index + date[0].length));
  return [identity[0], identity.slice(1).join(" · "), date ? canonicalDates(date[0]) : "", after].join(" | ");
}

function metadataParts(text: string) {
  const date = text.match(dateRangePattern)!;
  return [
    trimSeparators(text.slice(0, date.index)),
    canonicalDates(date[0]),
    trimSeparators(text.slice((date.index ?? 0) + date[0].length)),
  ];
}

function canonicalDates(text: string) {
  return text.replace(dateRangePattern, "$1 — $2");
}

function parseHtmlSubset(html: string): HtmlNode {
  const root: HtmlNode = { tag: "root", children: [] };
  const stack = [root];
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)) {
    const token = match[0];
    if (!token.startsWith("<")) {
      stack.at(-1)!.children.push(decodeEntities(token));
      continue;
    }
    const tagMatch = token.match(/^<(\/?)([a-z][a-z0-9]*)\b/i);
    if (!tagMatch) continue;
    const tag = tagMatch[2].toLowerCase();
    if (tagMatch[1]) {
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === tag) { stack.length = index; break; }
      }
    } else {
      const node: HtmlNode = { tag, children: [] };
      stack.at(-1)!.children.push(node);
      if (!["br", "img", "hr", "wbr", "input", "meta", "link"].includes(tag) && !token.endsWith("/>")) {
        if (stack.length >= 100) throw new Error("Word 内容嵌套过深，请另存为精简的 DOCX");
        stack.push(node);
      }
    }
  }
  return root;
}

function collectBlocks(node: HtmlNode): Block[] {
  if (["script", "style"].includes(node.tag)) return [];
  if (node.tag === "tr") {
    const cells = node.children.filter((child): child is HtmlNode => typeof child !== "string" && ["td", "th"].includes(child.tag));
    const cellBlocks = cells.map(collectBlocks);
    // Simple tabular headers retain column positions. Multi-paragraph layout
    // cells remain separate blocks; never concatenate their words or lists.
    if (cellBlocks.length > 1 && cellBlocks.every((blocks) => blocks.length <= 1 && blocks[0]?.kind !== "bullet")) {
      return [{ kind: "row", text: cellBlocks.map((blocks) => blocks[0]?.text ?? "").join(" | ") }];
    }
    return cellBlocks.flat();
  }
  if (node.tag === "li") {
    const nested: Block[] = [];
    const own: HtmlNode = { ...node, children: [] };
    for (const child of node.children) {
      if (typeof child !== "string" && ["ul", "ol"].includes(child.tag)) nested.push(...collectBlocks(child));
      else own.children.push(child);
    }
    return [{ kind: "bullet", text: nodeText(own) }, ...nested];
  }
  if (node.tag === "p" || /^h[1-6]$/.test(node.tag)) {
    const text = nodeText(node);
    const meaningful = node.children.filter((child) => typeof child !== "string" || child.trim());
    return [{
      kind: node.tag === "p" ? "paragraph" : "heading",
      text,
      bold: cleanText(emphasizedText(node)) === cleanText(text),
      leadingBold: typeof meaningful[0] !== "string" && ["strong", "b"].includes(meaningful[0]?.tag),
    }];
  }
  const result: Block[] = [];
  for (const child of node.children) {
    if (typeof child === "string") {
      if (child.trim()) result.push({ kind: "paragraph", text: child });
    } else result.push(...collectBlocks(child));
  }
  return result;
}

function nodeText(node: HtmlNode): string {
  if (node.tag === "br") return "\n";
  if (["img", "script", "style"].includes(node.tag)) return "";
  return node.children.map((child) => typeof child === "string" ? child : nodeText(child)
    + (["p", "li", "td"].includes(child.tag) ? "\n" : "")).join("");
}

function emphasizedText(node: HtmlNode): string {
  if (["strong", "b"].includes(node.tag)) return nodeText(node);
  return node.children.map((child) => typeof child === "string" ? "" : emphasizedText(child)).join("");
}

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, token: string) => {
    if (token[0] !== "#") return named[token.toLowerCase()] ?? entity;
    const codePoint = token[1]?.toLowerCase() === "x"
      ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
    try { return Number.isSafeInteger(codePoint) ? String.fromCodePoint(codePoint) : entity; }
    catch { return entity; }
  });
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function trimSeparators(value: string) {
  return cleanText(value).replace(/^[|·•,，;；\s]+|[|·•,，;；\s]+$/g, "");
}

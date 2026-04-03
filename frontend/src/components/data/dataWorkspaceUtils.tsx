import type {
  DatasetMessageTokenization,
  DatasetMessageToken,
  DatasetSample,
} from "../../types/app";

type YamlSegmentKind =
  | "plain"
  | "bullet"
  | "key"
  | "string"
  | "number"
  | "keyword";

export function describeSample(sample: DatasetSample): string {
  const userMessage = sample.messages.find(
    (message) => message.role === "user",
  );
  return userMessage?.content || sample.title;
}

export function buildTokenRenderSegments(
  text: string,
  tokens: DatasetMessageToken[],
) {
  const normalizedTokens = tokens.map((token) => ({
    ...token,
    text: token.text || token.token || "",
  }));

  if (!normalizedTokens.length) {
    return [{ kind: "text" as const, text }];
  }

  const concatenatedTokens = normalizedTokens
    .map((token) => token.text || "")
    .join("");
  if (concatenatedTokens === text) {
    return normalizedTokens.map((token) => ({
      kind: "token" as const,
      tokenIndex: token.token_index,
      text: token.text,
    }));
  }

  const segments: Array<
    | { kind: "text"; text: string }
    | { kind: "token"; tokenIndex: number; text: string }
  > = [];
  let cursor = 0;

  for (const token of normalizedTokens) {
    if (token.start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, token.start) });
    }
    segments.push({
      kind: "token",
      tokenIndex: token.token_index,
      text: token.text,
    });
    cursor = token.end;
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }

  return segments;
}

function indent(level: number): string {
  return "  ".repeat(level);
}

function needsQuotedYaml(value: string): boolean {
  return (
    value.length === 0 ||
    /^\s|\s$/.test(value) ||
    /[:#[\]{}!,&*?|\-<>=@`'"]/.test(value) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(value)
  );
}

function formatYamlScalar(value: unknown): string {
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === null || value === undefined) {
    return "null";
  }

  const text = String(value);
  return needsQuotedYaml(text) ? JSON.stringify(text) : text;
}

function pushYamlStringField(
  lines: string[],
  level: number,
  key: string,
  value: string,
) {
  if (value.includes("\n")) {
    lines.push(`${indent(level)}${key}: |-`);
    for (const line of value.split("\n")) {
      lines.push(`${indent(level + 1)}${line}`);
    }
    return;
  }

  lines.push(`${indent(level)}${key}: ${formatYamlScalar(value)}`);
}

function pushYamlJsonField(
  lines: string[],
  level: number,
  key: string,
  value: unknown,
) {
  const serialized = JSON.stringify(value, null, 2);
  if (!serialized) {
    lines.push(`${indent(level)}${key}: null`);
    return;
  }
  lines.push(`${indent(level)}${key}: |-`);
  for (const line of serialized.split("\n")) {
    lines.push(`${indent(level + 1)}${line}`);
  }
}

export function serializeSampleAsYaml(sample: DatasetSample): string {
  const lines: string[] = [];
  const anchors = sample.anchors ?? sample.edits;

  lines.push(`id: ${formatYamlScalar(sample.id)}`);
  lines.push(`title: ${formatYamlScalar(sample.title)}`);
  lines.push("messages:");
  for (const message of sample.messages) {
    lines.push(`${indent(1)}- role: ${formatYamlScalar(message.role)}`);
    if (message.name) {
      pushYamlStringField(lines, 2, "name", message.name);
    }
    if (message.tool_call_id) {
      pushYamlStringField(lines, 2, "tool_call_id", message.tool_call_id);
    }
    pushYamlStringField(lines, 2, "content", message.content);
  }

  lines.push("tools:");
  if (!sample.tools || sample.tools.length === 0) {
    lines.push(`${indent(1)}[]`);
  } else {
    pushYamlJsonField(lines, 1, "items", sample.tools);
  }

  lines.push("anchors:");
  if (anchors.length === 0) {
    lines.push(`${indent(1)}[]`);
  } else {
    for (const anchor of anchors) {
      lines.push(
        `${indent(1)}- message_index: ${formatYamlScalar(anchor.message_index)}`,
      );
      lines.push(
        `${indent(2)}token_index: ${formatYamlScalar(anchor.token_index)}`,
      );
      pushYamlStringField(
        lines,
        2,
        "replacement_token",
        anchor.replacement_token,
      );
      lines.push(
        `${indent(2)}regenerated_from_token_index: ${formatYamlScalar(anchor.regenerated_from_token_index)}`,
      );
      lines.push(
        `${indent(2)}created_at: ${formatYamlScalar(anchor.created_at)}`,
      );
    }
  }

  return lines.join("\n");
}

export function highlightYamlLine(
  line: string,
): Array<{ text: string; kind: YamlSegmentKind }> {
  const segments: Array<{ text: string; kind: YamlSegmentKind }> = [];
  const listMatch = line.match(/^(\s*-\s)(.*)$/);

  if (listMatch) {
    segments.push({ text: listMatch[1], kind: "bullet" });
    line = listMatch[2];
  }

  const keyMatch = line.match(/^([A-Za-z0-9_]+):(.*)$/);
  if (!keyMatch) {
    segments.push({ text: line, kind: "plain" });
    return segments;
  }

  segments.push({ text: `${keyMatch[1]}:`, kind: "key" });
  const value = keyMatch[2];
  if (!value) {
    return segments;
  }

  const leadingWhitespace = value.match(/^\s+/)?.[0] ?? "";
  if (leadingWhitespace) {
    segments.push({ text: leadingWhitespace, kind: "plain" });
  }

  const trimmed = value.trimStart();
  if (!trimmed) {
    return segments;
  }

  if (trimmed === "|-" || trimmed === "|" || trimmed === "[]") {
    segments.push({
      text: trimmed,
      kind: trimmed === "[]" ? "keyword" : "plain",
    });
    return segments;
  }

  if (/^".*"$/.test(trimmed)) {
    segments.push({ text: trimmed, kind: "string" });
    return segments;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    segments.push({ text: trimmed, kind: "number" });
    return segments;
  }

  if (/^(true|false|null)$/i.test(trimmed)) {
    segments.push({ text: trimmed, kind: "keyword" });
    return segments;
  }

  segments.push({ text: trimmed, kind: "plain" });
  return segments;
}

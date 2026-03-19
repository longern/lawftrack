import CloudDoneRoundedIcon from "@mui/icons-material/CloudDoneRounded";
import DnsRoundedIcon from "@mui/icons-material/DnsRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import type {
  DatasetMessage,
  DatasetMessageTokenization,
  DatasetSample,
  DataSummaryItem,
} from "../../types/app";

export function describeSample(sample: DatasetSample): string {
  const userMessage = sample.messages.find((message) => message.role === "user");
  return userMessage?.content || sample.title;
}

export function buildTokenRenderSegments(
  message: DatasetMessage,
  tokenization: DatasetMessageTokenization | null,
) {
  if (!tokenization) {
    return [{ kind: "text" as const, text: message.content }];
  }

  const segments: Array<
    | { kind: "text"; text: string }
    | { kind: "token"; tokenIndex: number; text: string }
  > = [];
  let cursor = 0;

  for (const token of tokenization.tokens) {
    if (token.start > cursor) {
      segments.push({ kind: "text", text: message.content.slice(cursor, token.start) });
    }
    segments.push({
      kind: "token",
      tokenIndex: token.token_index,
      text: message.content.slice(token.start, token.end) || token.text,
    });
    cursor = token.end;
  }

  if (cursor < message.content.length) {
    segments.push({ kind: "text", text: message.content.slice(cursor) });
  }

  return segments;
}

export function renderSummaryIcon(icon: DataSummaryItem["icon"]) {
  switch (icon) {
    case "gateway":
      return <CloudDoneRoundedIcon fontSize="small" />;
    case "health":
      return <DnsRoundedIcon fontSize="small" />;
    case "upstream":
      return <TuneRoundedIcon fontSize="small" />;
    case "auth":
      return <KeyRoundedIcon fontSize="small" />;
    default:
      return null;
  }
}

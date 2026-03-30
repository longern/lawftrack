import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import NavigateNextRoundedIcon from "@mui/icons-material/NavigateNextRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Drawer,
  Fab,
  IconButton,
  Paper,
  Slider,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Zoom,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { useI18n } from "../i18n";
import type { ApiListResponse, DatasetMessage } from "../types/app";
import {
  FALLBACK_BASE_MODEL,
  listModelOptionIds,
  resolvePreferredBaseModel,
  type RemoteModelRecord,
} from "../utils/modelSelection";

type ChatMode = "single" | "compare";
type ModelSlot = "primary" | "secondary";
type ResponseStatus = "streaming" | "complete" | "error";

const DEFAULT_TEMPERATURE = 0.7;

interface TurnResponse {
  modelId: string;
  reasoning: string;
  content: string;
  status: ResponseStatus;
  error: string;
}

interface ChatTurn {
  id: string;
  prompt: string;
  createdAt: number;
  responses: Partial<Record<ModelSlot, TurnResponse>>;
}

interface ChatSectionProps {
  isMobile: boolean;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        message = payload.detail;
      }
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function createTurnId() {
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickSecondaryModel(options: string[], primaryModel: string) {
  return (
    options.find((option) => option !== primaryModel) ??
    options[1] ??
    primaryModel
  );
}

function extractDeltaParts(delta: {
  content?: string | Array<{ text?: string; type?: string }>;
  reasoning?: string;
  reasoning_content?: string;
}) {
  let reasoning = "";
  let content = "";

  if (typeof delta.reasoning === "string") {
    reasoning += delta.reasoning;
  }
  if (typeof delta.reasoning_content === "string") {
    reasoning += delta.reasoning_content;
  }

  if (typeof delta.content === "string") {
    content += delta.content;
  } else if (Array.isArray(delta.content)) {
    delta.content.forEach((part) => {
      const text = typeof part.text === "string" ? part.text : "";
      if (!text) {
        return;
      }
      if (typeof part.type === "string" && /reason/i.test(part.type)) {
        reasoning += text;
        return;
      }
      content += text;
    });
  }

  return { reasoning, content };
}

function trimBoundaryBlankLines(value: string): string {
  return value
    .replace(/^(?:[ \t]*\r?\n)+/, "")
    .replace(/(?:\r?\n[ \t]*)+$/, "");
}

function formatModelChipLabel(modelId: string): string {
  const normalized = modelId.trim();
  if (!normalized) {
    return modelId;
  }
  return normalized.split("/").pop() ?? normalized;
}

interface AssistantBubbleProps {
  response: TurnResponse | undefined;
  label: string;
  accentColor: string;
}

function AssistantBubble({
  response,
  label,
  accentColor,
}: AssistantBubbleProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const reasoningContent = response?.reasoning?.trim() ?? "";
  const responseContent = trimBoundaryBlankLines(response?.content ?? "");
  const [reasoningExpanded, setReasoningExpanded] = useState(
    Boolean(reasoningContent),
  );
  const hadReasoningRef = useRef(Boolean(reasoningContent));

  useEffect(() => {
    if (!hadReasoningRef.current && reasoningContent) {
      setReasoningExpanded(true);
    }
    hadReasoningRef.current = Boolean(reasoningContent);
  }, [reasoningContent]);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 3.5,
        borderColor: alpha(accentColor, 0.36),
        background:
          theme.palette.mode === "dark"
            ? `linear-gradient(180deg, ${alpha(accentColor, 0.16)} 0%, ${alpha("#09111e", 0.88)} 100%)`
            : `linear-gradient(180deg, ${alpha(accentColor, 0.08)} 0%, rgba(255,255,255,0.96) 100%)`,
        boxShadow: `0 16px 48px ${alpha(accentColor, 0.12)}`,
      }}
    >
      <Stack spacing={1.5}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <SmartToyRoundedIcon sx={{ color: accentColor }} />
            <Typography variant="subtitle2">{label}</Typography>
          </Stack>
          {response?.modelId ? (
            <Chip size="small" label={response.modelId} />
          ) : null}
        </Stack>

        {response?.error ? (
          <Alert severity="error">{response.error}</Alert>
        ) : null}

        {response?.status === "streaming" ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <CircularProgress size={14} />
            <Typography variant="body2" color="text.secondary">
              {t("Generating...")}
            </Typography>
          </Stack>
        ) : null}

        {reasoningContent ? (
          <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
            <Button
              variant="text"
              size="small"
              onClick={() => setReasoningExpanded((current) => !current)}
              endIcon={
                <NavigateNextRoundedIcon
                  sx={{
                    fontSize: 16,
                    transform: reasoningExpanded
                      ? "rotate(90deg)"
                      : "rotate(0deg)",
                    transition: "transform 160ms ease",
                  }}
                />
              }
              sx={{
                minWidth: 0,
                px: 0,
                py: 0,
                color: "text.secondary",
                fontSize: "0.84rem",
                fontWeight: 400,
                lineHeight: 1.65,
                textTransform: "none",
                justifyContent: "flex-start",
                "& .MuiButton-endIcon": {
                  ml: 0.25,
                  mr: 0,
                },
                "&:hover": {
                  backgroundColor: "transparent",
                  textDecoration: "underline",
                },
              }}
            >
              {t("Thought process")}
            </Button>
            <Collapse
              in={reasoningExpanded}
              timeout="auto"
              sx={{ width: "100%" }}
            >
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "text.secondary",
                  fontSize: "0.84rem",
                  lineHeight: 1.65,
                }}
              >
                {reasoningContent}
              </Typography>
            </Collapse>
          </Stack>
        ) : null}

        <Typography
          variant="body1"
          sx={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            color:
              responseContent.trim() !== "" ? "text.primary" : "text.secondary",
            minHeight: 48,
            lineHeight: 1.72,
          }}
        >
          {responseContent.trim() !== ""
            ? responseContent
            : t("Waiting for model output.")}
        </Typography>
      </Stack>
    </Paper>
  );
}

function ChatSection({ isMobile }: ChatSectionProps) {
  const theme = useTheme();
  const { t, formatDateTime } = useI18n();
  const [mode, setMode] = useState<ChatMode>("single");
  const [controlsOpen, setControlsOpen] = useState(!isMobile);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<RemoteModelRecord[]>(
    [],
  );
  const [modelOptions, setModelOptions] = useState<string[]>([
    FALLBACK_BASE_MODEL,
  ]);
  const [primaryModel, setPrimaryModel] = useState(FALLBACK_BASE_MODEL);
  const [secondaryModel, setSecondaryModel] = useState(FALLBACK_BASE_MODEL);
  const [modelOptionsError, setModelOptionsError] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pageError, setPageError] = useState("");
  const [desktopControlsWidth, setDesktopControlsWidth] = useState(320);
  const controllersRef = useRef<AbortController[]>([]);
  const desktopPaneRef = useRef<HTMLDivElement | null>(null);
  const resizingDesktopPaneRef = useRef(false);
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } =
    useStickToBottom({
      initial: "instant",
      resize: "smooth",
    });

  const hasStreamingResponses = useMemo(
    () =>
      turns.some((turn) =>
        Object.values(turn.responses).some(
          (response) => response?.status === "streaming",
        ),
      ),
    [turns],
  );

  const selectedModels = useMemo(
    () =>
      Array.from(
        new Set(
          (mode === "compare"
            ? [primaryModel.trim(), secondaryModel.trim()]
            : [primaryModel.trim()]
          ).filter(Boolean),
        ),
      ),
    [mode, primaryModel, secondaryModel],
  );

  const modelParentLookup = useMemo(() => {
    const normalizedEntries = availableModels
      .map((model) => {
        const modelId = typeof model.id === "string" ? model.id.trim() : "";
        if (!modelId) {
          return null;
        }
        const parent =
          typeof model.parent === "string" ? model.parent.trim() : "";
        return [modelId, parent || null] as const;
      })
      .filter(
        (entry): entry is readonly [string, string | null] => entry !== null,
      );
    return new Map<string, string | null>(normalizedEntries);
  }, [availableModels]);

  useEffect(() => {
    void loadModels();

    return () => {
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setControlsOpen(true);
    }
  }, [isMobile]);

  useEffect(() => {
    function handlePointerMove(event: MouseEvent) {
      if (!resizingDesktopPaneRef.current || !desktopPaneRef.current) {
        return;
      }

      const rect = desktopPaneRef.current.getBoundingClientRect();
      const minLeftWidth = 280;
      const minRightWidth = 520;
      const maxLeftWidth = Math.max(minLeftWidth, rect.width - minRightWidth);
      const nextWidth = Math.min(
        Math.max(event.clientX - rect.left, minLeftWidth),
        maxLeftWidth,
      );
      setDesktopControlsWidth(nextWidth);
    }

    function handlePointerUp() {
      if (!resizingDesktopPaneRef.current) {
        return;
      }
      resizingDesktopPaneRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  function scrollConversationToBottom() {
    void Promise.resolve(
      scrollToBottom({
        animation: "smooth",
      }),
    );
  }

  async function loadModels(force = false) {
    if (modelsLoading && !force) {
      return;
    }

    setModelsLoading(true);
    setModelOptionsError("");

    try {
      const payload =
        await fetchJson<ApiListResponse<RemoteModelRecord>>("/v1/models");
      setAvailableModels(payload.data);
      const nextOptions = listModelOptionIds(payload.data);
      const preferredModel =
        resolvePreferredBaseModel(payload.data) ??
        nextOptions[0] ??
        FALLBACK_BASE_MODEL;
      const resolvedOptions =
        nextOptions.length > 0 ? nextOptions : [preferredModel];

      setModelOptions(resolvedOptions);
      setPrimaryModel((current) =>
        current.trim() !== "" && resolvedOptions.includes(current)
          ? current
          : preferredModel,
      );
      setSecondaryModel((current) => {
        const fallbackSecondary = pickSecondaryModel(
          resolvedOptions,
          preferredModel,
        );
        return current.trim() !== "" && resolvedOptions.includes(current)
          ? current
          : fallbackSecondary;
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("Failed to load models");
      setModelOptionsError(message);
      setAvailableModels([]);
      setModelOptions([FALLBACK_BASE_MODEL]);
      setPrimaryModel((current) =>
        current.trim() !== "" ? current : FALLBACK_BASE_MODEL,
      );
      setSecondaryModel((current) =>
        current.trim() !== "" ? current : FALLBACK_BASE_MODEL,
      );
    } finally {
      setModelsLoading(false);
    }
  }

  function stopGeneration() {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current = [];
    setTurns((current) =>
      current.map((turn) => ({
        ...turn,
        responses: Object.fromEntries(
          Object.entries(turn.responses).map(([slot, response]) => [
            slot,
            response?.status === "streaming"
              ? {
                  ...response,
                  status: "complete",
                  error: "",
                }
              : response,
          ]),
        ) as Partial<Record<ModelSlot, TurnResponse>>,
      })),
    );
  }

  function resetConversation() {
    stopGeneration();
    setTurns([]);
    setPageError("");
  }

  function updateTurnResponse(
    turnId: string,
    slot: ModelSlot,
    nextResponse: Partial<TurnResponse>,
  ) {
    setTurns((current) =>
      current.map((turn) => {
        if (turn.id !== turnId) {
          return turn;
        }

        const existingResponse = turn.responses[slot];
        if (!existingResponse) {
          return turn;
        }

        return {
          ...turn,
          responses: {
            ...turn.responses,
            [slot]: {
              ...existingResponse,
              ...nextResponse,
            },
          },
        };
      }),
    );
  }

  function buildMessagesForModel(
    historyTurns: ChatTurn[],
    slot: ModelSlot,
    modelId: string,
    prompt: string,
  ): DatasetMessage[] {
    const messages: DatasetMessage[] = [];
    if (systemPrompt.trim()) {
      messages.push({ role: "system", content: systemPrompt.trim() });
    }

    historyTurns.forEach((turn) => {
      messages.push({ role: "user", content: turn.prompt });
      const response = turn.responses[slot];
      if (
        response &&
        response.modelId === modelId &&
        response.content.trim() !== ""
      ) {
        messages.push({ role: "assistant", content: response.content });
      }
    });

    messages.push({ role: "user", content: prompt });
    return messages;
  }

  async function streamTurnResponse(args: {
    turnId: string;
    slot: ModelSlot;
    modelId: string;
    messages: DatasetMessage[];
  }) {
    const controller = new AbortController();
    controllersRef.current = [...controllersRef.current, controller];

    try {
      const response = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: args.modelId,
          messages: args.messages,
          stream: true,
          temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let message = `Request failed: ${response.status}`;
        try {
          const payload = (await response.json()) as { detail?: string };
          if (payload.detail) {
            message = payload.detail;
          }
        } catch {
          message = response.statusText || message;
        }
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedReasoning = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || !line.startsWith("data:")) {
            continue;
          }

          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") {
            continue;
          }

          const payload = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string | Array<{ text?: string; type?: string }>;
                reasoning?: string;
                reasoning_content?: string;
              };
            }>;
            error?: { message?: string };
          };
          if (payload.error?.message) {
            throw new Error(payload.error.message);
          }

          const deltaPayload = payload.choices?.[0]?.delta;
          if (!deltaPayload) {
            continue;
          }

          const deltaParts = extractDeltaParts(deltaPayload);
          if (!deltaParts.reasoning && !deltaParts.content) {
            continue;
          }

          accumulatedReasoning += deltaParts.reasoning;
          accumulated += deltaParts.content;
          updateTurnResponse(args.turnId, args.slot, {
            reasoning: accumulatedReasoning,
            content: accumulated,
            status: "streaming",
            error: "",
          });
        }
      }

      updateTurnResponse(args.turnId, args.slot, {
        reasoning: accumulatedReasoning,
        content: accumulated,
        status: "complete",
        error: "",
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      const message =
        error instanceof Error
          ? error.message
          : t("Failed to generate response");
      updateTurnResponse(args.turnId, args.slot, {
        status: "error",
        error: message,
      });
      setPageError(message);
    } finally {
      controllersRef.current = controllersRef.current.filter(
        (item) => item !== controller,
      );
    }
  }

  async function handleSendPrompt() {
    const prompt = draftPrompt.trim();
    const normalizedPrimaryModel = primaryModel.trim();
    const normalizedSecondaryModel = secondaryModel.trim();

    if (!prompt) {
      setPageError(t("Please enter a prompt."));
      return;
    }
    if (!normalizedPrimaryModel) {
      setPageError(t("Select a model first."));
      return;
    }
    if (mode === "compare" && !normalizedSecondaryModel) {
      setPageError(t("Select a second model first."));
      return;
    }
    if (
      mode === "compare" &&
      normalizedPrimaryModel === normalizedSecondaryModel
    ) {
      setPageError(t("Select two different models to compare."));
      return;
    }

    const historyTurns = turns;
    const turnId = createTurnId();
    const createdAt = Date.now();
    const nextTurn: ChatTurn = {
      id: turnId,
      prompt,
      createdAt,
      responses:
        mode === "compare"
          ? {
              primary: {
                modelId: normalizedPrimaryModel,
                reasoning: "",
                content: "",
                status: "streaming",
                error: "",
              },
              secondary: {
                modelId: normalizedSecondaryModel,
                reasoning: "",
                content: "",
                status: "streaming",
                error: "",
              },
            }
          : {
              primary: {
                modelId: normalizedPrimaryModel,
                reasoning: "",
                content: "",
                status: "streaming",
                error: "",
              },
            },
    };

    setPageError("");
    setDraftPrompt("");
    setTurns((current) => [...current, nextTurn]);
    requestAnimationFrame(() => {
      scrollConversationToBottom();
    });

    const primaryMessages = buildMessagesForModel(
      historyTurns,
      "primary",
      normalizedPrimaryModel,
      prompt,
    );
    void streamTurnResponse({
      turnId,
      slot: "primary",
      modelId: normalizedPrimaryModel,
      messages: primaryMessages,
    });

    if (mode === "compare") {
      const secondaryMessages = buildMessagesForModel(
        historyTurns,
        "secondary",
        normalizedSecondaryModel,
        prompt,
      );
      void streamTurnResponse({
        turnId,
        slot: "secondary",
        modelId: normalizedSecondaryModel,
        messages: secondaryMessages,
      });
    }
  }

  function renderModelSelector(args: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) {
    const modelParent = modelParentLookup.get(args.value.trim());

    return (
      <Autocomplete
        freeSolo
        options={modelOptions}
        value={args.value}
        inputValue={args.value}
        loading={modelsLoading}
        disabled={hasStreamingResponses}
        onOpen={() => void loadModels()}
        onChange={(_, value) =>
          args.onChange(typeof value === "string" ? value : (value ?? ""))
        }
        onInputChange={(_, value) => args.onChange(value)}
        renderInput={(params) => (
          <TextField
            {...params}
            label={args.label}
            helperText={
              modelOptionsError
                ? modelOptionsError
                : modelParent
                  ? t("Fine-tuned from {parent}", { parent: modelParent })
                  : undefined
            }
            size="small"
            fullWidth
            slotProps={{
              input: {
                ...params.InputProps,
                endAdornment: (
                  <>
                    {modelsLoading ? (
                      <CircularProgress color="inherit" size={16} />
                    ) : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />
    );
  }

  function renderTurn(turn: ChatTurn) {
    return (
      <Stack key={turn.id} spacing={1.5}>
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Paper
            elevation={0}
            sx={{
              maxWidth: { xs: "92%", md: "78%" },
              px: 2,
              py: 1.5,
              borderRadius: 3.5,
              background:
                theme.palette.mode === "dark"
                  ? `linear-gradient(135deg, ${alpha("#60a5fa", 0.18)} 0%, ${alpha("#2563eb", 0.34)} 100%)`
                  : "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
              border: `1px solid ${alpha("#2563eb", 0.24)}`,
              boxShadow: `0 16px 36px ${alpha("#2563eb", 0.12)}`,
            }}
          >
            <Stack spacing={0.75}>
              <Stack
                direction="row"
                spacing={1}
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography variant="subtitle2">{t("Prompt")}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDateTime(turn.createdAt, {
                    useSecondsTimestamp: false,
                    year: "numeric",
                  })}
                </Typography>
              </Stack>
              <Typography
                variant="body1"
                sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {turn.prompt}
              </Typography>
            </Stack>
          </Paper>
        </Box>

        {mode === "compare" ? (
          isMobile ? (
            <Box
              sx={{
                width: "100%",
                display: "grid",
                gridAutoFlow: "column",
                gridAutoColumns: "calc(100% - 28px)",
                gap: 1.5,
                overflowX: "auto",
                overflowY: "hidden",
                scrollSnapType: "x mandatory",
                pr: 3.5,
                overscrollBehaviorX: "contain",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                "&::-webkit-scrollbar": {
                  display: "none",
                },
              }}
            >
              <Box
                sx={{
                  minWidth: 0,
                  scrollSnapAlign: "start",
                  scrollSnapStop: "always",
                }}
              >
                <AssistantBubble
                  response={turn.responses.primary}
                  label={t("Model A")}
                  accentColor="#2563eb"
                />
              </Box>
              <Box
                sx={{
                  minWidth: 0,
                  scrollSnapAlign: "start",
                  scrollSnapStop: "always",
                }}
              >
                <AssistantBubble
                  response={turn.responses.secondary}
                  label={t("Model B")}
                  accentColor="#d97706"
                />
              </Box>
            </Box>
          ) : (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 2,
              }}
            >
              <AssistantBubble
                response={turn.responses.primary}
                label={t("Model A")}
                accentColor="#2563eb"
              />
              <AssistantBubble
                response={turn.responses.secondary}
                label={t("Model B")}
                accentColor="#d97706"
              />
            </Box>
          )
        ) : (
          <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
            <Box sx={{ width: { xs: "100%", md: "78%" } }}>
              <AssistantBubble
                response={turn.responses.primary}
                label={t("Response")}
                accentColor="#2563eb"
              />
            </Box>
          </Box>
        )}
      </Stack>
    );
  }

  function renderControlPanel() {
    return (
      <Stack spacing={2.5}>
        <Tabs
          value={mode}
          onChange={(_, value: ChatMode) => setMode(value)}
          variant="fullWidth"
          sx={{
            minHeight: 0,
            p: 0.5,
            borderRadius: 99,
            backgroundColor: alpha(theme.palette.primary.main, 0.08),
          }}
        >
          <Tab
            value="single"
            icon={<ForumRoundedIcon fontSize="small" />}
            iconPosition="start"
            label={t("Single model")}
            disabled={hasStreamingResponses}
            sx={{ minHeight: 40, borderRadius: 99 }}
          />
          <Tab
            value="compare"
            icon={<CompareArrowsRoundedIcon fontSize="small" />}
            iconPosition="start"
            label={t("Compare two models")}
            disabled={hasStreamingResponses}
            sx={{ minHeight: 40, borderRadius: 99 }}
          />
        </Tabs>

        <Stack spacing={1.5}>
          {renderModelSelector({
            label: mode === "compare" ? t("Model A") : t("Model"),
            value: primaryModel,
            onChange: setPrimaryModel,
          })}
          {mode === "compare"
            ? renderModelSelector({
                label: t("Model B"),
                value: secondaryModel,
                onChange: setSecondaryModel,
              })
            : null}
        </Stack>

        <TextField
          label={t("System prompt")}
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
          placeholder={t(
            "Optional instructions shared with the selected model(s).",
          )}
          fullWidth
          multiline
          minRows={3}
          maxRows={8}
          disabled={hasStreamingResponses}
        />

        <Stack spacing={1} sx={{ pb: 1 }}>
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Typography variant="body2">{t("Temperature")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {temperature.toFixed(1)}
            </Typography>
          </Stack>
          <Slider
            value={temperature}
            min={0}
            max={2}
            step={0.1}
            marks={[
              { value: 0, label: "0" },
              { value: 1, label: "1" },
              { value: 2, label: "2" },
            ]}
            valueLabelDisplay="auto"
            disabled={hasStreamingResponses}
            onChange={(_, value) =>
              setTemperature(Array.isArray(value) ? (value[0] ?? 0) : value)
            }
          />
        </Stack>

        <Stack direction="row" spacing={1.25}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AutorenewRoundedIcon />}
            onClick={() => void loadModels(true)}
            disabled={modelsLoading}
            fullWidth
          >
            {t("Refresh model list")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={resetConversation}
            disabled={hasStreamingResponses || turns.length === 0}
            fullWidth
          >
            {t("New conversation")}
          </Button>
        </Stack>
      </Stack>
    );
  }

  function handleStartDesktopResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    resizingDesktopPaneRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function renderConversationPane() {
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          borderRadius: 0,
          border: "none",
          background: isMobile
            ? "transparent"
            : theme.palette.mode === "dark"
              ? "linear-gradient(180deg, rgba(8,16,29,0.96) 0%, rgba(10,18,34,0.98) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(247,250,255,0.96) 100%)",
          boxShadow: "none",
        }}
      >
        <Box
          sx={{
            px: { xs: 2, md: 3 },
            py: 1.5,
            borderBottom: "1px solid",
            borderColor: "divider",
            background:
              theme.palette.mode === "dark"
                ? "linear-gradient(180deg, rgba(8,16,29,0.96) 0%, rgba(10,18,34,0.98) 100%)"
                : alpha("#f8fbff", 0.92),
            backdropFilter: "blur(14px)",
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            justifyContent={{ xs: "flex-start", md: "flex-end" }}
            flexWrap={{ xs: "nowrap", md: "wrap" }}
            useFlexGap
            sx={{
              overflowX: { xs: "auto", md: "visible" },
              overflowY: "hidden",
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": {
                display: "none",
              },
            }}
          >
            {selectedModels.map((modelId) => (
              <Chip
                key={modelId}
                label={formatModelChipLabel(modelId)}
                size="small"
                title={modelId}
                sx={{
                  maxWidth: { xs: 180, md: 240 },
                  "& .MuiChip-label": {
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                }}
              />
            ))}
          </Stack>
        </Box>

        {pageError ? (
          <Box sx={{ px: { xs: 2, md: 3 }, pt: 2, flexShrink: 0 }}>
            <Alert severity="error" onClose={() => setPageError("")}>
              {pageError}
            </Alert>
          </Box>
        ) : null}

        <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
          <Box
            ref={scrollRef}
            sx={{
              height: "100%",
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              px: { xs: 2, md: 3 },
              py: 3,
              background:
                theme.palette.mode === "dark"
                  ? "radial-gradient(circle at top, rgba(59,130,246,0.08), transparent 28%)"
                  : "radial-gradient(circle at top, rgba(59,130,246,0.08), transparent 32%)",
            }}
          >
            <Box ref={contentRef}>
              {turns.length === 0 ? (
                <Box
                  sx={{
                    height: "100%",
                    minHeight: 280,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Paper
                    elevation={0}
                    sx={{
                      maxWidth: 680,
                      px: { xs: 2.5, md: 4 },
                      py: { xs: 3, md: 4 },
                      textAlign: "center",
                      borderRadius: 4,
                      border: `1px dashed ${alpha(theme.palette.primary.main, 0.28)}`,
                      background:
                        theme.palette.mode === "dark"
                          ? alpha("#0f172a", 0.62)
                          : alpha("#ffffff", 0.74),
                    }}
                  >
                    <ForumRoundedIcon
                      sx={{ fontSize: 34, color: "primary.main", mb: 1.5 }}
                    />
                    <Typography variant="h6">
                      {t("Start a conversation")}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 1 }}
                    >
                      {t(
                        "Choose your model setup, then send a prompt from the composer at the bottom.",
                      )}
                    </Typography>
                  </Paper>
                </Box>
              ) : (
                <Stack spacing={3}>
                  {turns.map((turn) => renderTurn(turn))}
                </Stack>
              )}
            </Box>
          </Box>

          <Zoom in={!isAtBottom && turns.length > 0}>
            <Fab
              color="primary"
              size="small"
              aria-label={t("Scroll to bottom")}
              onClick={scrollConversationToBottom}
              sx={{
                position: "absolute",
                right: { xs: 16, md: 20 },
                bottom: { xs: 16, md: 20 },
                boxShadow: `0 18px 40px ${alpha(theme.palette.primary.main, 0.32)}`,
              }}
            >
              <KeyboardArrowDownRoundedIcon />
            </Fab>
          </Zoom>
        </Box>

        <Box
          sx={{
            flexShrink: 0,
            p: { xs: 1.5, md: 2 },
            borderTop: "1px solid",
            borderColor: "divider",
            background:
              theme.palette.mode === "dark"
                ? alpha("#08101d", 0.94)
                : alpha("#fbfdff", 0.94),
            backdropFilter: "blur(18px)",
          }}
        >
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              overflow: "hidden",
              borderRadius: 3.5,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.18)}`,
              background:
                theme.palette.mode === "dark"
                  ? alpha("#101826", 0.94)
                  : "#ffffff",
              boxShadow: `0 18px 40px ${alpha(theme.palette.common.black, 0.08)}`,
            }}
          >
            <TextField
              multiline
              minRows={isMobile ? 1 : 2}
              maxRows={10}
              value={draftPrompt}
              onChange={(event) => setDraftPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !hasStreamingResponses
                ) {
                  event.preventDefault();
                  void handleSendPrompt();
                }
              }}
              placeholder={t(
                "Message the selected model and keep the conversation going...",
              )}
              fullWidth
              disabled={hasStreamingResponses}
              variant="standard"
              sx={{
                width: "calc(100% + 12px)",
                mr: -1.5,
                "& .MuiInputBase-root": {
                  alignItems: "flex-start",
                },
                "& .MuiInputBase-inputMultiline": {
                  boxSizing: "border-box",
                  pr: 1.5,
                },
              }}
              slotProps={{
                input: {
                  disableUnderline: true,
                },
              }}
            />

            <Stack
              direction="row"
              spacing={1.5}
              justifyContent="space-between"
              alignItems="center"
              sx={{ mt: 1 }}
            >
              {!isMobile ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ alignSelf: "center" }}
                >
                  {t("Enter to send, Shift + Enter for newline")}
                </Typography>
              ) : (
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <Chip
                    clickable
                    onClick={() => setControlsOpen(true)}
                    icon={<TuneRoundedIcon sx={{ fontSize: 18 }} />}
                    label={
                      <Stack
                        direction="row"
                        spacing={0.5}
                        alignItems="center"
                        sx={{ minWidth: 0 }}
                      >
                        <Box
                          component="span"
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {mode === "compare"
                            ? t("Compare two models")
                            : t("Single model")}
                        </Box>
                        <KeyboardArrowDownRoundedIcon sx={{ fontSize: 16 }} />
                      </Stack>
                    }
                    variant="outlined"
                    sx={{
                      maxWidth: "100%",
                      height: 34,
                      borderRadius: 999,
                      flexShrink: 1,
                      bgcolor:
                        theme.palette.mode === "dark"
                          ? alpha("#101826", 0.72)
                          : alpha("#f8fbff", 0.96),
                      borderColor: alpha(theme.palette.primary.main, 0.18),
                      boxShadow: `0 8px 18px ${alpha(theme.palette.primary.main, 0.08)}`,
                      "& .MuiChip-label": {
                        display: "block",
                        maxWidth: "100%",
                        px: 1,
                      },
                    }}
                  />
                </Box>
              )}

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  flexShrink: 0,
                }}
              >
                <IconButton
                  color={hasStreamingResponses ? "warning" : "primary"}
                  onClick={
                    hasStreamingResponses
                      ? stopGeneration
                      : () => void handleSendPrompt()
                  }
                  disabled={!hasStreamingResponses && draftPrompt.trim() === ""}
                  aria-label={
                    hasStreamingResponses ? t("Stop generating") : t("Send")
                  }
                  sx={{
                    width: 42,
                    height: 42,
                    border: "1px solid",
                    borderColor: hasStreamingResponses
                      ? "warning.main"
                      : "primary.main",
                    bgcolor: hasStreamingResponses
                      ? alpha(theme.palette.warning.main, 0.08)
                      : alpha(theme.palette.primary.main, 0.08),
                    "&:hover": {
                      bgcolor: hasStreamingResponses
                        ? alpha(theme.palette.warning.main, 0.14)
                        : alpha(theme.palette.primary.main, 0.14),
                    },
                    "&.Mui-disabled": {
                      borderColor: "action.disabledBackground",
                    },
                  }}
                >
                  {hasStreamingResponses ? (
                    <StopRoundedIcon />
                  ) : (
                    <SendRoundedIcon />
                  )}
                </IconButton>
              </Box>
            </Stack>
          </Paper>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
      {isMobile ? (
        <Box
          sx={{
            height: "100%",
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Drawer
            anchor="bottom"
            open={controlsOpen}
            onClose={() => setControlsOpen(false)}
            slotProps={{
              paper: {
                sx: {
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  maxHeight: "85vh",
                },
              },
            }}
          >
            <Box sx={{ p: 2, pb: 3, overflowY: "auto" }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <TuneRoundedIcon color="primary" />
                  <Typography variant="subtitle1">
                    {mode === "compare"
                      ? t("Compare two models")
                      : t("Single model")}
                  </Typography>
                </Stack>
                <IconButton
                  edge="end"
                  aria-label={t("Close")}
                  onClick={() => setControlsOpen(false)}
                >
                  <CloseRoundedIcon />
                </IconButton>
              </Stack>
              {renderControlPanel()}
            </Box>
          </Drawer>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
            {renderConversationPane()}
          </Box>
        </Box>
      ) : (
        <Box
          ref={desktopPaneRef}
          sx={{
            height: "100%",
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: `${desktopControlsWidth}px 1px minmax(0, 1fr)`,
          }}
        >
          <Box
            sx={{
              minHeight: 0,
              display: "flex",
              overflow: "hidden",
              bgcolor: "background.paper",
            }}
          >
            <Box
              sx={{
                p: 2.5,
                width: "100%",
                height: "100%",
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
              }}
            >
              {renderControlPanel()}
            </Box>
          </Box>
          <Box
            role="separator"
            aria-orientation="vertical"
            onMouseDown={handleStartDesktopResize}
            sx={{
              position: "relative",
              minHeight: 0,
              cursor: "col-resize",
              overflow: "visible",
              zIndex: 2,
              "&::before": {
                content: '""',
                position: "absolute",
                top: 0,
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: "12px",
                backgroundColor: "transparent",
              },
              "&::after": {
                content: '""',
                position: "absolute",
                top: 0,
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: "1px",
                bgcolor: "divider",
                transition: "background-color 120ms ease, width 120ms ease",
              },
              "&:hover::after": {
                width: 3,
                bgcolor: "primary.main",
              },
            }}
          />
          <Box
            sx={{
              minHeight: 0,
              display: "flex",
              overflow: "hidden",
              bgcolor: "background.paper",
            }}
          >
            {renderConversationPane()}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default ChatSection;

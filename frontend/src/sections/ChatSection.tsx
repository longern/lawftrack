import { useEffect, useMemo, useRef, useState } from "react";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Fab,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Zoom,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
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

function ChatSection({ isMobile }: ChatSectionProps) {
  const theme = useTheme();
  const { t, formatDateTime } = useI18n();
  const [mode, setMode] = useState<ChatMode>("single");
  const [controlsOpen, setControlsOpen] = useState(!isMobile);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([
    FALLBACK_BASE_MODEL,
  ]);
  const [primaryModel, setPrimaryModel] = useState(FALLBACK_BASE_MODEL);
  const [secondaryModel, setSecondaryModel] = useState(FALLBACK_BASE_MODEL);
  const [modelOptionsError, setModelOptionsError] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pageError, setPageError] = useState("");
  const controllersRef = useRef<AbortController[]>([]);
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
          temperature: 0.7,
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
              modelOptionsError ||
              t("Choose from the model list or enter a model ID directly.")
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

  function renderAssistantBubble(
    response: TurnResponse | undefined,
    label: string,
    accentColor: string,
  ) {
    const reasoningContent = response?.reasoning?.trim() ?? "";
    const responseContent = response?.content ?? "";

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
          ) : null}

          <Typography
            variant="body1"
            sx={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color:
                responseContent.trim() !== ""
                  ? "text.primary"
                  : "text.secondary",
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
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
              },
              gap: 2,
            }}
          >
            {renderAssistantBubble(
              turn.responses.primary,
              t("Model A"),
              "#2563eb",
            )}
            {renderAssistantBubble(
              turn.responses.secondary,
              t("Model B"),
              "#d97706",
            )}
          </Box>
        ) : (
          <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
            <Box sx={{ width: { xs: "100%", md: "78%" } }}>
              {renderAssistantBubble(
                turn.responses.primary,
                t("Response"),
                "#2563eb",
              )}
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

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            label={
              mode === "compare" ? t("Compare two models") : t("Single model")
            }
            color="primary"
            variant="outlined"
          />
          {selectedModels.map((modelId) => (
            <Chip key={modelId} label={modelId} size="small" />
          ))}
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

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "320px minmax(0, 1fr)" },
        gridTemplateRows: { xs: "auto minmax(0, 1fr)", lg: "minmax(0, 1fr)" },
        gap: 2,
      }}
    >
      {isMobile ? (
        <Accordion
          disableGutters
          expanded={controlsOpen}
          onChange={(_, expanded) => setControlsOpen(expanded)}
          sx={{
            borderRadius: 4,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
            background:
              theme.palette.mode === "dark"
                ? alpha("#0b1323", 0.9)
                : alpha("#ffffff", 0.82),
            boxShadow: `0 20px 50px ${alpha(theme.palette.primary.main, 0.08)}`,
            "&:before": { display: "none" },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
            <Stack direction="row" spacing={1} alignItems="center">
              <TuneRoundedIcon color="primary" />
              <Typography variant="subtitle1">
                {mode === "compare"
                  ? t("Compare two models")
                  : t("Single model")}
              </Typography>
            </Stack>
          </AccordionSummary>
          <AccordionDetails>{renderControlPanel()}</AccordionDetails>
        </Accordion>
      ) : (
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            minHeight: 0,
            overflowY: "auto",
            borderRadius: 4,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.16)}`,
            background:
              theme.palette.mode === "dark"
                ? alpha("#0b1323", 0.9)
                : alpha("#ffffff", 0.78),
            boxShadow: `0 20px 50px ${alpha(theme.palette.primary.main, 0.08)}`,
          }}
        >
          {renderControlPanel()}
        </Paper>
      )}

      <Paper
        elevation={0}
        sx={{
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          borderRadius: 4,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.14)}`,
          background:
            theme.palette.mode === "dark"
              ? "linear-gradient(180deg, rgba(8,16,29,0.96) 0%, rgba(10,18,34,0.98) 100%)"
              : "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(247,250,255,0.96) 100%)",
          boxShadow: `0 28px 80px ${alpha(theme.palette.primary.main, 0.12)}`,
        }}
      >
        <Box
          sx={{
            px: { xs: 2, md: 3 },
            py: 2,
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.8)}`,
            background:
              theme.palette.mode === "dark"
                ? alpha("#0f172a", 0.54)
                : alpha("#f8fbff", 0.92),
            backdropFilter: "blur(14px)",
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "center" }}
          >
            <Box>
              <Typography variant="h6">{t("Conversation")}</Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                {mode === "compare"
                  ? t(
                      "Each turn keeps the same user prompt and shows one answer per model.",
                    )
                  : t(
                      "Each turn keeps the shared conversation history for the selected model.",
                    )}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {selectedModels.map((modelId) => (
                <Chip key={modelId} label={modelId} size="small" />
              ))}
              <Chip
                size="small"
                color={hasStreamingResponses ? "warning" : "default"}
                label={hasStreamingResponses ? t("Generating...") : t("Ready")}
              />
            </Stack>
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
            borderTop: `1px solid ${alpha(theme.palette.divider, 0.85)}`,
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
              minRows={2}
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
              slotProps={{
                input: {
                  disableUnderline: true,
                },
              }}
            />

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              justifyContent="space-between"
              alignItems={{ xs: "stretch", sm: "center" }}
              sx={{ mt: 1.25 }}
            >
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  variant="outlined"
                  label={
                    mode === "compare"
                      ? t("Ask both models")
                      : t("Ask one model")
                  }
                />
                {!isMobile ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ alignSelf: "center" }}
                  >
                    {t("Enter to send, Shift + Enter for newline")}
                  </Typography>
                ) : null}
              </Stack>

              <Stack direction="row" spacing={1} justifyContent="flex-end">
                {hasStreamingResponses ? (
                  <Button
                    variant="outlined"
                    startIcon={<StopRoundedIcon />}
                    onClick={stopGeneration}
                  >
                    {t("Stop generating")}
                  </Button>
                ) : null}
                <Button
                  variant="contained"
                  endIcon={<SendRoundedIcon />}
                  onClick={() => void handleSendPrompt()}
                  disabled={hasStreamingResponses || draftPrompt.trim() === ""}
                >
                  {t("Send")}
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Box>
      </Paper>
    </Box>
  );
}

export default ChatSection;

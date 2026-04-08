import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type {
  DatasetMessage,
  DatasetSample,
  DatasetSampleTokenization,
} from "../../types/app";
import type {
  ContinuationDraft,
  TokenCandidate,
  TokenSelection,
} from "./dataWorkspaceTypes";
import { fetchJson } from "./dataWorkspaceApi";

function buildContinuationPreviewEditList(
  sample: DatasetSample,
  selection: TokenSelection,
  originalToken: string,
  replacementToken: string,
  regeneratedFromTokenIndex: number,
  keepRewriteMark = true,
) {
  const previousEdits = sample.edits.filter(
    (edit) =>
      edit.message_index < selection.messageIndex ||
      (edit.message_index === selection.messageIndex &&
        edit.token_index < selection.tokenIndex),
  );
  if (!keepRewriteMark) {
    return previousEdits;
  }
  return [
    ...previousEdits,
    {
      message_index: selection.messageIndex,
      token_index: selection.tokenIndex,
      original_token: originalToken,
      replacement_token: replacementToken,
      regenerated_from_token_index: regeneratedFromTokenIndex,
      created_at: Math.floor(Date.now() / 1000),
    },
  ];
}

function buildContinuationPreviewTokenization(
  tokenization: DatasetSampleTokenization,
  selection: TokenSelection,
) {
  return {
    ...tokenization,
    messages: tokenization.messages.map((message) => {
      if (message.message_index !== selection.messageIndex) {
        return message;
      }
      return {
        ...message,
        tokens: message.tokens.filter(
          (token) => token.token_index < selection.tokenIndex,
        ),
      };
    }),
  };
}

interface UseTokenContinuationParams {
  activeDatasetId: string | null;
  model: string;
  selectedSample: DatasetSample | null;
  selectedSampleTokenization: DatasetSampleTokenization | null;
  selectedToken: TokenSelection | null;
  replacementToken: string;
  tokenCandidates: TokenCandidate[];
  setSelectedToken: Dispatch<SetStateAction<TokenSelection | null>>;
  setReplacementToken: Dispatch<SetStateAction<string>>;
  setTokenCandidates: Dispatch<SetStateAction<TokenCandidate[]>>;
  setCandidatesLoading: Dispatch<SetStateAction<boolean>>;
  setSamples: Dispatch<SetStateAction<DatasetSample[]>>;
  setSampleTokenizations: Dispatch<
    SetStateAction<Record<string, DatasetSampleTokenization>>
  >;
  setSavingSample: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  tokenCandidatesRequestRef: MutableRefObject<number>;
  ensureSampleTokenization: (
    sample: DatasetSample,
  ) => Promise<DatasetSampleTokenization | null>;
  updateCurrentSample: (sample: DatasetSample) => void;
  persistSample: (sample: DatasetSample) => Promise<DatasetSample>;
  t: (message: string, values?: Record<string, string | number>) => string;
}

export function useTokenContinuation({
  activeDatasetId,
  model,
  selectedSample,
  selectedSampleTokenization,
  selectedToken,
  replacementToken,
  tokenCandidates,
  setSelectedToken,
  setReplacementToken,
  setTokenCandidates,
  setCandidatesLoading,
  setSamples,
  setSampleTokenizations,
  setSavingSample,
  setError,
  tokenCandidatesRequestRef,
  ensureSampleTokenization,
  updateCurrentSample,
  persistSample,
  t,
}: UseTokenContinuationParams) {
  const [continuationDraft, setContinuationDraft] =
    useState<ContinuationDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const continuationAbortControllerRef = useRef<AbortController | null>(null);
  const continuationAbortRequestedRef = useRef(false);

  useEffect(
    () => () => {
      continuationAbortRequestedRef.current = true;
      continuationAbortControllerRef.current?.abort();
    },
    [],
  );

  async function tokenizeSampleMessages(
    sampleId: string,
    messages: DatasetMessage[],
  ): Promise<DatasetSampleTokenization> {
    if (!activeDatasetId) {
      throw new Error("Open a dataset before tokenizing samples.");
    }
    return fetchJson<DatasetSampleTokenization>(
      `/api/datasets/${activeDatasetId}/samples/${sampleId}/tokenize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
        }),
      },
    );
  }

  function clearContinuationDraft() {
    setContinuationDraft(null);
  }

  function handleAbortContinuationGeneration() {
    if (!generating) {
      return;
    }
    continuationAbortRequestedRef.current = true;
    continuationAbortControllerRef.current?.abort();
  }

  async function handleGenerateContinuation(options?: {
    replacementTokenOverride?: string;
    keepRewriteMark?: boolean;
  }) {
    if (!activeDatasetId || !selectedSample || !selectedToken) {
      return;
    }
    const keepRewriteMark = options?.keepRewriteMark ?? true;
    const submittedReplacementToken =
      options?.replacementTokenOverride ??
      (replacementToken === "" ? selectedToken.currentToken : replacementToken);
    if (!model) {
      setError(t("Please configure a base model for the current dataset first."));
      return;
    }
    const baseTokenization =
      selectedSampleTokenization ??
      (await ensureSampleTokenization(selectedSample));
    if (!baseTokenization) {
      return;
    }
    const abortController = new AbortController();
    continuationAbortControllerRef.current = abortController;
    continuationAbortRequestedRef.current = false;
    setGenerating(true);
    let latestSample: DatasetSample | null = null;
    let preparation:
      | {
          prompt: string;
          suggested_max_tokens?: number | null;
          prefix: string;
          original_token: string;
          replacement_token: string;
          regenerated_from_token_index: number;
        }
      | null = null;
    let receivedDelta = false;
    try {
      const prepared = await fetchJson<{
        prompt: string;
        suggested_max_tokens?: number | null;
        prefix: string;
        original_token: string;
        replacement_token: string;
        regenerated_from_token_index: number;
      }>(
        `/api/datasets/${activeDatasetId}/samples/${selectedSample.id}/continue_prepare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            message_index: selectedToken.messageIndex,
            token_index: selectedToken.tokenIndex,
            replacement_token: submittedReplacementToken,
          }),
        },
      );
      preparation = prepared;
      const previewEdits = buildContinuationPreviewEditList(
        selectedSample,
        selectedToken,
        prepared.original_token,
        prepared.replacement_token,
        prepared.regenerated_from_token_index,
        keepRewriteMark,
      );
      const previewSample: DatasetSample = {
        ...selectedSample,
        messages: selectedSample.messages.map((message, index) =>
          index !== selectedToken.messageIndex
            ? message
            : {
                ...message,
                content: prepared.prefix,
              },
        ),
        edits: previewEdits,
        anchors: previewEdits,
      };
      setContinuationDraft({
        sample: previewSample,
        tokenization: buildContinuationPreviewTokenization(
          baseTokenization,
          selectedToken,
        ),
        baseTokenization,
      });
      const response = await fetch("/v1/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          model,
          stream: true,
          prompt: prepared.prompt,
          max_tokens:
            typeof prepared.suggested_max_tokens === "number"
              ? prepared.suggested_max_tokens
              : 8192,
          temperature: 0.7,
          skip_special_tokens: false,
          include_stop_str_in_output: true,
        }),
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
      latestSample = previewSample;

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
              text?: string;
            }>;
            error?: { message?: string };
          };
          if (payload.error?.message) {
            throw new Error(payload.error.message);
          }
          const delta = payload.choices?.[0]?.text ?? "";
          if (!delta) {
            continue;
          }
          receivedDelta = true;
          latestSample = {
            ...latestSample,
            messages: latestSample.messages.map((message, index) =>
              index !== selectedToken.messageIndex
                ? message
                : {
                    ...message,
                    content: `${message.content}${delta}`,
                  },
            ),
          };
          const nextSample = latestSample;
          setContinuationDraft((current) =>
            current
              ? {
                  ...current,
                  sample: nextSample,
                }
              : current,
          );
        }
      }
      const finalizedSample: DatasetSample = {
        ...latestSample,
        edits: latestSample.edits.map((edit) =>
          edit.message_index === selectedToken.messageIndex &&
          edit.token_index === selectedToken.tokenIndex
            ? {
                ...edit,
                original_token: prepared.original_token,
                replacement_token: prepared.replacement_token,
                regenerated_from_token_index:
                  prepared.regenerated_from_token_index,
              }
            : edit,
        ),
        anchors:
          latestSample.anchors?.map((edit) =>
            edit.message_index === selectedToken.messageIndex &&
            edit.token_index === selectedToken.tokenIndex
              ? {
                  ...edit,
                  original_token: prepared.original_token,
                  replacement_token: prepared.replacement_token,
                  regenerated_from_token_index:
                    prepared.regenerated_from_token_index,
                }
              : edit,
          ) ?? latestSample.edits,
      };
      const finalTokenization = await tokenizeSampleMessages(
        selectedSample.id,
        finalizedSample.messages,
      );
      setSampleTokenizations((current) => ({
        ...current,
        [selectedSample.id]: finalTokenization,
      }));
      setContinuationDraft({
        sample: finalizedSample,
        tokenization: finalTokenization,
        baseTokenization,
      });
      setSelectedToken({
        ...selectedToken,
        currentToken: prepared.replacement_token,
      });
      setReplacementToken(prepared.replacement_token);
      setError("");
    } catch (generateError) {
      const abortRequested = continuationAbortRequestedRef.current;
      if (abortRequested && latestSample && preparation && receivedDelta) {
        try {
          const partialTokenization = await tokenizeSampleMessages(
            selectedSample.id,
            latestSample.messages,
          );
          setSampleTokenizations((current) => ({
            ...current,
            [selectedSample.id]: partialTokenization,
          }));
          setContinuationDraft({
            sample: latestSample,
            tokenization: partialTokenization,
            baseTokenization,
          });
          setSelectedToken({
            ...selectedToken,
            currentToken: preparation.replacement_token,
          });
          setReplacementToken(preparation.replacement_token);
          setError("");
        } catch (tokenizeError) {
          setContinuationDraft(null);
          setSelectedToken((current) =>
            current
              ? {
                  ...current,
                  currentToken: current.originalToken,
                }
              : current,
          );
          setReplacementToken(selectedToken.originalToken);
          setError(
            tokenizeError instanceof Error
              ? tokenizeError.message
              : t("Failed to refresh token data"),
          );
        }
      } else {
        setContinuationDraft(null);
        setSelectedToken((current) =>
          current
            ? {
                ...current,
                currentToken: current.originalToken,
              }
            : current,
        );
        setReplacementToken(selectedToken.originalToken);
        setError(
          abortRequested
            ? ""
            : generateError instanceof Error
              ? generateError.message
              : t("Failed to generate assistant message"),
        );
      }
    } finally {
      continuationAbortControllerRef.current = null;
      continuationAbortRequestedRef.current = false;
      setGenerating(false);
    }
  }

  async function handleGenerateTopCandidateWithoutRewriteMark() {
    if (!selectedToken || tokenCandidates.length === 0) {
      return;
    }
    const [topCandidate] = [...tokenCandidates].sort((left, right) => {
      if (left.logprob === null && right.logprob === null) {
        return 0;
      }
      if (left.logprob === null) {
        return 1;
      }
      if (right.logprob === null) {
        return -1;
      }
      return right.logprob - left.logprob;
    });
    if (!topCandidate?.text) {
      return;
    }
    setReplacementToken(topCandidate.text);
    await handleGenerateContinuation({
      replacementTokenOverride: topCandidate.text,
      keepRewriteMark: false,
    });
  }

  async function handleAcceptContinuationDraft() {
    if (!selectedSample || !continuationDraft || !selectedToken) {
      return;
    }
    const acceptedSample: DatasetSample = {
      ...continuationDraft.sample,
      edits: continuationDraft.sample.edits.map((edit) => ({
        ...edit,
        regenerated_from_token_index: null,
      })),
      updated_at: Math.floor(Date.now() / 1000),
    };
    updateCurrentSample(acceptedSample);
    setSampleTokenizations((current) => ({
      ...current,
      [acceptedSample.id]: continuationDraft.tokenization,
    }));
    setContinuationDraft(null);
    const activeEdit = acceptedSample.edits.find(
      (edit) =>
        edit.message_index === selectedToken.messageIndex &&
        edit.token_index === selectedToken.tokenIndex,
    );
    setSelectedToken({
      ...selectedToken,
      currentToken: activeEdit?.replacement_token ?? selectedToken.currentToken,
    });
    setTokenCandidates([]);
    setCandidatesLoading(false);
    tokenCandidatesRequestRef.current += 1;
    setSavingSample(true);
    try {
      const updated = await persistSample(acceptedSample);
      setSamples((current) =>
        current.map((sample) => (sample.id === updated.id ? updated : sample)),
      );
      setError("");
      setSampleTokenizations((current) => ({
        ...current,
        [updated.id]: continuationDraft.tokenization,
      }));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Auto-save failed after accepting rewrite",
      );
    } finally {
      setSavingSample(false);
    }
  }

  function handleDiscardContinuationDraft() {
    if (!continuationDraft || !selectedSample) {
      return;
    }
    setSampleTokenizations((current) => ({
      ...current,
      [selectedSample.id]: continuationDraft.baseTokenization,
    }));
    setContinuationDraft(null);
    setSelectedToken((current) =>
      current
        ? {
            ...current,
            currentToken: current.originalToken,
          }
        : null,
    );
    setReplacementToken(selectedToken?.originalToken ?? "");
    setTokenCandidates([]);
    setCandidatesLoading(false);
    tokenCandidatesRequestRef.current += 1;
  }

  return {
    continuationDraft,
    generating,
    clearContinuationDraft,
    handleAbortContinuationGeneration,
    handleGenerateContinuation,
    handleGenerateTopCandidateWithoutRewriteMark,
    handleAcceptContinuationDraft,
    handleDiscardContinuationDraft,
  };
}

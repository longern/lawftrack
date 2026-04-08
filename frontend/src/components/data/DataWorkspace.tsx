import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
} from "@mui/material";
import type {
  ApiListResponse,
  DatasetFileExport,
  DatasetMessage,
  DatasetRecord,
  DatasetSample,
  DatasetSampleTokenization,
} from "../../types/app";
import { WorkspaceShell } from "./DataWorkspaceShell";
import { useI18n } from "../../i18n";
import type { DatasetDraft, TokenCandidate, TokenSelection } from "./dataWorkspaceTypes";
import {
  FALLBACK_BASE_MODEL,
  type RemoteModelRecord,
  listModelOptionIds,
  resolvePreferredBaseModel,
} from "../../utils/modelSelection";
import {
  buildNextDatasetName,
  decodeCandidateToken,
  fetchJson,
} from "./dataWorkspaceApi";
import { useTokenContinuation } from "./useTokenContinuation";

interface DataWorkspaceProps {
  isMobile: boolean;
  initialDatasetId?: string | null;
  onDatasetOpen?: (dataset: DatasetRecord) => void;
  onInitialDatasetHandled?: () => void;
}

function DataWorkspace({
  isMobile,
  initialDatasetId,
  onDatasetOpen,
  onInitialDatasetHandled,
}: DataWorkspaceProps) {
  const { t } = useI18n();
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [datasetTabs, setDatasetTabs] = useState<DatasetRecord[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [recentDatasetIds, setRecentDatasetIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<DatasetDraft | null>(null);
  const [samples, setSamples] = useState<DatasetSample[]>([]);
  const [sampleTokenizations, setSampleTokenizations] = useState<
    Record<string, DatasetSampleTokenization>
  >({});
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [dirtySampleIds, setDirtySampleIds] = useState<string[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenSelection | null>(
    null,
  );
  const [replacementToken, setReplacementToken] = useState("");
  const [tokenCandidates, setTokenCandidates] = useState<TokenCandidate[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingSample, setSavingSample] = useState(false);
  const [exportingDataset, setExportingDataset] = useState(false);
  const [generatingAssistant, setGeneratingAssistant] = useState(false);
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);
  const [mobileSamplesOpen, setMobileSamplesOpen] = useState(false);
  const [mobileMetadataOpen, setMobileMetadataOpen] = useState(false);
  const [desktopExplorerCollapsed, setDesktopExplorerCollapsed] =
    useState(true);
  const [datasetToDelete, setDatasetToDelete] = useState<DatasetRecord | null>(
    null,
  );
  const [sampleToDelete, setSampleToDelete] = useState<DatasetSample | null>(
    null,
  );
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [preferredBaseModel, setPreferredBaseModel] =
    useState(FALLBACK_BASE_MODEL);
  const preferredBaseModelRef = useRef(FALLBACK_BASE_MODEL);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelOptionsError, setModelOptionsError] = useState("");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const tokenCandidatesRequestRef = useRef(0);
  const samplesRef = useRef<DatasetSample[]>([]);
  const lastOpenedDatasetStorageKey = "lawftrack:last-opened-dataset-id";

  const activeDataset =
    datasetTabs.find((tab) => tab.id === activeDatasetId) ?? null;
  const recentDatasets = useMemo(
    () =>
      recentDatasetIds
        .map((id) => datasets.find((dataset) => dataset.id === id))
        .filter((dataset): dataset is DatasetRecord => Boolean(dataset)),
    [datasets, recentDatasetIds],
  );
  const selectedSample =
    samples.find((sample) => sample.id === selectedSampleId) ??
    samples[0] ??
    null;
  const selectedSampleTokenization = selectedSample
    ? (sampleTokenizations[selectedSample.id] ?? null)
    : null;
  const currentModel = draft?.base_model.trim() || activeDataset?.base_model || "";
  const {
    continuationDraft,
    generating,
    clearContinuationDraft,
    handleAbortContinuationGeneration,
    handleGenerateContinuation,
    handleGenerateTopCandidateWithoutRewriteMark,
    handleAcceptContinuationDraft,
    handleDiscardContinuationDraft,
  } = useTokenContinuation({
    activeDatasetId: activeDataset?.id ?? null,
    model: currentModel,
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
  });
  const visibleSample = continuationDraft?.sample ?? selectedSample;
  const visibleSampleTokenization =
    continuationDraft?.tokenization ?? selectedSampleTokenization;
  const selectedTokenHasRewriteMark = Boolean(
    !continuationDraft &&
    selectedSample &&
    selectedToken &&
    selectedSample.edits.find(
      (edit) =>
        edit.message_index === selectedToken.messageIndex &&
        edit.token_index === selectedToken.tokenIndex,
    ),
  );
  const tokenSequence = useMemo(
    () =>
      (visibleSampleTokenization?.messages ?? []).flatMap((message) =>
        message.role === "assistant"
          ? message.tokens.map((token) => ({
              messageIndex: message.message_index,
              tokenIndex: token.token_index,
            }))
          : [],
      ),
    [visibleSampleTokenization],
  );
  const selectedTokenSequenceIndex = useMemo(
    () =>
      selectedToken
        ? tokenSequence.findIndex(
            (token) =>
              token.messageIndex === selectedToken.messageIndex &&
              token.tokenIndex === selectedToken.tokenIndex,
          )
        : -1,
    [selectedToken, tokenSequence],
  );

  useEffect(() => {
    samplesRef.current = samples;
  }, [samples]);

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  useEffect(() => {
    void loadModelOptions();
  }, []);

  useEffect(() => {
    const savedDatasetId = window.localStorage.getItem(
      lastOpenedDatasetStorageKey,
    );
    if (savedDatasetId) {
      setRecentDatasetIds([savedDatasetId]);
    }
  }, []);

  useEffect(() => {
    if (!initialDatasetId || activeDatasetId === initialDatasetId) {
      return;
    }
    const initialDataset = datasets.find(
      (dataset) => dataset.id === initialDatasetId,
    );
    if (!initialDataset) {
      return;
    }
    openDataset(initialDataset);
    onInitialDatasetHandled?.();
  }, [activeDatasetId, datasets, initialDatasetId, onInitialDatasetHandled]);

  useEffect(() => {
    if (!activeDataset) {
      setDraft(null);
      setSamples([]);
      setSampleTokenizations({});
      setSelectedSampleId(null);
      setSelectedToken(null);
      setTokenCandidates([]);
      clearContinuationDraft();
      setCandidatesLoading(false);
      setError("");
      tokenCandidatesRequestRef.current += 1;
      return;
    }
    setDraft({
      name: activeDataset.name,
      base_model: activeDataset.base_model ?? preferredBaseModelRef.current,
    });
    void loadSamples(activeDataset.id);
  }, [activeDataset]);

  useEffect(() => {
    const previousPreferredBaseModel = preferredBaseModelRef.current;
    preferredBaseModelRef.current = preferredBaseModel;
    if (!activeDataset || activeDataset.base_model?.trim()) {
      return;
    }
    setDraft((current) => {
      if (!current) {
        return current;
      }
      if (
        current.base_model.trim() !== "" &&
        current.base_model !== previousPreferredBaseModel
      ) {
        return current;
      }
      return {
        ...current,
        base_model: preferredBaseModel,
      };
    });
  }, [activeDataset, preferredBaseModel]);

  useEffect(() => {
    if (!selectedSample) {
      setSelectedToken(null);
      setReplacementToken("");
      setTokenCandidates([]);
      clearContinuationDraft();
      setCandidatesLoading(false);
      tokenCandidatesRequestRef.current += 1;
      return;
    }
    if (!selectedSampleId) {
      setSelectedSampleId(selectedSample.id);
    }
  }, [selectedSample, selectedSampleId]);

  useEffect(() => {
    if (
      !activeDataset ||
      !selectedSample ||
      generatingAssistant ||
      dirtySampleIds.includes(selectedSample.id)
    ) {
      return;
    }
    void ensureSampleTokenization(selectedSample);
  }, [
    activeDataset,
    selectedSample,
    draft?.base_model,
    generatingAssistant,
    dirtySampleIds,
  ]);

  function buildSampleSignature(sample: DatasetSample) {
    return JSON.stringify(
      {
        messages: sample.messages.map((message) => ({
          role: message.role,
          content: message.content,
          tool_call_id: message.tool_call_id ?? null,
          name: message.name ?? null,
        })),
        tools: sample.tools ?? [],
      },
    );
  }

  function downloadBlob(content: BlobPart, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function refreshWorkspace() {
    setLoading(true);
    try {
      const datasetsPayload =
        await fetchJson<ApiListResponse<DatasetRecord>>("/api/datasets");
      setDatasets(datasetsPayload.data);
      setError("");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("Failed to delete dataset"),
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadModelOptions(force = false) {
    if (modelsLoading || (modelsLoaded && !force)) {
      return;
    }
    setModelsLoading(true);
    try {
      const payload =
        await fetchJson<ApiListResponse<RemoteModelRecord>>("/v1/models");
      const options = listModelOptionIds(payload.data);
      setModelOptions(options);
      setPreferredBaseModel(
        resolvePreferredBaseModel(payload.data) ?? FALLBACK_BASE_MODEL,
      );
      setModelOptionsError("");
      setModelsLoaded(true);
    } catch (loadError) {
      setModelOptionsError(
        loadError instanceof Error
          ? loadError.message
          : t("Failed to load models"),
      );
      setModelsLoaded(true);
    } finally {
      setModelsLoading(false);
    }
  }

  async function loadSamples(datasetId: string) {
    setSamplesLoading(true);
    try {
      const payload = await fetchJson<ApiListResponse<DatasetSample>>(
        `/api/datasets/${datasetId}/samples`,
      );
      setSamples(payload.data);
      setSelectedSampleId(payload.data[0]?.id ?? null);
      setSelectedToken(null);
      setReplacementToken("");
      setTokenCandidates([]);
      clearContinuationDraft();
      setCandidatesLoading(false);
      tokenCandidatesRequestRef.current += 1;
      setDirtySampleIds([]);
      setSampleTokenizations({});
      setError("");
    } catch (loadError) {
      setSamples([]);
      setSampleTokenizations({});
      setSelectedSampleId(null);
      clearContinuationDraft();
      setCandidatesLoading(false);
      tokenCandidatesRequestRef.current += 1;
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("Failed to delete sample"),
      );
    } finally {
      setSamplesLoading(false);
    }
  }

  function openDataset(dataset: DatasetRecord) {
    window.localStorage.setItem(lastOpenedDatasetStorageKey, dataset.id);
    onDatasetOpen?.(dataset);
    setRecentDatasetIds((current) =>
      [dataset.id, ...current.filter((id) => id !== dataset.id)].slice(0, 6),
    );
    setMobileExplorerOpen(false);
    setDatasetTabs((currentTabs) => {
      if (currentTabs.some((tab) => tab.id === dataset.id)) {
        setActiveDatasetId(dataset.id);
        return currentTabs;
      }
      setActiveDatasetId(dataset.id);
      return [...currentTabs, dataset];
    });
  }

  async function handleCreateDataset() {
    setCreating(true);
    try {
      const nextName = buildNextDatasetName(datasets);
      const created = await fetchJson<DatasetRecord>("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          base_model: preferredBaseModel,
        }),
      });
      setDatasets((current) => [created, ...current]);
      openDataset(created);
      setError("");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("Failed to delete dataset"),
      );
    } finally {
      setCreating(false);
    }
  }

  function handleOpenNextDataset() {
    const nextDataset = datasets.find(
      (dataset) => !datasetTabs.some((tab) => tab.id === dataset.id),
    );
    if (nextDataset) {
      openDataset(nextDataset);
    }
  }

  function handleCloseDataset(datasetId: string) {
    setDatasetTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.id !== datasetId);
      if (activeDatasetId === datasetId) {
        setActiveDatasetId(
          nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : null,
        );
      }
      return nextTabs;
    });
    setError("");
  }

  async function handleSaveDataset() {
    if (!activeDataset || !draft) {
      return;
    }
    setSaving(true);
    try {
      const updated = await fetchJson<DatasetRecord>(
        `/api/datasets/${activeDataset.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: draft.name.trim() || activeDataset.name,
            base_model: draft.base_model.trim(),
          }),
        },
      );
      setDatasets((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setDatasetTabs((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setActiveDatasetId(updated.id);
      setError("");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("Failed to delete dataset"),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleExportDataset() {
    if (!activeDataset) {
      return;
    }
    setExportingDataset(true);
    try {
      const exported = await fetchJson<DatasetFileExport>(
        `/api/datasets/${activeDataset.id}/export`,
        {
          method: "POST",
        },
      );
      const response = await fetch(`/v1/files/${exported.file.id}/content`);
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }
      const content = await response.text();
      downloadBlob(
        content,
        exported.file.filename,
        exported.file.content_type || "application/json",
      );
      setError("");
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : t("Failed to export dataset"),
      );
    } finally {
      setExportingDataset(false);
    }
  }

  async function handleImportDataset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setCreating(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const imported = await fetchJson<DatasetRecord>("/api/datasets/import", {
        method: "POST",
        body: formData,
      });
      await refreshWorkspace();
      openDataset(imported);
      setError("");
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : t("Failed to delete dataset"),
      );
    } finally {
      setCreating(false);
      event.target.value = "";
    }
  }

  async function handleCreateSample() {
    if (!activeDataset) {
      return;
    }
    setSavingSample(true);
    try {
      const created = await fetchJson<DatasetSample>(
        `/api/datasets/${activeDataset.id}/samples`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `Sample ${samples.length + 1}`,
          }),
        },
      );
      setSamples((current) => [...current, created]);
      setSelectedSampleId(created.id);
      setSelectedToken(null);
      setReplacementToken("");
      setTokenCandidates([]);
      clearContinuationDraft();
      setCandidatesLoading(false);
      tokenCandidatesRequestRef.current += 1;
      setError("");
      setMobileSamplesOpen(false);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t("Failed to delete sample"),
      );
    } finally {
      setSavingSample(false);
    }
  }

  function updateCurrentSample(nextSample: DatasetSample) {
    setSamples((current) =>
      current.map((sample) =>
        sample.id === nextSample.id ? nextSample : sample,
      ),
    );
    setDirtySampleIds((current) =>
      current.includes(nextSample.id) ? current : [...current, nextSample.id],
    );
    setSampleTokenizations((current) => {
      const next = { ...current };
      delete next[nextSample.id];
      return next;
    });
  }

  function updateSelectedSample(
    updater: (sample: DatasetSample) => DatasetSample,
  ) {
    if (!selectedSample) {
      return;
    }
    const nextSample = updater(selectedSample);
    updateCurrentSample({
      ...nextSample,
      edits: [],
      updated_at: Math.floor(Date.now() / 1000),
    });
    setSelectedToken(null);
    setReplacementToken("");
    setTokenCandidates([]);
    clearContinuationDraft();
    setCandidatesLoading(false);
    tokenCandidatesRequestRef.current += 1;
  }

  function updateSelectedSampleMessages(
    updater: (messages: DatasetMessage[]) => DatasetMessage[],
  ) {
    updateSelectedSample((sample) => ({
      ...sample,
      messages: updater(sample.messages),
    }));
  }

  function updateSelectedSampleTitle(title: string) {
    updateSelectedSample((sample) => ({
      ...sample,
      title,
    }));
  }

  async function ensureSampleTokenization(
    sample: DatasetSample,
  ): Promise<DatasetSampleTokenization | null> {
    const model = draft?.base_model.trim() || activeDataset?.base_model || "";
    if (!model || !activeDataset) {
      setError(
        t("Please configure a base model for the current dataset first."),
      );
      return null;
    }
    const cached = sampleTokenizations[sample.id];
    if (cached) {
      return cached;
    }
    const signature = buildSampleSignature(sample);
    try {
      const tokenization = await fetchJson<DatasetSampleTokenization>(
        `/api/datasets/${activeDataset.id}/samples/${sample.id}/tokenize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        },
      );
      const latestSample = samplesRef.current.find(
        (item) => item.id === sample.id,
      );
      if (!latestSample || buildSampleSignature(latestSample) !== signature) {
        return null;
      }
      setSampleTokenizations((current) => ({
        ...current,
        [sample.id]: tokenization,
      }));
      return tokenization;
    } catch (tokenizeError) {
      setError(
        tokenizeError instanceof Error
          ? tokenizeError.message
          : t("Failed to refresh token data"),
      );
      return null;
    }
  }

  async function handleSelectToken(
    messageIndex: number,
    tokenIndex: number,
  ) {
    if (!visibleSample || continuationDraft) {
      return;
    }
    const tokenization = await ensureSampleTokenization(visibleSample);
    if (!tokenization) {
      return;
    }
    await selectResolvedToken(
      visibleSample,
      tokenization,
      messageIndex,
      tokenIndex,
    );
  }

  async function selectResolvedToken(
    sample: DatasetSample,
    tokenization: DatasetSampleTokenization,
    messageIndex: number,
    tokenIndex: number,
  ) {
    const message = tokenization.messages.find(
      (item) => item.message_index === messageIndex,
    );
    const tokenList = message?.tokens;
    const token = tokenList?.find((item) => item.token_index === tokenIndex);
    if (!token) {
      return;
    }
    const tokenText = token.text || token.token;
    setTokenCandidates([]);
    setSelectedToken({
      messageIndex,
      tokenIndex,
      currentToken: tokenText,
      originalToken: tokenText,
    });
    setReplacementToken(tokenText);
    void loadTokenCandidates(sample, tokenization, messageIndex, tokenIndex);
  }

  async function handleSelectAdjacentToken(direction: -1 | 1) {
    if (!visibleSample || continuationDraft || !selectedToken) {
      return;
    }
    const tokenization =
      visibleSampleTokenization ??
      (await ensureSampleTokenization(visibleSample));
    if (!tokenization) {
      return;
    }
    const currentIndex = tokenSequence.findIndex(
      (token) =>
        token.messageIndex === selectedToken.messageIndex &&
        token.tokenIndex === selectedToken.tokenIndex,
    );
    const nextToken = tokenSequence[currentIndex + direction];
    if (!nextToken) {
      return;
    }
    await selectResolvedToken(
      visibleSample,
      tokenization,
      nextToken.messageIndex,
      nextToken.tokenIndex,
    );
  }

  function clearSelectedToken() {
    setSelectedToken(null);
    setReplacementToken("");
    setTokenCandidates([]);
    setCandidatesLoading(false);
    tokenCandidatesRequestRef.current += 1;
  }

  async function loadTokenCandidates(
    sample: DatasetSample,
    tokenization: DatasetSampleTokenization | null,
    messageIndex: number,
    tokenIndex: number,
  ) {
    if (!draft || !activeDataset || !tokenization) {
      return;
    }
    const model = draft.base_model.trim() || activeDataset.base_model || "";
    if (!model) {
      return;
    }

    const targetMessage = sample.messages[messageIndex];
    const messageTokenization = tokenization.messages.find(
      (item) => item.message_index === messageIndex,
    );
    const tokenList = messageTokenization?.tokens;
    const targetToken = tokenList?.find(
      (item) => item.token_index === tokenIndex,
    );
    if (
      !targetMessage ||
      targetMessage.role !== "assistant" ||
      !messageTokenization ||
      !targetToken
    ) {
      return;
    }

    const requestId = tokenCandidatesRequestRef.current + 1;
    tokenCandidatesRequestRef.current = requestId;
    setCandidatesLoading(true);
    try {
      const payload = await fetchJson<{
        data?: Array<{
          text?: string;
          logprob?: number | null;
        }>;
      }>(
        `/api/datasets/${activeDataset.id}/samples/${sample.id}/candidate_tokens`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            message_index: messageIndex,
            token_index: tokenIndex,
            top_logprobs: 10,
          }),
        },
      );
      const seen = new Set<string>();
      const nextCandidates = (payload.data ?? [])
        .map((candidate) => ({
          text: decodeCandidateToken(candidate.text),
          logprob:
            typeof candidate.logprob === "number" ? candidate.logprob : null,
        }))
        .filter((candidate) => candidate.text)
        .filter((candidate) => {
          if (seen.has(candidate.text)) {
            return false;
          }
          seen.add(candidate.text);
          return true;
        })
        .sort((left, right) => {
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
        })
        .slice(0, 10);
      if (tokenCandidatesRequestRef.current === requestId) {
        setTokenCandidates(nextCandidates);
      }
    } catch {
      if (tokenCandidatesRequestRef.current === requestId) {
        setTokenCandidates([]);
      }
    } finally {
      if (tokenCandidatesRequestRef.current === requestId) {
        setCandidatesLoading(false);
      }
    }
  }

  async function handleSaveSample() {
    if (!activeDataset || !selectedSample || continuationDraft) {
      return;
    }
    setSavingSample(true);
    try {
      const updated = await persistSample(selectedSample);
      setSamples((current) =>
        current.map((sample) => (sample.id === updated.id ? updated : sample)),
      );
      setError("");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("Failed to delete sample"),
      );
    } finally {
      setSavingSample(false);
    }
  }

  async function handleGenerateAssistantMessage() {
    if (!activeDataset || !draft || !selectedSample || continuationDraft) {
      return;
    }
    const model = draft.base_model.trim() || activeDataset.base_model || "";
    if (!model) {
      setError(
        t("Please configure a base model for the current dataset first."),
      );
      return;
    }

    const lastMessage =
      selectedSample.messages[selectedSample.messages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage.content.trim()) {
      setError(
        t(
          "The last assistant message already has content. Clear or remove it before generating again.",
        ),
      );
      return;
    }
    const promptMessages =
      lastMessage?.role === "assistant"
        ? selectedSample.messages.slice(0, -1)
        : selectedSample.messages;
    if (promptMessages.length === 0) {
      setError(t("Keep at least one message before generating."));
      return;
    }
    const shouldFillExistingAssistant =
      lastMessage?.role === "assistant" && !lastMessage.content.trim();
    const optimisticMessages = shouldFillExistingAssistant
      ? selectedSample.messages.map((message, index) =>
          index === selectedSample.messages.length - 1
            ? { ...message, content: "" }
            : message,
        )
      : [...selectedSample.messages, { role: "assistant", content: "" }];

    setGeneratingAssistant(true);
    clearSelectedToken();
    const originalSample = selectedSample;
    let shouldRestoreOriginal = true;
    let latestSample = originalSample;
    updateCurrentSample({
      ...selectedSample,
      messages: optimisticMessages,
      edits: [],
      updated_at: Math.floor(Date.now() / 1000),
    });

    try {
      const promptPayload = await fetchJson<{
        prompt: string;
        suggested_max_tokens?: number | null;
      }>("/api/datasets/render_completion_prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: promptMessages,
          tools: selectedSample.tools ?? [],
        }),
      });
      const response = await fetch("/v1/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: promptPayload.prompt,
          stream: true,
          max_tokens:
            typeof promptPayload.suggested_max_tokens === "number"
              ? promptPayload.suggested_max_tokens
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
      const assistantIndex = optimisticMessages.length - 1;
      let buffer = "";
      let rawAssistantText = "";
      let receivedDelta = false;

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

          shouldRestoreOriginal = false;
          receivedDelta = true;
          rawAssistantText += delta;
          latestSample = {
            ...originalSample,
            messages: optimisticMessages.map((message, index) =>
              index === assistantIndex
                ? {
                    ...message,
                    content: rawAssistantText,
                  }
                : message,
            ),
            edits: [],
            updated_at: Math.floor(Date.now() / 1000),
          };
          updateCurrentSample(latestSample);
        }
      }

      if (!receivedDelta) {
        throw new Error(
          t(
            "The model returned no writable delta, so generation could not continue.",
          ),
        );
      }
      const persisted = await persistSample(latestSample);
      setSamples((current) =>
        current.map((sample) =>
          sample.id === persisted.id ? persisted : sample,
        ),
      );
      setError("");
    } catch (generateError) {
      if (shouldRestoreOriginal) {
        updateCurrentSample(originalSample);
      }
      setError(
        generateError instanceof Error
          ? generateError.message
          : t("Failed to delete sample"),
      );
    } finally {
      setGeneratingAssistant(false);
    }
  }

  async function handleDeleteDataset() {
    if (!datasetToDelete) {
      return;
    }
    const deletingId = datasetToDelete.id;
    setCreating(true);
    try {
      await fetchJson<{ deleted: boolean }>(`/api/datasets/${deletingId}`, {
        method: "DELETE",
      });
      setDatasets((current) =>
        current.filter((dataset) => dataset.id !== deletingId),
      );
      setDatasetTabs((current) => {
        const nextTabs = current.filter((dataset) => dataset.id !== deletingId);
        if (activeDatasetId === deletingId) {
          setActiveDatasetId(nextTabs[nextTabs.length - 1]?.id ?? null);
        }
        return nextTabs;
      });
      setRecentDatasetIds((current) =>
        current.filter((id) => id !== deletingId),
      );
      if (selectedSampleId && activeDatasetId === deletingId) {
        setSelectedSampleId(null);
      }
      setDatasetToDelete(null);
      setError("");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("Failed to delete dataset"),
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteSample() {
    if (!activeDataset || !sampleToDelete) {
      return;
    }
    const deletingSampleId = sampleToDelete.id;
    setSavingSample(true);
    try {
      await fetchJson<{ deleted: boolean }>(
        `/api/datasets/${activeDataset.id}/samples/${deletingSampleId}`,
        { method: "DELETE" },
      );
      const nextSamples = samples.filter(
        (sample) => sample.id !== deletingSampleId,
      );
      setSamples(nextSamples);
      setSelectedSampleId((current) => {
        if (current !== deletingSampleId) {
          return current;
        }
        return nextSamples[0]?.id ?? null;
      });
      setDirtySampleIds((current) =>
        current.filter((sampleId) => sampleId !== deletingSampleId),
      );
      setSampleTokenizations((current) => {
        const next = { ...current };
        delete next[deletingSampleId];
        return next;
      });
      if (selectedSampleId === deletingSampleId) {
        clearContinuationDraft();
        clearSelectedToken();
      }
      setSampleToDelete(null);
      setError("");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("Failed to delete sample"),
      );
    } finally {
      setSavingSample(false);
    }
  }

  async function refreshPersistedSampleTokenization(sample: DatasetSample) {
    const model = draft?.base_model.trim() || activeDataset?.base_model || "";
    if (!activeDataset || !model) {
      return;
    }
    try {
      const tokenization = await fetchJson<DatasetSampleTokenization>(
        `/api/datasets/${activeDataset.id}/samples/${sample.id}/tokenize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        },
      );
      setSampleTokenizations((current) => ({
        ...current,
        [sample.id]: tokenization,
      }));
    } catch (tokenizeError) {
      setError(
        tokenizeError instanceof Error
          ? tokenizeError.message
          : t("Failed to refresh token data"),
      );
    }
  }

  async function persistSample(sample: DatasetSample): Promise<DatasetSample> {
    if (!activeDataset) {
      throw new Error(t("Open a dataset before saving samples."));
    }
    const updated = await fetchJson<DatasetSample>(
      `/api/datasets/${activeDataset.id}/samples/${sample.id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sample.title,
          messages: sample.messages,
          tools: sample.tools ?? [],
          edits: sample.edits,
        }),
      },
    );
    setDirtySampleIds((current) =>
      current.filter((sampleId) => sampleId !== updated.id),
    );
    await refreshPersistedSampleTokenization(updated);
    return updated;
  }

  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        minHeight: 0,
        borderRadius: 0,
        overflow: "hidden",
        border: 0,
        bgcolor: (theme) =>
          theme.palette.mode === "dark"
            ? "#0f172a"
            : theme.palette.background.paper,
      }}
    >
      <WorkspaceShell
        activeDataset={activeDataset}
        creating={creating}
        datasets={datasets}
        datasetTabs={datasetTabs}
        draft={draft}
        error={error}
        onClearError={() => setError("")}
        importInputRef={importInputRef}
        isMobile={isMobile}
        loading={loading}
        mobileExplorerOpen={mobileExplorerOpen}
        mobileSamplesOpen={mobileSamplesOpen}
        mobileMetadataOpen={mobileMetadataOpen}
        desktopExplorerCollapsed={desktopExplorerCollapsed}
        recentDatasets={recentDatasets}
        modelOptions={modelOptions}
        modelOptionsError={modelOptionsError}
        modelsLoading={modelsLoading}
        onChangeDraft={setDraft}
        onCloseDataset={handleCloseDataset}
        onCreateDataset={() => void handleCreateDataset()}
        onDeleteDataset={(dataset) => setDatasetToDelete(dataset)}
        onExportDataset={() => void handleExportDataset()}
        onImportDataset={handleImportDataset}
        onOpenDataset={openDataset}
        onOpenNextDataset={handleOpenNextDataset}
        onLoadModelOptions={() => void loadModelOptions(true)}
        onSaveDataset={() => void handleSaveDataset()}
        onSelectDataset={setActiveDatasetId}
        onSetDesktopExplorerCollapsed={setDesktopExplorerCollapsed}
        onSetMobileExplorerOpen={setMobileExplorerOpen}
        onSetMobileSamplesOpen={setMobileSamplesOpen}
        onSetMobileMetadataOpen={setMobileMetadataOpen}
        samples={samples}
        samplesLoading={samplesLoading}
        selectedSample={visibleSample}
        selectedSampleTokenization={visibleSampleTokenization}
        selectedSampleId={selectedSampleId}
        dirtySampleIds={dirtySampleIds}
        selectedToken={selectedToken}
        tokenCandidates={tokenCandidates}
        candidatesLoading={candidatesLoading}
        hasContinuationDraft={Boolean(continuationDraft)}
        selectedTokenHasRewriteMark={selectedTokenHasRewriteMark}
        replacementToken={replacementToken}
        generating={generating}
        onAbortGeneration={handleAbortContinuationGeneration}
        generatingAssistant={generatingAssistant}
        saving={saving}
        exportingDataset={exportingDataset}
        savingSample={savingSample}
        onCreateSample={() => void handleCreateSample()}
        onDeleteSample={(sample) => setSampleToDelete(sample)}
        onGenerateAssistantMessage={() => void handleGenerateAssistantMessage()}
        onGenerateContinuation={() => void handleGenerateContinuation()}
        onGenerateTopCandidateWithoutRewriteMark={() =>
          void handleGenerateTopCandidateWithoutRewriteMark()
        }
        onAcceptContinuationDraft={handleAcceptContinuationDraft}
        onDiscardContinuationDraft={handleDiscardContinuationDraft}
        onSaveSample={() => void handleSaveSample()}
        onClearSelectedToken={clearSelectedToken}
        onSelectAdjacentToken={handleSelectAdjacentToken}
        onUpdateSelectedSampleTitle={updateSelectedSampleTitle}
        onUpdateSelectedSampleMessages={updateSelectedSampleMessages}
        hasNextToken={
          selectedTokenSequenceIndex >= 0 &&
          selectedTokenSequenceIndex < tokenSequence.length - 1
        }
        hasPrevToken={selectedTokenSequenceIndex > 0}
        onSelectSample={(sampleId) => {
          setSelectedSampleId(sampleId);
          clearContinuationDraft();
          clearSelectedToken();
        }}
        onSelectToken={handleSelectToken}
        onSetReplacementToken={setReplacementToken}
      />

      <Dialog
        open={Boolean(datasetToDelete)}
        onClose={() => setDatasetToDelete(null)}
        PaperProps={{
          sx: {
            bgcolor: "background.paper",
            color: "text.primary",
            borderRadius: 3,
            minWidth: { xs: "auto", sm: 420 },
          },
        }}
      >
        <DialogTitle>{t("Delete dataset")}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "text.secondary" }}>
            {datasetToDelete
              ? t(
                  'Are you sure you want to delete dataset "{name}"? This will remove the dataset and all of its samples permanently.',
                  { name: datasetToDelete.name },
                )
              : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setDatasetToDelete(null)}
            sx={{ color: "text.secondary" }}
          >
            {t("Cancel")}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleDeleteDataset()}
            disabled={creating}
          >
            {creating ? t("Deleting...") : t("Confirm delete")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(sampleToDelete)}
        onClose={() => setSampleToDelete(null)}
        PaperProps={{
          sx: {
            bgcolor: "background.paper",
            color: "text.primary",
            borderRadius: 3,
            minWidth: { xs: "auto", sm: 420 },
          },
        }}
      >
        <DialogTitle>{t("Delete sample")}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "text.secondary" }}>
            {sampleToDelete
              ? t(
                  'Are you sure you want to delete sample "{title}"? This action cannot be undone.',
                  { title: sampleToDelete.title },
                )
              : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => setSampleToDelete(null)}
            sx={{ color: "text.secondary" }}
          >
            {t("Cancel")}
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => void handleDeleteSample()}
            disabled={savingSample}
          >
            {savingSample ? t("Deleting...") : t("Confirm delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default DataWorkspace;

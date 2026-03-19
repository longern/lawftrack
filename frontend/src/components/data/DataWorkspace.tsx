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
  DatasetMessage,
  DatasetRecord,
  DatasetSample,
  DatasetSampleTokenization,
  DataSummaryItem,
  UploadedFile,
} from "../../types/app";
import { DatasetHome } from "./DatasetHome";
import { WorkspaceShell } from "./DataWorkspaceShell";
import type { DatasetDraft, TokenCandidate, TokenSelection } from "./dataWorkspaceTypes";

interface DataWorkspaceProps {
  dataSummary: DataSummaryItem[];
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

function decodeCandidateToken(token?: string, bytes?: number[]): string {
  if (Array.isArray(bytes) && bytes.length > 0) {
    try {
      return new TextDecoder().decode(new Uint8Array(bytes));
    } catch {
      return token ?? "";
    }
  }
  return token ?? "";
}

function DataWorkspace({ dataSummary, isMobile }: DataWorkspaceProps) {
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [datasetTabs, setDatasetTabs] = useState<DatasetRecord[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [recentDatasetIds, setRecentDatasetIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<DatasetDraft | null>(null);
  const [samples, setSamples] = useState<DatasetSample[]>([]);
  const [sampleTokenizations, setSampleTokenizations] = useState<Record<string, DatasetSampleTokenization>>({});
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [dirtySampleIds, setDirtySampleIds] = useState<string[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenSelection | null>(null);
  const [replacementToken, setReplacementToken] = useState("");
  const [tokenCandidates, setTokenCandidates] = useState<TokenCandidate[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [samplesLoading, setSamplesLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingSample, setSavingSample] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingAssistant, setGeneratingAssistant] = useState(false);
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);
  const [mobileSamplesOpen, setMobileSamplesOpen] = useState(false);
  const [mobileMetadataOpen, setMobileMetadataOpen] = useState(false);
  const [desktopExplorerCollapsed, setDesktopExplorerCollapsed] = useState(false);
  const [datasetToDelete, setDatasetToDelete] = useState<DatasetRecord | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelOptionsError, setModelOptionsError] = useState("");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const untitledCountRef = useRef(1);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const tokenCandidatesRequestRef = useRef(0);

  const fineTuneFiles = useMemo(() => files.filter((file) => file.purpose === "fine-tune"), [files]);
  const activeDataset = datasetTabs.find((tab) => tab.id === activeDatasetId) ?? null;
  const recentDatasets = useMemo(
    () =>
      recentDatasetIds
        .map((id) => datasets.find((dataset) => dataset.id === id))
        .filter((dataset): dataset is DatasetRecord => Boolean(dataset)),
    [datasets, recentDatasetIds],
  );
  const selectedSample = samples.find((sample) => sample.id === selectedSampleId) ?? samples[0] ?? null;
  const selectedSampleTokenization = selectedSample ? sampleTokenizations[selectedSample.id] ?? null : null;

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  useEffect(() => {
    void loadModelOptions();
  }, []);

  useEffect(() => {
    if (!activeDataset) {
      setDraft(null);
      setSamples([]);
      setSampleTokenizations({});
      setSelectedSampleId(null);
      setSelectedToken(null);
      setTokenCandidates([]);
      setCandidatesLoading(false);
      tokenCandidatesRequestRef.current += 1;
      return;
    }
    setDraft({
      name: activeDataset.name,
      base_model: activeDataset.base_model ?? "Qwen/Qwen2.5-7B-Instruct",
      training_file_id: activeDataset.training_file_id ?? "",
    });
    void loadSamples(activeDataset.id);
  }, [activeDataset]);

  useEffect(() => {
    if (!selectedSample) {
      setSelectedToken(null);
      setReplacementToken("");
      setTokenCandidates([]);
      setCandidatesLoading(false);
      tokenCandidatesRequestRef.current += 1;
      return;
    }
    if (!selectedSampleId) {
      setSelectedSampleId(selectedSample.id);
    }
  }, [selectedSample, selectedSampleId]);

  useEffect(() => {
    if (!selectedSample || generatingAssistant) {
      return;
    }
    void ensureSampleTokenization(selectedSample);
  }, [selectedSample, draft?.base_model, activeDataset?.id, generatingAssistant]);

  async function refreshWorkspace() {
    setLoading(true);
    try {
      const [datasetsPayload, filesPayload] = await Promise.all([
        fetchJson<ApiListResponse<DatasetRecord>>("/api/datasets"),
        fetchJson<ApiListResponse<UploadedFile>>("/api/files"),
      ]);
      setDatasets(datasetsPayload.data);
      setFiles(filesPayload.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载数据工作区失败");
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
      const payload = await fetchJson<ApiListResponse<{ id: string }>>("/v1/models");
      const options = Array.from(
        new Set(
          payload.data
            .map((model) => model.id?.trim())
            .filter((modelId): modelId is string => Boolean(modelId)),
        ),
      );
      setModelOptions(options);
      setModelOptionsError("");
      setModelsLoaded(true);
    } catch (loadError) {
      setModelOptionsError(loadError instanceof Error ? loadError.message : "加载模型列表失败");
      setModelsLoaded(true);
    } finally {
      setModelsLoading(false);
    }
  }

  async function loadSamples(datasetId: string) {
    setSamplesLoading(true);
    try {
      const payload = await fetchJson<ApiListResponse<DatasetSample>>(`/api/datasets/${datasetId}/samples`);
      setSamples(payload.data);
      setSelectedSampleId(payload.data[0]?.id ?? null);
      setSelectedToken(null);
      setReplacementToken("");
      setTokenCandidates([]);
      setCandidatesLoading(false);
      tokenCandidatesRequestRef.current += 1;
      setDirtySampleIds([]);
      setSampleTokenizations({});
      setError("");
    } catch (loadError) {
      setSamples([]);
      setSampleTokenizations({});
      setSelectedSampleId(null);
      setCandidatesLoading(false);
      tokenCandidatesRequestRef.current += 1;
      setError(loadError instanceof Error ? loadError.message : "加载样本失败");
    } finally {
      setSamplesLoading(false);
    }
  }

  function openDataset(dataset: DatasetRecord) {
    setRecentDatasetIds((current) => [dataset.id, ...current.filter((id) => id !== dataset.id)].slice(0, 6));
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
      const nextName = `dataset-${untitledCountRef.current}`;
      untitledCountRef.current += 1;
      const created = await fetchJson<DatasetRecord>("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          base_model: "Qwen/Qwen2.5-7B-Instruct",
        }),
      });
      setDatasets((current) => [created, ...current]);
      openDataset(created);
      setError("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建数据集失败");
    } finally {
      setCreating(false);
    }
  }

  function handleOpenNextDataset() {
    const nextDataset = datasets.find((dataset) => !datasetTabs.some((tab) => tab.id === dataset.id));
    if (nextDataset) {
      openDataset(nextDataset);
    }
  }

  function handleCloseDataset(datasetId: string) {
    setDatasetTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.id !== datasetId);
      if (activeDatasetId === datasetId) {
        setActiveDatasetId(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : null);
      }
      return nextTabs;
    });
  }

  async function handleSaveDataset() {
    if (!activeDataset || !draft) {
      return;
    }
    setSaving(true);
    try {
      const updated = await fetchJson<DatasetRecord>(`/api/datasets/${activeDataset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim() || activeDataset.name,
          base_model: draft.base_model.trim(),
          training_file_id: draft.training_file_id || null,
        }),
      });
      setDatasets((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDatasetTabs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setActiveDatasetId(updated.id);
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存数据集失败");
    } finally {
      setSaving(false);
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
      setError(importError instanceof Error ? importError.message : "导入数据集失败");
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
      const created = await fetchJson<DatasetSample>(`/api/datasets/${activeDataset.id}/samples`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `样本 ${samples.length + 1}`,
        }),
      });
      setSamples((current) => [...current, created]);
      setSelectedSampleId(created.id);
      setSelectedToken(null);
      setReplacementToken("");
      setTokenCandidates([]);
      setCandidatesLoading(false);
      tokenCandidatesRequestRef.current += 1;
      setError("");
      setMobileSamplesOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建样本失败");
    } finally {
      setSavingSample(false);
    }
  }

  function updateCurrentSample(nextSample: DatasetSample) {
    setSamples((current) => current.map((sample) => (sample.id === nextSample.id ? nextSample : sample)));
    setDirtySampleIds((current) => (current.includes(nextSample.id) ? current : [...current, nextSample.id]));
    setSampleTokenizations((current) => {
      const next = { ...current };
      delete next[nextSample.id];
      return next;
    });
  }

  function updateSelectedSample(updater: (sample: DatasetSample) => DatasetSample) {
    if (!selectedSample) {
      return;
    }
    const nextSample = updater(selectedSample);
    updateCurrentSample({
      ...nextSample,
      source_messages: nextSample.messages,
      edits: [],
      updated_at: Math.floor(Date.now() / 1000),
    });
    setSelectedToken(null);
    setReplacementToken("");
    setTokenCandidates([]);
    setCandidatesLoading(false);
    tokenCandidatesRequestRef.current += 1;
  }

  function updateSelectedSampleMessages(updater: (messages: DatasetMessage[]) => DatasetMessage[]) {
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

  async function ensureSampleTokenization(sample: DatasetSample): Promise<DatasetSampleTokenization | null> {
    const model = draft?.base_model.trim() || activeDataset?.base_model || "";
    if (!model || !activeDataset) {
      setError("请先在数据集元数据中设置模型。");
      return null;
    }
    const cached = sampleTokenizations[sample.id];
    if (cached) {
      return cached;
    }
    try {
      const tokenization = await fetchJson<DatasetSampleTokenization>(`/api/datasets/${activeDataset.id}/samples/${sample.id}/tokenize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      setSampleTokenizations((current) => ({ ...current, [sample.id]: tokenization }));
      return tokenization;
    } catch (tokenizeError) {
      setError(tokenizeError instanceof Error ? tokenizeError.message : "加载 token 失败");
      return null;
    }
  }

  async function handleSelectToken(messageIndex: number, tokenIndex: number) {
    if (!selectedSample) {
      return;
    }
    const tokenization = await ensureSampleTokenization(selectedSample);
    const message = tokenization?.messages.find((item) => item.message_index === messageIndex);
    const token = message?.tokens.find((item) => item.token_index === tokenIndex);
    if (!token) {
      return;
    }
    setTokenCandidates([]);
    setSelectedToken({
      messageIndex,
      tokenIndex,
      currentToken: token.text || token.token,
      originalToken: token.text || token.token,
    });
    setReplacementToken(token.text || token.token);
    void loadTokenCandidates(selectedSample, tokenization, messageIndex, tokenIndex);
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
    const messageTokenization = tokenization.messages.find((item) => item.message_index === messageIndex);
    const targetToken = messageTokenization?.tokens.find((item) => item.token_index === tokenIndex);
    if (!targetMessage || targetMessage.role !== "assistant" || !messageTokenization || !targetToken) {
      return;
    }

    const requestMessages = sample.messages.slice(0, messageIndex).map((message) => ({
      role: message.role,
      content: message.content,
    }));
    requestMessages.push({
      role: "assistant",
      content: targetMessage.content.slice(0, targetToken.start),
    });

    const requestId = tokenCandidatesRequestRef.current + 1;
    tokenCandidatesRequestRef.current = requestId;
    setCandidatesLoading(true);
    try {
      const payload = await fetchJson<{
        choices?: Array<{
          logprobs?: {
            content?: Array<{
              top_logprobs?: Array<{
                token?: string;
                logprob?: number | null;
                bytes?: number[];
              }>;
            }>;
          };
        }>;
      }>("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: requestMessages,
          max_tokens: 1,
          temperature: 0,
          logprobs: true,
          top_logprobs: 10,
          add_generation_prompt: false,
          continue_final_message: true,
        }),
      });
      const rawCandidates = payload.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs ?? [];
      const seen = new Set<string>();
      const nextCandidates = rawCandidates
        .map((candidate) => ({
          text: decodeCandidateToken(candidate.token, candidate.bytes),
          logprob: typeof candidate.logprob === "number" ? candidate.logprob : null,
        }))
        .filter((candidate) => candidate.text)
        .filter((candidate) => {
          if (seen.has(candidate.text)) {
            return false;
          }
          seen.add(candidate.text);
          return true;
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

  async function handleGenerateContinuation() {
    if (!activeDataset || !draft || !selectedSample || !selectedToken) {
      return;
    }
    const model = draft.base_model.trim() || activeDataset.base_model || "";
    if (!model) {
      setError("请先在右侧设置数据集绑定模型。");
      return;
    }
    setGenerating(true);
    try {
      const continuation = await fetchJson<{ sample: DatasetSample }>(`/api/datasets/${activeDataset.id}/samples/${selectedSample.id}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          message_index: selectedToken.messageIndex,
          token_index: selectedToken.tokenIndex,
          replacement_token: replacementToken.trim() || selectedToken.currentToken,
        }),
      });
      updateCurrentSample({ ...continuation.sample, updated_at: Math.floor(Date.now() / 1000) });
      setSelectedToken({ ...selectedToken, currentToken: replacementToken.trim() || selectedToken.currentToken });
      setError("");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "继续生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveSample() {
    if (!activeDataset || !selectedSample) {
      return;
    }
    setSavingSample(true);
    try {
      const updated = await persistSample(selectedSample);
      setSamples((current) => current.map((sample) => (sample.id === updated.id ? updated : sample)));
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存样本失败");
    } finally {
      setSavingSample(false);
    }
  }

  async function handleGenerateAssistantMessage() {
    if (!activeDataset || !draft || !selectedSample) {
      return;
    }
    const model = draft.base_model.trim() || activeDataset.base_model || "";
    if (!model) {
      setError("请先在右侧设置数据集绑定模型。");
      return;
    }

    const lastMessage = selectedSample.messages[selectedSample.messages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage.content.trim()) {
      setError("最后一条已经是完整的助手消息，请先添加用户消息或清空最后一条助手消息。");
      return;
    }
    const requestMessages = (lastMessage?.role === "assistant" ? selectedSample.messages.slice(0, -1) : selectedSample.messages).map((message) => ({
      role: message.role,
      content: message.content,
    }));
    if (requestMessages.length === 0) {
      setError("请先添加至少一条有效消息。");
      return;
    }
    const shouldFillExistingAssistant = lastMessage?.role === "assistant" && !lastMessage.content.trim();
    const optimisticMessages = shouldFillExistingAssistant
      ? selectedSample.messages.map((message, index) => (index === selectedSample.messages.length - 1 ? { ...message, content: "" } : message))
      : [...selectedSample.messages, { role: "assistant", content: "" }];

    setGeneratingAssistant(true);
    setSelectedToken(null);
    setReplacementToken("");
    setTokenCandidates([]);
    setCandidatesLoading(false);
    tokenCandidatesRequestRef.current += 1;
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
      const response = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: requestMessages,
          stream: true,
          max_tokens: 512,
          temperature: 0.7,
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
      let assistantContent = "";
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
            choices?: Array<{ delta?: { content?: string | Array<{ text?: string }> } }>;
            error?: { message?: string };
          };
          if (payload.error?.message) {
            throw new Error(payload.error.message);
          }

          const contentValue = payload.choices?.[0]?.delta?.content;
          const delta =
            typeof contentValue === "string"
              ? contentValue
              : Array.isArray(contentValue)
                ? contentValue.map((item) => item.text || "").join("")
                : "";

          if (delta) {
            shouldRestoreOriginal = false;
            receivedDelta = true;
            assistantContent += delta;
            latestSample = {
              ...originalSample,
              messages: optimisticMessages.map((message, index) => (index === assistantIndex ? { ...message, content: assistantContent } : message)),
              edits: [],
              updated_at: Math.floor(Date.now() / 1000),
            };
            updateCurrentSample(latestSample);
          }
        }
      }

      if (!receivedDelta && !assistantContent) {
        throw new Error("生成提前结束，未收到完整消息。");
      }
      const persisted = await persistSample(latestSample);
      setSamples((current) => current.map((sample) => (sample.id === persisted.id ? persisted : sample)));
      setError("");
    } catch (generateError) {
      if (shouldRestoreOriginal) {
        updateCurrentSample(originalSample);
      }
      setError(generateError instanceof Error ? generateError.message : "生成助手消息失败");
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
      await fetchJson<{ deleted: boolean }>(`/api/datasets/${deletingId}`, { method: "DELETE" });
      setDatasets((current) => current.filter((dataset) => dataset.id !== deletingId));
      setDatasetTabs((current) => {
        const nextTabs = current.filter((dataset) => dataset.id !== deletingId);
        if (activeDatasetId === deletingId) {
          setActiveDatasetId(nextTabs[nextTabs.length - 1]?.id ?? null);
        }
        return nextTabs;
      });
      setRecentDatasetIds((current) => current.filter((id) => id !== deletingId));
      if (selectedSampleId && activeDatasetId === deletingId) {
        setSelectedSampleId(null);
      }
      setDatasetToDelete(null);
      setError("");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除数据集失败");
    } finally {
      setCreating(false);
    }
  }

  async function persistSample(sample: DatasetSample): Promise<DatasetSample> {
    if (!activeDataset) {
      throw new Error("当前没有打开的数据集。");
    }
    const updated = await fetchJson<DatasetSample>(`/api/datasets/${activeDataset.id}/samples/${sample.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: sample.title,
        messages: sample.messages,
        source_messages: sample.source_messages,
        edits: sample.edits,
      }),
    });
    setDirtySampleIds((current) => current.filter((sampleId) => sampleId !== updated.id));
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
        bgcolor: "#0f172a",
      }}
    >
      {datasetTabs.length === 0 ? (
        <DatasetHome
          creating={creating}
          dataSummary={dataSummary}
          datasets={datasets}
          importInputRef={importInputRef}
          isMobile={isMobile}
          loading={loading}
          onCreateDataset={() => void handleCreateDataset()}
          onDeleteDataset={(dataset) => setDatasetToDelete(dataset)}
          onImportDataset={handleImportDataset}
          onOpenDataset={openDataset}
          recentDatasets={recentDatasets}
        />
      ) : (
        <WorkspaceShell
          activeDataset={activeDataset}
          creating={creating}
          dataSummary={dataSummary}
          datasets={datasets}
          datasetTabs={datasetTabs}
          draft={draft}
          error={error}
          fineTuneFiles={fineTuneFiles}
          importInputRef={importInputRef}
          isMobile={isMobile}
          loading={loading}
          mobileExplorerOpen={mobileExplorerOpen}
          mobileSamplesOpen={mobileSamplesOpen}
          mobileMetadataOpen={mobileMetadataOpen}
          desktopExplorerCollapsed={desktopExplorerCollapsed}
          modelOptions={modelOptions}
          modelOptionsError={modelOptionsError}
          modelsLoading={modelsLoading}
          onChangeDraft={setDraft}
          onCloseDataset={handleCloseDataset}
          onCreateDataset={() => void handleCreateDataset()}
          onDeleteDataset={(dataset) => setDatasetToDelete(dataset)}
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
          selectedSample={selectedSample}
          selectedSampleTokenization={selectedSampleTokenization}
          selectedSampleId={selectedSampleId}
          dirtySampleIds={dirtySampleIds}
          selectedToken={selectedToken}
          tokenCandidates={tokenCandidates}
          candidatesLoading={candidatesLoading}
          replacementToken={replacementToken}
          generating={generating}
          generatingAssistant={generatingAssistant}
          saving={saving}
          savingSample={savingSample}
          onCreateSample={() => void handleCreateSample()}
          onGenerateAssistantMessage={() => void handleGenerateAssistantMessage()}
          onGenerateContinuation={() => void handleGenerateContinuation()}
          onSaveSample={() => void handleSaveSample()}
          onUpdateSelectedSampleTitle={updateSelectedSampleTitle}
          onUpdateSelectedSampleMessages={updateSelectedSampleMessages}
          onSelectSample={setSelectedSampleId}
          onSelectToken={handleSelectToken}
          onSetReplacementToken={setReplacementToken}
        />
      )}

      <Dialog
        open={Boolean(datasetToDelete)}
        onClose={() => setDatasetToDelete(null)}
        PaperProps={{
          sx: {
            bgcolor: "#111827",
            color: "#f8fafc",
            borderRadius: 3,
            minWidth: { xs: "auto", sm: 420 },
          },
        }}
      >
        <DialogTitle>删除数据集</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "#cbd5e1" }}>
            {datasetToDelete ? `确认删除“${datasetToDelete.name}”吗？数据集元数据和已保存样本都会被移除。` : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDatasetToDelete(null)} sx={{ color: "#cbd5e1" }}>
            取消
          </Button>
          <Button color="error" variant="contained" onClick={() => void handleDeleteDataset()} disabled={creating}>
            {creating ? "删除中..." : "确认删除"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default DataWorkspace;

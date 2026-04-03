import type { ChangeEvent, RefObject } from "react";
import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import NavigateBeforeRoundedIcon from "@mui/icons-material/NavigateBeforeRounded";
import NavigateNextRoundedIcon from "@mui/icons-material/NavigateNextRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import {
  Alert,
  Box,
  Button,
  Drawer,
  IconButton,
  Paper,
  Typography,
} from "@mui/material";
import type {
  DatasetMessage,
  DatasetRecord,
  DatasetSample,
  DatasetSampleTokenization,
} from "../../types/app";
import { DatasetHome } from "./DatasetHome";
import { useI18n } from "../../i18n";
import {
  ActivityRail,
  DatasetMetadataForm,
  DatasetMetadataSection,
  EditorTabs,
  ExplorerPane,
  MobileDatasetSheet,
  SampleListPane,
} from "./DataWorkspacePanels";
import { MessageFlowPanel } from "./DataWorkspaceMessageFlow";
import {
  TokenActionMiniPanel,
  TokenActionPanel,
} from "./DataWorkspaceTokenPanels";
import { panelCardSx } from "./dataWorkspaceStyles";
import type {
  DatasetDraft,
  TokenCandidate,
  TokenSelection,
} from "./dataWorkspaceTypes";
import { getWorkspaceColors } from "./dataWorkspaceTheme";

export interface WorkspaceShellProps {
  activeDataset: DatasetRecord | null;
  creating: boolean;
  datasets: DatasetRecord[];
  datasetTabs: DatasetRecord[];
  draft: DatasetDraft | null;
  error: string;
  onClearError: () => void;
  importInputRef: RefObject<HTMLInputElement | null>;
  isMobile: boolean;
  loading: boolean;
  mobileExplorerOpen: boolean;
  mobileSamplesOpen: boolean;
  mobileMetadataOpen: boolean;
  desktopExplorerCollapsed: boolean;
  recentDatasets: DatasetRecord[];
  modelOptions: string[];
  modelOptionsError: string;
  modelsLoading: boolean;
  onChangeDraft: (draft: DatasetDraft | null) => void;
  onCloseDataset: (datasetId: string) => void;
  onCreateDataset: () => void;
  onDeleteDataset: (dataset: DatasetRecord) => void;
  onExportDataset: () => void;
  onImportDataset: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenDataset: (dataset: DatasetRecord) => void;
  onOpenNextDataset: () => void;
  onLoadModelOptions: () => void;
  onSaveDataset: () => void;
  onSelectDataset: (datasetId: string | null) => void;
  onSetDesktopExplorerCollapsed: (collapsed: boolean) => void;
  onSetMobileExplorerOpen: (open: boolean) => void;
  onSetMobileSamplesOpen: (open: boolean) => void;
  onSetMobileMetadataOpen: (open: boolean) => void;
  samples: DatasetSample[];
  samplesLoading: boolean;
  selectedSample: DatasetSample | null;
  selectedSampleTokenization: DatasetSampleTokenization | null;
  selectedSampleId: string | null;
  dirtySampleIds: string[];
  selectedToken: TokenSelection | null;
  selectedTokenHasRewriteMark: boolean;
  replacementToken: string;
  hasContinuationDraft: boolean;
  generating: boolean;
  generatingAssistant: boolean;
  saving: boolean;
  exportingDataset: boolean;
  savingSample: boolean;
  tokenCandidates: TokenCandidate[];
  candidatesLoading: boolean;
  onCreateSample: () => void;
  onDeleteSample: (sample: DatasetSample) => void;
  onAcceptContinuationDraft: () => void;
  onGenerateAssistantMessage: () => void;
  onGenerateContinuation: () => void;
  onGenerateTopCandidateWithoutRewriteMark: () => void;
  onDiscardContinuationDraft: () => void;
  onSaveSample: () => void;
  onClearSelectedToken: () => void;
  onSelectAdjacentToken: (direction: -1 | 1) => void;
  onUpdateSelectedSampleTitle: (title: string) => void;
  onUpdateSelectedSampleMessages: (
    updater: (messages: DatasetMessage[]) => DatasetMessage[],
  ) => void;
  hasNextToken: boolean;
  hasPrevToken: boolean;
  onSelectSample: (sampleId: string | null) => void;
  onSelectToken: (
    messageIndex: number,
    tokenIndex: number,
  ) => void;
  onSetReplacementToken: (value: string) => void;
}

export function WorkspaceShell({
  activeDataset,
  creating,
  datasets,
  datasetTabs,
  draft,
  error,
  onClearError,
  importInputRef,
  isMobile,
  loading,
  mobileExplorerOpen,
  mobileSamplesOpen,
  mobileMetadataOpen,
  desktopExplorerCollapsed,
  recentDatasets,
  modelOptions,
  modelOptionsError,
  modelsLoading,
  onChangeDraft,
  onCloseDataset,
  onCreateDataset,
  onDeleteDataset,
  onExportDataset,
  onImportDataset,
  onOpenDataset,
  onOpenNextDataset,
  onLoadModelOptions,
  onSaveDataset,
  onSelectDataset,
  onSetDesktopExplorerCollapsed,
  onSetMobileExplorerOpen,
  onSetMobileSamplesOpen,
  onSetMobileMetadataOpen,
  samples,
  samplesLoading,
  selectedSample,
  selectedSampleTokenization,
  selectedSampleId,
  dirtySampleIds,
  selectedToken,
  selectedTokenHasRewriteMark,
  tokenCandidates,
  candidatesLoading,
  hasContinuationDraft,
  replacementToken,
  generating,
  generatingAssistant,
  saving,
  exportingDataset,
  savingSample,
  onCreateSample,
  onDeleteSample,
  onAcceptContinuationDraft,
  onGenerateAssistantMessage,
  onGenerateContinuation,
  onGenerateTopCandidateWithoutRewriteMark,
  onDiscardContinuationDraft,
  onClearSelectedToken,
  onSaveSample,
  onSelectAdjacentToken,
  onUpdateSelectedSampleTitle,
  onUpdateSelectedSampleMessages,
  hasNextToken,
  hasPrevToken,
  onSelectSample,
  onSelectToken,
  onSetReplacementToken,
}: WorkspaceShellProps) {
  const { t } = useI18n();
  const tokenPanel =
    activeDataset && draft ? (
      <TokenActionPanel
        generating={generating}
        hasContinuationDraft={hasContinuationDraft}
        selectedTokenHasRewriteMark={selectedTokenHasRewriteMark}
        onAcceptContinuationDraft={onAcceptContinuationDraft}
        onDiscardContinuationDraft={onDiscardContinuationDraft}
        onGenerateContinuation={onGenerateContinuation}
        onGenerateTopCandidateWithoutRewriteMark={
          onGenerateTopCandidateWithoutRewriteMark
        }
        onSetReplacementToken={onSetReplacementToken}
        replacementToken={replacementToken}
        savingSample={savingSample}
        selectedSample={selectedSample}
        selectedToken={selectedToken}
        tokenCandidates={tokenCandidates}
        candidatesLoading={candidatesLoading}
      />
    ) : null;

  const metadataSection =
    activeDataset && draft ? (
      <DatasetMetadataSection
        dataset={activeDataset}
        draft={draft}
        modelOptions={modelOptions}
        modelOptionsError={modelOptionsError}
        modelsLoading={modelsLoading}
        onChangeDraft={onChangeDraft}
        onExportDataset={onExportDataset}
        onLoadModelOptions={onLoadModelOptions}
        onSaveDataset={onSaveDataset}
        exportingDataset={exportingDataset}
        saving={saving}
      />
    ) : null;

  if (isMobile) {
    return (
      <Box
        sx={{
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box
          sx={{
            px: 1.5,
            py: 1,
            bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
            borderBottom: (theme) =>
              `1px solid ${getWorkspaceColors(theme).border}`,
            display: "flex",
            gap: 1,
            flexShrink: 0,
          }}
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<StorageRoundedIcon />}
            onClick={() => onSetMobileExplorerOpen(true)}
            sx={{ flex: 1, color: "text.primary", borderColor: "divider" }}
          >
            {t("Dataset")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DataObjectRoundedIcon />}
            onClick={() => onSetMobileSamplesOpen(true)}
            sx={{ flex: 1, color: "text.primary", borderColor: "divider" }}
          >
            {t("Samples")}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<TuneRoundedIcon />}
            onClick={() => onSetMobileMetadataOpen(true)}
            sx={{ flex: 1, color: "text.primary", borderColor: "divider" }}
          >
            {t("Edit")}
          </Button>
        </Box>

        <EditorTabs
          activeDatasetId={activeDataset?.id ?? null}
          datasetTabs={datasetTabs}
          hasWelcomeTab={datasetTabs.length === 0}
          onCloseDataset={onCloseDataset}
          onSelectDataset={onSelectDataset}
        />

        {error ? (
          <Box
            sx={{
              p: 1.5,
              bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
              borderBottom: (theme) =>
                `1px solid ${getWorkspaceColors(theme).border}`,
            }}
          >
            <Alert severity="error" onClose={onClearError}>
              {error}
            </Alert>
          </Box>
        ) : null}

        {datasetTabs.length === 0 ? (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <DatasetHome
              creating={creating}
              datasets={datasets}
              importInputRef={importInputRef}
              isMobile={isMobile}
              loading={loading}
              onCreateDataset={onCreateDataset}
        onDeleteDataset={onDeleteDataset}
        onExportDataset={onExportDataset}
        onImportDataset={onImportDataset}
              onOpenDataset={onOpenDataset}
              recentDatasets={recentDatasets}
            />
          </Box>
        ) : (
          <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <MessageFlowPanel
              generatingAssistant={generatingAssistant}
              hasContinuationDraft={hasContinuationDraft}
              samplesLoading={samplesLoading}
              sample={selectedSample}
              sampleTokenization={selectedSampleTokenization}
              savingSample={savingSample}
              onGenerateAssistantMessage={onGenerateAssistantMessage}
              selectedToken={selectedToken}
              onSaveSample={onSaveSample}
              onSelectToken={onSelectToken}
              onUpdateSampleMessages={onUpdateSelectedSampleMessages}
              onUpdateSampleTitle={onUpdateSelectedSampleTitle}
            />
          </Box>
        )}

        <Drawer
          anchor="bottom"
          open={mobileExplorerOpen}
          onClose={() => onSetMobileExplorerOpen(false)}
          PaperProps={{
            sx: {
              height: "72dvh",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
              color: "text.primary",
              overflow: "hidden",
            },
          }}
        >
          <MobileDatasetSheet
            activeDatasetId={activeDataset?.id ?? null}
            creating={creating}
            datasets={datasets}
            importInputRef={importInputRef}
            loading={loading}
            onCreateDataset={onCreateDataset}
            onDeleteDataset={onDeleteDataset}
            onImportDataset={onImportDataset}
            onOpenDataset={onOpenDataset}
            onOpenNextDataset={onOpenNextDataset}
          />
        </Drawer>

        <Drawer
          anchor="bottom"
          open={mobileSamplesOpen}
          onClose={() => onSetMobileSamplesOpen(false)}
          PaperProps={{
            sx: {
              height: "72dvh",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
              color: "text.primary",
              overflow: "hidden",
            },
          }}
        >
          <SampleListPane
            compact
            dirtySampleIds={dirtySampleIds}
            onCreateSample={onCreateSample}
            onDeleteSample={onDeleteSample}
            onSelectSample={(sampleId) => {
              onSelectSample(sampleId);
              onSetMobileSamplesOpen(false);
            }}
            samples={samples}
            samplesLoading={samplesLoading}
            savingSample={savingSample}
            selectedSampleId={selectedSampleId}
          />
        </Drawer>

        <Drawer
          anchor="bottom"
          open={Boolean(selectedToken)}
          onClose={onClearSelectedToken}
          PaperProps={{
            sx: {
              minHeight: 240,
              maxHeight: "72dvh",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
              color: "text.primary",
              overflow: "hidden",
            },
          }}
        >
          <Box
            sx={{
              height: "100%",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box
              sx={{
                px: 1,
                py: 1,
                borderBottom: (theme) =>
                  `1px solid ${getWorkspaceColors(theme).border}`,
                display: "grid",
                gridTemplateColumns: "40px minmax(0, 1fr) 40px",
                alignItems: "center",
                gap: 1,
                flexShrink: 0,
              }}
            >
              <IconButton
                size="small"
                onClick={() => onSelectAdjacentToken(-1)}
                disabled={!hasPrevToken || hasContinuationDraft}
                sx={{ color: "text.secondary", justifySelf: "start" }}
              >
                <NavigateBeforeRoundedIcon />
              </IconButton>
              <Typography
                variant="body2"
                sx={{
                  textAlign: "center",
                  color: "text.primary",
                  fontWeight: 700,
                }}
                noWrap
              >
                {selectedToken?.currentToken ||
                  selectedToken?.originalToken ||
                  "Token"}
              </Typography>
              <IconButton
                size="small"
                onClick={() => onSelectAdjacentToken(1)}
                disabled={!hasNextToken || hasContinuationDraft}
                sx={{ color: "text.secondary", justifySelf: "end" }}
              >
                <NavigateNextRoundedIcon />
              </IconButton>
            </Box>
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                WebkitOverflowScrolling: "touch",
                p: 1.5,
              }}
            >
              <TokenActionMiniPanel
                generating={generating}
                hasContinuationDraft={hasContinuationDraft}
                selectedTokenHasRewriteMark={selectedTokenHasRewriteMark}
                onAcceptContinuationDraft={onAcceptContinuationDraft}
                onDiscardContinuationDraft={onDiscardContinuationDraft}
                onGenerateContinuation={onGenerateContinuation}
                onGenerateTopCandidateWithoutRewriteMark={
                  onGenerateTopCandidateWithoutRewriteMark
                }
                onSetReplacementToken={onSetReplacementToken}
                replacementToken={replacementToken}
                savingSample={savingSample}
                selectedSample={selectedSample}
                selectedToken={selectedToken}
                tokenCandidates={tokenCandidates}
                candidatesLoading={candidatesLoading}
                showSelectionSummary={false}
              />
            </Box>
          </Box>
        </Drawer>

        <Drawer
          anchor="bottom"
          open={mobileMetadataOpen}
          onClose={() => onSetMobileMetadataOpen(false)}
          PaperProps={{
            sx: {
              height: "72dvh",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
              color: "text.primary",
              overflow: "hidden",
            },
          }}
        >
          {activeDataset && draft ? (
            <Box sx={{ height: "100%", minHeight: 0, overflow: "auto", p: 2 }}>
              <Paper variant="outlined" sx={panelCardSx}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
                  {t("Dataset metadata")}
                </Typography>
                <DatasetMetadataForm
                  dataset={activeDataset}
                  draft={draft}
                  modelOptions={modelOptions}
                  modelOptionsError={modelOptionsError}
                  modelsLoading={modelsLoading}
                  onChangeDraft={onChangeDraft}
                  onExportDataset={onExportDataset}
                  onLoadModelOptions={onLoadModelOptions}
                  onSaveDataset={onSaveDataset}
                  exportingDataset={exportingDataset}
                  saving={saving}
                />
              </Paper>
            </Box>
          ) : null}
        </Drawer>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
      <ActivityRail
        explorerCollapsed={desktopExplorerCollapsed}
        onToggleExplorer={() =>
          onSetDesktopExplorerCollapsed(!desktopExplorerCollapsed)
        }
      />
      <Box
        sx={{
          position: "relative",
          width: 320,
          marginRight: desktopExplorerCollapsed ? "-320px" : 0,
          minHeight: 0,
          flexShrink: 0,
          overflow: "hidden",
          transition: "margin-right 160ms ease",
          pointerEvents: desktopExplorerCollapsed ? "none" : "auto",
        }}
      >
        <ExplorerPane
          activeDatasetId={activeDataset?.id ?? null}
          collapsed={desktopExplorerCollapsed}
          creating={creating}
          datasets={datasets}
          importInputRef={importInputRef}
          loading={loading}
          onCreateDataset={onCreateDataset}
          onDeleteDataset={onDeleteDataset}
          onImportDataset={onImportDataset}
          onOpenDataset={onOpenDataset}
          onOpenNextDataset={onOpenNextDataset}
          onToggleCollapse={() =>
            onSetDesktopExplorerCollapsed(!desktopExplorerCollapsed)
          }
        />
      </Box>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <EditorTabs
          activeDatasetId={activeDataset?.id ?? null}
          datasetTabs={datasetTabs}
          hasWelcomeTab={datasetTabs.length === 0}
          onCloseDataset={onCloseDataset}
          onSelectDataset={onSelectDataset}
        />

        {error ? (
          <Box
            sx={{
              p: 1.5,
              bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
              borderBottom: (theme) =>
                `1px solid ${getWorkspaceColors(theme).border}`,
            }}
          >
            <Alert severity="error" onClose={onClearError}>
              {error}
            </Alert>
          </Box>
        ) : null}

        {datasetTabs.length === 0 ? (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <DatasetHome
              creating={creating}
              datasets={datasets}
              importInputRef={importInputRef}
              isMobile={isMobile}
              loading={loading}
              onCreateDataset={onCreateDataset}
              onDeleteDataset={onDeleteDataset}
              onImportDataset={onImportDataset}
              onOpenDataset={onOpenDataset}
              recentDatasets={recentDatasets}
            />
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: "260px minmax(0, 1fr) 360px",
            }}
          >
            <SampleListPane
              dirtySampleIds={dirtySampleIds}
              metadataSection={metadataSection}
              onCreateSample={onCreateSample}
              onDeleteSample={onDeleteSample}
              onSelectSample={onSelectSample}
              samples={samples}
              samplesLoading={samplesLoading}
              savingSample={savingSample}
              selectedSampleId={selectedSampleId}
            />
            <MessageFlowPanel
              generatingAssistant={generatingAssistant}
              hasContinuationDraft={hasContinuationDraft}
              samplesLoading={samplesLoading}
              sample={selectedSample}
              sampleTokenization={selectedSampleTokenization}
              savingSample={savingSample}
              onGenerateAssistantMessage={onGenerateAssistantMessage}
              selectedToken={selectedToken}
              onSaveSample={onSaveSample}
              onSelectToken={onSelectToken}
              onUpdateSampleMessages={onUpdateSelectedSampleMessages}
              onUpdateSampleTitle={onUpdateSelectedSampleTitle}
            />
            {tokenPanel}
          </Box>
        )}
      </Box>
    </Box>
  );
}

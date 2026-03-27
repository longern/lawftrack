import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { type SubmitEvent, useState } from "react";
import { useI18n } from "../../i18n";
import type { DatasetRecord } from "../../types/app";
import type { TrainingFormState, TrainingMethodType } from "./trainingTypes";

interface CreateTrainingJobDialogProps {
  datasets: DatasetRecord[];
  form: TrainingFormState;
  preferredBaseModel: string;
  open: boolean;
  pageError: string;
  selectedDatasetId: string;
  submitting: boolean;
  onChangeMethodType: (methodType: TrainingMethodType) => void;
  onChangeForm: <K extends keyof TrainingFormState>(
    key: K,
    value: TrainingFormState[K],
  ) => void;
  onSelectDataset: (datasetId: string) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  onClearError: () => void;
  onClose: () => void;
}

export function CreateTrainingJobDialog({
  datasets,
  form,
  preferredBaseModel,
  open,
  pageError,
  selectedDatasetId,
  submitting,
  onChangeMethodType,
  onChangeForm,
  onSelectDataset,
  onSubmit,
  onClearError,
  onClose,
}: CreateTrainingJobDialogProps) {
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t("Create training job")}</DialogTitle>
      <Box component="form" onSubmit={onSubmit}>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {pageError ? (
              <Alert severity="error" onClose={onClearError}>
                {pageError}
              </Alert>
            ) : null}

            <TextField
              label="Base Model"
              value={form.model}
              onChange={(event) => onChangeForm("model", event.target.value)}
              placeholder={`${preferredBaseModel} ${t("or /path/to/model")}`}
              required
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel id="dialog-dataset-select-label">
                {t("Dataset")}
              </InputLabel>
              <Select
                labelId="dialog-dataset-select-label"
                label={t("Dataset")}
                value={selectedDatasetId}
                onChange={(event) => onSelectDataset(event.target.value)}
                required
              >
                <MenuItem value="" disabled>
                  {t("Select a dataset")}
                </MenuItem>
                {datasets.map((dataset) => (
                  <MenuItem key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {datasets.length === 0 ? (
              <Alert severity="warning">
                {t("Create a dataset first to start a training job.")}
              </Alert>
            ) : null}

            <FormControl fullWidth>
              <InputLabel id="training-method-label">
                {t("Training method")}
              </InputLabel>
              <Select
                labelId="training-method-label"
                label={t("Training method")}
                value={form.methodType}
                onChange={(event) =>
                  onChangeMethodType(event.target.value as TrainingMethodType)
                }
              >
                <MenuItem value="sft">SFT</MenuItem>
                <MenuItem value="lawf">LAwF</MenuItem>
              </Select>
            </FormControl>

            <Accordion
              disableGutters
              elevation={0}
              expanded={advancedOpen}
              onChange={(_, expanded) => setAdvancedOpen(expanded)}
              sx={{
                border: "1px solid rgba(15, 23, 42, 0.12)",
                borderRadius: 2,
                "&:before": { display: "none" },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {t("Advanced settings")}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2.5}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Epochs"
                        type="number"
                        value={form.nEpochs}
                        onChange={(event) =>
                          onChangeForm("nEpochs", event.target.value)
                        }
                        inputProps={{ min: 1, step: 1 }}
                        fullWidth
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Seed"
                        type="number"
                        value={form.seed}
                        onChange={(event) =>
                          onChangeForm("seed", event.target.value)
                        }
                        fullWidth
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Suffix"
                        value={form.suffix}
                        onChange={(event) =>
                          onChangeForm("suffix", event.target.value)
                        }
                        fullWidth
                      />
                    </Grid>
                  </Grid>

                  {form.methodType === "lawf" ? (
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Batch Size"
                          type="number"
                          value={form.batchSize}
                          onChange={(event) =>
                            onChangeForm("batchSize", event.target.value)
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Learning Rate"
                          type="number"
                          value={form.learningRate}
                          onChange={(event) =>
                            onChangeForm("learningRate", event.target.value)
                          }
                          inputProps={{ step: "0.00001" }}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Logging Steps"
                          type="number"
                          value={form.loggingSteps}
                          onChange={(event) =>
                            onChangeForm("loggingSteps", event.target.value)
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="LoRA Rank"
                          type="number"
                          value={form.loraRank}
                          onChange={(event) =>
                            onChangeForm("loraRank", event.target.value)
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="LoRA Alpha"
                          type="number"
                          value={form.loraAlpha}
                          onChange={(event) =>
                            onChangeForm("loraAlpha", event.target.value)
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="LoRA Dropout"
                          type="number"
                          value={form.loraDropout}
                          onChange={(event) =>
                            onChangeForm("loraDropout", event.target.value)
                          }
                          inputProps={{ step: "0.01" }}
                          fullWidth
                        />
                      </Grid>
                    </Grid>
                  ) : null}

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={form.tensorboard}
                        onChange={(event) =>
                          onChangeForm("tensorboard", event.target.checked)
                        }
                      />
                    }
                    label={t("Enable TensorBoard integration")}
                  />
                </Stack>
              </AccordionDetails>
            </Accordion>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={<AddRoundedIcon />}
            disabled={submitting || datasets.length === 0 || !selectedDatasetId}
          >
            {submitting ? t("Submitting...") : t("Create training job")}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

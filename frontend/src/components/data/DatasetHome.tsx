import type { ChangeEvent, RefObject } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { DatasetRecord, DataSummaryItem } from "../../types/app";
import { renderSummaryIcon } from "./dataWorkspaceUtils";

interface DatasetHomeProps {
  creating: boolean;
  dataSummary: DataSummaryItem[];
  datasets: DatasetRecord[];
  importInputRef: RefObject<HTMLInputElement | null>;
  isMobile: boolean;
  loading: boolean;
  onCreateDataset: () => void;
  onDeleteDataset: (dataset: DatasetRecord) => void;
  onImportDataset: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenDataset: (dataset: DatasetRecord) => void;
  recentDatasets: DatasetRecord[];
}

function SummaryPanel({ dataSummary, mobile }: { dataSummary: DataSummaryItem[]; mobile: boolean }) {
  if (mobile) {
    return (
      <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 0.5 }}>
        {dataSummary.map((item) => (
          <Paper
            key={item.title}
            variant="outlined"
            sx={{
              minWidth: 140,
              p: 1.5,
              bgcolor: (theme) => (theme.palette.mode === "dark" ? "#111827" : theme.palette.background.paper),
              borderColor: (theme) => theme.palette.divider,
              color: "text.primary",
              flexShrink: 0,
            }}
          >
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ display: "flex", color: "primary.main" }}>{renderSummaryIcon(item.icon)}</Box>
                <Typography variant="caption">{item.title}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {item.value}
              </Typography>
            </Stack>
          </Paper>
        ))}
      </Box>
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        bgcolor: (theme) => (theme.palette.mode === "dark" ? "#111827" : theme.palette.background.paper),
        borderColor: (theme) => theme.palette.divider,
        p: 2,
        overflow: "auto",
      }}
    >
      <Typography variant="subtitle1" fontWeight={700} sx={{ color: "text.primary", mb: 1.5 }}>
        状态
      </Typography>
      <Stack spacing={1.25}>
        {dataSummary.map((item) => (
          <Stack
            key={item.title}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1.5}
            sx={{ color: "text.primary" }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ display: "flex", color: "primary.main" }}>{renderSummaryIcon(item.icon)}</Box>
              <Typography variant="body2">{item.title}</Typography>
            </Stack>
            <Typography
              variant="caption"
              sx={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", color: "text.secondary" }}
            >
              {item.value}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

export function DatasetHome({
  creating,
  dataSummary,
  datasets,
  importInputRef,
  isMobile,
  loading,
  onCreateDataset,
  onDeleteDataset,
  onImportDataset,
  onOpenDataset,
  recentDatasets,
}: DatasetHomeProps) {
  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        px: { xs: 2, md: 4 },
        py: { xs: 2, md: 3 },
        display: "flex",
        flexDirection: "column",
        gap: 2,
        color: "text.primary",
        overflow: "hidden",
      }}
    >
      <Typography variant={isMobile ? "h5" : "h4"} fontWeight={700}>
        数据集
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ flexShrink: 0 }}>
        <Button variant="contained" size="large" startIcon={<AddRoundedIcon />} onClick={onCreateDataset} disabled={creating}>
          {creating ? "创建中..." : "新建数据集"}
        </Button>
        <Button
          variant="outlined"
          size="large"
          startIcon={<CloudUploadRoundedIcon />}
          onClick={() => importInputRef.current?.click()}
          sx={{ color: "text.primary", borderColor: "divider" }}
        >
          上传数据集
        </Button>
        <input ref={importInputRef} hidden type="file" accept=".yaml,.yml,.json,.jsonl" onChange={onImportDataset} />
      </Stack>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) 280px" },
          overflow: "hidden",
        }}
      >
        <Stack spacing={2} sx={{ minHeight: 0, overflow: "hidden" }}>
          {recentDatasets.length > 0 ? (
            <Box sx={{ flexShrink: 0 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.25 }}>
                最近打开
              </Typography>
              <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 0.5 }}>
                {recentDatasets.slice(0, 6).map((dataset) => (
                  <Card
                    key={dataset.id}
                    variant="outlined"
                    sx={{
                      minWidth: isMobile ? 220 : 260,
                      bgcolor: (theme) => (theme.palette.mode === "dark" ? "#111827" : theme.palette.background.paper),
                      borderColor: (theme) => theme.palette.divider,
                      flexShrink: 0,
                    }}
                  >
                    <CardActionArea onClick={() => onOpenDataset(dataset)}>
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography variant="subtitle1" fontWeight={700} noWrap>
                            {dataset.name}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" noWrap>
                            {dataset.base_model ?? "未设置模型"}
                          </Typography>
                          <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.75 }}>
                            {dataset.sample_count ?? 0} 条样本
                          </Typography>
                        </Stack>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Box>
            </Box>
          ) : null}

          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              minHeight: 0,
              bgcolor: (theme) => (theme.palette.mode === "dark" ? "#111827" : theme.palette.background.paper),
              borderColor: (theme) => theme.palette.divider,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Box sx={{ px: 2, py: 1.5, borderBottom: (theme) => `1px solid ${theme.palette.divider}` }}>
              <Typography variant="subtitle1" fontWeight={700}>
                所有数据集
              </Typography>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.5 }}>
              {loading ? (
                <Typography variant="body2" color="text.secondary">
                  加载中...
                </Typography>
              ) : datasets.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  还没有数据集。
                </Typography>
              ) : (
                <List sx={{ p: 0 }}>
                  {datasets.map((dataset) => (
                    <ListItemButton
                      key={dataset.id}
                      onClick={() => onOpenDataset(dataset)}
                      sx={{
                        borderRadius: 2,
                        color: "text.primary",
                        mb: 0.75,
                        bgcolor: (theme) =>
                          theme.palette.mode === "dark"
                            ? "#0f172a"
                            : alpha(theme.palette.primary.main, 0.04),
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36, color: "primary.main" }}>
                        <StorageRoundedIcon fontSize="small" />
                      </ListItemIcon>
                      <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 1 }}>
                        <ListItemText
                          primary={dataset.name}
                          secondary={`${dataset.base_model ?? "未设置模型"} · ${dataset.sample_count ?? 0} 条样本`}
                          slotProps={{ primary: { fontSize: 14 }, secondary: { sx: { color: "text.secondary" } } }}
                        />
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteDataset(dataset);
                          }}
                          sx={{ color: "text.secondary", flexShrink: 0 }}
                        >
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
          </Paper>
        </Stack>

        <SummaryPanel dataSummary={dataSummary} mobile={isMobile} />
      </Box>
    </Box>
  );
}

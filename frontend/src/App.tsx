import { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Container,
  CssBaseline,
  Drawer,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { alpha, ThemeProvider } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import AppSidebar from "./components/layout/AppSidebar";
import DataWorkspace from "./components/data/DataWorkspace";
import ErrorCard from "./components/shared/ErrorCard";
import { DRAWER_WIDTH, getNavItems } from "./constants/app";
import { useI18n } from "./i18n";
import OverviewSection from "./sections/OverviewSection";
import ChatSection from "./sections/ChatSection";
import TrainingSection from "./sections/TrainingSection";
import { createAppTheme } from "./theme/appTheme";
import type {
  ApiListResponse,
  AppSnapshot,
  DataSummaryItem,
  DatasetRecord,
  FineTuningJob,
  NavView,
} from "./types/app";

const LAST_OPENED_DATASET_STORAGE_KEY = "lawftune:last-opened-dataset-id";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

function App() {
  const { locale, setLocale, t } = useI18n();
  const APP_BAR_HEIGHT = 72;
  const MOBILE_NAV_HEIGHT = 92;
  const dataViewportHeight = {
    xs: `calc(100dvh - ${APP_BAR_HEIGHT}px - ${MOBILE_NAV_HEIGHT}px)`,
    md: `calc(100dvh - ${APP_BAR_HEIGHT}px)`,
  } as const;
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(
    () => createAppTheme(prefersDarkMode ? "dark" : "light"),
    [prefersDarkMode],
  );
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [activeView, setActiveView] = useState<NavView>("overview");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recentDatasetId, setRecentDatasetId] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [jobs, setJobs] = useState<FineTuningJob[]>([]);
  const [snapshot, setSnapshot] = useState<AppSnapshot>({
    status: null,
    health: null,
    config: null,
  });

  const navItems = useMemo(() => getNavItems(t), [t]);

  useEffect(() => {
    setRecentDatasetId(
      window.localStorage.getItem(LAST_OPENED_DATASET_STORAGE_KEY),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAppState() {
      setLoading(true);
      setError("");

      const results = await Promise.allSettled([
        fetchJson<AppSnapshot["status"]>("/api/status"),
        fetchJson<AppSnapshot["health"]>("/api/healthz"),
        fetchJson<AppSnapshot["config"]>("/api/config"),
        fetchJson<ApiListResponse<DatasetRecord>>("/api/datasets"),
        fetchJson<ApiListResponse<FineTuningJob>>("/api/fine_tuning/jobs"),
      ]);

      if (cancelled) {
        return;
      }

      const [
        statusResult,
        healthResult,
        configResult,
        datasetsResult,
        jobsResult,
      ] = results;

      if (
        statusResult.status === "fulfilled" &&
        healthResult.status === "fulfilled" &&
        configResult.status === "fulfilled"
      ) {
        setSnapshot({
          status: statusResult.value,
          health: healthResult.value,
          config: configResult.value,
        });
      }

      if (datasetsResult.status === "fulfilled") {
        setDatasets(datasetsResult.value.data);
      }

      if (jobsResult.status === "fulfilled") {
        setJobs(jobsResult.value.data);
      }

      const firstError = results.find((result) => result.status === "rejected");
      setError(
        firstError?.status === "rejected"
          ? firstError.reason instanceof Error
            ? firstError.reason.message
            : t("Unknown error")
          : "",
      );
      setLoading(false);
    }

    void loadAppState();

    return () => {
      cancelled = true;
    };
  }, [t]);

  const healthOk = snapshot.health?.status === "ok";
  const healthLabel = healthOk ? t("Healthy") : t("Offline");
  const endpoint = snapshot.config?.vllm_endpoint ?? t("Unavailable");
  const apiKey = snapshot.config?.has_api_key ? t("Configured") : t("Not set");
  const gatewayStatus = snapshot.status?.status ?? "unknown";
  const activeNav =
    navItems.find((item) => item.id === activeView) ?? navItems[0];

  const recentDataset = useMemo(() => {
    if (recentDatasetId) {
      const matched = datasets.find(
        (dataset) => dataset.id === recentDatasetId,
      );
      if (matched) {
        return matched;
      }
    }
    return [...datasets].sort((a, b) => b.updated_at - a.updated_at)[0] ?? null;
  }, [datasets, recentDatasetId]);

  const recentJob = useMemo(
    () => [...jobs].sort((a, b) => b.created_at - a.created_at)[0] ?? null,
    [jobs],
  );

  const dataSummary = useMemo<DataSummaryItem[]>(
    () => [
      {
        title: t("Gateway"),
        value: gatewayStatus === "running" ? t("Connected") : t("Not ready"),
        icon: "gateway",
      },
      { title: t("Health"), value: healthLabel, icon: "health" },
      { title: t("Upstream"), value: endpoint, icon: "upstream" },
      { title: t("Auth"), value: apiKey, icon: "auth" },
    ],
    [apiKey, endpoint, gatewayStatus, healthLabel, t],
  );

  function handleOpenDataset(dataset: DatasetRecord) {
    window.localStorage.setItem(LAST_OPENED_DATASET_STORAGE_KEY, dataset.id);
    setRecentDatasetId(dataset.id);
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          background:
            theme.palette.mode === "dark"
              ? "radial-gradient(circle at top, rgba(126, 169, 255, 0.16), transparent 32%), linear-gradient(180deg, #08101d 0%, #0b1323 100%)"
              : "radial-gradient(circle at top, rgba(31, 75, 153, 0.16), transparent 32%), linear-gradient(180deg, #f6f9ff 0%, #eef3fb 100%)",
        }}
      >
        <AppBar
          position="fixed"
          color="inherit"
          elevation={0}
          sx={{
            width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
            ml: { md: `${DRAWER_WIDTH}px` },
            borderBottom: `1px solid ${theme.palette.divider}`,
            backdropFilter: "blur(18px)",
            backgroundColor:
              theme.palette.mode === "dark"
                ? alpha("#08101d", 0.82)
                : alpha("#f6f9ff", 0.85),
          }}
        >
          <Toolbar
            sx={{
              minHeight: `${APP_BAR_HEIGHT}px !important`,
              height: APP_BAR_HEIGHT,
              gap: 1.5,
            }}
          >
            {isMobile ? (
              <IconButton
                edge="start"
                onClick={() => setMobileDrawerOpen(true)}
                sx={{ mr: 0.5 }}
              >
                <MenuRoundedIcon />
              </IconButton>
            ) : null}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700} noWrap>
                {activeNav.label}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <ButtonGroup
                size="small"
                variant="outlined"
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              >
                <Button
                  onClick={() => setLocale("zh-CN")}
                  variant={locale === "zh-CN" ? "contained" : "outlined"}
                >
                  {t("Chinese")}
                </Button>
                <Button
                  onClick={() => setLocale("en-US")}
                  variant={locale === "en-US" ? "contained" : "outlined"}
                >
                  {t("English")}
                </Button>
              </ButtonGroup>
              <Chip
                color={healthOk ? "success" : "default"}
                label={healthLabel}
                variant="filled"
              />
            </Stack>
          </Toolbar>
          {loading ? <LinearProgress /> : null}
        </AppBar>

        <Box sx={{ display: "flex" }}>
          <Box
            component="nav"
            sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
          >
            <Drawer
              variant="temporary"
              open={mobileDrawerOpen}
              onClose={() => setMobileDrawerOpen(false)}
              ModalProps={{ keepMounted: true }}
              sx={{
                display: { xs: "block", md: "none" },
                "& .MuiDrawer-paper": { width: DRAWER_WIDTH },
              }}
            >
              <AppSidebar
                activeView={activeView}
                items={navItems}
                onSelect={setActiveView}
              />
            </Drawer>
            <Drawer
              variant="permanent"
              open
              sx={{
                display: { xs: "none", md: "block" },
                "& .MuiDrawer-paper": {
                  width: DRAWER_WIDTH,
                  boxSizing: "border-box",
                },
              }}
            >
              <AppSidebar
                activeView={activeView}
                items={navItems}
                onSelect={setActiveView}
              />
            </Drawer>
          </Box>

          <Box
            component="main"
            sx={{
              flex: 1,
              width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
              pb: { xs: activeView === "data" ? 0 : 10, md: 0 },
              overflow: activeView === "data" ? "hidden" : "visible",
            }}
          >
            <Toolbar
              sx={{
                minHeight: `${APP_BAR_HEIGHT}px !important`,
                height: APP_BAR_HEIGHT,
              }}
            />

            {activeView === "data" ? (
              <Box
                sx={{
                  height: dataViewportHeight,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  overflow: "hidden",
                }}
              >
                {error ? (
                  <Box sx={{ p: 2, flexShrink: 0 }}>
                    <ErrorCard message={error} onClose={() => setError("")} />
                  </Box>
                ) : null}
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <DataWorkspace
                    dataSummary={dataSummary}
                    isMobile={isMobile}
                    onDatasetOpen={handleOpenDataset}
                  />
                </Box>
              </Box>
            ) : activeView === "chat" ? (
              <Box
                sx={{
                  height: dataViewportHeight,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  overflow: "hidden",
                  px: { xs: 2, md: 4 },
                  py: { xs: 2, md: 4 },
                }}
              >
                {error ? (
                  <Box sx={{ pb: 2, flexShrink: 0 }}>
                    <ErrorCard message={error} onClose={() => setError("")} />
                  </Box>
                ) : null}
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ChatSection isMobile={isMobile} />
                </Box>
              </Box>
            ) : (
              <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 } }}>
                <Box sx={{ display: "grid", gap: 2 }}>
                  {error ? (
                    <ErrorCard message={error} onClose={() => setError("")} />
                  ) : null}
                  {activeView === "overview" ? (
                    <OverviewSection
                      loading={loading}
                      recentDataset={recentDataset}
                      recentJob={recentJob}
                      status={snapshot.status}
                      health={snapshot.health}
                      config={snapshot.config}
                      onNavigate={setActiveView}
                    />
                  ) : null}
                  {activeView === "training" ? <TrainingSection /> : null}
                </Box>
              </Container>
            )}
          </Box>
        </Box>

        {isMobile ? (
          <Paper
            elevation={8}
            sx={{
              position: "fixed",
              right: 12,
              bottom: 12,
              left: 12,
              zIndex: 1200,
              borderRadius: 4,
              overflow: "hidden",
              border: `1px solid ${theme.palette.divider}`,
              backgroundColor:
                theme.palette.mode === "dark"
                  ? alpha(theme.palette.background.paper, 0.94)
                  : alpha(theme.palette.background.paper, 0.96),
            }}
          >
            <BottomNavigation
              showLabels
              value={activeView}
              onChange={(_, value: NavView) => setActiveView(value)}
            >
              {navItems.map((item) => (
                <BottomNavigationAction
                  key={item.id}
                  label={item.label}
                  value={item.id}
                  icon={item.icon}
                />
              ))}
            </BottomNavigation>
          </Paper>
        ) : null}
      </Box>
    </ThemeProvider>
  );
}

export default App;

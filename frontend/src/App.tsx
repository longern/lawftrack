import { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Chip,
  Container,
  CssBaseline,
  Drawer,
  IconButton,
  LinearProgress,
  Paper,
  Toolbar,
  Typography,
} from "@mui/material";
import { alpha, ThemeProvider } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import AppSidebar from "./components/layout/AppSidebar";
import DataWorkspace from "./components/data/DataWorkspace";
import ErrorCard from "./components/shared/ErrorCard";
import ServiceSection from "./sections/ServiceSection";
import TrainingSection from "./sections/TrainingSection";
import { DRAWER_WIDTH, NAV_ITEMS, SERVICE_COMMANDS } from "./constants/app";
import { createAppTheme } from "./theme/appTheme";
import type { AppSnapshot, DataSummaryItem, NavView, ServiceRecord } from "./types/app";

function App() {
  const APP_BAR_HEIGHT = 72;
  const MOBILE_NAV_HEIGHT = 92;
  const dataViewportHeight = {
    xs: `calc(100dvh - ${APP_BAR_HEIGHT}px - ${MOBILE_NAV_HEIGHT}px)`,
    md: `calc(100dvh - ${APP_BAR_HEIGHT}px)`,
  } as const;
  const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
  const theme = useMemo(() => createAppTheme(prefersDarkMode ? "dark" : "light"), [prefersDarkMode]);
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [activeView, setActiveView] = useState<NavView>("data");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<AppSnapshot>({
    status: null,
    health: null,
    config: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      setLoading(true);
      setError("");

      try {
        const [statusResponse, healthResponse, configResponse] = await Promise.all([
          fetch("/api/status"),
          fetch("/api/healthz"),
          fetch("/api/config"),
        ]);

        if (!statusResponse.ok || !healthResponse.ok || !configResponse.ok) {
          throw new Error("Could not load gateway state");
        }

        const [status, health, config] = await Promise.all([
          statusResponse.json(),
          healthResponse.json(),
          configResponse.json(),
        ]);

        if (!cancelled) {
          setSnapshot({ status, health, config });
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, []);

  const healthLabel = snapshot.health?.status === "ok" ? "正常" : "离线";
  const endpoint = snapshot.config?.vllm_endpoint ?? "Unavailable";
  const apiKey = snapshot.config?.has_api_key ? "已配置" : "未设置";
  const gatewayStatus = snapshot.status?.status ?? "unknown";
  const activeNav = NAV_ITEMS.find((item) => item.id === activeView) ?? NAV_ITEMS[0];

  const dataSummary = useMemo<DataSummaryItem[]>(
    () => [
      {
        title: "网关",
        value: gatewayStatus === "running" ? "已连通" : "未就绪",
        icon: "gateway",
      },
      {
        title: "健康",
        value: healthLabel,
        icon: "health",
      },
      {
        title: "上游",
        value: endpoint,
        icon: "upstream",
      },
      {
        title: "鉴权",
        value: apiKey,
        icon: "auth",
      },
    ],
    [apiKey, endpoint, gatewayStatus, healthLabel],
  );

  const serviceRecords: ServiceRecord[] = [
    { label: "服务名称", value: snapshot.status?.name ?? "Loading..." },
    { label: "网关状态", value: snapshot.status?.status ?? "Loading..." },
    { label: "健康状态", value: snapshot.health?.status ?? "Loading..." },
    { label: "vLLM 地址", value: snapshot.config?.vllm_endpoint ?? "Loading..." },
    {
      label: "API Key",
      value: snapshot.config?.has_api_key ? "Configured" : loading ? "Loading..." : "Not set",
    },
  ];

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
          <Toolbar sx={{ minHeight: `${APP_BAR_HEIGHT}px !important`, height: APP_BAR_HEIGHT }}>
            {isMobile && (
              <IconButton edge="start" onClick={() => setMobileDrawerOpen(true)} sx={{ mr: 1 }}>
                <MenuRoundedIcon />
              </IconButton>
            )}
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" fontWeight={700}>
                {activeNav.label}
              </Typography>
            </Box>
            <Chip
              color={healthLabel === "正常" ? "success" : "default"}
              label={healthLabel}
              variant="filled"
            />
          </Toolbar>
          {loading && <LinearProgress />}
        </AppBar>

        <Box sx={{ display: "flex" }}>
          <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
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
              <AppSidebar activeView={activeView} onSelect={setActiveView} />
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
              <AppSidebar activeView={activeView} onSelect={setActiveView} />
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
            <Toolbar sx={{ minHeight: `${APP_BAR_HEIGHT}px !important`, height: APP_BAR_HEIGHT }} />

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
                  <DataWorkspace dataSummary={dataSummary} isMobile={isMobile} />
                </Box>
              </Box>
            ) : (
              <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 } }}>
                <Box sx={{ display: "grid", gap: 24 }}>
                  {error ? <ErrorCard message={error} onClose={() => setError("")} /> : null}
                  {activeView === "training" ? <TrainingSection /> : null}
                  {activeView === "service" ? (
                    <ServiceSection commands={SERVICE_COMMANDS} records={serviceRecords} />
                  ) : null}
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
              {NAV_ITEMS.map((item) => (
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

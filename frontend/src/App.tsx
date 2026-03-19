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
import { appTheme } from "./theme/appTheme";
import type { AppSnapshot, DataSummaryItem, NavView, ServiceRecord } from "./types/app";

function App() {
  const isMobile = useMediaQuery(appTheme.breakpoints.down("md"));
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
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          background:
            "radial-gradient(circle at top, rgba(31, 75, 153, 0.16), transparent 32%), linear-gradient(180deg, #f6f9ff 0%, #eef3fb 100%)",
        }}
      >
        <AppBar
          position="fixed"
          color="inherit"
          elevation={0}
          sx={{
            width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
            ml: { md: `${DRAWER_WIDTH}px` },
            borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
            backdropFilter: "blur(18px)",
            backgroundColor: alpha("#f6f9ff", 0.85),
          }}
        >
          <Toolbar sx={{ minHeight: 72 }}>
            {isMobile && (
              <IconButton edge="start" onClick={() => setMobileDrawerOpen(true)} sx={{ mr: 1 }}>
                <MenuRoundedIcon />
              </IconButton>
            )}
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" fontWeight={700}>
                {activeNav.label}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {isMobile ? "移动端底部导航切换" : "PC 端侧边栏导航切换"}
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
              pb: { xs: 10, md: 0 },
            }}
          >
            <Toolbar sx={{ minHeight: 72 }} />

            {activeView === "data" ? (
              <Box sx={{ minHeight: "calc(100vh - 72px)" }}>
                {error ? (
                  <Box sx={{ p: 2 }}>
                    <ErrorCard message={error} />
                  </Box>
                ) : null}
                <DataWorkspace dataSummary={dataSummary} isMobile={isMobile} />
              </Box>
            ) : (
              <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 } }}>
                <Box sx={{ display: "grid", gap: 24 }}>
                  {error ? <ErrorCard message={error} /> : null}
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

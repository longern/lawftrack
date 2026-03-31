import HttpsRoundedIcon from "@mui/icons-material/HttpsRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import WifiTetheringRoundedIcon from "@mui/icons-material/WifiTetheringRounded";
import {
  Button,
  ButtonGroup,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { useI18n, type AppLocale } from "../i18n";
import type { GatewayConfig, GatewayHealth, GatewayStatus } from "../types/app";

interface MySectionProps {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  status: GatewayStatus | null;
  health: GatewayHealth | null;
  config: GatewayConfig | null;
}

function MySection({
  locale,
  setLocale,
  status,
  health,
  config,
}: MySectionProps) {
  const { t } = useI18n();
  const healthOk = health?.status === "ok";
  const healthLabel = healthOk ? t("Healthy") : t("Offline");
  const endpoint = config?.vllm_endpoint || t("Not configured");
  const apiKey = config?.has_api_key ? t("Configured") : t("Not set");
  const hostname = status?.hostname || t("Unknown");

  return (
    <Stack spacing={2.5}>
      <Card sx={{ borderRadius: 4 }}>
        <CardContent sx={{ p: 0 }}>
          <List disablePadding>
            <ListItem sx={{ px: 3, py: 2.25 }}>
              <ListItemIcon sx={{ minWidth: 42, pt: 0.25 }}>
                <TranslateRoundedIcon />
              </ListItemIcon>
              <ListItemText
                primary={t("Language preference")}
                secondary={t("Choose the interface language for this browser.")}
                slotProps={{
                  primary: { fontWeight: 700 },
                  secondary: { sx: { mt: 0.5 } },
                }}
              />
              <ButtonGroup
                size="small"
                variant="outlined"
                sx={{ flexShrink: 0, ml: 2 }}
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
            </ListItem>
            <Divider component="li" />
            <ListItem sx={{ px: 3, py: 2.25 }}>
              <ListItemIcon sx={{ minWidth: 42, pt: 0.25 }}>
                <WifiTetheringRoundedIcon />
              </ListItemIcon>
              <ListItemText
                primary={t("Gateway status")}
                secondary={t("Current service connectivity status.")}
                slotProps={{
                  primary: { fontWeight: 700 },
                  secondary: { sx: { mt: 0.5 } },
                }}
              />
              <Chip
                color={healthOk ? "success" : "default"}
                label={healthLabel}
                size="small"
                sx={{ ml: 2 }}
              />
            </ListItem>
            <Divider component="li" />
            <ListItem sx={{ px: 3, py: 2.25 }}>
              <ListItemIcon sx={{ minWidth: 42, pt: 0.25 }}>
                <LinkRoundedIcon />
              </ListItemIcon>
              <ListItemText
                primary={t("Endpoint address")}
                secondary={t("Active upstream service address.")}
                slotProps={{
                  primary: { fontWeight: 700 },
                  secondary: { sx: { mt: 0.5 } },
                }}
              />
              <Typography
                variant="body2"
                fontWeight={600}
                textAlign="right"
                sx={{ maxWidth: 280, ml: 2, wordBreak: "break-word" }}
              >
                {endpoint}
              </Typography>
            </ListItem>
            <Divider component="li" />
            <ListItem sx={{ px: 3, py: 2.25 }}>
              <ListItemIcon sx={{ minWidth: 42, pt: 0.25 }}>
                <HttpsRoundedIcon />
              </ListItemIcon>
              <ListItemText
                primary="API Key"
                secondary={t(
                  "Authentication configuration for the upstream service.",
                )}
                slotProps={{
                  primary: { fontWeight: 700 },
                  secondary: { sx: { mt: 0.5 } },
                }}
              />
              <Typography variant="body2" fontWeight={600} sx={{ ml: 2 }}>
                {apiKey}
              </Typography>
            </ListItem>
            <Divider component="li" />
            <ListItem sx={{ px: 3, py: 2.25 }}>
              <ListItemIcon sx={{ minWidth: 42, pt: 0.25 }}>
                <MemoryRoundedIcon />
              </ListItemIcon>
              <ListItemText
                primary={t("Current device")}
                secondary={t("Host machine reported by the gateway.")}
                slotProps={{
                  primary: { fontWeight: 700 },
                  secondary: { sx: { mt: 0.5 } },
                }}
              />
              <Typography
                variant="body2"
                fontWeight={600}
                textAlign="right"
                sx={{ maxWidth: 220, ml: 2, wordBreak: "break-word" }}
              >
                {hostname}
              </Typography>
            </ListItem>
          </List>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default MySection;

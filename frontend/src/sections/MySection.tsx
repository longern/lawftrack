import HttpsRoundedIcon from "@mui/icons-material/HttpsRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
import TranslateRoundedIcon from "@mui/icons-material/TranslateRounded";
import WifiTetheringRoundedIcon from "@mui/icons-material/WifiTetheringRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import {
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { useI18n, type AppLocale } from "../i18n";
import type { GatewayConfig, GatewayHealth, GatewayStatus } from "../types/app";

interface MySectionProps {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  status: GatewayStatus | null;
  health: GatewayHealth | null;
  config: GatewayConfig | null;
  onOpenGettingStarted: () => void;
}

function MySection({
  locale,
  setLocale,
  status,
  health,
  config,
  onOpenGettingStarted,
}: MySectionProps) {
  const { t } = useI18n();
  const [languageMenuAnchor, setLanguageMenuAnchor] =
    useState<null | HTMLElement>(null);
  const healthOk = health?.status === "ok";
  const healthLabel = healthOk ? t("Healthy") : t("Offline");
  const endpoint = config?.vllm_endpoint || t("Not configured");
  const apiKey = config?.has_api_key ? t("Configured") : t("Not set");
  const hostname = status?.hostname || t("Unknown");
  const languageLabels: Record<AppLocale, string> = {
    "zh-CN": "中文",
    "en-US": "English",
    "ja-JP": "日本語",
  };
  const currentLanguageLabel = languageLabels[locale];

  function handleLanguageMenuClose() {
    setLanguageMenuAnchor(null);
  }

  function handleLanguageSelect(nextLocale: AppLocale) {
    setLocale(nextLocale);
    handleLanguageMenuClose();
  }

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
              <Button
                size="small"
                variant="outlined"
                onClick={(event) => setLanguageMenuAnchor(event.currentTarget)}
                endIcon={<KeyboardArrowDownRoundedIcon />}
                sx={{ flexShrink: 0, ml: 2 }}
              >
                {currentLanguageLabel}
              </Button>
              <Menu
                anchorEl={languageMenuAnchor}
                open={Boolean(languageMenuAnchor)}
                onClose={handleLanguageMenuClose}
              >
                <MenuItem
                  selected={locale === "zh-CN"}
                  onClick={() => handleLanguageSelect("zh-CN")}
                >
                  {languageLabels["zh-CN"]}
                </MenuItem>
                <MenuItem
                  selected={locale === "en-US"}
                  onClick={() => handleLanguageSelect("en-US")}
                >
                  {languageLabels["en-US"]}
                </MenuItem>
                <MenuItem
                  selected={locale === "ja-JP"}
                  onClick={() => handleLanguageSelect("ja-JP")}
                >
                  {languageLabels["ja-JP"]}
                </MenuItem>
              </Menu>
            </ListItem>
            <Divider component="li" />
            <ListItem sx={{ px: 3, py: 2.25 }}>
              <ListItemIcon sx={{ minWidth: 42, pt: 0.25 }}>
                <AutoStoriesRoundedIcon />
              </ListItemIcon>
              <ListItemText
                primary={t("Getting started guide")}
                secondary={t(
                  "Reopen the LAwF walkthrough and the annotation rationale at any time.",
                )}
                slotProps={{
                  primary: { fontWeight: 700 },
                  secondary: { sx: { mt: 0.5 } },
                }}
              />
              <Button
                variant="outlined"
                onClick={onOpenGettingStarted}
                sx={{ ml: 2, flexShrink: 0 }}
              >
                {t("Open")}
              </Button>
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

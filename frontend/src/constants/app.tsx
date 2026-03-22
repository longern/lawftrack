import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import ModelTrainingRoundedIcon from "@mui/icons-material/ModelTrainingRounded";
import SettingsEthernetRoundedIcon from "@mui/icons-material/SettingsEthernetRounded";
import type { CommandItem, NavItem } from "../types/app";

export const DRAWER_WIDTH = 280;

type Translate = (message: string) => string;

export function getNavItems(t: Translate): NavItem[] {
  return [
    { id: "overview", label: t("Overview"), icon: <DashboardRoundedIcon /> },
    { id: "data", label: t("Data"), icon: <DataObjectRoundedIcon /> },
    { id: "training", label: t("Training"), icon: <ModelTrainingRoundedIcon /> },
    { id: "service", label: t("Service"), icon: <SettingsEthernetRoundedIcon /> },
  ];
}

export function getServiceCommands(t: Translate): CommandItem[] {
  return [
    { label: t("Reinstall"), value: "lawftune install" },
    { label: t("Run gateway in foreground"), value: "lawftune gateway" },
    { label: t("Check gateway status"), value: "lawftune gateway status" },
    { label: t("Start gateway service"), value: "lawftune gateway start" },
  ];
}

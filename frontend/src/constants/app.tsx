import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import ModelTrainingRoundedIcon from "@mui/icons-material/ModelTrainingRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import type { NavItem } from "../types/app";

export const DRAWER_WIDTH = 280;

type Translate = (message: string) => string;

export function getNavItems(t: Translate): NavItem[] {
  return [
    { id: "overview", label: t("Overview"), icon: <DashboardRoundedIcon /> },
    { id: "data", label: t("Data"), icon: <DataObjectRoundedIcon /> },
    {
      id: "training",
      label: t("Training"),
      icon: <ModelTrainingRoundedIcon />,
    },
    {
      id: "chat",
      label: t("Chat"),
      icon: <ForumRoundedIcon />,
    },
    {
      id: "me",
      label: t("Me"),
      icon: <PersonRoundedIcon />,
    },
  ];
}

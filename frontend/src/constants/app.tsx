import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import ModelTrainingRoundedIcon from "@mui/icons-material/ModelTrainingRounded";
import SettingsEthernetRoundedIcon from "@mui/icons-material/SettingsEthernetRounded";
import type { NavItem } from "../types/app";

export const DRAWER_WIDTH = 280;

export const NAV_ITEMS: NavItem[] = [
  { id: "data", label: "数据", icon: <DataObjectRoundedIcon /> },
  { id: "training", label: "训练", icon: <ModelTrainingRoundedIcon /> },
  { id: "service", label: "服务", icon: <SettingsEthernetRoundedIcon /> },
];

export const SERVICE_COMMANDS = [
  { label: "重新安装", value: "lawftune install" },
  { label: "前台启动网关", value: "lawftune gateway" },
  { label: "查看服务状态", value: "lawftune gateway status" },
  { label: "启动服务", value: "lawftune gateway start" },
];

export const TRAINING_STEPS = [
  {
    title: "准备数据集",
    body: "在这里接入上传、切分和标注状态，后续可以扩成数据集列表与详情抽屉。",
  },
  {
    title: "配置训练参数",
    body: "适合放 LoRA 参数、基座模型、轮数、批大小，以及训练模板选择。",
  },
  {
    title: "提交与跟踪任务",
    body: "当前可以先展示最近任务、队列状态和日志入口，后面再接真实训练接口。",
  },
];

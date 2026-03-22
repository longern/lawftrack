import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AppLocale = "zh-CN" | "en-US";

type DateTimeFormatOptions = Intl.DateTimeFormatOptions & {
  useSecondsTimestamp?: boolean;
};

const ZH_MESSAGES: Record<string, string> = {
  Overview: "总览",
  Data: "数据",
  Training: "训练",
  Service: "服务",
  Chinese: "中文",
  English: "英文",
  "Unknown error": "未知错误",
  Healthy: "正常",
  Offline: "离线",
  Unavailable: "不可用",
  Configured: "已配置",
  "Not set": "未设置",
  Gateway: "网关",
  Connected: "已连通",
  "Not ready": "未就绪",
  Health: "健康",
  Upstream: "上游",
  Auth: "鉴权",
  "Service name": "服务名称",
  "Gateway status": "网关状态",
  "Health status": "健康状态",
  "vLLM endpoint": "vLLM 地址",
  "Loading...": "加载中...",
  "Generating...": "生成中...",
  Reinstall: "重新安装",
  "Run gateway in foreground": "前台启动网关",
  "Check gateway status": "查看服务状态",
  "Start gateway service": "启动服务",
  "Gateway data could not be loaded": "网关数据加载失败",
  "Service details": "服务详情",
  "Common commands": "常用命令",
  Device: "设备",
  Hostname: "主机名",
  "Operating system": "操作系统",
  Architecture: "架构",
  "Python version": "Python 版本",
  "GPU snapshot": "GPU 快照",
  "VRAM total": "显存总量",
  "VRAM used": "显存已用",
  "VRAM free": "显存剩余",
  "GPU utilization": "GPU 利用率",
  Temperature: "温度",
  "No GPU detected": "未检测到 GPU",
  "No NVIDIA GPU metrics available on the server yet.":
    "服务端暂时没有可用的 NVIDIA GPU 指标。",
  Language: "语言",
  Unknown: "未知",
  "CPU threads": "CPU 线程",
  Viewport: "视口",
  Network: "网络",
  Online: "在线",
  "Base model": "基座模型",
  Samples: "样本",
  "Updated at": "最近更新",
  Status: "状态",
  "No job yet": "暂无任务",
  Model: "模型",
  "Dataset ID": "数据集 ID",
  "Not linked": "未绑定",
  "Created at": "创建时间",
  "Health check": "健康检查",
  "Upstream endpoint": "上游地址",
  "Not configured": "未配置",
  "lawftune Workspace": "lawftune 工作台",
  "See datasets, training jobs, and gateway health in one place, then jump straight into the next task.":
    "在一个界面里查看数据集、训练任务和网关状态，快速切到正在处理的工作。",
  "Open data workspace": "打开数据工作区",
  "Open training queue": "查看训练队列",
  "Recent dataset": "最近数据集",
  "No activity yet": "暂无记录",
  "No recently opened dataset": "还没有最近打开的数据集",
  "Create or open a dataset to see its latest configuration and timestamp here.":
    "创建或打开一个数据集后，这里会显示最近的配置和更新时间。",
  "Recent training job": "最近训练任务",
  "No training jobs yet": "还没有训练任务",
  Created: "创建于",
  "Submit a training job to see its status, model, and linked dataset here.":
    "提交第一条训练任务后，这里会显示状态、模型和关联数据集。",
  "Current device": "当前设备",
  "Server device": "服务端设备",
  "Service snapshot": "服务快照",
  Datasets: "数据集",
  "New dataset": "新建数据集",
  "Creating...": "创建中...",
  "Import dataset": "上传数据集",
  "Recently opened": "最近打开",
  "No base model": "未设置模型",
  "All datasets": "所有数据集",
  "No datasets yet.": "还没有数据集。",
  "Dataset workspace": "数据集工作区",
  Creating: "创建中",
  New: "新建",
  Import: "上传",
  Open: "打开",
  "No datasets yet. Create one to get started.": "还没有数据集，先新建一个。",
  items: "条",
  "Loading samples...": "加载样本中...",
  "This dataset has no samples yet.": "当前数据集没有样本。",
  "Dataset name": "数据集名称",
  "Annotation model / Base model": "标注模型 / Base Model",
  "Choose from the model list or enter a local model path directly.":
    "可从模型列表选择，也可直接输入本地模型目录路径。",
  "Saving...": "保存中...",
  "Save dataset config": "保存数据集配置",
  "Dataset metadata": "数据集元数据",
  Welcome: "欢迎",
  Dataset: "数据集",
  Edit: "编辑",
  "Failed to load datasets": "加载数据集失败",
  "Failed to load samples": "加载样本失败",
  "Failed to create dataset": "创建数据集失败",
  "Failed to save dataset": "保存数据集失败",
  "Failed to import dataset": "导入数据集失败",
  "Failed to create sample": "创建样本失败",
  "Please configure a base model for the current dataset first.":
    "请先为当前数据集配置基础模型。",
  "Failed to load token data": "加载 token 信息失败",
  "Failed to save sample": "保存样本失败",
  "The last assistant message already has content. Clear or remove it before generating again.":
    "当前最后一条 assistant 消息已有内容，请先清空或删除后再生成。",
  "Keep at least one message before generating.":
    "请至少保留一条消息后再生成。",
  "The model returned no writable delta, so generation could not continue.":
    "模型没有返回可写入的增量内容，无法继续生成。",
  "Failed to continue generation": "继续生成失败",
  "Failed to delete dataset": "删除数据集失败",
  "Failed to delete sample": "删除样本失败",
  "Failed to refresh token data": "刷新 token 信息失败",
  "Open a dataset before saving samples.": "保存样本前需要先打开一个数据集。",
  "Failed to load models": "加载模型列表失败",
  "Failed to generate assistant message": "生成 assistant 消息失败",
  "Delete dataset": "删除数据集",
  "Delete sample": "删除样本",
  'Are you sure you want to delete dataset "{name}"? This will remove the dataset and all of its samples permanently.':
    "确认删除数据集“{name}”吗？此操作会移除数据集及其所有样本，且无法撤销。",
  'Are you sure you want to delete sample "{title}"? This action cannot be undone.':
    "确认删除样本“{title}”吗？删除后无法恢复。",
  Cancel: "取消",
  "Deleting...": "删除中...",
  "Confirm delete": "确认删除",
  "Failed to load files": "加载文件失败",
  "Failed to load training jobs": "加载训练任务失败",
  "Failed to load training logs": "加载训练日志失败",
  "Failed to refresh training page": "刷新训练页面失败",
  "Failed to upload file": "上传文件失败",
  "Select a training file first.": "必须先选择训练集文件。",
  "Failed to create training job": "创建训练任务失败",
  "Failed to cancel job": "取消任务失败",
  "Training console": "训练控制台",
  "Create training job": "创建训练任务",
  "Training files": "训练文件库",
  "Uploading...": "上传中...",
  "No training files yet. Upload a JSON/JSONL/CSV/Parquet file first.":
    "还没有训练文件。先上传一个 JSON/JSONL/CSV/Parquet 文件。",
  "Use as training file": "作为训练集",
  "Use as validation file": "作为验证集",
  "Training queue": "训练任务队列",
  'No training jobs yet. Click "Create training job" to get started.':
    "还没有训练任务。点击右上角“创建训练任务”开始。",
  "Job details": "任务详情",
  "Cancel job": "取消任务",
  "Select a training job to view details.": "选择一个训练任务查看详情。",
  "Basic info": "基础信息",
  Method: "方法",
  "File references": "文件引用",
  "Training file": "训练集文件",
  "Validation file": "验证集文件",
  "Runtime status": "运行状态",
  "End time": "结束时间",
  "Outputs and errors": "产物与错误",
  "Fine-tuned model": "微调模型",
  "Training curve": "训练曲线",
  "Logs and events": "日志与事件",
  Events: "事件",
  "Raw logs": "原始日志",
  "No events.": "暂无事件。",
  "No raw logs.": "暂无原始日志。",
  "No content": "暂无内容",
  "No loss data available to plot.": "暂无可绘制的损失数据。",
  "Training loss curve": "训练损失曲线",
  "Initial loss": "起始 loss",
  "Latest loss": "最新 loss",
  "Lowest loss": "最低 loss",
  "or /path/to/model": "或 /path/to/model",
  "Do not attach dataset metadata": "不绑定数据集元数据",
  "Training method": "训练方法",
  "Generated on create": "创建时生成",
  "Do not use": "不使用",
  "Advanced settings": "高级设置",
  "Enable TensorBoard integration": "启用 TensorBoard 集成",
  "Submitting...": "提交中...",
  "Message flow": "消息流",
  "Generate AI message": "生成 AI 消息",
  "Save sample": "保存样本",
  "Select a sample to start editing.": "选择一条样本开始编辑。",
  "Add user message": "添加用户消息",
  "Add assistant message": "添加助手消息",
  "Line break token": "换行 token",
  Reasoning: "推理内容",
  "Token rewrite": "Token 改写",
  "Original {target} token: {token}": "原 {target} token: {token}",
  "Replace with": "替换为",
  "Candidate tokens": "候选 token",
  "Loading candidates...": "加载候选中...",
  "No candidates.": "暂无候选。",
  "Accept and save": "接受并保存",
  "Discard rewrite": "放弃改写",
  "Replace and continue": "替换并继续生成",
  "Click any token in an assistant message to replace it and continue generation from that point.":
    "点击 assistant 消息中的任意 token 后，可将它替换为新 token，并让模型从该位置继续生成。",
  "Click a token in an assistant message to start rewriting.":
    "点击 assistant 消息里的 token 开始改写。",
  "Original token: {token}": "原 token: {token}",
  Discard: "放弃",
  "Continue generation": "继续生成",
  "Just now": "刚刚",
};

interface I18nContextValue {
  locale: AppLocale;
  isZh: boolean;
  setLocale: (locale: AppLocale) => void;
  t: (message: string, params?: Record<string, string | number>) => string;
  formatDateTime: (
    value?: number | null,
    options?: DateTimeFormatOptions,
  ) => string;
  formatRelativeTime: (value?: number | null) => string;
  formatDatasetCount: (count?: number | null) => string;
  formatTaskCount: (count?: number | null) => string;
}

const LOCALE_STORAGE_KEY = "lawftune:locale";

const I18nContext = createContext<I18nContextValue | null>(null);

function normalizeLocale(value?: string | null): AppLocale {
  if (!value) {
    return "zh-CN";
  }
  return value.toLowerCase().startsWith("en") ? "en-US" : "zh-CN";
}

function toDate(
  value?: number | null,
  useSecondsTimestamp = true,
): Date | null {
  if (!value) {
    return null;
  }
  return new Date(useSecondsTimestamp ? value * 1000 : value);
}

function interpolate(
  message: string,
  params?: Record<string, string | number>,
) {
  if (!params) {
    return message;
  }
  return Object.entries(params).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    message,
  );
}

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<AppLocale>(() => {
    if (typeof window === "undefined") {
      return "zh-CN";
    }
    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return normalizeLocale(storedLocale ?? window.navigator.language);
  });

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    const isZh = locale === "zh-CN";
    const t = (message: string, params?: Record<string, string | number>) => {
      const translated = isZh ? (ZH_MESSAGES[message] ?? message) : message;
      return interpolate(translated, params);
    };

    return {
      locale,
      isZh,
      setLocale,
      t,
      formatDateTime: (value, options) => {
        const date = toDate(value, options?.useSecondsTimestamp ?? true);
        if (!date) {
          return "-";
        }

        const {
          useSecondsTimestamp: _useSecondsTimestamp,
          ...dateTimeOptions
        } = options ?? {};
        return new Intl.DateTimeFormat(locale, {
          hour12: false,
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          ...dateTimeOptions,
        }).format(date);
      },
      formatRelativeTime: (value) => {
        if (!value) {
          return t("No activity yet");
        }

        const diffMinutes = Math.max(
          0,
          Math.round((Date.now() - value * 1000) / 60000),
        );
        if (diffMinutes < 1) {
          return t("Just now");
        }
        if (diffMinutes < 60) {
          return isZh ? `${diffMinutes} 分钟前` : `${diffMinutes} min ago`;
        }

        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) {
          return isZh ? `${diffHours} 小时前` : `${diffHours} hr ago`;
        }

        const diffDays = Math.round(diffHours / 24);
        return isZh
          ? `${diffDays} 天前`
          : `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
      },
      formatDatasetCount: (count) =>
        isZh ? `${count ?? 0} 条样本` : `${count ?? 0} samples`,
      formatTaskCount: (count) =>
        isZh ? `${count ?? 0} 个任务` : `${count ?? 0} jobs`,
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

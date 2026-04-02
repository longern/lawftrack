import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AppLocale = "zh-CN" | "en-US" | "ja-JP";

type DateTimeFormatOptions = Intl.DateTimeFormatOptions & {
  useSecondsTimestamp?: boolean;
};

const ZH_MESSAGES: Record<string, string> = {
  Overview: "总览",
  Data: "数据",
  Training: "训练",
  Service: "服务",
  Chat: "对话",
  Me: "我的",
  Chinese: "中文",
  English: "英文",
  Japanese: "日语",
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
  "lawftrack Workspace": "lawftrack 工作台",
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
  "My settings": "我的设置",
  "Manage your workspace preferences and keep an eye on the current gateway configuration.":
    "在这里管理常用偏好，并随时查看当前网关配置。",
  "Settings menu": "设置菜单",
  "Use this page to adjust language and inspect the runtime configuration used by this workspace.":
    "在这个页面里调整语言，并查看当前工作区正在使用的运行配置。",
  "Language preference": "语言偏好",
  "Choose the interface language for this browser.": "为当前浏览器选择界面语言。",
  "Current service connectivity status.": "当前服务连通状态。",
  "Endpoint address": "端点地址",
  "Active upstream service address.": "当前启用的上游服务地址。",
  "Authentication configuration for the upstream service.":
    "上游服务的鉴权配置状态。",
  "Host machine reported by the gateway.": "网关当前上报的主机名。",
  "More settings will appear here as workspace preferences expand.":
    "后续更多工作区偏好也会集中放在这里。",
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
  "Export dataset": "导出数据集",
  "Exporting...": "导出中...",
  "Dataset metadata": "数据集元数据",
  Welcome: "欢迎",
  Dataset: "数据集",
  Edit: "编辑",
  "Failed to load datasets": "加载数据集失败",
  "Failed to load samples": "加载样本失败",
  "Failed to create dataset": "创建数据集失败",
  "Failed to save dataset": "保存数据集失败",
  "Failed to export dataset": "导出数据集失败",
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
  "Token probability: {probability}": "Token 概率：{probability}",
  "Token probability unavailable": "Token 概率不可用",
  "Failed to load models": "加载模型列表失败",
  "Failed to generate assistant message": "生成 assistant 消息失败",
  "Delete dataset": "删除数据集",
  "Delete sample": "删除样本",
  'Are you sure you want to delete dataset "{name}"? This will remove the dataset and all of its samples permanently.':
    "确认删除数据集“{name}”吗？此操作会移除数据集及其所有样本，且无法撤销。",
  'Are you sure you want to delete sample "{title}"? This action cannot be undone.':
    "确认删除样本“{title}”吗？删除后无法恢复。",
  Cancel: "取消",
  Close: "关闭",
  "Deleting...": "删除中...",
  "Confirm delete": "确认删除",
  "Failed to load files": "加载文件失败",
  "Failed to load training jobs": "加载训练任务失败",
  "Failed to load training logs": "加载训练日志失败",
  "Failed to refresh training page": "刷新训练页面失败",
  "Select a dataset first.": "请先选择一个数据集。",
  "Select a dataset": "选择数据集",
  "Create a dataset first to start a training job.":
    "请先创建一个数据集，再开始训练任务。",
  "Training job details": "训练任务详情",
  "Back to training queue": "返回训练队列",
  "Failed to upload file": "上传文件失败",
  "Select a training file first.": "必须先选择训练集文件。",
  "Failed to create training job": "创建训练任务失败",
  "Failed to cancel job": "取消任务失败",
  "Failed to generate response": "生成回复失败",
  "Training console": "训练控制台",
  "Create training job": "创建训练任务",
  "Training files": "训练文件库",
  Refresh: "刷新",
  Upload: "上传",
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
  "Download full logs": "下载完整日志",
  "Showing the last {count} lines from each log stream.":
    "当前仅显示每个日志流最后 {count} 行。",
  "No events.": "暂无事件。",
  "No raw logs.": "暂无原始日志。",
  "No content": "暂无内容",
  "No loss data available to plot.": "暂无可绘制的损失数据。",
  "Training loss curve": "训练损失曲线",
  "Initial loss": "起始 loss",
  "Latest loss": "最新 loss",
  "Latest valid loss": "最新验证 loss",
  "Lowest loss": "最低 loss",
  "Validating files": "校验文件中",
  Queued: "排队中",
  Running: "运行中",
  Succeeded: "已成功",
  Failed: "失败",
  Cancelled: "已取消",
  Paused: "已暂停",
  "Pending load": "等待加载",
  Loaded: "已加载",
  "Load failed": "加载失败",
  "Train loss": "训练 loss",
  "Validation loss": "验证 loss",
  Step: "步数",
  "or /path/to/model": "或 /path/to/model",
  "Do not attach dataset metadata": "不绑定数据集元数据",
  "Training method": "训练方法",
  "Generated on create": "创建时生成",
  "Do not use": "不使用",
  "Advanced settings": "高级设置",
  "Enable TensorBoard integration": "启用 TensorBoard 集成",
  "Submitting...": "提交中...",
  Prompt: "提问",
  Response: "回复",
  Send: "发送",
  Conversation: "对话记录",
  "Model chat": "模型对话",
  "Single model": "单模型",
  "Compare two models": "双模型对比",
  "Model A": "模型 A",
  "Model B": "模型 B",
  "System prompt": "系统提示词",
  "Optional instructions shared with the selected model(s).":
    "可选的全局指令，会一并发送给当前选中的模型。",
  "Refresh model list": "刷新模型列表",
  "Choose from the model list or enter a model ID directly.":
    "可从模型列表中选择，也可直接输入模型 ID。",
  "Fine-tuned from {parent}": "微调自{parent}",
  "Each turn keeps the same user prompt and shows one answer per model.":
    "每一轮都会保留同一条用户提问，并分别展示两个模型的回答。",
  "Each turn keeps the shared conversation history for the selected model.":
    "每一轮都会沿用当前模型的共享对话历史。",
  "New conversation": "新建对话",
  Ready: "就绪",
  "Start a conversation": "开始对话",
  "Choose your model setup, then send a prompt from the composer at the bottom.":
    "先配置模型，再从底部输入框发送第一条消息。",
  "Message the selected model and keep the conversation going...":
    "给当前模型发消息，继续这段对话……",
  "Enter to send, Shift + Enter for newline": "Enter 发送，Shift + Enter 换行",
  "Stop generating": "停止生成",
  "Start a conversation by selecting model settings and sending a prompt.":
    "选择模型设置后，发送一条消息开始对话。",
  "Ctrl/Cmd + Enter to send": "按 Ctrl/Cmd + Enter 发送",
  "Describe the task, question, or scenario you want to discuss.":
    "输入你想讨论的任务、问题或场景。",
  "Ask both models": "同时询问两个模型",
  "Ask one model": "询问单个模型",
  "Thought process": "思考过程",
  "Show reasoning": "展开推理",
  "Hide reasoning": "收起推理",
  "Scroll to bottom": "滚动到底部",
  "Waiting for model output.": "等待模型输出...",
  "Please enter a prompt.": "请输入提问内容。",
  "Select a model first.": "请先选择一个模型。",
  "Select a second model first.": "请先选择第二个模型。",
  "Select two different models to compare.": "请选择两个不同的模型进行对比。",
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
  Revert: "还原",
  "Click any token in an assistant message to replace it and continue generation from that point.":
    "点击 assistant 消息中的任意 token 后，可将它替换为新 token，并让模型从该位置继续生成。",
  "Click a token in an assistant message to start rewriting.":
    "点击 assistant 消息里的 token 开始改写。",
  "Original token: {token}": "原 token: {token}",
  Discard: "放弃",
  "Continue generation": "继续生成",
  "Just now": "刚刚",
  "Getting started": "入门",
  "Getting started guide": "入门向导",
  "Recommended on first launch": "首次打开建议先看",
  "Read the LAwF method, understand why this workspace uses anchor-style annotation, and jump into your first dataset.":
    "阅读 LAwF 方法，理解为什么这个工作区采用 anchor 式标注，并直接开始你的第一份数据集。",
  "Open guide": "打开向导",
  "Back to overview": "返回总览",
  "How it works": "工作原理",
  "Start with LAwF and anchor-style annotation": "从 LAwF 与 anchor 式标注开始",
  "lawftrack is built around LAwF, a token-level fine-tuning idea from the linked repository. It only asks annotators to correct the crucial wrong token, while the rest of the sequence stays close to the reference model.":
    "lawftrack 围绕 LAwF 设计。这个方法来自上方链接的仓库，核心是只要求标注者纠正关键错误 token，同时让其余序列尽量贴近参考模型。",
  "lawftrack is an open-source no-code self-distillation fine-tuning framework for large language models.":
    "lawftrack 是一款开源无代码大模型自蒸馏微调框架。",
  Introduction: "概述",
  "Product positioning": "产品定位",
  "Algorithm principles": "算法原理",
  "LAwF algorithm principle diagram": "LAwF 算法原理示意图",
  "Core mechanism": "核心机制",
  "It combines dataset management, response correction, training launch, and result tracking in one interface so users can finish the full fine-tuning workflow without writing training scripts.":
    "lawftrack 是一款开源无代码大模型自蒸馏微调框架。它把数据集管理、回答修正、训练发起和结果追踪整合到同一个界面中，让用户不需要手写训练脚本，也能完成从数据到微调模型的完整流程。",
  "Its core idea is not to rewrite every answer from scratch, but to correct the decisive error positions and keep the rest of the model behavior as stable as possible.":
    "它的核心思路不是把每条答案从头重写，而是只纠正真正决定行为变化的错误位置，并尽量保持其余部分的模型行为稳定。",
  "It does not retrain everything. It changes only what should change.":
    "它不是把模型整体重训一遍，而是只改真正该改的地方。",
  "Traditional fine-tuning often asks annotators to rewrite the full answer even when only a few crucial tokens are wrong. That raises labeling cost and makes the model more likely to drift away from capabilities it already had.":
    "传统微调通常要求标注者把整段答案完整重写，即使真正出错的只是少数几个关键 token。这样既会抬高标注成本，也更容易让模型偏离原本已经具备的能力。",
  "lawftrack follows a LAwF-style training approach: users mark the key wrong token, provide the correction, and let the system focus learning on the positions that actually change behavior.":
    "lawftrack 采用 LAwF 风格的训练思路：用户只需要标记关键错误 token，给出修正结果，再让系统把学习重点集中到真正影响行为变化的位置上。",
  "The untouched positions still stay close to the base model's output distribution, so the model is corrected locally instead of being reshaped globally.":
    "那些没有被改动的位置仍然会尽量贴近基座模型原本的输出分布，因此模型得到的是局部纠正，而不是整体重塑。",
  "How the training algorithm works": "训练算法是怎么工作的",
  "During training, the base model's original output distribution is used as the teacher signal for most tokens.":
    "训练时，基座模型原本的输出分布会作为大部分 token 的教师信号。",
  "When a token is marked as a key error, the training target at that position is pulled toward the human correction, while the remaining positions continue to follow the teacher distribution.":
    "当某个 token 被标记为关键错误时，该位置的训练目标会被明确拉向人工修正结果，而其余位置仍然继续跟随教师分布。",
  "This combines explicit supervision on anchor tokens with self-distillation on non-anchor tokens, so the model learns what to change without forgetting everything else.":
    "这相当于把 anchor token 上的显式监督，与非 anchor token 上的自蒸馏结合到同一个训练目标里，让模型学会该改什么，同时不过度遗忘其它能力。",
  "During training, non-anchor positions keep the base model's target distribution, while the anchor position is explicitly supervised with the human-corrected token.":
    "训练时，非 anchor 位置保持基座模型原本的目标分布，而 anchor 位置则用人工修正后的 token 进行显式监督。",
  "In the diagram above, SFT pushes every aligned position toward the rewritten answer, while LAwF leaves non-anchor positions unchanged and updates only the anchor token.":
    "在上面的示意图里，SFT 会把所有对齐位置都推向重写后的答案，而 LAwF 会保持非 anchor 位置不变，只更新 anchor token。",
  "How it differs from traditional SFT": "它和传统 SFT 有什么不同",
  "Traditional SFT asks the model to reproduce the whole target answer. Even when only a small span is wrong, the entire response becomes a training target.":
    "传统 SFT 的做法，是让模型去复现整段目标答案。即使只有一小段内容是错的，整条回答也会一起成为训练目标。",
  "lawftrack concentrates the training signal on the critical tokens that determine the behavioral change, so data labeling is lighter and the optimization target is more precise.":
    "lawftrack 会把训练信号集中到真正决定行为变化的关键 token 上，因此标注负担更轻，训练目标也更精确。",
  "That means even tokens that were already acceptable are also pushed toward the rewritten sequence, making the optimization target broader than necessary.":
    "这意味着即使原本已经可以接受的 token，也会被一起推向重写后的序列，因此训练目标会比真正需要的范围更宽。",
  "It is closer to targeted correction than full-answer rewriting.":
    "它更像一种定向纠偏，而不是整段重写。",
  "How it differs from pure distillation": "它和纯蒸馏方法有什么不同",
  "Pure distillation mainly keeps the model close to a reference distribution. That helps preserve style and stability, but it does not tell the model which behavior should be corrected.":
    "纯蒸馏的主要作用，是让模型尽量贴近某个参考分布。这样有助于保持风格和稳定性，但它并不会直接告诉模型到底该纠正哪种行为。",
  "lawftrack keeps that distribution-preserving effect on non-anchor positions, then adds human corrections on anchor tokens so the model learns both what should stay unchanged and where it must change.":
    "lawftrack 在非 anchor 位置保留这种维持参考分布的效果，同时在 anchor token 上加入人工修正，因此模型学到的不只是哪些部分应当保持不变，还包括哪些位置必须改。",
  "How it differs from reinforcement learning": "与 RL 的区别",
  "How it differs from preference learning or reinforcement learning":
    "它和偏好学习、强化学习有什么不同",
  "Preference optimization and reinforcement learning are useful for more complex alignment problems, but they usually require heavier data construction, more training control, and higher experimentation cost.":
    "偏好优化和强化学习适合处理更复杂的对齐问题，但它们通常需要更重的数据构造、更复杂的训练控制，以及更高的实验成本。",
  "lawftrack is designed for the lighter case: the model is mostly correct already, but keeps making recurring mistakes at a few key positions.":
    "lawftrack 更适合另一类更轻量的场景：模型整体已经接近正确，但总是在少数几个关键位置重复出错。",
  "Why this works well for targeted fine-tuning": "为什么这种方式更适合做定向微调",
  "Because annotation effort is spent only on the positions that really matter, users can iterate faster while keeping more of the base model's original knowledge.":
    "因为人工标注成本只花在真正重要的位置上，用户可以更快迭代，同时保留更多基座模型原本的知识。",
  "Applicable scenarios": "适用场景",
  "terminology correction": "术语修正",
  "factual error repair": "事实纠错",
  "format and schema constraints": "格式与结构约束",
  "style alignment": "风格对齐",
  "domain-specific answer adjustment": "领域化回答调整",
  "Typical workflow in lawftrack": "在 lawftrack 里的典型使用流程",
  "Usage flow": "使用流程",
  "Generate an answer, inspect the tokenized output, and locate the key error token.":
    "先生成回答，查看 token 级输出，再定位关键错误 token。",
  "Replace the error token, continue generation, and save the corrected sample.":
    "替换错误 token，继续生成后续内容，并保存修正后的样本。",
  "Launch a training job after a batch of corrected samples is ready, so the model learns the local corrections instead of relearning every full response.":
    "当你积累了一批修正样本后，就可以直接发起训练任务，让模型学习这些局部修正，而不是把整条回答重新学一遍。",
  "One-sentence summary": "一句话总结",
  "Instead of choosing between rewriting everything and imitating everything, lawftrack takes a third path: correct only the parts that must change, and preserve the rest of the model as much as possible.":
    "传统方法往往是在“全部重写”和“全部模仿”之间做选择，而 lawftrack 选择的是第三条路径：只纠正真正必须改变的部分，并尽量保留模型其余能力。",
  "Open LAwF repository": "打开 LAwF 仓库",
  "How LAwF works": "LAwF 如何工作",
  "LAwF blends supervised anchors with the reference model's distribution.":
    "LAwF 把监督式 anchor 标注与参考模型分布结合成同一个训练目标。",
  "Annotators mark the first wrong token, provide the correct replacement, and let generation continue from there.":
    "标注时只需要定位第一个错误 token，填入正确替换项，再从该位置继续生成。",
  "Non-anchor tokens keep the reference model's behavior, which helps preserve prior knowledge instead of overwriting everything.":
    "非 anchor token 会尽量保持参考模型的行为，这样能保留已有知识，而不是把整段输出都重写掉。",
  "Why this annotation style is needed": "为什么需要这种标注方式",
  "Full-sequence supervision is expensive because every answer must be rewritten even when only a few tokens are wrong.":
    "如果沿用整段监督标注，即使只错了少数 token，也要把整条回答重新改写，成本很高。",
  "Anchor-only correction cuts labeling cost to the decisive edits that actually change the behavior.":
    "只改 anchor 能把标注成本压缩到真正影响模型行为的关键编辑上。",
  "Keeping the untouched tokens close to the reference model reduces catastrophic forgetting during fine-tuning.":
    "让未改动 token 继续贴近参考模型，可以降低微调时的灾难性遗忘。",
  "How to use it in lawftrack": "在 lawftrack 里怎么使用",
  "Create or open a dataset and choose the base model used for generation and training.":
    "创建或打开数据集，并选好用于生成和训练的基座模型。",
  "Write the prompt, generate an assistant answer, and inspect the tokenized output in the data workspace.":
    "写下 prompt，生成 assistant 回复，然后在数据工作区检查 token 化后的输出。",
  "Click the first wrong assistant token, replace it, then continue generation until the sample becomes correct.":
    "点击第一个错误的 assistant token，替换它，再继续生成，直到整条样本变正确。",
  "Export the dataset or launch a LAwF training job so the model learns the anchor tokens without drifting too far from the base model.":
    "导出数据集或直接发起 LAwF 训练任务，让模型学会这些 anchor，同时不过度偏离基座模型。",
  "Next step": "下一步",
  "Start your first anchor-labeled dataset or revisit training after you have a few corrected samples.":
    "现在就开始你的第一份 anchor 标注数据集，或者在积累几条修正样本后回到训练页面。",
  "Reopen the LAwF walkthrough and the annotation rationale at any time.":
    "你可以随时重新打开这份 LAwF 入门说明和标注设计原因。",
};

const JA_MESSAGES: Record<string, string> = {
  Overview: "概要",
  Data: "データ",
  Training: "学習",
  Service: "サービス",
  Chat: "チャット",
  Me: "設定",
  Chinese: "中国語",
  English: "英語",
  Japanese: "日本語",
  "Unknown error": "不明なエラー",
  Healthy: "正常",
  Offline: "オフライン",
  Unavailable: "利用不可",
  Configured: "設定済み",
  "Not set": "未設定",
  Gateway: "ゲートウェイ",
  Connected: "接続済み",
  "Not ready": "未準備",
  Health: "状態",
  Upstream: "アップストリーム",
  Auth: "認証",
  "Service name": "サービス名",
  "Gateway status": "ゲートウェイ状態",
  "Health status": "ヘルス状態",
  "vLLM endpoint": "vLLM エンドポイント",
  "Loading...": "読み込み中...",
  "Generating...": "生成中...",
  Language: "言語",
  Unknown: "不明",
  "Base model": "ベースモデル",
  Samples: "サンプル",
  "Updated at": "更新日時",
  Status: "ステータス",
  "No job yet": "ジョブなし",
  Model: "モデル",
  "Dataset ID": "データセット ID",
  "Not linked": "未関連付け",
  "Created at": "作成日時",
  "Health check": "ヘルスチェック",
  "Upstream endpoint": "アップストリーム先",
  "Not configured": "未設定",
  "lawftrack Workspace": "lawftrack ワークスペース",
  "See datasets, training jobs, and gateway health in one place, then jump straight into the next task.":
    "データセット、学習ジョブ、ゲートウェイ状態を一か所で確認し、そのまま次の作業に進めます。",
  "Open data workspace": "データワークスペースを開く",
  "Open training queue": "学習キューを開く",
  "Recent dataset": "最近のデータセット",
  "No activity yet": "まだアクティビティはありません",
  "No recently opened dataset": "最近開いたデータセットはありません",
  "Create or open a dataset to see its latest configuration and timestamp here.":
    "データセットを作成または開くと、最新の設定と更新時刻がここに表示されます。",
  "Recent training job": "最近の学習ジョブ",
  "No training jobs yet": "まだ学習ジョブはありません",
  Created: "作成",
  "Submit a training job to see its status, model, and linked dataset here.":
    "学習ジョブを送信すると、状態、モデル、関連データセットがここに表示されます。",
  "Current device": "現在のデバイス",
  "Server device": "サーバーデバイス",
  "Service snapshot": "サービススナップショット",
  "My settings": "設定",
  "Manage your workspace preferences and keep an eye on the current gateway configuration.":
    "ワークスペース設定を管理し、現在のゲートウェイ構成を確認できます。",
  "Settings menu": "設定メニュー",
  "Use this page to adjust language and inspect the runtime configuration used by this workspace.":
    "このページでは表示言語を変更し、このワークスペースで使われている実行設定を確認できます。",
  "Language preference": "表示言語",
  "Choose the interface language for this browser.":
    "このブラウザで使うインターフェース言語を選択します。",
  "Current service connectivity status.": "現在のサービス接続状態です。",
  "Endpoint address": "エンドポイントアドレス",
  "Active upstream service address.": "現在有効なアップストリームサービスのアドレスです。",
  "Authentication configuration for the upstream service.":
    "アップストリームサービスの認証設定です。",
  "Host machine reported by the gateway.":
    "ゲートウェイが報告したホストマシン名です。",
  "More settings will appear here as workspace preferences expand.":
    "ワークスペース設定が増えると、ここに順次追加されます。",
  Open: "開く",
  Close: "閉じる",
  Refresh: "更新",
  "Getting started": "入門",
  "Getting started guide": "はじめにガイド",
  "Recommended on first launch": "初回起動時におすすめ",
  "Read the LAwF method, understand why this workspace uses anchor-style annotation, and jump into your first dataset.":
    "LAwF の考え方を読み、このワークスペースが anchor 型アノテーションを使う理由を理解して、最初のデータセット作成に進みましょう。",
  "Open guide": "ガイドを開く",
  "Back to overview": "概要に戻る",
  "How it works": "仕組み",
  Introduction: "概要",
  "Algorithm principles": "アルゴリズム原理",
  "LAwF algorithm principle diagram": "LAwF アルゴリズム原理図",
  "Core mechanism": "中核メカニズム",
  "It combines dataset management, response correction, training launch, and result tracking in one interface so users can finish the full fine-tuning workflow without writing training scripts.":
    "lawftrack は、データセット管理、応答修正、学習開始、結果追跡を一つの画面にまとめ、学習スクリプトを書かなくても微調整の流れを完結できるようにします。",
  "Its core idea is not to rewrite every answer from scratch, but to correct the decisive error positions and keep the rest of the model behavior as stable as possible.":
    "中核となる考え方は、すべての回答を書き直すことではなく、挙動を左右する誤り位置だけを修正し、それ以外のモデル挙動はできるだけ安定して保つことです。",
  "Traditional fine-tuning often asks annotators to rewrite the full answer even when only a few crucial tokens are wrong. That raises labeling cost and makes the model more likely to drift away from capabilities it already had.":
    "従来の微調整では、重要な token が少数だけ誤っていても回答全体を書き直すことが多く、アノテーションコストが上がり、既存能力からも逸れやすくなります。",
  "lawftrack follows a LAwF-style training approach: users mark the key wrong token, provide the correction, and let the system focus learning on the positions that actually change behavior.":
    "lawftrack は LAwF 型の学習方針を取り、ユーザーは重要な誤り token を指定して修正し、実際に挙動が変わる位置へ学習を集中させます。",
  "During training, non-anchor positions keep the base model's target distribution, while the anchor position is explicitly supervised with the human-corrected token.":
    "学習時には、non-anchor 位置はベースモデルの目標分布を保ち、anchor 位置だけを人手で修正した token で明示的に監督します。",
  "In the diagram above, SFT pushes every aligned position toward the rewritten answer, while LAwF leaves non-anchor positions unchanged and updates only the anchor token.":
    "上の図では、SFT はすべての整列位置を再記述した答えへ押し寄せますが、LAwF は non-anchor 位置を維持し、anchor token だけを更新します。",
  "How it differs from traditional SFT": "従来の SFT との違い",
  "Traditional SFT asks the model to reproduce the whole target answer. Even when only a small span is wrong, the entire response becomes a training target.":
    "従来の SFT はモデルに目標回答全体の再現を求めます。小さな範囲だけが誤っていても、応答全体が学習対象になります。",
  "That means even tokens that were already acceptable are also pushed toward the rewritten sequence, making the optimization target broader than necessary.":
    "そのため、もともと問題のない token まで再記述シーケンスへ引っ張られ、最適化対象が必要以上に広くなります。",
  "It is closer to targeted correction than full-answer rewriting.":
    "これは全文書き換えというより、狙いを絞った修正に近い方法です。",
  "How it differs from pure distillation": "純粋な蒸留との違い",
  "Pure distillation mainly keeps the model close to a reference distribution. That helps preserve style and stability, but it does not tell the model which behavior should be corrected.":
    "純粋な蒸留は、主にモデルを参照分布に近づけるためのものです。スタイルや安定性の維持には有効ですが、どの挙動を修正すべきかまでは示しません。",
  "lawftrack keeps that distribution-preserving effect on non-anchor positions, then adds human corrections on anchor tokens so the model learns both what should stay unchanged and where it must change.":
    "lawftrack は non-anchor 位置でその分布保持の効果を残しつつ、anchor token に人手修正を加えることで、何を維持し、どこを変えるべきかの両方を学習させます。",
  "How it differs from reinforcement learning": "強化学習との違い",
  "Preference optimization and reinforcement learning are useful for more complex alignment problems, but they usually require heavier data construction, more training control, and higher experimentation cost.":
    "選好最適化や強化学習は、より複雑なアラインメント問題には有効ですが、一般にデータ構築、学習制御、実験コストがより重くなります。",
  "lawftrack is designed for the lighter case: the model is mostly correct already, but keeps making recurring mistakes at a few key positions.":
    "lawftrack は、モデルが概ね正しいものの、いくつかの重要位置で繰り返し誤るような、より軽量なケース向けに設計されています。",
  "Applicable scenarios": "適用シナリオ",
  "Because annotation effort is spent only on the positions that really matter, users can iterate faster while keeping more of the base model's original knowledge.":
    "本当に重要な位置だけにアノテーション工数を使うため、ベースモデルの知識をより多く保ったまま、速く反復できます。",
  "terminology correction": "用語修正",
  "factual error repair": "事実誤りの修正",
  "format and schema constraints": "形式・スキーマ制約",
  "style alignment": "スタイル整合",
  "domain-specific answer adjustment": "ドメイン特化の回答調整",
  "Usage flow": "利用フロー",
  "Create or open a dataset and choose the base model used for generation and training.":
    "データセットを作成または開き、生成と学習に使うベースモデルを選びます。",
  "Generate an answer, inspect the tokenized output, and locate the key error token.":
    "回答を生成し、token 化された出力を確認して、重要な誤り token を特定します。",
  "Replace the error token, continue generation, and save the corrected sample.":
    "誤り token を置き換え、続きを生成し、修正済みサンプルとして保存します。",
  "Launch a training job after a batch of corrected samples is ready, so the model learns the local corrections instead of relearning every full response.":
    "修正済みサンプルがまとまったら学習ジョブを開始し、各回答全体を学び直すのではなく、局所的な修正だけを学習させます。",
  Reinstall: "再インストール",
  "Run gateway in foreground": "ゲートウェイをフォアグラウンドで起動",
  "Check gateway status": "ゲートウェイ状態を確認",
  "Start gateway service": "ゲートウェイサービスを起動",
  "Gateway data could not be loaded": "ゲートウェイデータを読み込めませんでした",
  "Service details": "サービス詳細",
  "Common commands": "よく使うコマンド",
  Device: "デバイス",
  Hostname: "ホスト名",
  "Operating system": "OS",
  Architecture: "アーキテクチャ",
  "Python version": "Python バージョン",
  "GPU snapshot": "GPU スナップショット",
  "VRAM total": "総 VRAM",
  "VRAM used": "使用中 VRAM",
  "VRAM free": "空き VRAM",
  "GPU utilization": "GPU 使用率",
  Temperature: "温度",
  "No GPU detected": "GPU が検出されません",
  "No NVIDIA GPU metrics available on the server yet.":
    "サーバーで利用可能な NVIDIA GPU メトリクスはまだありません。",
  "CPU threads": "CPU スレッド",
  Viewport: "ビューポート",
  Network: "ネットワーク",
  Online: "オンライン",
  Datasets: "データセット",
  "New dataset": "新しいデータセット",
  "Creating...": "作成中...",
  "Import dataset": "データセットをインポート",
  "Recently opened": "最近開いた項目",
  "No base model": "ベースモデル未設定",
  "All datasets": "すべてのデータセット",
  "No datasets yet.": "まだデータセットはありません。",
  "Dataset workspace": "データセットワークスペース",
  Creating: "作成中",
  New: "新規",
  Import: "インポート",
  "No datasets yet. Create one to get started.":
    "まだデータセットはありません。まず 1 つ作成してください。",
  items: "件",
  "Loading samples...": "サンプルを読み込み中...",
  "This dataset has no samples yet.": "このデータセットにはまだサンプルがありません。",
  "Dataset name": "データセット名",
  "Annotation model / Base model": "アノテーションモデル / ベースモデル",
  "Choose from the model list or enter a local model path directly.":
    "モデル一覧から選ぶか、ローカルのモデルパスを直接入力します。",
  "Saving...": "保存中...",
  "Save dataset config": "データセット設定を保存",
  "Export dataset": "データセットをエクスポート",
  "Exporting...": "エクスポート中...",
  "Dataset metadata": "データセットメタデータ",
  Welcome: "ようこそ",
  Dataset: "データセット",
  Edit: "編集",
  "Failed to load datasets": "データセットの読み込みに失敗しました",
  "Failed to load samples": "サンプルの読み込みに失敗しました",
  "Failed to create dataset": "データセットの作成に失敗しました",
  "Failed to save dataset": "データセットの保存に失敗しました",
  "Failed to export dataset": "データセットのエクスポートに失敗しました",
  "Failed to import dataset": "データセットのインポートに失敗しました",
  "Failed to create sample": "サンプルの作成に失敗しました",
  "Please configure a base model for the current dataset first.":
    "まず現在のデータセットにベースモデルを設定してください。",
  "Failed to load token data": "token データの読み込みに失敗しました",
  "Failed to save sample": "サンプルの保存に失敗しました",
  "The last assistant message already has content. Clear or remove it before generating again.":
    "最後の assistant メッセージにはすでに内容があります。再生成する前にクリアまたは削除してください。",
  "Keep at least one message before generating.":
    "生成前に少なくとも 1 件のメッセージを残してください。",
  "The model returned no writable delta, so generation could not continue.":
    "モデルが書き込み可能な差分を返さなかったため、生成を続行できませんでした。",
  "Failed to continue generation": "続きの生成に失敗しました",
  "Failed to delete dataset": "データセットの削除に失敗しました",
  "Failed to delete sample": "サンプルの削除に失敗しました",
  "Failed to refresh token data": "token データの更新に失敗しました",
  "Open a dataset before saving samples.":
    "サンプルを保存する前にデータセットを開いてください。",
  "Token probability: {probability}": "Token 確率: {probability}",
  "Token probability unavailable": "Token 確率は利用できません",
  "Failed to load models": "モデル一覧の読み込みに失敗しました",
  "Failed to generate assistant message":
    "assistant メッセージの生成に失敗しました",
  "Delete dataset": "データセットを削除",
  "Delete sample": "サンプルを削除",
  'Are you sure you want to delete dataset "{name}"? This will remove the dataset and all of its samples permanently.':
    'データセット「{name}」を削除してもよろしいですか？ この操作により、データセットとそのすべてのサンプルが完全に削除されます。',
  'Are you sure you want to delete sample "{title}"? This action cannot be undone.':
    'サンプル「{title}」を削除してもよろしいですか？ この操作は元に戻せません。',
  Cancel: "キャンセル",
  "Deleting...": "削除中...",
  "Confirm delete": "削除の確認",
  "Failed to load files": "ファイルの読み込みに失敗しました",
  "Failed to load training jobs": "学習ジョブの読み込みに失敗しました",
  "Failed to load training logs": "学習ログの読み込みに失敗しました",
  "Failed to refresh training page": "学習ページの更新に失敗しました",
  "Select a dataset first.": "まずデータセットを選択してください。",
  "Select a dataset": "データセットを選択",
  "Create a dataset first to start a training job.":
    "学習ジョブを始める前に、まずデータセットを作成してください。",
  "Training job details": "学習ジョブ詳細",
  "Back to training queue": "学習キューに戻る",
  "Failed to upload file": "ファイルのアップロードに失敗しました",
  "Select a training file first.": "まず学習ファイルを選択してください。",
  "Failed to create training job": "学習ジョブの作成に失敗しました",
  "Failed to cancel job": "ジョブのキャンセルに失敗しました",
  "Failed to generate response": "応答の生成に失敗しました",
  "Training console": "学習コンソール",
  "Create training job": "学習ジョブを作成",
  "Training files": "学習ファイル",
  Upload: "アップロード",
  "Uploading...": "アップロード中...",
  "No training files yet. Upload a JSON/JSONL/CSV/Parquet file first.":
    "まだ学習ファイルはありません。まず JSON/JSONL/CSV/Parquet ファイルをアップロードしてください。",
  "Use as training file": "学習ファイルとして使用",
  "Use as validation file": "検証ファイルとして使用",
  "Training queue": "学習キュー",
  'No training jobs yet. Click "Create training job" to get started.':
    'まだ学習ジョブはありません。「学習ジョブを作成」をクリックして始めてください。',
  "Job details": "ジョブ詳細",
  "Cancel job": "ジョブをキャンセル",
  "Select a training job to view details.":
    "詳細を表示するには学習ジョブを選択してください。",
  "Basic info": "基本情報",
  Method: "方法",
  "File references": "ファイル参照",
  "Training file": "学習ファイル",
  "Validation file": "検証ファイル",
  "Runtime status": "実行状態",
  "End time": "終了時刻",
  "Outputs and errors": "出力とエラー",
  "Fine-tuned model": "微調整済みモデル",
  "Training curve": "学習曲線",
  "Logs and events": "ログとイベント",
  Events: "イベント",
  "Raw logs": "生ログ",
  "Download full logs": "完全なログをダウンロード",
  "Showing the last {count} lines from each log stream.":
    "各ログストリームの最後の {count} 行を表示しています。",
  "No events.": "イベントはありません。",
  "No raw logs.": "生ログはありません。",
  "No content": "内容はありません",
  "No loss data available to plot.": "描画できる loss データがありません。",
  "Training loss curve": "学習 loss 曲線",
  "Initial loss": "初期 loss",
  "Latest loss": "最新 loss",
  "Latest valid loss": "最新の検証 loss",
  "Lowest loss": "最低 loss",
  "Validating files": "ファイルを検証中",
  Queued: "待機中",
  Running: "実行中",
  Succeeded: "成功",
  Failed: "失敗",
  Cancelled: "キャンセル済み",
  Paused: "一時停止",
  "Pending load": "読み込み待ち",
  Loaded: "読み込み済み",
  "Load failed": "読み込み失敗",
  "Train loss": "学習 loss",
  "Validation loss": "検証 loss",
  Step: "ステップ",
  "or /path/to/model": "または /path/to/model",
  "Do not attach dataset metadata": "データセットメタデータを付与しない",
  "Training method": "学習方法",
  "Generated on create": "作成時に生成",
  "Do not use": "使用しない",
  "Advanced settings": "詳細設定",
  "Enable TensorBoard integration": "TensorBoard 連携を有効化",
  "Submitting...": "送信中...",
  Prompt: "プロンプト",
  Response: "応答",
  Send: "送信",
  Conversation: "会話",
  "Model chat": "モデルチャット",
  "Single model": "単一モデル",
  "Compare two models": "2つのモデルを比較",
  "Model A": "モデル A",
  "Model B": "モデル B",
  "System prompt": "システムプロンプト",
  "Optional instructions shared with the selected model(s).":
    "選択したモデルに共通して送られる任意の指示です。",
  "Refresh model list": "モデル一覧を更新",
  "Choose from the model list or enter a model ID directly.":
    "モデル一覧から選ぶか、モデル ID を直接入力します。",
  "Fine-tuned from {parent}": "{parent} から微調整",
  "Each turn keeps the same user prompt and shows one answer per model.":
    "各ターンで同じユーザープロンプトを保ち、モデルごとに 1 つの回答を表示します。",
  "Each turn keeps the shared conversation history for the selected model.":
    "各ターンで選択したモデルの共有会話履歴を保持します。",
  "New conversation": "新しい会話",
  Ready: "準備完了",
  "Start a conversation": "会話を開始",
  "Choose your model setup, then send a prompt from the composer at the bottom.":
    "モデル設定を選んでから、下部の入力欄でプロンプトを送信します。",
  "Message the selected model and keep the conversation going...":
    "選択したモデルにメッセージを送り、会話を続けましょう...",
  "Enter to send, Shift + Enter for newline":
    "Enter で送信、Shift + Enter で改行",
  "Stop generating": "生成を停止",
  "Start a conversation by selecting model settings and sending a prompt.":
    "モデル設定を選び、プロンプトを送信して会話を開始します。",
  "Ctrl/Cmd + Enter to send": "Ctrl/Cmd + Enter で送信",
  "Describe the task, question, or scenario you want to discuss.":
    "相談したいタスク、質問、または状況を入力してください。",
  "Ask both models": "両方のモデルに聞く",
  "Ask one model": "1つのモデルに聞く",
  "Thought process": "思考過程",
  "Show reasoning": "推論を表示",
  "Hide reasoning": "推論を隠す",
  "Scroll to bottom": "一番下へスクロール",
  "Waiting for model output.": "モデル出力を待っています。",
  "Please enter a prompt.": "プロンプトを入力してください。",
  "Select a model first.": "まずモデルを選択してください。",
  "Select a second model first.": "まず 2 つ目のモデルを選択してください。",
  "Select two different models to compare.":
    "比較するには異なる 2 つのモデルを選択してください。",
  "Message flow": "メッセージフロー",
  "Generate AI message": "AI メッセージを生成",
  "Save sample": "サンプルを保存",
  "Select a sample to start editing.":
    "編集を始めるにはサンプルを選択してください。",
  "Add user message": "ユーザーメッセージを追加",
  "Add assistant message": "assistant メッセージを追加",
  "Line break token": "改行 token",
  Reasoning: "推論",
  "Token rewrite": "Token 書き換え",
  "Original {target} token: {token}": "元の {target} token: {token}",
  "Replace with": "置き換え先",
  "Candidate tokens": "候補 token",
  "Loading candidates...": "候補を読み込み中...",
  "No candidates.": "候補はありません。",
  "Accept and save": "反映して保存",
  "Discard rewrite": "書き換えを破棄",
  "Replace and continue": "置き換えて続行",
  Revert: "元に戻す",
  "Click any token in an assistant message to replace it and continue generation from that point.":
    "assistant メッセージ内の token をクリックすると置き換えて、その位置から生成を続けられます。",
  "Click a token in an assistant message to start rewriting.":
    "assistant メッセージ内の token をクリックして書き換えを開始します。",
  "Original token: {token}": "元の token: {token}",
  Discard: "破棄",
  "Continue generation": "生成を続ける",
  "Just now": "たった今",
  "Start with LAwF and anchor-style annotation":
    "LAwF と anchor 型アノテーションから始める",
  "lawftrack is built around LAwF, a token-level fine-tuning idea from the linked repository. It only asks annotators to correct the crucial wrong token, while the rest of the sequence stays close to the reference model.":
    "lawftrack は LAwF を中心に設計されています。これはリンク先リポジトリに由来する token レベルの微調整アイデアで、重要な誤り token だけを修正し、残りの系列は参照分布にできるだけ近づけます。",
  "lawftrack is an open-source no-code self-distillation fine-tuning framework for large language models.":
    "lawftrack は、大規模言語モデル向けのオープンソース・ノーコード自己蒸留微調整フレームワークです。",
  "Product positioning": "製品位置づけ",
  "It does not retrain everything. It changes only what should change.":
    "すべてを再学習するのではなく、変えるべきところだけを変えます。",
  "The untouched positions still stay close to the base model's output distribution, so the model is corrected locally instead of being reshaped globally.":
    "手を加えていない位置はベースモデルの出力分布に近いまま保たれるため、モデルは全体を書き換えるのではなく局所的に修正されます。",
  "How the training algorithm works": "学習アルゴリズムの仕組み",
  "During training, the base model's original output distribution is used as the teacher signal for most tokens.":
    "学習時には、ほとんどの token でベースモデル本来の出力分布が参照信号として使われます。",
  "When a token is marked as a key error, the training target at that position is pulled toward the human correction, while the remaining positions continue to follow the teacher distribution.":
    "ある token が重要な誤りとしてマークされると、その位置の学習目標は人手修正へ引き寄せられ、残りの位置は引き続き参照分布に従います。",
  "This combines explicit supervision on anchor tokens with self-distillation on non-anchor tokens, so the model learns what to change without forgetting everything else.":
    "anchor token 上の明示的監督と non-anchor token 上の自己蒸留を組み合わせることで、何を変えるべきかを学びつつ、他を過度に忘れないようにします。",
  "lawftrack concentrates the training signal on the critical tokens that determine the behavioral change, so data labeling is lighter and the optimization target is more precise.":
    "lawftrack は挙動の変化を決める重要 token に学習信号を集中させるため、ラベリング負担が軽く、最適化目標もより精密です。",
  "How it differs from preference learning or reinforcement learning":
    "選好学習や強化学習との違い",
  "Why this works well for targeted fine-tuning":
    "なぜこれは定向微調整に向いているのか",
  "Typical workflow in lawftrack": "lawftrack における典型的な利用フロー",
  "One-sentence summary": "一言でまとめると",
  "Instead of choosing between rewriting everything and imitating everything, lawftrack takes a third path: correct only the parts that must change, and preserve the rest of the model as much as possible.":
    "すべてを書き直すか、すべてを模倣するかの二択ではなく、lawftrack は第三の道を取ります。変える必要がある部分だけを修正し、それ以外のモデル挙動はできるだけ保ちます。",
  "Open LAwF repository": "LAwF リポジトリを開く",
  "How LAwF works": "LAwF の仕組み",
  "LAwF blends supervised anchors with the reference model's distribution.":
    "LAwF は、監督付き anchor と参照モデルの分布を 1 つの学習目標に組み合わせます。",
  "Annotators mark the first wrong token, provide the correct replacement, and let generation continue from there.":
    "アノテータは最初の誤り token を指定し、正しい置き換えを与え、その位置から生成を続けます。",
  "Non-anchor tokens keep the reference model's behavior, which helps preserve prior knowledge instead of overwriting everything.":
    "non-anchor token は参照モデルの振る舞いを保つため、すべてを上書きせずに既存知識を維持しやすくなります。",
  "Why this annotation style is needed": "なぜこのアノテーション方式が必要なのか",
  "Full-sequence supervision is expensive because every answer must be rewritten even when only a few tokens are wrong.":
    "全系列監督は、少数の token だけが誤っている場合でも回答全体を書き直す必要があるため、コストが高くなります。",
  "Anchor-only correction cuts labeling cost to the decisive edits that actually change the behavior.":
    "anchor のみを修正する方式なら、ラベリングコストを実際に挙動を変える決定的な編集だけに絞れます。",
  "Keeping the untouched tokens close to the reference model reduces catastrophic forgetting during fine-tuning.":
    "手を加えていない token を参照モデルに近づけて保つことで、微調整時の破滅的忘却を抑えられます。",
  "How to use it in lawftrack": "lawftrack での使い方",
  "Write the prompt, generate an assistant answer, and inspect the tokenized output in the data workspace.":
    "プロンプトを書き、assistant の回答を生成し、データワークスペースで token 化された出力を確認します。",
  "Click the first wrong assistant token, replace it, then continue generation until the sample becomes correct.":
    "最初の誤った assistant token をクリックして置き換え、サンプルが正しくなるまで生成を続けます。",
  "Export the dataset or launch a LAwF training job so the model learns the anchor tokens without drifting too far from the base model.":
    "データセットをエクスポートするか LAwF 学習ジョブを開始して、ベースモデルから大きく逸れずに anchor token を学習させます。",
  "Next step": "次のステップ",
  "Start your first anchor-labeled dataset or revisit training after you have a few corrected samples.":
    "最初の anchor ラベル付きデータセットを始めるか、修正済みサンプルがいくつかたまったら学習ページに戻ってください。",
  "Reopen the LAwF walkthrough and the annotation rationale at any time.":
    "この LAwF ガイドとアノテーション設計の意図はいつでも開き直せます。",
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

const LOCALE_STORAGE_KEY = "lawftrack:locale";

const I18nContext = createContext<I18nContextValue | null>(null);

function normalizeLocale(value?: string | null): AppLocale {
  if (!value) {
    return "zh-CN";
  }
  const normalized = value.toLowerCase();
  if (normalized.startsWith("en")) {
    return "en-US";
  }
  if (normalized.startsWith("ja")) {
    return "ja-JP";
  }
  return "zh-CN";
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
    const messages =
      locale === "zh-CN"
        ? ZH_MESSAGES
        : locale === "ja-JP"
          ? JA_MESSAGES
          : null;
    const t = (message: string, params?: Record<string, string | number>) => {
      const translated = messages?.[message] ?? message;
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
          if (locale === "zh-CN") {
            return `${diffMinutes} 分钟前`;
          }
          if (locale === "ja-JP") {
            return `${diffMinutes} 分前`;
          }
          return `${diffMinutes} min ago`;
        }

        const diffHours = Math.round(diffMinutes / 60);
        if (diffHours < 24) {
          if (locale === "zh-CN") {
            return `${diffHours} 小时前`;
          }
          if (locale === "ja-JP") {
            return `${diffHours} 時間前`;
          }
          return `${diffHours} hr ago`;
        }

        const diffDays = Math.round(diffHours / 24);
        if (locale === "zh-CN") {
          return `${diffDays} 天前`;
        }
        if (locale === "ja-JP") {
          return `${diffDays} 日前`;
        }
        return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
      },
      formatDatasetCount: (count) =>
        locale === "zh-CN"
          ? `${count ?? 0} 条样本`
          : locale === "ja-JP"
            ? `${count ?? 0} 件のサンプル`
            : `${count ?? 0} samples`,
      formatTaskCount: (count) =>
        locale === "zh-CN"
          ? `${count ?? 0} 个任务`
          : locale === "ja-JP"
            ? `${count ?? 0} 件のジョブ`
            : `${count ?? 0} jobs`,
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

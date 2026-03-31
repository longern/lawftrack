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
  Chat: "对话",
  Me: "我的",
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

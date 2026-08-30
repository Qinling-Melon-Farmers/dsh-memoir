/** Locale-aware copy used by every agent-facing dsh-memoir surface. */

export type MemoirLanguage = 'zh' | 'en'

export const MEMOIR_LANGUAGES: MemoirLanguage[] = ['zh', 'en']
export const DEFAULT_MEMOIR_LANGUAGE: MemoirLanguage = 'zh'

export type MemoirLanguageSource = MemoirLanguage | (() => MemoirLanguage)

export interface SectionCopy {
  label: string
  header: string
}

type SectionKey = 'work' | 'lessons' | 'actions' | 'note'

export interface HostCopy {
  guidance: string
  sectionHeading: string
  distillPrompt: string
  sections: Record<SectionKey, SectionCopy>
  hotMemory: {
    header: string
    actions: string
    lessons: string
    recent: string
  }
  markdown: {
    title: string
    intro: string[]
    empty: string
  }
  record: {
    description: string
    section: string
    title: string
    content: string
    importance: string
    pinned: string
    supersedes: string
    tags: string
    resolution: string
    targetId: string
    needsResolution: (count: number) => string
    resolutionInstruction: string
    updated: string
    superseded: string
    recorded: string
    noWorkspace: string
  }
  update: {
    description: string
    id: string
    section: string
    title: string
    content: string
    importance: string
    pinned: string
    status: string
    supersedes: string
    tags: string
    rendered: string
    noWorkspace: string
    notFound: (id: string) => string
  }
  read: {
    description: (defaultLimit: number) => string
    scope: string
    section: string
    query: string
    limit: (defaultLimit: number, maxLimit: number) => string
    detail: string
    clipped: (total: number, shown: number) => string
    noWorkspace: string
    projectEmpty: (cwd: string, filtered: boolean) => string
    globalEmpty: string
    outputClipped: (limit: number) => string
    path: string
    updated: string
  }
  governance: {
    targetRequired: string
    targetCandidate: string
    targetMissing: (id: string) => string
    resolutionRequired: string
    updateMissing: (id: string) => string
    forceTargetUnused: string
  }
  routes: {
    malformed: string
    notFound: string
    method: string
    contentType: string
    absolutePath: string
    forbiddenPath: string
    section: (keys: string) => string
    resolution: string
    invalidResolution: string
  }
  validation: {
    payloadObject: string
    section: (keys: string) => string
    contentRequired: string
    title: string
    titleOrNull: string
    importance: string
    pinned: string
    status: (keys: string) => string
    supersedes: string
    tags: string
    patchObject: string
    updateRequired: string
    contentNotEmpty: string
    settingsObject: string
    settingRequired: string
    unknownSetting: (key: string) => string
    booleanSetting: (key: string) => string
    integerSetting: (key: string) => string
    language: string
    cooldown: string
    hotMax: string
    readMax: string
  }
}

const zh: HostCopy = {
  guidance:
    'dsh-memoir 提供项目持久记忆。下方仅注入本项目高优先级记忆；' +
    '需要历史细节时调用 memoir_read；产生可复用的工作结论、经验或后续行动时调用 memoir_record。',
  sectionHeading: '## 项目持久记忆（自动注入）',
  distillPrompt:
    '（dsh-memoir 自动收尾）本轮工作已结束，请把本轮归纳沉淀进项目记忆：\n' +
    '1. 若本轮有实质产出、踩坑结论或下一步安排，调用 memoir_record 分条记录（section 可选 work 工作记录 / lessons 经验教训 / actions 行动指南，可用 title 一句话概括）；\n' +
    '2. 若本轮已经记录过、或没有值得沉淀的内容，直接回复“本轮无需沉淀”，不要调用任何工具。\n' +
    '最终回复保持一句话以内，不要展开。',
  sections: {
    work: { label: '工作记录', header: '## 工作记录 Work Log' },
    lessons: { label: '经验教训', header: '## 经验教训 Lessons Learned' },
    actions: { label: '行动指南', header: '## 行动指南 Action Guide' },
    note: { label: '备注', header: '## 备注 Notes' },
  },
  hotMemory: {
    header: '[项目记忆]',
    actions: '行动：',
    lessons: '经验：',
    recent: '近期状态：',
  },
  markdown: {
    title: '# 项目持久记忆 Project Memory',
    intro: [
      '> 本文件由 dsh-memoir 插件维护：记录本项目历次会话的工作归纳、经验教训与行动指南，',
      '> 作为未来 AGENTS 接手本项目时的行动指南；它是人类可读的投影，不是 system prompt 的完整注入内容。',
      '> 新会话只注入有界的 Hot Memory，完整历史通过 memoir_read 按需检索。',
    ],
    empty: '> 暂无条目。让 agent 用 memoir_record 沉淀，或在“记忆”面板中手动记录。',
  },
  record: {
    description:
      '把一条记忆写入项目持久记忆，供未来会话继承。阶段任务收尾时归纳“做了什么(work)/经验教训(lessons)/下一步行动(actions)”分条记录。' +
      '写入前会返回疑似重复/冲突候选且不自动改动；收到候选后必须明确选择 resolution=update（更新候选）、supersede（新结论替代候选）或 force-record（确认并存）。' +
      '触发场景：记录经验教训、沉淀记忆、归纳工作、更新行动指南、总结踩坑。',
    section: '记忆分类：work 工作记录 / lessons 经验教训 / actions 行动指南 / note 备注。',
    title: '可选，一句话标题（如“修复 pet 悬停闪退”）。',
    content: '记忆正文：具体做了什么、结论、教训或下一步怎么做。建议精炼、可执行。',
    importance: '可选，重要度 1 到 5；默认为 3。',
    pinned: '可选，是否置顶此条目。',
    supersedes: '可选，此条目显式替代的旧记忆 id 列表。',
    tags: '可选，供后续筛选和说明使用的标签。',
    resolution: '仅在出现相似候选后使用：update 更新 targetId；supersede 新建并替代 targetId；force-record 明确保留两条。',
    targetId: 'resolution=update/supersede 时必填的候选记忆 id；force-record 不使用。',
    needsResolution: (count) => `检测到 ${count} 条疑似重复/冲突记忆，本次未写入：`,
    resolutionInstruction: '请再次调用 memoir_record，并明确选择 resolution=update + targetId、resolution=supersede + targetId，或 resolution=force-record。',
    updated: '已更新',
    superseded: '已记录并替代旧记忆',
    recorded: '已记录',
    noWorkspace: '无法确定会话工作区（缺少 agent cwd）；请在项目会话内调用 memoir_record',
  },
  update: {
    description: '更新已有记忆的标题、正文、分类或生命周期状态，不删除历史。需要替换旧结论时优先更新或使用 status=superseded；更新后会同步 PROJECT_MEMORY.md 与 Hot Memory。触发场景：修改记忆、纠正结论、归档记忆、标记过时、替代旧记忆。',
    id: '要更新的记忆 id（先用 memoir_read 获取）。',
    section: '可选，新的记忆分类。',
    title: '可选，新的标题；传空字符串清除标题。',
    content: '可选，新的正文（不能为空）。',
    importance: '可选，重要度 1 到 5。',
    pinned: '可选，是否置顶。',
    status: '可选，active / superseded / archived。',
    supersedes: '可选，此条目显式替代的旧记忆 id 列表；目标会标记为 superseded。',
    tags: '可选，替换标签列表；传空数组清除标签。',
    rendered: '已更新记忆',
    noWorkspace: '无法确定会话工作区（缺少 agent cwd）；请在项目会话内调用 memoir_update',
    notFound: (id) => '找不到记忆条目：' + id,
  },
  read: {
    description: (defaultLimit) => `读取项目持久记忆与经验教训（默认返回最近 ${defaultLimit} 条 compact 摘要）。开始新会话或接手旧项目时先调用。触发场景：读取记忆、回顾项目历史、查询经验教训、接手项目、查看行动指南。`,
    scope: '读取范围：project 仅本项目（默认）/ global 全局跨项目 / all 全部。',
    section: '可选，只返回某一分类。',
    query: '可选，本地相关性检索标题与正文：支持中文短语、英文关键词、代码标识符与路径，并按相关性排序。',
    limit: (defaultLimit, maxLimit) => `可选，最多返回条数（启动默认 ${defaultLimit}，启动最大 ${maxLimit}；Web 设置可实时覆盖）。`,
    detail: '输出形态：compact 单行摘要（默认）/ full 完整正文。',
    clipped: (total, shown) => `（共 ${total} 条匹配，仅显示 ${shown} 条，可用 limit 参数调整）`,
    noWorkspace: '（无法确定会话工作区，跳过项目记忆）',
    projectEmpty: (cwd, filtered) => `本项目（${cwd}）暂无${filtered ? '匹配的' : ''}持久记忆。可用 memoir_record 沉淀。`,
    globalEmpty: '（全局索引中没有匹配的内容）',
    outputClipped: (limit) => `（输出超过 ${limit} 字符上限，已保留相关性最高/最新的部分）`,
    path: '路径',
    updated: '更新',
  },
  governance: {
    targetRequired: 'update 或 supersede 必须提供 targetId',
    targetCandidate: 'targetId 必须是当前相似候选之一',
    targetMissing: (id) => '找不到待处理的相似记忆：' + id,
    resolutionRequired: '提供 targetId 时必须明确指定 resolution',
    updateMissing: (id) => '找不到待更新的相似记忆：' + id,
    forceTargetUnused: 'force-record 不使用 targetId',
  },
  routes: {
    malformed: '请求格式不正确',
    notFound: '未知路由',
    method: '不允许此请求方法',
    contentType: '必须使用 application/json content-type',
    absolutePath: 'path 必须是绝对工作区路径',
    forbiddenPath: 'path 不在允许的工作区中：仅当前活动 cwd 或已有 store 项目可写',
    section: (keys) => `section 必须是 ${keys} 之一`,
    resolution: 'resolution 必须是 update、supersede 或 force-record',
    invalidResolution: '相似记忆处理方式无效',
  },
  validation: {
    payloadObject: 'payload 必须是 JSON 对象',
    section: (keys) => `section 必须是 ${keys} 之一`,
    contentRequired: 'content 为必填项',
    title: 'title 必须是不超过 200 个字符的字符串',
    titleOrNull: 'title 必须是不超过 200 个字符的字符串，或用 null 清除',
    importance: 'importance 必须是 1 到 5 的整数',
    pinned: 'pinned 必须是布尔值',
    status: (keys) => `status 必须是 ${keys} 之一`,
    supersedes: 'supersedes 必须是记忆 id 数组',
    tags: 'tags 必须是非空字符串数组',
    patchObject: 'patch 必须是 JSON 对象',
    updateRequired: '至少需要一个更新字段',
    contentNotEmpty: 'content 不能为空',
    settingsObject: 'settings 必须是对象',
    settingRequired: '至少需要一项设置',
    unknownSetting: (key) => `未知设置：${key}`,
    booleanSetting: (key) => `${key} 必须是布尔值`,
    integerSetting: (key) => `${key} 必须是不小于 1 的整数`,
    language: 'language 必须是 zh 或 en',
    cooldown: 'autoDistillCooldownMin 必须是不小于 0 的有限数值',
    hotMax: 'hotMemoryMaxTokens 必须不小于 hotMemoryTokens',
    readMax: 'readMaxLimit 必须不小于 readDefaultLimit',
  },
}

const en: HostCopy = {
  guidance:
    'dsh-memoir provides persistent project memory. Only high-priority memory for this project is injected below; ' +
    'call memoir_read for historical details, and call memoir_record when you produce reusable conclusions, lessons, or follow-up actions.',
  sectionHeading: '## Persistent project memory (automatically injected)',
  distillPrompt:
    '(dsh-memoir automatic wrap-up) This work turn has ended. Distill it into project memory:\n' +
    '1. If the turn produced substantive work, a reusable lesson, or a next action, call memoir_record once per item (section: work, lessons, or actions; use title for a one-line summary).\n' +
    '2. If the turn was already recorded or has nothing worth preserving, reply “Nothing to distill for this turn” without calling any tool.\n' +
    'Keep the final reply to one sentence and do not elaborate.',
  sections: {
    work: { label: 'Work Log', header: '## Work Log' },
    lessons: { label: 'Lessons Learned', header: '## Lessons Learned' },
    actions: { label: 'Action Guide', header: '## Action Guide' },
    note: { label: 'Notes', header: '## Notes' },
  },
  hotMemory: {
    header: '[Project memory]',
    actions: 'Actions:',
    lessons: 'Lessons:',
    recent: 'Recent state:',
  },
  markdown: {
    title: '# Persistent Project Memory',
    intro: [
      '> Maintained by dsh-memoir: a cross-session record of completed work, lessons learned, and follow-up actions.',
      '> This human-readable projection guides future agents; it is not injected into the system prompt in full.',
      '> New sessions receive only bounded Hot Memory. Use memoir_read to retrieve complete history on demand.',
    ],
    empty: '> No entries yet. Ask the agent to distill with memoir_record, or add one in the Memory panel.',
  },
  record: {
    description:
      'Persist one project-memory entry for future sessions. At the end of a task, record completed work (work), reusable lessons (lessons), and follow-up actions (actions) as separate entries. ' +
      'Before writing, the tool returns possible duplicates or conflicts without changing data; when candidates exist, explicitly choose resolution=update, supersede, or force-record. ' +
      'Triggers: record a lesson, preserve context, distill work, update an action guide, or capture a pitfall.',
    section: 'Memory section: work / lessons / actions / note.',
    title: 'Optional one-line title, for example “Fix pet hover crash”.',
    content: 'The concrete work, conclusion, lesson, or next action. Keep it concise and actionable.',
    importance: 'Optional importance from 1 to 5; defaults to 3.',
    pinned: 'Optional flag that keeps this entry prominent.',
    supersedes: 'Optional IDs of entries this record explicitly supersedes.',
    tags: 'Optional tags for later filtering and explanation.',
    resolution: 'Use only after similar candidates appear: update modifies targetId; supersede creates a new entry that replaces targetId; force-record explicitly keeps both.',
    targetId: 'Required for resolution=update or supersede; unused by force-record.',
    needsResolution: (count) => `${count} possible duplicate/conflicting memor${count === 1 ? 'y was' : 'ies were'} found; nothing was written:`,
    resolutionInstruction: 'Call memoir_record again with resolution=update + targetId, resolution=supersede + targetId, or resolution=force-record.',
    updated: 'Updated',
    superseded: 'Recorded and superseded the old memory',
    recorded: 'Recorded',
    noWorkspace: 'Cannot determine the session workspace (agent cwd is missing); call memoir_record from a project session',
  },
  update: {
    description: 'Update an existing memory title, body, section, or lifecycle status without deleting history. Prefer an update or status=superseded when replacing an old conclusion. PROJECT_MEMORY.md and Hot Memory update after the write. Triggers: edit memory, correct a conclusion, archive an entry, mark stale guidance, or replace old memory.',
    id: 'Memory entry ID (obtain it with memoir_read first).',
    section: 'Optional new memory section.',
    title: 'Optional new title; pass an empty string to clear it.',
    content: 'Optional new body; it cannot be empty.',
    importance: 'Optional importance from 1 to 5.',
    pinned: 'Optional pinned state.',
    status: 'Optional lifecycle status: active / superseded / archived.',
    supersedes: 'Optional IDs explicitly superseded by this entry; targets become superseded.',
    tags: 'Optional replacement tag list; pass an empty array to clear tags.',
    rendered: 'Updated memory',
    noWorkspace: 'Cannot determine the session workspace (agent cwd is missing); call memoir_update from a project session',
    notFound: (id) => 'Memory entry not found: ' + id,
  },
  read: {
    description: (defaultLimit) => `Read persistent project memory and lessons (the default is ${defaultLimit} compact summaries). Call this when starting a new session or taking over an existing project. Triggers: read memory, review project history, query lessons, take over a project, or inspect action guidance.`,
    scope: 'Read scope: project (current project, default) / global (cross-project) / all.',
    section: 'Optional section filter.',
    query: 'Optional local relevance search over titles and bodies; supports natural-language terms, code identifiers, and paths, then ranks results by relevance.',
    limit: (defaultLimit, maxLimit) => `Optional result count (startup default ${defaultLimit}, startup maximum ${maxLimit}; Web settings can override both live).`,
    detail: 'Output shape: compact one-line summaries (default) / full bodies.',
    clipped: (total, shown) => `(${total} matches; showing ${shown}. Adjust limit to return more.)`,
    noWorkspace: '(The session workspace is unavailable; project memory was skipped.)',
    projectEmpty: (cwd, filtered) => `Project ${cwd} has no ${filtered ? 'matching ' : ''}persistent memory. Use memoir_record to preserve one.`,
    globalEmpty: '(No matching content exists in the global index.)',
    outputClipped: (limit) => `(Output exceeded the ${limit}-character limit; the highest-relevance/newest portion was retained.)`,
    path: 'path',
    updated: 'updated',
  },
  governance: {
    targetRequired: 'targetId is required for update or supersede',
    targetCandidate: 'targetId must identify one of the current similarity candidates',
    targetMissing: (id) => 'Similarity target not found: ' + id,
    resolutionRequired: 'targetId requires an explicit resolution',
    updateMissing: (id) => 'Similarity target to update was not found: ' + id,
    forceTargetUnused: 'targetId is not used with force-record',
  },
  routes: {
    malformed: 'malformed request',
    notFound: 'unknown route',
    method: 'method not allowed',
    contentType: 'application/json content-type required',
    absolutePath: 'path must be an absolute workspace path',
    forbiddenPath: 'path is outside the allowed workspaces; only an active cwd or an existing store project is writable',
    section: (keys) => `section must be one of ${keys}`,
    resolution: 'resolution must be update, supersede, or force-record',
    invalidResolution: 'invalid similarity resolution',
  },
  validation: {
    payloadObject: 'payload must be a JSON object',
    section: (keys) => `section must be one of ${keys}`,
    contentRequired: 'content is required',
    title: 'title must be a string of at most 200 chars',
    titleOrNull: 'title must be a string of at most 200 chars, or null to clear it',
    importance: 'importance must be an integer from 1 to 5',
    pinned: 'pinned must be a boolean',
    status: (keys) => `status must be one of ${keys}`,
    supersedes: 'supersedes must be an array of entry ids',
    tags: 'tags must be an array of non-empty strings',
    patchObject: 'patch must be a JSON object',
    updateRequired: 'at least one update field is required',
    contentNotEmpty: 'content cannot be empty',
    settingsObject: 'settings must be an object',
    settingRequired: 'at least one setting is required',
    unknownSetting: (key) => `unknown setting: ${key}`,
    booleanSetting: (key) => `${key} must be a boolean`,
    integerSetting: (key) => `${key} must be an integer greater than or equal to 1`,
    language: 'language must be zh or en',
    cooldown: 'autoDistillCooldownMin must be a finite number greater than or equal to 0',
    hotMax: 'hotMemoryMaxTokens must be greater than or equal to hotMemoryTokens',
    readMax: 'readMaxLimit must be greater than or equal to readDefaultLimit',
  },
}

const dictionaries: Record<MemoirLanguage, HostCopy> = { zh, en }

export function resolveMemoirLanguage(value: unknown, fallback: MemoirLanguage = DEFAULT_MEMOIR_LANGUAGE): MemoirLanguage {
  return value === 'zh' || value === 'en' ? value : fallback
}

export function languageFrom(source: MemoirLanguageSource | undefined): MemoirLanguage {
  return resolveMemoirLanguage(typeof source === 'function' ? source() : source)
}

export function hostCopy(language: MemoirLanguage): HostCopy {
  return dictionaries[language]
}

export function sectionCopy(section: SectionKey, language: MemoirLanguage): SectionCopy {
  return dictionaries[language].sections[section]
}

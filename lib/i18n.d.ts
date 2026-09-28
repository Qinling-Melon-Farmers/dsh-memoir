/** Locale-aware copy used by every agent-facing dsh-memoir surface. */
import { type MemoirLanguage } from './languages.js';
export { MEMOIR_LANGUAGES, DEFAULT_MEMOIR_LANGUAGE, resolveMemoirLanguage } from './languages.js';
export type { MemoirLanguage } from './languages.js';
export type MemoirLanguageSource = MemoirLanguage | (() => MemoirLanguage);
export interface SectionCopy {
    label: string;
    header: string;
}
type SectionKey = 'work' | 'lessons' | 'actions' | 'note';
export interface HostCopy {
    guidance: string;
    sectionHeading: string;
    distillPrompt: string;
    distillOrigin: (turn: number) => string;
    sections: Record<SectionKey, SectionCopy>;
    hotMemory: {
        header: string;
        actions: string;
        lessons: string;
        recent: string;
    };
    markdown: {
        title: string;
        intro: string[];
        empty: string;
    };
    record: {
        description: string;
        section: string;
        title: string;
        content: string;
        importance: string;
        pinned: string;
        supersedes: string;
        tags: string;
        resolution: string;
        targetId: string;
        needsResolution: (count: number) => string;
        resolutionInstruction: string;
        updated: string;
        superseded: string;
        recorded: string;
        noWorkspace: string;
    };
    update: {
        description: string;
        id: string;
        section: string;
        title: string;
        content: string;
        importance: string;
        pinned: string;
        status: string;
        supersedes: string;
        tags: string;
        rendered: string;
        noWorkspace: string;
        notFound: (id: string) => string;
    };
    read: {
        description: (defaultLimit: number) => string;
        scope: string;
        section: string;
        query: string;
        limit: (defaultLimit: number, maxLimit: number) => string;
        detail: string;
        clipped: (total: number, shown: number) => string;
        noWorkspace: string;
        projectEmpty: (cwd: string, filtered: boolean) => string;
        globalEmpty: string;
        outputClipped: (limit: number) => string;
        path: string;
        updated: string;
    };
    governance: {
        targetRequired: string;
        targetCandidate: string;
        targetMissing: (id: string) => string;
        resolutionRequired: string;
        updateMissing: (id: string) => string;
        forceTargetUnused: string;
    };
    routes: {
        malformed: string;
        notFound: string;
        method: string;
        contentType: string;
        absolutePath: string;
        forbiddenPath: string;
        section: (keys: string) => string;
        resolution: string;
        invalidResolution: string;
    };
    validation: {
        payloadObject: string;
        section: (keys: string) => string;
        contentRequired: string;
        title: string;
        titleOrNull: string;
        importance: string;
        pinned: string;
        status: (keys: string) => string;
        supersedes: string;
        tags: string;
        patchObject: string;
        updateRequired: string;
        contentNotEmpty: string;
        settingsObject: string;
        settingRequired: string;
        unknownSetting: (key: string) => string;
        booleanSetting: (key: string) => string;
        integerSetting: (key: string) => string;
        language: string;
        cooldown: string;
        hotMax: string;
        readMax: string;
    };
}
export declare function languageFrom(source: MemoirLanguageSource | undefined): MemoirLanguage;
export declare function hostCopy(language: MemoirLanguage): HostCopy;
export declare function sectionCopy(section: SectionKey, language: MemoirLanguage): SectionCopy;

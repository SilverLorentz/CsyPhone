export type YesterdayNewspaperLayout =
    | 'morning'
    | 'extra'
    | 'night'
    | 'sweet'
    | 'coldwar'
    | 'short';

export type YesterdayNewspaperStatus = 'generating' | 'ready' | 'failed';
export type YesterdayNewspaperPeriodType = 'daily' | 'weekly' | 'monthly';

export interface YesterdayNewspaperSideCard {
    title: string;
    content: string;
}

export interface YesterdayNewspaperContent {
    date: string;
    periodType?: YesterdayNewspaperPeriodType;
    periodLabel?: string;
    publicationName?: string;
    publicationSubtitle?: string;
    issueLabel?: string;
    layoutType: YesterdayNewspaperLayout;
    masthead: string;
    headline: string;
    subheadline: string;
    relationshipWeather: string;
    lead?: string;
    leadStory: string;
    sideCards?: YesterdayNewspaperSideCard[];
    extraNotes?: string[];
    closingLine?: string;
    memoryHighlights: string[];
    heartGraphNote: string;
    cornerNote: string;
    tomorrowHint: string;
    footer: string;
    voiceSnippet?: string;
    statusSnapshot?: string;
    cardEcho?: string;
    moodTags?: string[];
    isShort?: boolean;
}

export interface YesterdayNewspaperSourceSummary {
    messageCount: number;
    diaryCount: number;
    memoryCount: number;
    graphRelationCount: number;
    hasInnerVoice: boolean;
    hasStatusSnapshot: boolean;
    periodStartDate?: string;
    periodEndDate?: string;
}

export interface YesterdayNewspaperRecord {
    id: string;
    ownerUserId: string;
    charId: string;
    date: string;
    periodType?: YesterdayNewspaperPeriodType;
    status: YesterdayNewspaperStatus;
    content?: YesterdayNewspaperContent;
    sourceSummary?: YesterdayNewspaperSourceSummary;
    error?: string;
    createdAt: number;
    updatedAt: number;
    generatedAt?: number;
    openedAt?: number;
}

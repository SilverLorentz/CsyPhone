export interface CanvaMcpConfig {
    enabled: boolean;
    serverUrl: string;
    workspaceLabel?: string;
}

export type CanvaDesignStatus = 'created' | 'searched' | 'exported' | 'candidate';

export interface CanvaDesignSummary {
    id?: string;
    title: string;
    url?: string;
    thumbnailUrl?: string;
    exportUrl?: string;
    format?: string;
    designType?: string;
    status?: CanvaDesignStatus;
    raw?: any;
}

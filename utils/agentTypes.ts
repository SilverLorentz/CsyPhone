export interface AgentConfig {
    enabled: boolean;
    minIntervalMin: number;
    maxIntervalMin: number;
    cooldownHours: number;
    maxDailyActions: number;
    maxConsecutiveIgnored: number;
    baseProb: number;
    notificationsEnabled: boolean;
    debugMode: boolean;
    debugIntervalSec: number;
}

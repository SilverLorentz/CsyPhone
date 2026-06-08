// Barrel re-export: compose the DB object from domain stores
// Existing `import { DB } from '../utils/db'` continues to work unchanged.


// Re-export core types
export type { ScheduledMessage } from './core';

// Import all domain stores
import * as characterStore from './characterStore';
import * as contentStore from './contentStore';
import * as appDataStore from './appDataStore';
import * as bankStore from './bankStore';
import * as backupStore from './backupStore';
import * as vectorMemoryStore from './vectorMemoryStore';
import * as memoryRecordStore from './memoryRecordStore';
import * as newspaperStore from './newspaperStore';
import * as vibeReferenceStore from './vibeReferenceStore';
import * as niannianStore from './niannianStore';


// Compose the same `DB` object shape as the original monolithic file
export const DB = {
    // System
    deleteDB: backupStore.deleteDB,
    getRawStoreData: backupStore.getRawStoreData,
    exportFullData: backupStore.exportFullData,
    importFullData: backupStore.importFullData,

    // Characters
    getAllCharacters: characterStore.getAllCharacters,
    getCharacterById: characterStore.getCharacterById,
    saveCharacter: characterStore.saveCharacter,
    deleteCharacter: characterStore.deleteCharacter,
    resolveCharacterContentId: characterStore.resolveCharacterContentId,
    migrateLocalCharacterContentToInstance: characterStore.migrateLocalCharacterContentToInstance,

    // Messages
    getMessagesByCharId: characterStore.getMessagesByCharId,
    getMessagesByCharIdAfterTimestamp: characterStore.getMessagesByCharIdAfterTimestamp,
    getRecentMessageWindow: characterStore.getRecentMessageWindow,
    getRecentMessagesByCharId: characterStore.getRecentMessagesByCharId,
    getRecentMessagesWithCount: characterStore.getRecentMessagesWithCount,
    getMessagesFromId: characterStore.getMessagesFromId,
    getMessagesByIds: characterStore.getMessagesByIds,
    saveMessage: characterStore.saveMessage,
    saveMessageOnceByBackendId: characterStore.saveMessageOnceByBackendId,
    updateMessage: characterStore.updateMessage,
    updateMessageMetadata: characterStore.updateMessageMetadata,
    updateMessageType: characterStore.updateMessageType,
    deleteMessage: characterStore.deleteMessage,
    deleteMessages: characterStore.deleteMessages,
    clearMessages: characterStore.clearMessages,

    // Groups
    getGroups: characterStore.getGroups,
    saveGroup: characterStore.saveGroup,
    deleteGroup: characterStore.deleteGroup,
    getGroupMessages: characterStore.getGroupMessages,
    getRecentGroupMessagesWithCount: characterStore.getRecentGroupMessagesWithCount,

    // Scheduled Messages
    saveScheduledMessage: characterStore.saveScheduledMessage,
    getDueScheduledMessages: characterStore.getDueScheduledMessages,
    deleteScheduledMessage: characterStore.deleteScheduledMessage,

    // Themes
    getThemes: contentStore.getThemes,
    saveTheme: contentStore.saveTheme,
    deleteTheme: contentStore.deleteTheme,

    // Assets
    getAllAssets: contentStore.getAllAssets,
    getStartupAssets: contentStore.getStartupAssets,
    getAsset: contentStore.getAsset,
    saveAsset: contentStore.saveAsset,
    getAssetRaw: contentStore.getAssetRaw,
    saveAssetRaw: contentStore.saveAssetRaw,
    deleteAsset: contentStore.deleteAsset,

    // Emojis
    getEmojis: contentStore.getEmojis,
    saveEmoji: contentStore.saveEmoji,
    deleteEmoji: contentStore.deleteEmoji,
    deleteEmojis: contentStore.deleteEmojis,
    getEmojiCategories: contentStore.getEmojiCategories,
    saveEmojiCategory: contentStore.saveEmojiCategory,
    deleteEmojiCategory: contentStore.deleteEmojiCategory,
    initializeEmojiData: contentStore.initializeEmojiData,

    // Journal Stickers
    getJournalStickers: contentStore.getJournalStickers,
    saveJournalSticker: contentStore.saveJournalSticker,
    deleteJournalSticker: contentStore.deleteJournalSticker,

    // User Profile
    saveUserProfile: contentStore.saveUserProfile,
    getUserProfile: contentStore.getUserProfile,

    // Gallery
    saveGalleryImage: contentStore.saveGalleryImage,
    getGalleryImages: contentStore.getGalleryImages,
    updateGalleryImageReview: contentStore.updateGalleryImageReview,
    deleteGalleryImage: contentStore.deleteGalleryImage,

    // XHS Stock
    getXhsStockImages: contentStore.getXhsStockImages,
    saveXhsStockImage: contentStore.saveXhsStockImage,
    deleteXhsStockImage: contentStore.deleteXhsStockImage,
    updateXhsStockImageUsage: contentStore.updateXhsStockImageUsage,

    // XHS Activities
    saveXhsActivity: contentStore.saveXhsActivity,
    getXhsActivities: contentStore.getXhsActivities,
    getAllXhsActivities: contentStore.getAllXhsActivities,
    deleteXhsActivity: contentStore.deleteXhsActivity,
    clearXhsActivities: contentStore.clearXhsActivities,

    // Diaries
    getDiariesByCharId: appDataStore.getDiariesByCharId,
    saveDiary: appDataStore.saveDiary,
    deleteDiary: appDataStore.deleteDiary,

    // Tasks
    getAllTasks: appDataStore.getAllTasks,
    saveTask: appDataStore.saveTask,
    deleteTask: appDataStore.deleteTask,

    // Anniversaries
    getAllAnniversaries: appDataStore.getAllAnniversaries,
    saveAnniversary: appDataStore.saveAnniversary,
    deleteAnniversary: appDataStore.deleteAnniversary,

    // Room Todos & Notes
    getRoomTodo: appDataStore.getRoomTodo,
    saveRoomTodo: appDataStore.saveRoomTodo,
    getRoomNotes: appDataStore.getRoomNotes,
    saveRoomNote: appDataStore.saveRoomNote,
    deleteRoomNote: appDataStore.deleteRoomNote,

    // Social
    getSocialPosts: appDataStore.getSocialPosts,
    saveSocialPost: appDataStore.saveSocialPost,
    deleteSocialPost: appDataStore.deleteSocialPost,
    clearSocialPosts: appDataStore.clearSocialPosts,

    // Courses
    getAllCourses: appDataStore.getAllCourses,
    saveCourse: appDataStore.saveCourse,
    deleteCourse: appDataStore.deleteCourse,

    // Games
    getAllGames: appDataStore.getAllGames,
    saveGame: appDataStore.saveGame,
    deleteGame: appDataStore.deleteGame,

    // Worldbooks
    getAllWorldbooks: appDataStore.getAllWorldbooks,
    saveWorldbook: appDataStore.saveWorldbook,
    deleteWorldbook: appDataStore.deleteWorldbook,

    // Novels
    getAllNovels: appDataStore.getAllNovels,
    saveNovel: appDataStore.saveNovel,
    deleteNovel: appDataStore.deleteNovel,

    // Bank
    getBankState: bankStore.getBankState,
    saveBankState: bankStore.saveBankState,
    getBankDollhouse: bankStore.getBankDollhouse,
    saveBankDollhouse: bankStore.saveBankDollhouse,
    getAllTransactions: bankStore.getAllTransactions,
    saveTransaction: bankStore.saveTransaction,
    deleteTransaction: bankStore.deleteTransaction,

    // Voice Audio
    saveVoiceAudio: contentStore.saveVoiceAudio,
    getVoiceAudio: contentStore.getVoiceAudio,
    deleteVoiceAudio: contentStore.deleteVoiceAudio,

    // Hot News Snapshots
    saveHotNewsSnapshot: contentStore.saveHotNewsSnapshot,
    getHotNewsSnapshot: contentStore.getHotNewsSnapshot,
    getLatestHotNewsSnapshot: contentStore.getLatestHotNewsSnapshot,
    pruneHotNewsSnapshots: contentStore.pruneHotNewsSnapshots,

    // Vector Memories
    getAllVectorMemories: vectorMemoryStore.getAllVectorMemories,
    getUnsyncedVectorMemories: vectorMemoryStore.getUnsyncedVectorMemories,
    getVectorMemoryHeaders: vectorMemoryStore.getVectorMemoryHeaders,
    getVectorMemoryById: vectorMemoryStore.getVectorMemoryById,
    getVectorMemoriesByIds: vectorMemoryStore.getVectorMemoriesByIds,
    saveVectorMemory: vectorMemoryStore.saveVectorMemory,
    deleteVectorMemory: vectorMemoryStore.deleteVectorMemory,
    clearVectorMemories: vectorMemoryStore.clearVectorMemories,
    replaceVectorMemories: vectorMemoryStore.replaceVectorMemories,
    countVectorMemories: vectorMemoryStore.countVectorMemories,

    // Memory Records
    getMemoryRecords: memoryRecordStore.getMemoryRecords,
    getMemoryRecordById: memoryRecordStore.getMemoryRecordById,
    saveMemoryRecord: memoryRecordStore.saveMemoryRecord,
    deleteMemoryRecord: memoryRecordStore.deleteMemoryRecord,
    saveMemoryRecordAudio: memoryRecordStore.saveMemoryRecordAudio,
    getMemoryRecordAudio: memoryRecordStore.getMemoryRecordAudio,
    getMemoryRecordAudioEntry: memoryRecordStore.getMemoryRecordAudioEntry,
    getMemoryRecordAudioByRecordId: memoryRecordStore.getMemoryRecordAudioByRecordId,
    deleteMemoryRecordAudio: memoryRecordStore.deleteMemoryRecordAudio,

    // Yesterday Newspaper
    buildYesterdayNewspaperId: newspaperStore.buildYesterdayNewspaperId,
    getYesterdayNewspaper: newspaperStore.getYesterdayNewspaper,
    saveYesterdayNewspaper: newspaperStore.saveYesterdayNewspaper,
    markYesterdayNewspaperOpened: newspaperStore.markYesterdayNewspaperOpened,
    getLatestYesterdayNewspaperByPeriod: newspaperStore.getLatestYesterdayNewspaperByPeriod,
    getYesterdayNewspapersByCharId: newspaperStore.getYesterdayNewspapersByCharId,

    // NovelAI Vibe References
    getSavedVibeReferences: vibeReferenceStore.getSavedVibeReferences,
    getSavedVibeReference: vibeReferenceStore.getSavedVibeReference,
    saveSavedVibeReference: vibeReferenceStore.saveSavedVibeReference,
    renameSavedVibeReference: vibeReferenceStore.renameSavedVibeReference,
    deleteSavedVibeReference: vibeReferenceStore.deleteSavedVibeReference,
    clearSavedVibeReferenceCache: vibeReferenceStore.clearSavedVibeReferenceCache,
    upsertSavedVibeEncoding: vibeReferenceStore.upsertSavedVibeEncoding,

    // 念念浮生
    getAllNianNianSessions: niannianStore.getAllNianNianSessions,
    getNianNianSessionsByCharId: niannianStore.getNianNianSessionsByCharId,
    getNianNianSessionById: niannianStore.getNianNianSessionById,
    saveNianNianSession: niannianStore.saveNianNianSession,
    deleteNianNianSession: niannianStore.deleteNianNianSession,
};

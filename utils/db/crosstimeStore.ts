/**
 * Crosstime Store — localStorage 持久化
 * 与 trajectoryStore / theaterStore 一致的轻量存储模式。
 *
 * 房间不持久化（退出即归档），消息保留为只读历史。
 */

import type { CrosstimeRoom, CrosstimeMessage } from '../../types/crosstime';

const ROOMS_KEY = 'crosstime_rooms';
const MSGS_KEY_PREFIX = 'crosstime_msgs_';
const MAX_ROOMS = 20;

// ── Rooms ──

/** 获取所有房间（按 lastActiveAt 降序） */
export function getCrosstimeRooms(): CrosstimeRoom[] {
    try {
        const raw = localStorage.getItem(ROOMS_KEY);
        if (!raw) return [];
        const rooms = JSON.parse(raw) as CrosstimeRoom[];
        return rooms.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
    } catch {
        return [];
    }
}

/** 保存/更新房间（upsert），超过上限自动清理最旧的 */
export function saveCrosstimeRoom(room: CrosstimeRoom): void {
    try {
        const existing = getCrosstimeRooms();
        const idx = existing.findIndex(r => r.id === room.id);
        if (idx >= 0) {
            existing[idx] = room;
        } else {
            existing.unshift(room);
        }

        // 超过上限，清理最旧的房间和其消息
        while (existing.length > MAX_ROOMS) {
            const oldest = existing.pop();
            if (oldest) {
                try { localStorage.removeItem(MSGS_KEY_PREFIX + oldest.id); } catch { /* ignore */ }
            }
        }

        localStorage.setItem(ROOMS_KEY, JSON.stringify(existing));
    } catch (e) {
        console.error('[CrosstimeStore] Failed to save room:', e);
    }
}

/** 删除房间及其消息 */
export function deleteCrosstimeRoom(roomId: string): void {
    try {
        const existing = getCrosstimeRooms().filter(r => r.id !== roomId);
        localStorage.setItem(ROOMS_KEY, JSON.stringify(existing));
        localStorage.removeItem(MSGS_KEY_PREFIX + roomId);
    } catch { /* ignore */ }
}

// ── Messages ──

/** 获取某房间的所有消息（按时间升序） */
export function getCrosstimeMessages(roomId: string): CrosstimeMessage[] {
    try {
        const raw = localStorage.getItem(MSGS_KEY_PREFIX + roomId);
        if (!raw) return [];
        const msgs = JSON.parse(raw) as CrosstimeMessage[];
        return msgs.sort((a, b) => a.timestamp - b.timestamp);
    } catch {
        return [];
    }
}

/** 追加消息，返回自动分配的 id */
export function saveCrosstimeMessage(msg: Omit<CrosstimeMessage, 'id'>): number {
    try {
        const existing = getCrosstimeMessages(msg.roomId);
        const newId = existing.length > 0 ? Math.max(...existing.map(m => m.id)) + 1 : 1;
        const full: CrosstimeMessage = { ...msg, id: newId };
        existing.push(full);
        localStorage.setItem(MSGS_KEY_PREFIX + msg.roomId, JSON.stringify(existing));
        return newId;
    } catch (e) {
        console.error('[CrosstimeStore] Failed to save message:', e);
        return -1;
    }
}

/** 删除指定 ID 的消息（总结后释放存储空间） */
export function deleteCrosstimeMessagesByIds(roomId: string, idsToDelete: number[]): void {
    const idSet = new Set(idsToDelete);
    const remaining = getCrosstimeMessages(roomId).filter(m => !idSet.has(m.id));
    localStorage.setItem(MSGS_KEY_PREFIX + roomId, JSON.stringify(remaining));
}

/** 清空某房间的所有消息 */
export function deleteCrosstimeMessages(roomId: string): void {
    try {
        localStorage.removeItem(MSGS_KEY_PREFIX + roomId);
    } catch { /* ignore */ }
}

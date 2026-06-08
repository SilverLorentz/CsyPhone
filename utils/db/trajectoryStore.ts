/**
 * Trajectory Store — localStorage 持久化
 * 与 theaterStore 一致的轻量存储模式，避免 IDB version bump。
 */

import type { TrajectoryNode, TrajectoryMeta } from '../../types/trajectory';

const TRAJECTORY_NODES_KEY = 'trajectory_nodes_';
const TRAJECTORY_META_KEY = 'trajectory_meta_';

// ── Nodes ──

/** 获取角色所有轨迹节点 (按 sortOrder 升序) */
export function getTrajectoryNodes(charId: string): TrajectoryNode[] {
    try {
        const raw = localStorage.getItem(TRAJECTORY_NODES_KEY + charId);
        if (!raw) return [];
        const nodes = JSON.parse(raw) as TrajectoryNode[];
        return nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    } catch {
        return [];
    }
}

/** 保存/更新节点 (upsert) */
export function saveTrajectoryNode(node: TrajectoryNode): void {
    try {
        const existing = getTrajectoryNodes(node.charId);
        const idx = existing.findIndex(n => n.id === node.id);
        if (idx >= 0) {
            existing[idx] = { ...node, updatedAt: Date.now() };
        } else {
            existing.push(node);
        }
        localStorage.setItem(TRAJECTORY_NODES_KEY + node.charId, JSON.stringify(existing));
    } catch (e) {
        console.error('[TrajectoryStore] Failed to save node:', e);
    }
}

/** 批量保存节点（覆盖整个列表） */
export function saveAllTrajectoryNodes(charId: string, nodes: TrajectoryNode[]): void {
    try {
        localStorage.setItem(TRAJECTORY_NODES_KEY + charId, JSON.stringify(nodes));
    } catch (e) {
        console.error('[TrajectoryStore] Failed to save all nodes:', e);
    }
}

/** 删除节点 */
export function deleteTrajectoryNode(charId: string, nodeId: string): void {
    try {
        const existing = getTrajectoryNodes(charId).filter(n => n.id !== nodeId);
        localStorage.setItem(TRAJECTORY_NODES_KEY + charId, JSON.stringify(existing));
    } catch { /* ignore */ }
}

// ── Meta ──

/** 获取轨迹元数据 */
export function getTrajectoryMeta(charId: string): TrajectoryMeta | null {
    try {
        const raw = localStorage.getItem(TRAJECTORY_META_KEY + charId);
        if (!raw) return null;
        return JSON.parse(raw) as TrajectoryMeta;
    } catch {
        return null;
    }
}

/** 保存轨迹元数据 */
export function saveTrajectoryMeta(meta: TrajectoryMeta): void {
    try {
        localStorage.setItem(TRAJECTORY_META_KEY + meta.charId, JSON.stringify(meta));
    } catch (e) {
        console.error('[TrajectoryStore] Failed to save meta:', e);
    }
}

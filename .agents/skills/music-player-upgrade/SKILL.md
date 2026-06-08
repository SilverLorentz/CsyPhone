---
name: music-player-upgrade
description: Emo Cloud 音乐播放器五合一升级：我的歌单 / 进度条拖拽 / 歌词跳转 / 分享卡片跳转弹窗 / 收藏歌曲占位
---

# Emo Cloud 音乐播放器五合一升级

> 本 skill 包含 5 个功能模块，可拆分为独立任务。每个模块标注了涉及文件、具体改法和验收标准。

---

## 📍 项目上下文

### 关键文件地图

| 文件 | 作用 |
|------|------|
| `apps/music/MusicApp.tsx` (~2743 行) | 音乐 App 主组件，含 DiscoverPage / SearchPage / ProfilePage / FullPlayer / MiniPlayer / PlayerLyricsPanel 等子组件 |
| `apps/music/music.css` (~2051 行) | 音乐 App 全部样式 |
| `hooks/useAudioPlayer.ts` (416 行) | 单例音频引擎，暴露 playSong / togglePlay / seek(percent) / playNext / playPrev 等 |
| `hooks/useLyrics.ts` (97 行) | 歌词获取 + 当前行索引计算 |
| `utils/musicService.ts` (940 行) | 网易云 API 封装，所有 `musicPost()` 调用后端 `/api/music/*` |
| `types/music.ts` (190 行) | 所有音乐类型定义 |
| `components/chat/cards/SongShareCardBubble.tsx` (193 行) | 聊天消息中的歌曲分享卡片 |
| `components/chat/MessageItem.tsx` | 渲染 SongShareCardBubble 的父组件 (line 651) |
| `context/AppContext.tsx` (89 行) | App 导航系统，`openApp(appId, params)` 带参数切换 App |
| `constants.tsx` | `AppID.Music` = Emo Cloud 的 App ID |

### 架构要点

- **App 导航**：`openApp(AppID.Music, { songId: 123 })` → MusicApp 通过 `useApp().appParams` 读取参数
- **音频引擎**：`useAudioPlayer()` 是全局单例，任何组件调用 `playSong(song)` 都能播放
- **进度跳转**：当前 `seek(percent)` 按百分比跳转，需要新增 `seekToTime(seconds)` 按秒跳转
- **歌词数据**：每行歌词是 `{ time: number, text: string, translation?: string }`，`time` 是秒数
- **后端代理**：所有 `/api/music/*` 由后端 Workers 代理网易云 API，前端不直接调网易云

---

## 模块 A：我的歌单（ProfilePage）

### 📝 要求

登录状态下（`isLoggedIn && account` 存在），在 ProfilePage 展示用户的歌单列表。

### 📁 涉及文件

- `utils/musicService.ts` — 新增 `getUserPlaylists(uid)`
- `apps/music/MusicApp.tsx` — ProfilePage 组件 + 主组件状态

### 详细步骤

#### 1. musicService.ts — 新增函数

在文件末尾（`getUserAccount` 函数后面）添加：

```ts
export async function getUserPlaylists(uid: number, limit = 50, offset = 0): Promise<NeteasePlaylist[]> {
    const data = await musicPost<{ playlist?: unknown }>('/api/music/user/playlist', {
        uid,
        limit,
        offset,
        cookie: getMusicCookie(),
    });
    assertMusicApiSuccess(data, `${MUSIC_SERVICE_NAME}用户歌单暂时不可用`);
    return asArray(data.playlist)
        .map(normalizePlaylist)
        .filter((item): item is NeteasePlaylist => Boolean(item));
}
```

同时在文件顶部的 import 块里，确保 `getUserPlaylists` 在 `MusicApp.tsx` 的 import 中被引入。

#### 2. MusicApp.tsx — 主组件新增状态

在 `MusicApp()` 组件函数内部，在 `accountReloadKey` 状态附近添加：

```ts
const [userPlaylists, setUserPlaylists] = useState<NeteasePlaylist[]>([]);
const [userPlaylistsLoading, setUserPlaylistsLoading] = useState(false);
const [userPlaylistsError, setUserPlaylistsError] = useState<string | null>(null);
```

添加 useEffect 在 account 变化时加载歌单：

```ts
useEffect(() => {
    if (!isLoggedIn || !account) {
        setUserPlaylists([]);
        setUserPlaylistsLoading(false);
        setUserPlaylistsError(null);
        return;
    }

    let active = true;
    setUserPlaylistsLoading(true);
    setUserPlaylistsError(null);

    getUserPlaylists(account.userId)
        .then((playlists) => {
            if (!active) return;
            setUserPlaylists(playlists);
        })
        .catch((err) => {
            if (!active) return;
            setUserPlaylistsError(err instanceof Error ? err.message : '歌单加载失败');
            setUserPlaylists([]);
        })
        .finally(() => {
            if (active) setUserPlaylistsLoading(false);
        });

    return () => { active = false; };
}, [account, isLoggedIn]);
```

#### 3. ProfilePage 组件 — 新增 props 和歌单渲染

给 ProfilePage 组件新增 props：

```ts
userPlaylists: NeteasePlaylist[];
userPlaylistsLoading: boolean;
userPlaylistsError: string | null;
onOpenPlaylist: (playlist: NeteasePlaylist) => void;
```

在 ProfilePage 的 `music-profile-summary-card` 下方，渲染歌单列表：

```tsx
{/* 分为"创建的歌单"和"收藏的歌单" */}
{isLoggedIn && account && !userPlaylistsLoading && userPlaylists.length > 0 ? (
    <>
        {/* 创建的歌单 */}
        {(() => {
            const created = userPlaylists.filter(p => p.creator?.userId === account.userId);
            return created.length > 0 ? (
                <SectionBlock title="创建的歌单" subtitle={`${created.length} 个`}>
                    <div style={{ padding: '0 16px' }}>
                        <ul className="music-song-list">
                            {created.map(playlist => (
                                <li key={playlist.id} className="music-song-item" onClick={() => onOpenPlaylist(playlist)}>
                                    <CoverArt src={playlist.coverImgUrl} alt={playlist.name} seed={playlist.id} className="music-song-cover" note="♫" />
                                    <div className="music-song-info">
                                        <div className="music-song-name">{playlist.name}</div>
                                        <div className="music-song-artist">{getPlaylistSubtitle(playlist)}</div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </SectionBlock>
            ) : null;
        })()}

        {/* 收藏的歌单 */}
        {(() => {
            const collected = userPlaylists.filter(p => p.creator?.userId !== account.userId);
            return collected.length > 0 ? (
                <SectionBlock title="收藏的歌单" subtitle={`${collected.length} 个`}>
                    <div style={{ padding: '0 16px' }}>
                        <ul className="music-song-list">
                            {collected.map(playlist => (
                                <li key={playlist.id} className="music-song-item" onClick={() => onOpenPlaylist(playlist)}>
                                    <CoverArt src={playlist.coverImgUrl} alt={playlist.name} seed={playlist.id} className="music-song-cover" note="♫" />
                                    <div className="music-song-info">
                                        <div className="music-song-name">{playlist.name}</div>
                                        <div className="music-song-artist">{getPlaylistSubtitle(playlist)}</div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </SectionBlock>
            ) : null;
        })()}
    </>
) : null}

{isLoggedIn && account && userPlaylistsLoading ? (
    <div className="music-loading-block">
        <div className="music-inline-spinner" />
        <div className="music-state-text">正在加载你的歌单...</div>
    </div>
) : null}

{isLoggedIn && account && userPlaylistsError ? (
    <div className="music-state-card" style={{ margin: '0 16px 16px' }}>
        <div className="music-state-title">歌单加载失败</div>
        <div className="music-state-text">{userPlaylistsError}</div>
    </div>
) : null}
```

然后在主组件渲染 `<ProfilePage>` 的地方传入这些 props：

```tsx
userPlaylists={userPlaylists}
userPlaylistsLoading={userPlaylistsLoading}
userPlaylistsError={userPlaylistsError}
onOpenPlaylist={openPlaylistDetail}
```

注意：`openPlaylistDetail` 函数已经存在于主组件中 (line ~2407)，直接复用。

---

## 模块 B：进度条拖拽（FullPlayer）

### 📝 要求

将 FullPlayer 的进度条从「点击跳转」升级为「支持 pointer 拖拽」。拖拽时进度条视觉放大，松手后 seek 到目标位置。

### 📁 涉及文件

- `apps/music/MusicApp.tsx` — FullPlayer 组件 (line ~1752)
- `apps/music/music.css` — 进度条样式 (line ~1028)

### 详细步骤

#### 1. FullPlayer 组件 — 拖拽状态和事件

在 FullPlayer 组件内，`progressBarRef` 下方添加：

```tsx
const [isDragging, setIsDragging] = useState(false);
const [dragPercent, setDragPercent] = useState(0);

function clampPercent(e: React.PointerEvent, bar: HTMLDivElement): number {
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
}

function handleProgressPointerDown(e: React.PointerEvent): void {
    e.preventDefault();
    const bar = progressBarRef.current;
    if (!bar) return;
    bar.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragPercent(clampPercent(e, bar));
}

function handleProgressPointerMove(e: React.PointerEvent): void {
    if (!isDragging) return;
    const bar = progressBarRef.current;
    if (!bar) return;
    setDragPercent(clampPercent(e, bar));
}

function handleProgressPointerUp(e: React.PointerEvent): void {
    if (!isDragging) return;
    const bar = progressBarRef.current;
    if (bar) bar.releasePointerCapture(e.pointerId);
    setIsDragging(false);
    onSeek(dragPercent);
}
```

#### 2. FullPlayer — 替换进度条 JSX

找到进度条区域（`<div className="music-player-progress">`，约 line 1928），替换为：

```tsx
<div className="music-player-progress">
    <div
        ref={progressBarRef}
        className={`music-player-progress-bar ${isDragging ? 'dragging' : ''}`}
        onPointerDown={handleProgressPointerDown}
        onPointerMove={handleProgressPointerMove}
        onPointerUp={handleProgressPointerUp}
        onPointerCancel={handleProgressPointerUp}
        style={{ touchAction: 'none' }}
    >
        <div
            className="music-player-progress-fill"
            style={{ width: `${isDragging ? dragPercent : progress}%` }}
        >
            <div className="music-player-progress-dot" />
        </div>
    </div>
    <div className="music-player-time">
        <span>
            {isDragging
                ? formatSeconds((dragPercent / 100) * displayDuration)
                : formatSeconds(currentTime)}
        </span>
        <span>{formatSeconds(displayDuration)}</span>
    </div>
</div>
```

**重要**：删除原来进度条上的 `onClick` 事件，拖拽已包含点击（pointerDown + pointerUp 在同一位置 = 点击）。

#### 3. music.css — 拖拽态样式

在 `.music-player-progress-dot` 样式后面（约 line 1063 后）添加：

```css
/* 拖拽态 — 进度条加粗 + 手柄放大 */
.music-player-progress-bar.dragging {
    height: 8px;
}

.music-player-progress-bar.dragging .music-player-progress-dot {
    width: 20px;
    height: 20px;
    right: -10px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.4), 0 0 16px rgba(255,255,255,0.2);
}

/* 增大触控热区 */
.music-player-progress-bar {
    padding: 12px 0;
    margin: -12px 0;
    background-clip: content-box;
    transition: height 0.15s ease;
}
```

---

## 模块 C：歌词点击跳转

### 📝 要求

点击歌词面板中任意一行歌词 → 歌曲跳到该行时间戳。

### 📁 涉及文件

- `hooks/useAudioPlayer.ts` — 新增 `seekToTime(seconds)` 方法
- `apps/music/MusicApp.tsx` — PlayerLyricsPanel 和 FullPlayer 组件
- `apps/music/music.css` — 歌词行交互样式

### 详细步骤

#### 1. useAudioPlayer.ts — 新增 seekToTime

在 `seekInternal` 函数后面（约 line 329 后）添加：

```ts
function seekToTimeInternal(seconds: number): void {
    const audio = getAudio();
    if (!audio) return;

    const safeDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (safeDuration <= 0) return;

    audio.currentTime = Math.max(0, Math.min(seconds, safeDuration));
    syncStateFromAudio();
}
```

在 `useAudioPlayer` 的 return 中添加：

```ts
seekToTime: seekToTimeInternal,
```

#### 2. PlayerLyricsPanel — 新增 onSeekToTime prop

给 `PlayerLyricsPanel` 组件增加 prop：

```ts
onSeekToTime?: (seconds: number) => void;
```

在歌词行渲染中，给每个 `<div className="music-player-lyrics-line ...">` 添加 onClick：

```tsx
onClick={() => {
    if (onSeekToTime && line.time >= 0) {
        onSeekToTime(line.time);
    }
}}
```

#### 3. FullPlayer — 传入 onSeekToTime

在 FullPlayer 组件内，在渲染 `<PlayerLyricsPanel>` 时新增 prop。需要先从 `useAudioPlayer` 解构出 `seekToTime`（或者通过 FullPlayer 的 props 传入）。

**推荐做法**：给 FullPlayer 增加 `onSeekToTime` prop，从主组件传入。

在主组件中：

```tsx
const { ..., seekToTime } = useAudioPlayer();
```

在 `<FullPlayer>` 传入：

```tsx
onSeekToTime={seekToTime}
```

FullPlayer 再传给 `<PlayerLyricsPanel onSeekToTime={onSeekToTime}>`.

#### 4. music.css — 歌词行可点击样式

在 `.music-player-lyrics-line` 样式后面添加：

```css
.music-player-lyrics-line {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
}

.music-player-lyrics-line:active {
    opacity: 0.6;
}
```

---

## 模块 D：分享卡片 → 确认弹窗 → 跳转 Emo Cloud

### 📝 要求

点击聊天中的 `SongShareCardBubble` → 弹出一个精美的确认弹窗（显示封面、歌名、歌手） → 用户确认 → 打开 Emo Cloud 并自动播放 + 展示全屏播放器。

### 📁 涉及文件

- `components/chat/cards/SongShareCardBubble.tsx` — 修改点击行为 + 新增确认弹窗
- `apps/music/MusicApp.tsx` — 读取 appParams 自动播放
- `context/AppContext.tsx` — 已有 `openApp(appId, params)` 无需修改

### 详细步骤

#### 1. SongShareCardBubble.tsx — 新增确认弹窗

**完整重写此文件**。核心改动：

1. 引入 `{ useAppNavigation }` from `'../../../context/AppContext'` 和 `{ AppID }` from `'../../../types'`
2. 引入 `{ useState }` from `'react'`
3. 点击卡片不再直接 `playSong()`，改为 `setShowConfirm(true)`
4. 新增 `SongOpenConfirmModal` 内联组件

```tsx
import React, { useCallback, useState } from 'react';
import type { SongCardMetadata } from '../../../types/music';
import { useAppNavigation } from '../../../context/AppContext';
import { AppID } from '../../../types';
import { useAudioPlayer } from '../../../hooks/useAudioPlayer';
import type { NeteaseSong } from '../../../types/music';

interface SongShareCardBubbleProps {
    metadata: SongCardMetadata;
}

const SongShareCardBubble: React.FC<SongShareCardBubbleProps> = ({ metadata }) => {
    const { openApp } = useAppNavigation();
    const { playSong } = useAudioPlayer();
    const [showConfirm, setShowConfirm] = useState(false);

    const handleConfirmOpen = useCallback(() => {
        if (!metadata.songId || metadata.songId === 0) return;

        // Build song object for player
        const song: NeteaseSong = {
            kind: 'song',
            id: metadata.songId,
            name: metadata.songName,
            artists: [{ id: 0, name: metadata.artist }],
            album: {
                kind: 'album' as const,
                id: 0,
                name: metadata.albumName || '',
                picUrl: metadata.albumCover,
            },
            duration: metadata.duration || 0,
        };

        playSong(song);
        openApp(AppID.Music, { autoShowPlayer: true });
        setShowConfirm(false);
    }, [metadata, playSong, openApp]);

    return (
        <>
            {/* 卡片本体（保持原有样式不变） */}
            <div
                className="animate-fade-in active:scale-[0.97] transition-transform cursor-pointer select-none"
                onClick={() => setShowConfirm(true)}
                style={{
                    width: '240px',
                    background: '#fafafa',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: '0.5px solid rgba(0,0,0,0.08)',
                }}
            >
                {/* ... 保持原有卡片 JSX 完全不变 ... */}
            </div>

            {/* 确认弹窗 */}
            {showConfirm ? (
                <div
                    className="song-open-confirm-backdrop"
                    onClick={() => setShowConfirm(false)}
                >
                    <div
                        className="song-open-confirm-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* 封面 */}
                        <div className="song-open-confirm-cover">
                            {metadata.albumCover ? (
                                <img src={metadata.albumCover} alt="" />
                            ) : (
                                <div className="song-open-confirm-cover-fallback">♪</div>
                            )}
                        </div>

                        {/* 歌曲信息 */}
                        <div className="song-open-confirm-title">{metadata.songName}</div>
                        <div className="song-open-confirm-artist">{metadata.artist}</div>

                        {/* 按钮组 */}
                        <div className="song-open-confirm-actions">
                            <button
                                type="button"
                                className="song-open-confirm-btn song-open-confirm-btn--primary"
                                onClick={handleConfirmOpen}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                                打开并播放
                            </button>
                            <button
                                type="button"
                                className="song-open-confirm-btn song-open-confirm-btn--secondary"
                                onClick={() => setShowConfirm(false)}
                            >
                                取消
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
};

export default SongShareCardBubble;
```

> 重要：卡片本体的 JSX（封面 + 歌曲信息 + 底部标签部分）完全保留原文件的内容，只是把 `onClick={handlePlay}` 改成 `onClick={() => setShowConfirm(true)}`。

#### 2. 确认弹窗样式

在 `apps/music/music.css` 末尾添加弹窗样式。**不在 music.css 添加**，而是在卡片组件所在的上下文中添加样式。

新建文件 `components/chat/cards/songConfirmModal.css`：

```css
/* ─── 歌曲跳转确认弹窗 ────────────────────── */
.song-open-confirm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: song-confirm-fade-in 0.2s ease;
}

@keyframes song-confirm-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}

.song-open-confirm-card {
    width: 280px;
    background: rgba(38, 38, 40, 0.92);
    backdrop-filter: blur(40px) saturate(1.6);
    -webkit-backdrop-filter: blur(40px) saturate(1.6);
    border-radius: 20px;
    padding: 28px 24px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    box-shadow:
        0 24px 48px rgba(0, 0, 0, 0.4),
        0 0 0 0.5px rgba(255, 255, 255, 0.1);
    animation: song-confirm-slide-up 0.35s cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes song-confirm-slide-up {
    from { transform: translateY(40px) scale(0.95); opacity: 0; }
    to { transform: translateY(0) scale(1); opacity: 1; }
}

.song-open-confirm-cover {
    width: 120px;
    height: 120px;
    border-radius: 14px;
    overflow: hidden;
    margin-bottom: 18px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.song-open-confirm-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.song-open-confirm-cover-fallback {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #ec4141, #c03030);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    font-size: 36px;
}

.song-open-confirm-title {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    line-height: 1.3;
    margin-bottom: 4px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.song-open-confirm-artist {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin-bottom: 24px;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.song-open-confirm-actions {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.song-open-confirm-btn {
    width: 100%;
    height: 44px;
    border: none;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: transform 0.12s, opacity 0.12s;
}

.song-open-confirm-btn:active {
    transform: scale(0.96);
}

.song-open-confirm-btn--primary {
    background: #ec4141;
    color: #fff;
    box-shadow: 0 4px 16px rgba(236, 65, 65, 0.35);
}

.song-open-confirm-btn--secondary {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
}
```

在 `SongShareCardBubble.tsx` 顶部 import 这个 CSS：

```ts
import './songConfirmModal.css';
```

#### 3. MusicApp.tsx — 读取 appParams 自动打开全屏播放器

在 MusicApp 主组件中，导入 `appParams`：

```ts
const { closeApp, registerBackHandler, appParams } = useApp();
```

> 注意：`useApp()` 在 line 2011 已经被调用，只需在解构中加上 `appParams`。

添加 useEffect 响应 `appParams.autoShowPlayer`：

```ts
useEffect(() => {
    if (appParams?.autoShowPlayer) {
        setShowFullPlayer(true);
    }
}, [appParams]);
```

这样当从分享卡片跳转过来时，会自动打开全屏播放器。

---

## 模块 E：收藏歌曲到歌单（前端占位）

### 📝 要求

在全屏播放器中的「更多」菜单里添加「收藏到歌单」选项。后端 API 暂未就绪，前端先做好 UI + 占位逻辑。

### 📁 涉及文件

- `utils/musicService.ts` — 新增 stub 函数
- `apps/music/MusicApp.tsx` — FullPlayer 组件
- `apps/music/music.css` — 收藏菜单样式

### 详细步骤

#### 1. musicService.ts — 收藏 API 占位

```ts
/**
 * 收藏歌曲到歌单 (后端路由待添加)
 * @param playlistId 目标歌单 ID
 * @param songIds 要收藏的歌曲 ID 数组
 */
export async function addSongsToPlaylist(playlistId: number, songIds: number[]): Promise<void> {
    // TODO: 后端添加 /api/music/playlist/tracks 路由后启用
    console.warn('[MusicService] addSongsToPlaylist: 后端路由待添加', { playlistId, songIds });
    throw new Error('收藏功能即将上线，后端路由正在开发中。');
}
```

#### 2. FullPlayer — 更多菜单弹窗

在 FullPlayer 的歌曲信息区域的「更多」图标（`<IconMore />`，约 line 1914）添加一个 onClick，触发一个简单的底部弹窗。这是 UI 占位，点击收藏时 catch 错误并显示 toast 提示。

> 具体实现可简化为：点击更多按钮 → 显示一个底部弹出的操作菜单（「收藏到歌单」「取消」）→ 点击收藏 → 弹出歌单选择列表 → 选择后调用 `addSongsToPlaylist` → catch 提示「即将上线」。

**这个模块可以简化为只添加按钮 + 占位提示，不做完整的歌单选择 UI。**

---

## ⚠️ 不能碰的东西

1. **不能修改** `context/AppContext.tsx` 的现有接口签名
2. **不能修改** `hooks/useAudioPlayer.ts` 的现有方法签名（只能新增）
3. **不能改** `types/music.ts` 的已有类型（只能新增）
4. **不能删除** MusicApp 中任何现有功能或组件
5. **不能推送到** `origin/main`
6. **CSS 中不用 TailwindCSS 扩展类**（music.css 使用纯 CSS）
7. **SongShareCardBubble 弹窗的 CSS 不写在 music.css 中**，而是写在卡片组件旁边的独立 CSS 文件

---

## ✅ 验收标准

### 编译检查

- [ ] `npx tsc --noEmit` 在前端目录无报错
- [ ] `npm run build` 成功

### 功能验收

**模块 A — 我的歌单**
- [ ] QR 登录后，"我的"页面显示「创建的歌单」和「收藏的歌单」两个分组
- [ ] 点击歌单可进入详情页，点歌可播放
- [ ] 未登录时不显示歌单区域
- [ ] 后端路由不存在时，显示加载失败提示而不是白屏

**模块 B — 进度条拖拽**
- [ ] 手指/鼠标按住进度条可拖拽，实时更新进度位置
- [ ] 拖拽时进度条视觉变粗，手柄变大
- [ ] 拖拽时时间标签实时变化
- [ ] 松手后歌曲跳到目标位置
- [ ] 单击进度条仍然有效（等同于按下+抬起同一位置）

**模块 C — 歌词点击跳转**
- [ ] 点击任意歌词行，歌曲跳到该行对应的时间
- [ ] 歌词行 cursor 显示为 pointer
- [ ] 点击后歌词面板自动滚动到新的当前行

**模块 D — 分享卡片跳转弹窗**
- [ ] 点击聊天中的歌曲卡片 → 弹出确认弹窗
- [ ] 弹窗显示封面图、歌名、歌手名
- [ ] 点击「打开并播放」→ 跳转到 Emo Cloud + 自动打开全屏播放器 + 开始播放
- [ ] 点击「取消」或背景 → 关闭弹窗
- [ ] 弹窗有入场动画（毛玻璃 + 滑入）

**模块 E — 收藏占位**
- [ ] 全屏播放器中可见收藏入口
- [ ] 点击后显示"即将上线"提示

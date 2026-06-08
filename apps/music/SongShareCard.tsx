/**
 * SongShareCard — 网易云音乐歌曲分享卡片
 *
 * 在聊天消息中渲染的可点击歌曲分享卡片。
 * 仿照网易云音乐 App 内的分享卡片样式。
 */

import React from 'react';

interface SongShareCardProps {
  songName: string;
  artist: string;
  albumCover?: string;
  songId?: number;
  onPlay?: () => void;
}

const SongShareCard: React.FC<SongShareCardProps> = ({
  songName,
  artist,
  albumCover,
  onPlay,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        maxWidth: 280,
        transition: 'transform 0.15s',
        border: '0.5px solid rgba(0,0,0,0.06)',
      }}
      onClick={onPlay}
      onMouseDown={(e) => {
        const target = e.currentTarget;
        target.style.transform = 'scale(0.97)';
      }}
      onMouseUp={(e) => {
        const target = e.currentTarget;
        target.style.transform = 'scale(1)';
      }}
      onMouseLeave={(e) => {
        const target = e.currentTarget;
        target.style.transform = 'scale(1)';
      }}
    >
      {/* Album Cover */}
      <div style={{
        width: 56,
        height: 56,
        flexShrink: 0,
        background: albumCover ? undefined : 'linear-gradient(135deg, #ec4141, #c03030)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {albumCover ? (
          <img
            src={albumCover}
            alt={songName}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: 22, color: 'rgba(255,255,255,0.9)' }}>♪</span>
        )}
      </div>

      {/* Song Info */}
      <div style={{
        flex: 1,
        padding: '8px 12px',
        minWidth: 0,
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#333',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {songName}
        </div>
        <div style={{
          fontSize: 12,
          color: '#999',
          marginTop: 2,
        }}>
          {artist}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginTop: 4,
          fontSize: 10,
          color: '#ec4141',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#ec4141">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
          </svg>
          网易云音乐
        </div>
      </div>

      {/* Play Button */}
      <div style={{
        width: 36,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        flexShrink: 0,
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: '#ec4141',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(236,65,65,0.3)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default SongShareCard;


import React,{ useRef,useCallback } from 'react';
import { AppConfig } from '../../types';
import { Icons } from '../../constants';
import { haptic } from '../../utils/haptics';

interface AppIconProps {
  app: AppConfig;
  onClick: () => void;
  onLongPress?: () => void;
  size?: 'md' | 'lg';
  hideLabel?: boolean;
  variant?: 'default' | 'minimal' | 'dock';
  customIconUrl?: string;
  contentColor?: string;
  showCustomIconFrame?: boolean;
  isLite?: boolean;
}

const AppIcon: React.FC<AppIconProps> = React.memo(({
  app,
  onClick,
  onLongPress,
  size = 'md',
  hideLabel = false,
  variant = 'default',
  customIconUrl,
  contentColor = '#ffffff',
  showCustomIconFrame = true,
  isLite = false,
}) => {
  const IconComponent = Icons[app.icon] || Icons.Settings;
  const showIconFrame = !customIconUrl || showCustomIconFrame;

  // Long-press detection
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    didLongPress.current = false;
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      haptic.medium();
      onLongPress?.();
    }, 500);
  }, [onLongPress]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const dx = e.touches[0].clientX - touchStartPos.current.x;
    const dy = e.touches[0].clientY - touchStartPos.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  }, []);

  const handleClick = useCallback(() => {
    // Prevent click after long-press
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    onClick();
  }, [onClick]);

  // Standard sizes
  const sizeClasses = size === 'lg' ? 'w-[4.5rem] h-[4.5rem]' : 'w-[4rem] h-[4rem]';

  return (
    <button
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="flex flex-col items-center gap-1.5 group relative active:scale-95 transition-transform duration-200"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Container: Glass Prism with internal glow */}
      <div className={`${sizeClasses} relative flex items-center justify-center transition-all duration-300 ${
        showIconFrame
          ? isLite
            ? `bg-white/55 rounded-[1.2rem]
              border border-white/25
              shadow-[0_4px_10px_rgba(0,0,0,0.14)]`
            : `bg-white/10 backdrop-blur-xl rounded-[1.2rem]
              border-t border-l border-white/40 border-b border-r border-white/10
              shadow-[0_8px_16px_rgba(0,0,0,0.2)]
              group-hover:bg-white/20 group-hover:shadow-[0_0_20px_rgba(255,255,255,0.3)] group-hover:border-white/60`
          : ''
      }`}>

        {/* Shine effect */}
        {showIconFrame && (
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent rounded-[1.2rem] opacity-0 group-hover:opacity-100 transition-opacity"></div>
        )}

        {customIconUrl ? (
          <img
            src={customIconUrl}
            className={showCustomIconFrame ? 'w-full h-full object-cover rounded-[1.2rem]' : 'w-full h-full object-contain drop-shadow-[0_6px_12px_rgba(15,23,42,0.2)]'}
            alt={app.name}
            loading="lazy"
          />
        ) : (
          <div
            className="w-[50%] h-[50%] drop-shadow-[0_2px_5px_rgba(0,0,0,0.3)] opacity-90"
            style={{ color: contentColor }}
          >
            <IconComponent className="w-full h-full" />
          </div>
        )}
      </div>

      {!hideLabel && (
        <span
          className={`text-[10px] font-bold tracking-widest uppercase opacity-80 text-shadow-md transition-opacity ${variant === 'dock' ? 'hidden' : 'block'}`}
          style={{ color: contentColor }}
        >
          {app.name}
        </span>
      )}
    </button>
  );
}, (prev, next) => {
  return prev.app.id === next.app.id &&
    prev.size === next.size &&
    prev.hideLabel === next.hideLabel &&
    prev.variant === next.variant &&
    prev.customIconUrl === next.customIconUrl &&
    prev.contentColor === next.contentColor &&
    prev.showCustomIconFrame === next.showCustomIconFrame &&
    prev.isLite === next.isLite &&
    prev.onClick === next.onClick &&
    prev.onLongPress === next.onLongPress;
});

export default AppIcon;

import React from 'react';

/**
 * MeituanTakeoutCard — 高仿美团外卖订单卡片
 *
 * Design principles:
 * - Pixel-accurate Meituan brand colors (#FFD000 yellow, #111 text)
 * - Kangaroo logo placeholder (SVG-like icon)
 * - Multi-item list with quantities
 * - Status-aware coloring
 * - Defensive rendering for missing AI fields
 *
 * Expected metadata from AI:
 *   title  — 商家名 (e.g. "华莱士(高新店)")
 *   detail — 菜品明细，用「;」「；」「,」「，」分隔多个菜品 (e.g. "蜜汁手扒鸡×1;可乐×2;薯条×1")
 *   value  — 总价 (e.g. "¥45.8")
 *   shop   — (可选) 订单状态 (e.g. "已完成" / "骑手正在配送")
 */

interface MeituanTakeoutCardProps {
    title: string;
    detail: string;
    value?: string;
    shop?: string;   // Repurposed: 当有status字段时用作状态, 否则fallback "已完成"
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Parse comma/semicolon-separated item list from AI */
const parseItems = (detail: string): string[] => {
    return detail
        .split(/[;；,，\n\\n]/)
        .map(s => s.trim())
        .filter(Boolean);
};

/** Pick a food emoji based on item name heuristics */
const getFoodEmoji = (name: string): string => {
    if (/鸡|翅|腿/.test(name)) return '🍗';
    if (/汉堡|堡/.test(name)) return '🍔';
    if (/薯条|薯/.test(name)) return '🍟';
    if (/可乐|雪碧|饮|奶茶|咖啡|茶/.test(name)) return '🥤';
    if (/饭|米|粥/.test(name)) return '🍚';
    if (/面|粉|拉面/.test(name)) return '🍜';
    if (/披萨|pizza/.test(name)) return '🍕';
    if (/蛋糕|甜品|冰淇淋/.test(name)) return '🍰';
    if (/寿司|刺身/.test(name)) return '🍣';
    if (/烧烤|串|烤/.test(name)) return '🍢';
    if (/沙拉/.test(name)) return '🥗';
    if (/火锅|锅/.test(name)) return '🍲';
    if (/虾|蟹|鱼|海鲜/.test(name)) return '🦐';
    return '🍱';
};

/** Derive status styling */
const getStatusInfo = (status: string) => {
    if (/已完成|已送达|已签收/.test(status))
        return { label: status, color: '#52c41a', bg: '#f6ffed' };
    if (/配送|骑手|送货|送达中/.test(status))
        return { label: status, color: '#1890ff', bg: '#e6f7ff' };
    if (/待取餐|制作中|备餐/.test(status))
        return { label: status, color: '#fa8c16', bg: '#fff7e6' };
    if (/已取消|退款/.test(status))
        return { label: status, color: '#ff4d4f', bg: '#fff1f0' };
    // Default: 已完成
    return { label: status || '已完成', color: '#52c41a', bg: '#f6ffed' };
};

// ─── Component ───────────────────────────────────────────────────

const MeituanTakeoutCard: React.FC<MeituanTakeoutCardProps> = ({ title, detail, value, shop }) => {
    const items = parseItems(detail);
    const statusRaw = shop || '已完成';
    const statusInfo = getStatusInfo(statusRaw);

    return (
        <div style={{
            width: 260,
            borderRadius: 12,
            overflow: 'hidden',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            border: '1px solid #f0f0f0',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
            {/* ═══ Header: Meituan Brand Bar ═══ */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: 'linear-gradient(135deg, #FFD000 0%, #FFC300 100%)',
            }}>
                {/* Left: Logo + Shop Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    {/* Meituan Kangaroo Icon (simplified) */}
                    <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}>
                        <span style={{ fontSize: 14, lineHeight: 1 }}>🦘</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#111111',
                            lineHeight: 1.3,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {title || '美团外卖商家'}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)', lineHeight: 1 }}>
                            美团外卖
                        </div>
                    </div>
                </div>
                {/* Right: Status Badge */}
                <div style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: statusInfo.color,
                    backgroundColor: statusInfo.bg,
                    padding: '2px 8px',
                    borderRadius: 10,
                    flexShrink: 0,
                    lineHeight: '18px',
                }}>
                    {statusInfo.label}
                </div>
            </div>

            {/* ═══ Body: Item List ═══ */}
            <div style={{ padding: '8px 12px' }}>
                {items.slice(0, 5).map((item, i) => (
                    <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '5px 0',
                        borderBottom: i < Math.min(items.length, 5) - 1 ? '1px solid #fafafa' : 'none',
                    }}>
                        {/* Food emoji icon */}
                        <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            backgroundColor: '#FFF8E1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontSize: 14,
                        }}>
                            {getFoodEmoji(item)}
                        </div>
                        {/* Item name */}
                        <div style={{
                            flex: 1,
                            fontSize: 12,
                            color: '#333333',
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {item}
                        </div>
                    </div>
                ))}
                {items.length > 5 && (
                    <div style={{
                        fontSize: 10,
                        color: '#999',
                        textAlign: 'center',
                        padding: '4px 0',
                    }}>
                        …共 {items.length} 件商品
                    </div>
                )}
            </div>

            {/* ═══ Footer: Price + Action Button ═══ */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px 10px',
                borderTop: '1px solid #f5f5f5',
            }}>
                {/* Total Price */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    <span style={{ fontSize: 10, color: '#999', lineHeight: 1 }}>合计</span>
                    <span style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: '#FF6633',
                        lineHeight: 1,
                    }}>
                        {value
                            ? (value.startsWith('¥') || value.startsWith('￥') ? value : `¥${value}`)
                            : '¥--'
                        }
                    </span>
                </div>
                {/* Action Button */}
                <div style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: '#111',
                    backgroundColor: '#FFD000',
                    padding: '4px 14px',
                    borderRadius: 14,
                    lineHeight: '20px',
                    cursor: 'default',
                }}>
                    再来一单
                </div>
            </div>
        </div>
    );
};

export default MeituanTakeoutCard;

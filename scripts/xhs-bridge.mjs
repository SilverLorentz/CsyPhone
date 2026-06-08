#!/usr/bin/env node

/**
 * XHS Bridge Server — Node HTTP 桥接 xiaohongshu-skills Python CLI
 *
 * 替代原来的 mcp-proxy.mjs + xiaohongshu-mcp Go 服务。
 * 前端通过 REST API 调用此服务，此服务 spawn Python CLI 命令并返回 JSON。
 *
 * 依赖: xiaohongshu-skills (Python, 需先 uv sync 安装依赖)
 *       Chrome 以 --remote-debugging-port=9222 启动
 *
 * 用法:
 *   node scripts/xhs-bridge.mjs                                    # 默认端口 18061
 *   node scripts/xhs-bridge.mjs --port 19000                       # 自定义端口
 *   node scripts/xhs-bridge.mjs --skills-dir /path/to/skills       # 自定义 skills 目录
 *   node scripts/xhs-bridge.mjs --chrome-port 9222                 # Chrome CDP 端口
 *   node scripts/xhs-bridge.mjs --bridge-url ws://localhost:9333   # Extension Bridge 地址（新版 CLI）
 *   node scripts/xhs-bridge.mjs --account myaccount                # 多账号
 *
 * 前端 MCP URL 设为: http://localhost:18061/api
 */

import { createServer, request as httpRequest } from 'http';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { randomBytes } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
    const idx = args.indexOf(name);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
};

const PORT = parseInt(getArg('--port', '18061'), 10);
const CHROME_HOST = getArg('--chrome-host', '127.0.0.1');
const CHROME_PORT = getArg('--chrome-port', '9222');
const BRIDGE_URL = getArg('--bridge-url', 'ws://localhost:9333');
const ACCOUNT = getArg('--account', '');

// Auto-detect skills directory
function findSkillsDir() {
    const explicit = getArg('--skills-dir', '');
    if (explicit) return explicit;
    const candidates = [
        join(__dirname, '..', 'xiaohongshu-skills'),
        join(__dirname, '..', 'xiaohongshu-skills-main'),
        join(__dirname, 'xiaohongshu-skills'),
        join(__dirname, 'xiaohongshu-skills-main'),
        join(process.cwd(), 'xiaohongshu-skills'),
        join(process.cwd(), 'xiaohongshu-skills-main'),
    ];
    for (const dir of candidates) {
        if (existsSync(join(dir, 'scripts', 'cli.py'))) {
            console.log(`[bridge] Auto-detected skills dir: ${dir}`);
            return dir;
        }
    }
    return join(__dirname, '..', 'xiaohongshu-skills');
}
const SKILLS_DIR = findSkillsDir();
const CLI_PATH = join(SKILLS_DIR, 'scripts', 'cli.py');
const CLI_SOURCE = existsSync(CLI_PATH) ? readFileSync(CLI_PATH, 'utf-8') : '';
const CLI_SUPPORTS_BRIDGE_URL = CLI_SOURCE.includes('--bridge-url');

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
};

// ==================== Search Cache ====================
const searchCache = new Map();
const CACHE_TTL_MS = 60_000; // 60 秒

function getCached(key) {
    const entry = searchCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        searchCache.delete(key);
        return null;
    }
    console.log(`[bridge] 缓存命中: ${key}`);
    return entry.data;
}

function setCache(key, data) {
    searchCache.set(key, { ts: Date.now(), data });
    // 清理过期缓存（最多保留 50 条）
    if (searchCache.size > 50) {
        const now = Date.now();
        for (const [k, v] of searchCache) {
            if (now - v.ts > CACHE_TTL_MS) searchCache.delete(k);
        }
    }
}

// ==================== CLI Runner ====================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runCli(command, cliArgs = []) {
    return new Promise((resolve, reject) => {
        const cliPrelude = CLI_SUPPORTS_BRIDGE_URL
            ? ['--bridge-url', BRIDGE_URL]
            : [
                '--host', CHROME_HOST,
                '--port', CHROME_PORT,
                ...(ACCOUNT ? ['--account', ACCOUNT] : []),
            ];
        const fullArgs = [CLI_PATH, ...cliPrelude, command, ...cliArgs];

        console.log(`[bridge] $ uv run python ${fullArgs.join(' ')}`);

        const proc = spawn('uv', ['run', 'python', ...fullArgs], {
            cwd: SKILLS_DIR,
            env: { ...process.env },
            timeout: 120_000,
        });

        const stdout = [];
        const stderr = [];

        proc.stdout.on('data', (d) => stdout.push(d));
        proc.stderr.on('data', (d) => stderr.push(d));

        proc.on('close', (code) => {
            const out = Buffer.concat(stdout).toString().trim();
            const err = Buffer.concat(stderr).toString().trim();

            if (err) console.log(`[bridge] stderr: ${err.slice(0, 500)}`);
            console.log(`[bridge] stdout (${out.length} chars): ${out.slice(0, 300)}`);
            console.log(`[bridge] exit code: ${code}`);

            if (out) {
                try {
                    const parsed = JSON.parse(out);
                    resolve({ code, data: parsed });
                    return;
                } catch {
                    resolve({ code, data: out });
                    return;
                }
            }

            if (code === 0) {
                console.warn(`[bridge] WARNING: CLI exited 0 but produced no output for: ${command}`);
                resolve({ code, data: { success: true, empty: true, warning: 'CLI returned no data' } });
            } else if (code === 1) {
                reject(new Error('未登录，请先登录小红书'));
            } else {
                reject(new Error(err || `CLI 退出码: ${code}`));
            }
        });

        proc.on('error', (e) => {
            reject(new Error(`无法启动 CLI: ${e.message}. 请确保已安装 uv 和 xiaohongshu-skills`));
        });
    });
}

async function runCliWithRetry(command, cliArgs, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await runCli(command, cliArgs);
            const errMsg = result.data?.error || '';
            if (errMsg.includes('不可访问') || errMsg.includes('无法浏览') || errMsg.includes('暂时无法')) {
                if (attempt < maxRetries) {
                    const waitSec = 5 + attempt * 3;
                    console.log(`[bridge] ${command}: 笔记暂时不可访问，等 ${waitSec}s 后重试 (${attempt + 1}/${maxRetries})...`);
                    await sleep(waitSec * 1000);
                    continue;
                }
            }
            return result;
        } catch (e) {
            if (attempt < maxRetries && (e.message.includes('不可访问') || e.message.includes('无法浏览'))) {
                const waitSec = 5 + attempt * 3;
                console.log(`[bridge] ${command}: 异常 - 笔记不可访问，等 ${waitSec}s 后重试 (${attempt + 1}/${maxRetries})...`);
                await sleep(waitSec * 1000);
                continue;
            }
            throw e;
        }
    }
}

function writeTempFile(content, prefix = 'xhs-') {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    const path = join(dir, 'content.txt');
    writeFileSync(path, content, 'utf-8');
    return path;
}

function cleanupTempFile(path) {
    try { unlinkSync(path); } catch { /* ignore */ }
}

// ==================== CDP Direct Connection ====================

function cdpGetTabs() {
    return new Promise((resolve, reject) => {
        const req = httpRequest(
            `http://${CHROME_HOST}:${CHROME_PORT}/json/list`,
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(Buffer.concat(chunks).toString()));
                    } catch (e) {
                        reject(new Error(`CDP /json/list 解析失败: ${e.message}`));
                    }
                });
            },
        );
        req.on('error', (e) => reject(new Error(`CDP 连接失败: ${e.message}`)));
        req.setTimeout(5000, () => { req.destroy(); reject(new Error('CDP /json/list 超时')); });
        req.end();
    });
}

function cdpEvaluate(wsUrl, expression, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const url = new URL(wsUrl);
        const key = randomBytes(16).toString('base64');

        const req = httpRequest({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            headers: {
                Connection: 'Upgrade',
                Upgrade: 'websocket',
                'Sec-WebSocket-Key': key,
                'Sec-WebSocket-Version': '13',
            },
        });

        const timer = setTimeout(() => {
            req.destroy();
            reject(new Error('CDP WebSocket 超时'));
        }, timeout);

        req.on('upgrade', (_res, socket) => {
            const msgId = 1;
            const payload = JSON.stringify({
                id: msgId,
                method: 'Runtime.evaluate',
                params: { expression, returnByValue: true },
            });

            socket.write(encodeWsFrame(payload));

            let buf = Buffer.alloc(0);
            socket.on('data', (data) => {
                buf = Buffer.concat([buf, data]);
                let decoded;
                while ((decoded = decodeWsFrame(buf)) !== null) {
                    buf = decoded.rest;
                    try {
                        const msg = JSON.parse(decoded.payload);
                        if (msg.id === msgId) {
                            clearTimeout(timer);
                            socket.end();
                            const val = msg.result?.result?.value;
                            resolve(val !== undefined ? val : null);
                            return;
                        }
                    } catch { /* non-JSON frame, skip */ }
                }
            });

            socket.on('error', (e) => { clearTimeout(timer); reject(e); });
        });

        req.on('error', (e) => { clearTimeout(timer); reject(e); });
        req.end();
    });
}

/** 编码 WebSocket 文本帧 (client→server 需要 mask) */
function encodeWsFrame(text) {
    const data = Buffer.from(text, 'utf-8');
    const mask = randomBytes(4);
    let header;
    if (data.length < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81;
        header[1] = 0x80 | data.length;
    } else if (data.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(data.length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(data.length), 2);
    }
    const masked = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
    return Buffer.concat([header, mask, masked]);
}

/** 解码一个 WebSocket 帧 */
function decodeWsFrame(buf) {
    if (buf.length < 2) return null;
    const secondByte = buf[1];
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLen = secondByte & 0x7f;
    let offset = 2;
    if (payloadLen === 126) {
        if (buf.length < 4) return null;
        payloadLen = buf.readUInt16BE(2);
        offset = 4;
    } else if (payloadLen === 127) {
        if (buf.length < 10) return null;
        payloadLen = Number(buf.readBigUInt64BE(2));
        offset = 10;
    }
    if (isMasked) offset += 4;
    if (buf.length < offset + payloadLen) return null;
    let payload = buf.subarray(offset, offset + payloadLen);
    if (isMasked) {
        const maskKey = buf.subarray(offset - 4, offset);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
    }
    return { payload: payload.toString('utf-8'), rest: buf.subarray(offset + payloadLen) };
}

// JS snippets for extracting data from Chrome pages
const EXTRACT_SEARCH_JS = `(() => {
    if (window.__INITIAL_STATE__ &&
        window.__INITIAL_STATE__.search &&
        window.__INITIAL_STATE__.search.feeds) {
        const feeds = window.__INITIAL_STATE__.search.feeds;
        const feedsData = feeds.value !== undefined ? feeds.value : feeds._value;
        if (feedsData && feedsData.length > 0) {
            return JSON.stringify(feedsData);
        }
    }
    return "";
})()`;

const EXTRACT_USER_NOTES_JS = `(() => {
    if (window.__INITIAL_STATE__ &&
        window.__INITIAL_STATE__.user &&
        window.__INITIAL_STATE__.user.notes) {
        const notes = window.__INITIAL_STATE__.user.notes;
        const notesData = notes.value !== undefined ? notes.value : notes._value;
        if (notesData && notesData.length > 0) {
            return JSON.stringify(notesData);
        }
    }
    return "";
})()`;

const EXTRACT_USER_INFO_JS = `(() => {
    if (window.__INITIAL_STATE__ &&
        window.__INITIAL_STATE__.user &&
        window.__INITIAL_STATE__.user.userPageData) {
        const data = window.__INITIAL_STATE__.user.userPageData;
        const userData = data.value !== undefined ? data.value : data._value;
        if (userData) {
            return JSON.stringify(userData);
        }
    }
    return "";
})()`;

const EXTRACT_FEEDS_JS = `(() => {
    if (window.__INITIAL_STATE__ &&
        window.__INITIAL_STATE__.feed &&
        window.__INITIAL_STATE__.feed.feeds) {
        const feeds = window.__INITIAL_STATE__.feed.feeds;
        const feedsData = feeds.value !== undefined ? feeds.value : feeds._value;
        if (feedsData && feedsData.length > 0) {
            return JSON.stringify(feedsData);
        }
    }
    return "";
})()`;

const EXTRACT_DETAIL_JS = `(() => {
    if (window.__INITIAL_STATE__?.note?.noteDetailMap) {
        const map = window.__INITIAL_STATE__.note.noteDetailMap;
        const d = map.value || map._value || map;
        if (d && typeof d === 'object' && Object.keys(d).length > 0) {
            return JSON.stringify(d);
        }
    }
    return "";
})()`;

const EXTRACT_COMMENTS_FROM_DOM_JS = `(() => {
    try {
        const comments = [];
        const commentItems = document.querySelectorAll('.comment-item, .note-comment .comment-inner, [class*="commentItem"], [class*="comment-item"]');
        if (commentItems.length === 0) {
            const container = document.querySelector('.comments-container, .note-comment, [class*="comments"], [class*="commentContainer"]');
            if (!container) return "";
        }
        commentItems.forEach((item, idx) => {
            const nameEl = item.querySelector('.name, .author-name, [class*="userName"], [class*="authorName"], [class*="nickname"]');
            const contentEl = item.querySelector('.content, .comment-text, [class*="commentContent"], [class*="content"]');
            const likeEl = item.querySelector('.like-count, [class*="likeCount"], [class*="like-wrapper"] span');
            if (contentEl) {
                comments.push({
                    id: item.getAttribute('data-id') || item.getAttribute('data-comment-id') || ('dom_' + idx),
                    nickname: nameEl?.textContent?.trim() || '未知用户',
                    content: contentEl?.textContent?.trim() || '',
                    likes: parseInt(likeEl?.textContent?.trim() || '0') || 0,
                });
            }
        });
        return comments.length > 0 ? JSON.stringify(comments) : "";
    } catch (e) { return ""; }
})()`;

const SCROLL_TO_COMMENTS_JS = `(() => {
    try {
        const scrollContainer = document.querySelector('.note-scroller, .comment-container, [class*="noteContainer"], [class*="scrollContainer"]')
            || document.querySelector('.note-detail-mask .content, .note-content')
            || document.documentElement;
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
        window.scrollTo(0, document.body.scrollHeight);
        return "scrolled";
    } catch (e) { return "error: " + e.message; }
})()`;

const EXTRACT_XSEC_TOKEN_JS = `(() => {
    try {
        const s = window.__INITIAL_STATE__;
        if (!s?.note?.noteDetailMap) return "";
        const map = s.note.noteDetailMap.value || s.note.noteDetailMap._value || s.note.noteDetailMap;
        for (const [id, data] of Object.entries(map)) {
            const note = data?.note || data;
            const token = note?.xsecToken || note?.xsec_token || data?.xsecToken;
            if (token) return JSON.stringify({ noteId: id, xsecToken: token });
        }
    } catch {}
    try {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('xsec_token');
        if (token) return JSON.stringify({ xsecToken: token });
    } catch {}
    return "";
})()`;

const EXTRACT_LOGGED_IN_USER_JS = `(() => {
    try {
        const s = window.__INITIAL_STATE__;
        if (s?.user?.userPageData) {
            const d = s.user.userPageData.value || s.user.userPageData._value;
            if (d?.basicInfo) {
                return JSON.stringify({
                    userId: d.basicInfo.userId || d.basicInfo.user_id || d.basicInfo.red_id,
                    nickname: d.basicInfo.nickname || d.basicInfo.name,
                });
            }
        }
    } catch {}
    try {
        const s = window.__INITIAL_STATE__;
        const u = s?.user?.currentUser || s?.user?.selfInfo || s?.user?.userInfo;
        if (u) {
            const d = u.value || u._value || u;
            return JSON.stringify({
                userId: d.userId || d.user_id || d.red_id || d.id,
                nickname: d.nickname || d.name || d.username,
            });
        }
    } catch {}
    try {
        const sidebarLink = document.querySelector('a.link-wrapper[href*="/user/profile/"]');
        if (sidebarLink) {
            const href = sidebarLink.getAttribute('href') || '';
            const match = href.match(/\\/user\\/profile\\/([a-f0-9]+)/);
            const nickname = sidebarLink.querySelector('.channel')?.textContent?.trim();
            if (match) return JSON.stringify({ userId: match[1], nickname: nickname || '' });
        }
    } catch {}
    return "";
})()`;

// ==================== CDP Helpers ====================

function cdpNewTab(targetUrl) {
    return new Promise((resolve, reject) => {
        const encoded = encodeURIComponent(targetUrl);
        const req = httpRequest(
            `http://${CHROME_HOST}:${CHROME_PORT}/json/new?${encoded}`,
            { method: 'PUT' },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
                    catch (e) { reject(new Error(`CDP /json/new 解析失败: ${e.message}`)); }
                });
            },
        );
        req.on('error', (e) => reject(new Error(`CDP /json/new 失败: ${e.message}`)));
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('CDP /json/new 超时')); });
        req.end();
    });
}

function cdpCloseTab(tabId) {
    return new Promise((resolve) => {
        const req = httpRequest(
            `http://${CHROME_HOST}:${CHROME_PORT}/json/close/${tabId}`,
            { method: 'PUT' },
            () => resolve(true),
        );
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => { req.destroy(); resolve(false); });
        req.end();
    });
}

async function cdpWaitAndExtract(targetUrl, tabMatchFn, extractJs, maxWaitSec = 15) {
    let tab = null;
    let createdTab = false;

    try {
        const tabs = await cdpGetTabs();
        tab = tabs.find(tabMatchFn);

        if (!tab?.webSocketDebuggerUrl) {
            console.log(`[bridge] CDP fallback: 现有 tab 未找到，自行开启: ${targetUrl}`);
            tab = await cdpNewTab(targetUrl);
            createdTab = true;
            await sleep(2000);
        }

        if (!tab?.webSocketDebuggerUrl) {
            console.log('[bridge] CDP fallback: 无法获取 tab WebSocket URL');
            return null;
        }

        for (let i = 0; i < maxWaitSec; i++) {
            const result = await cdpEvaluate(tab.webSocketDebuggerUrl, extractJs);
            if (result && result.length > 0) {
                return result;
            }
            await sleep(1000);
        }
        return null;
    } finally {
        if (createdTab && tab?.id) {
            await cdpCloseTab(tab.id);
        }
    }
}

async function cdpFallbackSearch(keyword) {
    console.log(`[bridge] CDP fallback: 搜索 "${keyword}"...`);
    try {
        const searchUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}&source=web_explore_feed`;
        const result = await cdpWaitAndExtract(
            searchUrl,
            (t) => t.url && t.url.includes('search_result'),
            EXTRACT_SEARCH_JS,
        );
        if (result) {
            const feeds = JSON.parse(result);
            console.log(`[bridge] CDP fallback: 成功提取 ${feeds.length} 条搜索结果`);
            return { feeds, count: feeds.length };
        }
        console.log('[bridge] CDP fallback: 搜索等待超时');
        return null;
    } catch (e) {
        console.error('[bridge] CDP fallback 搜索错误:', e.message);
        return null;
    }
}

async function cdpFallbackListFeeds() {
    console.log('[bridge] CDP fallback: 首页推荐...');
    try {
        const feedUrl = 'https://www.xiaohongshu.com/explore';
        const result = await cdpWaitAndExtract(
            feedUrl,
            (t) => t.url && (t.url.includes('xiaohongshu.com/explore') || t.url.includes('xiaohongshu.com/?')),
            EXTRACT_FEEDS_JS,
        );
        if (result) {
            const feeds = JSON.parse(result);
            console.log(`[bridge] CDP fallback: 成功提取 ${feeds.length} 条首页推荐`);
            return { feeds, count: feeds.length };
        }
        console.log('[bridge] CDP fallback: 首页等待超时');
        return null;
    } catch (e) {
        console.error('[bridge] CDP fallback 首页错误:', e.message);
        return null;
    }
}

async function cdpFallbackUserProfile(userId) {
    console.log(`[bridge] CDP fallback: 用户主页 "${userId}"...`);
    try {
        const profileUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;
        const combinedExtractJs = `(() => {
            if (!window.__INITIAL_STATE__?.user) return "";
            const u = window.__INITIAL_STATE__.user;
            let notes = u.notes?.value ?? u.notes?._value ?? u.notes;
            if (!Array.isArray(notes)) {
                notes = u.noteList?.value ?? u.noteList?._value ?? u.noteList ?? null;
            }
            if (!notes || !Array.isArray(notes) || !notes.length) return "";
            if (Array.isArray(notes[0])) { notes = notes.flat(); }
            notes = notes.map(n => typeof n === 'string' ? { noteId: n } : n);
            notes = notes.filter(n => n && typeof n === 'object' && (n.id || n.noteId || n.noteCard));
            const info = u.userPageData?.value ?? u.userPageData?._value ?? null;
            const basicInfo = info?.basicInfo ?? info?.basic_info ?? info;
            return JSON.stringify({ notes, basic_info: basicInfo });
        })()`;

        const result = await cdpWaitAndExtract(
            profileUrl,
            (t) => t.url && t.url.includes('/user/profile/'),
            combinedExtractJs,
        );
        if (result) {
            const parsed = JSON.parse(result);
            console.log(`[bridge] CDP fallback: 成功提取用户主页 (${parsed.notes.length} 篇笔记)`);
            return { basic_info: parsed.basic_info, notes: parsed.notes, notes_count: parsed.notes.length };
        }
        console.log('[bridge] CDP fallback: 用户主页等待超时');
        return null;
    } catch (e) {
        console.error('[bridge] CDP fallback 用户主页错误:', e.message);
        return null;
    }
}

async function cdpFallbackFeedDetail(feedId) {
    console.log(`[bridge] CDP fallback: 笔记详情 "${feedId}"...`);
    let tab = null;
    let createdTab = false;

    try {
        const noteUrl = `https://www.xiaohongshu.com/explore/${feedId}`;
        const tabs = await cdpGetTabs();
        tab = tabs.find((t) => t.url && t.url.includes(feedId));
        if (!tab?.webSocketDebuggerUrl) {
            console.log(`[bridge] CDP fallback: 现有 tab 未找到，自行开启: ${noteUrl}`);
            tab = await cdpNewTab(noteUrl);
            createdTab = true;
            await sleep(2000);
        }
        if (!tab?.webSocketDebuggerUrl) {
            console.log('[bridge] CDP fallback: 无法获取 tab WebSocket URL');
            return null;
        }

        // 等待 noteDetailMap 加载
        let noteData = null;
        for (let i = 0; i < 15; i++) {
            const result = await cdpEvaluate(tab.webSocketDebuggerUrl, EXTRACT_DETAIL_JS);
            if (result && result.length > 0) {
                const detailMap = JSON.parse(result);
                noteData = detailMap[feedId] || Object.values(detailMap)[0];
                if (noteData) {
                    console.log(`[bridge] CDP fallback: 成功提取笔记详情`);
                    for (const [id, data] of Object.entries(detailMap)) {
                        const note = data?.note || data;
                        const token = note?.xsecToken || note?.xsec_token || data?.xsecToken;
                        if (token) cacheXsecToken(id, token);
                    }
                    break;
                }
            }
            await sleep(1000);
        }

        if (!noteData) {
            console.log('[bridge] CDP fallback: 笔记详情等待超时');
            return null;
        }

        // 滚动触发评论加载
        console.log(`[bridge] CDP fallback: 滚动页面触发评论加载...`);
        await cdpEvaluate(tab.webSocketDebuggerUrl, SCROLL_TO_COMMENTS_JS);
        await sleep(2000);

        // 从 DOM 提取评论
        let domComments = null;
        for (let i = 0; i < 8; i++) {
            const commentsResult = await cdpEvaluate(tab.webSocketDebuggerUrl, EXTRACT_COMMENTS_FROM_DOM_JS);
            if (commentsResult && commentsResult.length > 0) {
                domComments = JSON.parse(commentsResult);
                console.log(`[bridge] CDP fallback: 从 DOM 提取到 ${domComments.length} 条评论`);
                break;
            }
            if (i === 3) await cdpEvaluate(tab.webSocketDebuggerUrl, SCROLL_TO_COMMENTS_JS);
            await sleep(1000);
        }

        if (domComments && domComments.length > 0) {
            const existingComments = noteData.comments || noteData.note?.comments;
            if (!existingComments || (Array.isArray(existingComments) && existingComments.length === 0)) {
                if (noteData.note) {
                    noteData.note.comments = domComments;
                } else {
                    noteData.comments = domComments;
                }
                console.log(`[bridge] CDP fallback: 已合并 ${domComments.length} 条 DOM 评论到笔记数据`);
            }
        }

        return noteData;
    } catch (e) {
        console.error('[bridge] CDP fallback 笔记详情错误:', e.message);
        return null;
    } finally {
        if (createdTab && tab?.id) await cdpCloseTab(tab.id);
    }
}

// xsecToken 缓存
const xsecTokenCache = new Map();

function cacheXsecToken(feedId, token) {
    if (feedId && token) {
        xsecTokenCache.set(feedId, token);
        console.log(`[bridge] xsecToken 已缓存: ${feedId} → ${token.slice(0, 20)}...`);
    }
}

async function cdpGetXsecToken(feedId) {
    console.log(`[bridge] CDP: 获取 xsecToken for ${feedId}...`);
    try {
        const noteUrl = `https://www.xiaohongshu.com/explore/${feedId}`;
        const result = await cdpWaitAndExtract(
            noteUrl,
            (t) => t.url && t.url.includes(feedId),
            EXTRACT_XSEC_TOKEN_JS,
            10,
        );
        if (result) {
            const parsed = JSON.parse(result);
            if (parsed.xsecToken) {
                console.log(`[bridge] CDP: 获取到 xsecToken: ${parsed.xsecToken.slice(0, 20)}...`);
                cacheXsecToken(feedId, parsed.xsecToken);
                return parsed.xsecToken;
            }
        }
    } catch (e) {
        console.warn('[bridge] CDP 获取 xsecToken 失败:', e.message);
    }
    return null;
}

async function ensureXsecToken(feedId, providedToken) {
    if (providedToken) return providedToken;
    const cached = xsecTokenCache.get(feedId);
    if (cached) {
        console.log(`[bridge] xsecToken 命中缓存: ${feedId}`);
        return cached;
    }
    return cdpGetXsecToken(feedId);
}

async function cdpGetLoggedInUser() {
    try {
        const tabs = await cdpGetTabs();
        const xhsTab = tabs.find((t) => t.url && t.url.includes('xiaohongshu.com') && t.webSocketDebuggerUrl);
        if (!xhsTab) {
            console.log('[bridge] cdpGetLoggedInUser: 未找到小红书页面');
            return null;
        }
        const result = await cdpEvaluate(xhsTab.webSocketDebuggerUrl, EXTRACT_LOGGED_IN_USER_JS);
        if (result && result.length > 0) {
            const user = JSON.parse(result);
            if (user.userId || user.nickname) {
                console.log(`[bridge] CDP 提取到登录用户: ${user.nickname} (${user.userId})`);
                return user;
            }
        }
    } catch (e) {
        console.warn('[bridge] cdpGetLoggedInUser 错误:', e.message);
    }
    return null;
}

// ==================== Result Helpers ====================

function isEmptySearchResult(data) {
    if (!data) return true;
    if (data.feeds && Array.isArray(data.feeds) && data.feeds.length === 0) return true;
    if (data.count === 0) return true;
    return false;
}

function isEmptyProfileResult(data) {
    if (!data) return true;
    if (typeof data === 'string') return true;
    if (data.error) return true;
    if (data.empty) return true;
    if (data.basicInfo || data.basic_info) return false;
    if (data.notes && Array.isArray(data.notes) && data.notes.length > 0) return false;
    if (data.notes_count > 0) return false;
    return true;
}

function normalizeCliProfileData(raw) {
    if (!raw || typeof raw !== 'object') return { basic_info: null, notes: [], notes_count: 0 };

    const basicInfo = raw.basicInfo || raw.basic_info || null;
    let notes = [];

    if (Array.isArray(raw.notes) && raw.notes.length > 0) {
        notes = raw.notes;
    } else if (raw.tabPublic?.notes && Array.isArray(raw.tabPublic.notes)) {
        notes = raw.tabPublic.notes;
    } else if (raw.tab_public?.notes && Array.isArray(raw.tab_public.notes)) {
        notes = raw.tab_public.notes;
    } else if (Array.isArray(raw.noteList)) {
        notes = raw.noteList;
    } else {
        for (const [key, val] of Object.entries(raw)) {
            if (key === 'interactions') continue;
            if (Array.isArray(val) && val.length > 0) {
                const first = val[0];
                if (first && typeof first === 'object' &&
                    (first.noteId || first.note_id || first.id || first.noteCard || first.displayTitle || first.title)) {
                    notes = val;
                    console.log(`[bridge] normalizeCliProfileData: found notes under key "${key}" (${val.length} items)`);
                    break;
                }
            }
            if (val && typeof val === 'object' && !Array.isArray(val)) {
                for (const [subKey, subVal] of Object.entries(val)) {
                    if (Array.isArray(subVal) && subVal.length > 0) {
                        const first = subVal[0];
                        if (first && typeof first === 'object' &&
                            (first.noteId || first.note_id || first.id || first.noteCard || first.displayTitle)) {
                            notes = subVal;
                            console.log(`[bridge] normalizeCliProfileData: found notes under "${key}.${subKey}" (${subVal.length} items)`);
                            break;
                        }
                    }
                }
                if (notes.length > 0) break;
            }
        }
    }

    return { basic_info: basicInfo, notes, notes_count: notes.length };
}

// ==================== Route Handlers ====================

const handlers = {
    'check-login': async (_body) => {
        const result = await runCli('check-login');
        if (result.data?.logged_in) {
            const user = await cdpGetLoggedInUser();
            if (user) {
                result.data.userId = result.data.userId || user.userId;
                result.data.user_id = result.data.user_id || user.userId;
                result.data.nickname = result.data.nickname || user.nickname;
                result.data.name = result.data.name || user.nickname;
                console.log(`[bridge] check-login 增强: userId=${user.userId}, nickname=${user.nickname}`);
            }
        }
        return result;
    },

    'search': async (body) => {
        const keyword = body.keyword || '';
        const cacheKey = `search:${keyword}:${body.sort_by || ''}:${body.note_type || ''}`;

        // 检查缓存
        const cached = getCached(cacheKey);
        if (cached) return { code: 0, data: cached };

        const cliArgs = ['--keyword', keyword];
        if (body.sort_by) cliArgs.push('--sort-by', body.sort_by);
        if (body.note_type) cliArgs.push('--note-type', body.note_type);
        if (body.publish_time) cliArgs.push('--publish-time', body.publish_time);
        if (body.search_scope) cliArgs.push('--search-scope', body.search_scope);
        if (body.location) cliArgs.push('--location', body.location);
        const result = await runCli('search-feeds', cliArgs);

        if (isEmptySearchResult(result.data)) {
            console.log('[bridge] CLI 返回空搜索结果，启动 CDP fallback...');
            const fallback = await cdpFallbackSearch(keyword);
            if (fallback) {
                setCache(cacheKey, fallback);
                return { code: 0, data: fallback };
            }
        } else {
            setCache(cacheKey, result.data);
        }
        return result;
    },

    'list-feeds': async (_body) => {
        const cached = getCached('list-feeds');
        if (cached) return { code: 0, data: cached };

        const result = await runCli('list-feeds');
        if (isEmptySearchResult(result.data)) {
            console.log('[bridge] CLI 返回空首页结果，启动 CDP fallback...');
            const fallback = await cdpFallbackListFeeds();
            if (fallback) {
                setCache('list-feeds', fallback);
                return { code: 0, data: fallback };
            }
        } else {
            setCache('list-feeds', result.data);
        }
        return result;
    },

    'get-feed-detail': async (body) => {
        const feedId = body.feed_id;
        const xsecToken = body.xsec_token || xsecTokenCache.get(feedId) || '';

        if (xsecToken) {
            try {
                const cliArgs = ['--feed-id', feedId, '--xsec-token', xsecToken];
                if (body.load_all_comments) cliArgs.push('--load-all-comments');
                if (body.click_more_replies) cliArgs.push('--click-more-replies');
                const result = await runCli('get-feed-detail', cliArgs);
                if (result.data && !result.data.error) return result;
            } catch (e) {
                console.warn('[bridge] get-feed-detail CLI 失败:', e.message);
            }
        }

        console.log(`[bridge] get-feed-detail: CDP 直连 feedId=${feedId}...`);
        const cdpResult = await cdpFallbackFeedDetail(feedId);

        const cachedToken = xsecTokenCache.get(feedId);
        if (cachedToken) {
            console.log(`[bridge] get-feed-detail: CDP 拿到 xsecToken，用 CLI 重试以获取评论...`);
            try {
                const cliArgs2 = ['--feed-id', feedId, '--xsec-token', cachedToken];
                if (body.load_all_comments) cliArgs2.push('--load-all-comments');
                if (body.click_more_replies) cliArgs2.push('--click-more-replies');
                const cliResult = await runCli('get-feed-detail', cliArgs2);
                if (cliResult.data && !cliResult.data.error) {
                    console.log(`[bridge] get-feed-detail: CLI 重试成功（含评论）`);
                    return cliResult;
                }
            } catch (e) {
                console.warn('[bridge] get-feed-detail CLI 重试失败:', e.message);
            }
        }

        if (cdpResult) return { code: 0, data: cdpResult };
        return { code: 0, data: { error: '无法获取笔记详情（缺少 xsec_token 且 CDP 提取失败）' } };
    },

    'post-comment': async (body) => {
        const xsecToken = await ensureXsecToken(body.feed_id, body.xsec_token);
        if (!xsecToken) return { code: 1, data: { error: '无法获取 xsecToken，评论失败' } };
        const cliArgs = ['--feed-id', body.feed_id, '--xsec-token', xsecToken, '--content', body.content];
        return runCliWithRetry('post-comment', cliArgs);
    },

    'reply-comment': async (body) => {
        const xsecToken = await ensureXsecToken(body.feed_id, body.xsec_token);
        if (!xsecToken) return { code: 1, data: { error: '无法获取 xsecToken，回复失败' } };
        const cliArgs = ['--feed-id', body.feed_id, '--xsec-token', xsecToken, '--content', body.content];
        if (body.comment_id) cliArgs.push('--comment-id', body.comment_id);
        if (body.user_id) cliArgs.push('--user-id', body.user_id);
        return runCliWithRetry('reply-comment', cliArgs);
    },

    'like-feed': async (body) => {
        const xsecToken = await ensureXsecToken(body.feed_id, body.xsec_token);
        if (!xsecToken) return { code: 1, data: { error: '无法获取 xsecToken，点赞失败' } };
        const cliArgs = ['--feed-id', body.feed_id, '--xsec-token', xsecToken];
        if (body.unlike) cliArgs.push('--unlike');
        return runCli('like-feed', cliArgs);
    },

    'favorite-feed': async (body) => {
        const xsecToken = await ensureXsecToken(body.feed_id, body.xsec_token);
        if (!xsecToken) return { code: 1, data: { error: '无法获取 xsecToken，收藏失败' } };
        const cliArgs = ['--feed-id', body.feed_id, '--xsec-token', xsecToken];
        if (body.unfavorite) cliArgs.push('--unfavorite');
        return runCli('favorite-feed', cliArgs);
    },

    'user-profile': async (body) => {
        const userId = body.user_id;
        const xsecToken = body.xsec_token || '';

        // CDP 直连（最可靠，不需要 xsec_token）
        console.log(`[bridge] user-profile: CDP 直连获取 userId=${userId}...`);
        const cdpResult = await cdpFallbackUserProfile(userId);
        if (cdpResult) return { code: 0, data: cdpResult };

        // CLI fallback
        console.log('[bridge] user-profile: CDP 失败，尝试 CLI...');
        try {
            const cliArgs = ['--user-id', userId];
            if (xsecToken) cliArgs.push('--xsec-token', xsecToken);
            const result = await runCli('user-profile', cliArgs);
            if (!isEmptyProfileResult(result.data)) {
                const normalized = normalizeCliProfileData(result.data);
                console.log(`[bridge] user-profile: CLI 成功, notes=${normalized.notes.length}`);
                return { code: 0, data: normalized };
            }
        } catch (e) {
            console.warn('[bridge] user-profile CLI 也失败:', e.message);
        }

        console.warn('[bridge] user-profile: CDP 和 CLI 均失败');
        return { code: 0, data: { basic_info: null, notes: [], notes_count: 0 } };
    },

    'publish': async (body) => {
        const titleFile = writeTempFile(body.title || '');
        const contentFile = writeTempFile(body.content || '');
        const cliArgs = ['--title-file', titleFile, '--content-file', contentFile];
        if (body.images?.length) { for (const img of body.images) cliArgs.push('--images', img); }
        if (body.tags?.length) { for (const tag of body.tags) cliArgs.push('--tags', tag); }
        if (body.visibility) cliArgs.push('--visibility', body.visibility);
        if (body.headless) cliArgs.push('--headless');
        try { return await runCli('publish', cliArgs); }
        finally { cleanupTempFile(titleFile); cleanupTempFile(contentFile); }
    },

    'publish-video': async (body) => {
        const titleFile = writeTempFile(body.title || '');
        const contentFile = writeTempFile(body.content || '');
        const cliArgs = ['--title-file', titleFile, '--content-file', contentFile, '--video', body.video];
        if (body.tags?.length) { for (const tag of body.tags) cliArgs.push('--tags', tag); }
        if (body.visibility) cliArgs.push('--visibility', body.visibility);
        if (body.headless) cliArgs.push('--headless');
        try { return await runCli('publish-video', cliArgs); }
        finally { cleanupTempFile(titleFile); cleanupTempFile(contentFile); }
    },

    'long-article': async (body) => {
        const titleFile = writeTempFile(body.title || '');
        const contentFile = writeTempFile(body.content || '');
        const cliArgs = ['--title-file', titleFile, '--content-file', contentFile];
        if (body.images?.length) { for (const img of body.images) cliArgs.push('--images', img); }
        try { return await runCli('long-article', cliArgs); }
        finally { cleanupTempFile(titleFile); cleanupTempFile(contentFile); }
    },

    'login': async (_body) => runCli('login'),
    'get-qrcode': async (_body) => runCli('get-qrcode'),
    'delete-cookies': async (_body) => runCli('delete-cookies'),
};

// ==================== HTTP Server ====================

createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    if (path === '/api/health' || path === '/health') {
        res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', backend: 'xiaohongshu-skills', chromePort: CHROME_PORT }));
        return;
    }

    const match = path.match(/^\/api\/(.+)$/);
    if (!match) {
        res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found. Use /api/<command>' }));
        return;
    }

    const command = match[1];
    const handler = handlers[command];

    if (!handler) {
        res.writeHead(404, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown command: ${command}. Available: ${Object.keys(handlers).join(', ')}` }));
        return;
    }

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
        let body = {};
        if (chunks.length > 0) {
            try {
                body = JSON.parse(Buffer.concat(chunks).toString());
            } catch {
                res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                return;
            }
        }

        try {
            const result = await handler(body);
            res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result.data));
        } catch (e) {
            console.error(`[bridge] Error in ${command}:`, e.message);
            const status = e.message.includes('未登录') ? 401 : 500;
            res.writeHead(status, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
}).listen(PORT, () => {
    console.log(`XHS Bridge Server started`);
    console.log(`  Listen:     http://localhost:${PORT}/api`);
    console.log(`  Skills dir: ${SKILLS_DIR}`);
    console.log(`  CLI path:   ${CLI_PATH}`);
    console.log(`  CLI mode:   ${CLI_SUPPORTS_BRIDGE_URL ? 'extension-bridge' : 'chrome-cdp'}`);
    console.log(`  Bridge URL: ${BRIDGE_URL}`);
    console.log(`  Chrome CDP: ${CHROME_HOST}:${CHROME_PORT}`);
    console.log(`  Account:    ${ACCOUNT || '(default)'}`);
    if (!existsSync(CLI_PATH)) {
        console.error(`\n[WARNING] cli.py not found at: ${CLI_PATH}`);
        console.error(`  The bridge will start but CLI commands will fail.`);
        console.error(`  Please check your --skills-dir path or put xiaohongshu-skills in the parent directory.`);
    }
    console.log(`\nAvailable endpoints:`);
    for (const cmd of Object.keys(handlers)) {
        console.log(`  POST /api/${cmd}`);
    }
    console.log(`\nSet your server URL to: http://localhost:${PORT}/api`);
});

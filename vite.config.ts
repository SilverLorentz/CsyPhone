import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';

type BuildInfo = {
  buildId: string;
  builtAt: string;
};

const REQUIRED_REMOTE_BUILD_ENV_KEYS = [
  'VITE_CSYOS_BACKEND_URL',
  'VITE_CSYOS_BACKEND_TOKEN',
] as const;

function forwardElevenLabsApiKey(proxyReq: any, req: any) {
  const apiKey = req.headers['x-elevenlabs-key'];
  if (typeof apiKey === 'string' && apiKey.trim()) {
    proxyReq.setHeader('xi-api-key', apiKey.trim());
  }
  proxyReq.removeHeader('x-elevenlabs-key');
}

function createBuildInfo(): BuildInfo {
  const builtAt = new Date().toISOString();
  const buildId =
    process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) ||
    process.env.GITHUB_SHA?.slice(0, 12) ||
    `${builtAt.replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}`;

  return { buildId, builtAt };
}

function assertRequiredBuildEnv(mode: string, env: Record<string, string>) {
  if (!['staging', 'production'].includes(mode)) {
    return;
  }

  const missingKeys = REQUIRED_REMOTE_BUILD_ENV_KEYS.filter((key) => {
    const value = env[key];
    return !value || /replace-me|<your-|<set-/i.test(value);
  });

  if (missingKeys.length === 0) {
    return;
  }

  const envHint =
    mode === 'production'
      ? '.env.production.local or Cloudflare Pages production variables'
      : '.env.staging.local or Cloudflare Pages preview variables';

  throw new Error(
    `[build env] Missing required ${mode} variables: ${missingKeys.join(', ')}. ` +
      `Set them in ${envHint}. Automatic Pages builds cannot read your local .env files.`,
  );
}

function buildInfoPlugin(info: BuildInfo): Plugin {
  const body = `${JSON.stringify(info, null, 2)}\n`;

  return {
    name: 'sully-build-info',
    configureServer(server) {
      server.middlewares.use('/build-info.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'build-info.json',
        source: body,
      });
    },
  };
}

const HOT_NEWS_DEV_API = 'https://orz.ai/api/v1/dailynews/';
const HOT_NEWS_DEV_ALIASES: Record<string, string> = {
  sspai: 'shaoshupai',
  tskr: '36kr',
  ftpojie: '52pojie',
  vtex: 'v2ex',
};
const HOT_NEWS_DEV_CODELIFE_IDS: Record<string, string> = {
  weibo: 'KqndgxeLl9',
  zhihu: 'mproPpoq6O',
  baidu: 'Jb0vmloB1G',
  bilibili: '74KvxwokxM',
  douyin: 'DpQvNABoNE',
};

function normalizeHotNewsFallbackItems(items: any[]): { title: string; url?: string; desc?: string }[] {
  return items
    .map((item) => {
      const title = String(item?.title || item?.name || '').trim();
      const url = typeof item?.url === 'string' ? item.url
        : typeof item?.link === 'string' ? item.link
          : typeof item?.mobilUrl === 'string' ? item.mobilUrl
            : undefined;
      const desc = String(item?.desc || item?.hotValue || item?.hot || '').replace(/\s+/g, ' ').trim();
      return title ? { title, url, desc: desc || undefined } : null;
    })
    .filter(Boolean) as { title: string; url?: string; desc?: string }[];
}

async function fetchHotNewsFallbackPayload(platform: string): Promise<unknown | null> {
  const id = HOT_NEWS_DEV_CODELIFE_IDS[platform];
  if (!id) return null;

  const fallbackUrl = new URL('https://api.codelife.cc/api/top/list');
  fallbackUrl.searchParams.set('lang', 'cn');
  fallbackUrl.searchParams.set('id', id);

  const fallback = await fetch(fallbackUrl.toString(), {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'SullyOS-HotNews/1.0',
    },
  });
  if (!fallback.ok) return null;

  const payload = await fallback.json() as any;
  const items = normalizeHotNewsFallbackItems(Array.isArray(payload?.data) ? payload.data : []);
  if (items.length === 0) return null;
  return { status: '200', data: items, msg: 'success', fallback: 'codelife' };
}

async function fetchHotNewsDevPayload(platform: string): Promise<{ payload: unknown; status: number }> {
  const upstreamUrl = new URL(HOT_NEWS_DEV_API);
  upstreamUrl.searchParams.set('platform', platform);

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SullyOS-HotNews/1.0',
      },
    });
    const payload = await upstream.json() as any;
    const hasItems = Array.isArray(payload?.data) && payload.data.length > 0;
    if (hasItems) return { payload, status: upstream.status };

    const fallbackPayload = await fetchHotNewsFallbackPayload(platform);
    if (fallbackPayload) return { payload: fallbackPayload, status: 200 };
    return { payload, status: upstream.status };
  } catch (error) {
    const fallbackPayload = await fetchHotNewsFallbackPayload(platform);
    if (fallbackPayload) return { payload: fallbackPayload, status: 200 };
    const detail = error instanceof Error ? error.message : String(error);
    return { payload: { error: 'hot_news_proxy_error', detail }, status: 502 };
  }
}

function hotNewsDevProxyPlugin(): Plugin {
  return {
    name: 'sully-hot-news-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/hot-news', async (req: any, res: any) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'method_not_allowed' }));
          return;
        }

        const url = new URL(req.url || '/', 'http://localhost/hot-news');
        const rawPlatform = String(url.searchParams.get('platform') || '').trim().toLowerCase();
        const platform = HOT_NEWS_DEV_ALIASES[rawPlatform] || rawPlatform;
        if (!platform) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'invalid_platform' }));
          return;
        }

        const { payload, status } = await fetchHotNewsDevPayload(platform);
        res.statusCode = status;
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.end(JSON.stringify(payload));
      });
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const buildInfo = createBuildInfo();

  if (command === 'build') {
    assertRequiredBuildEnv(mode, env);
  }

  return {
    plugins: [react() as any, buildInfoPlugin(buildInfo), hotNewsDevProxyPlugin()],
    optimizeDeps: {
      exclude: ['onnxruntime-web'],
    },
    define: {
      __APP_BUILD_ID__: JSON.stringify(buildInfo.buildId),
    },
    server: {
      proxy: {
        '/minimax-api': {
          target: 'https://api.minimaxi.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/minimax-api/, ''),
        },
        '/minimax-global-api': {
          target: 'https://api.minimax.io',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/minimax-global-api/, ''),
        },
        '/minimax-music-api': {
          target: 'https://api.minimax.chat',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/minimax-music-api/, ''),
        },
        '/elevenlabs-token': {
          target: 'https://api.elevenlabs.io',
          changeOrigin: true,
          rewrite: () => '/v1/single-use-token/tts_websocket',
          configure: (proxy) => {
            proxy.on('proxyReq', forwardElevenLabsApiKey);
          },
        },
        '/elevenlabs-voice-design': {
          target: 'https://api.elevenlabs.io',
          changeOrigin: true,
          rewrite: () => '/v1/text-to-voice/design',
          configure: (proxy) => {
            proxy.on('proxyReq', forwardElevenLabsApiKey);
          },
        },
        '/elevenlabs-voice-create': {
          target: 'https://api.elevenlabs.io',
          changeOrigin: true,
          rewrite: () => '/v1/text-to-voice',
          configure: (proxy) => {
            proxy.on('proxyReq', forwardElevenLabsApiKey);
          },
        },
        // XHS Bridge 模式 (xiaohongshu-skills REST server)
        '/xhs-api': {
          target: 'http://localhost:18061',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/xhs-api/, '/api'),
        },
        // XHS MCP 模式 (xiaohongshu-mcp Go server)
        '/xhs-mcp': {
          target: 'http://localhost:18060',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/xhs-mcp/, '/mcp'),
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              proxyRes.headers['access-control-expose-headers'] = 'Mcp-Session-Id';
            });
          },
        },
      },
    },
    base: './',
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './test/setup.ts',
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      rollupOptions: {
        // Exclude onnxruntime-web from bundling — let @ricky0123/vad-web's
        // pre-bundled copy resolve WASM files from public/vad/onnx/ at runtime
        external: ['onnxruntime-web'],
        output: {
          paths: {
            'onnxruntime-web': '/vad/onnx/ort-wasm-simd-threaded.mjs',
          },
          manualChunks(id) {
            if (id.includes('node_modules/three')) {
              return 'vendor-three';
            }
            if (id.includes('node_modules/pdfjs-dist')) {
              return 'vendor-pdf';
            }
            if (id.includes('node_modules/katex')) {
              return 'vendor-katex';
            }
            if (id.includes('node_modules/html2canvas')) {
              return 'vendor-canvas';
            }
            return undefined;
          },
        },
      },
    },
  };
});

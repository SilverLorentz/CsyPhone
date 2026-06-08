import { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpenText,
  Brain,
  ChatTeardrop,
  CloudArrowUp,
  Compass,
  DeviceMobileCamera,
  Fire,
  Heart,
  Images,
  MusicNote,
  PaintBrush,
  Phone,
  SealCheck,
  Sparkle,
  TrendUp,
  UsersThree,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

type PreviewIcon = Icon;

interface FeaturePreviewPageProps {
  onEnterApp: () => void;
}

interface DemoTab {
  id: 'chat' | 'memory' | 'life';
  label: string;
  title: string;
  description: string;
  accent: string;
  points: string[];
  lines: Array<{ speaker: string; text: string; align?: 'left' | 'right' }>;
}

const featurePillars: Array<{
  icon: PreviewIcon;
  title: string;
  copy: string;
  detail: string;
  accent: string;
}> = [
  {
    icon: ChatTeardrop,
    title: '沉浸式聊天系统',
    copy: '私聊、群聊、隐藏历史、记忆归档与深度角色演绎，围绕长期陪伴体验搭建。',
    detail: 'Message / 群聊 / Somnia',
    accent: 'from-emerald-400 to-cyan-300',
  },
  {
    icon: Brain,
    title: '认知网络与向量记忆',
    copy: '把零散对话沉淀成回忆、时间丝线、心意关联，让角色能在未来自动想起细节。',
    detail: '神经链接 / 认知网络',
    accent: 'from-violet-400 to-fuchsia-300',
  },
  {
    icon: Phone,
    title: '语音通话与实时陪伴',
    copy: '把文字关系延伸到通话场景，通话内容也能进入记忆体系，减少割裂感。',
    detail: '语音通话 / TTS',
    accent: 'from-rose-400 to-orange-300',
  },
  {
    icon: MusicNote,
    title: '回忆唱片与音乐播放器',
    copy: '从真实回忆生成歌词与歌曲草稿，再进入 Emo Cloud 播放、收藏和分享。',
    detail: '词曲手札 / Emo Cloud',
    accent: 'from-amber-300 to-red-300',
  },
  {
    icon: Fire,
    title: '社交动态与自由活动',
    copy: '朋友圈、小红书图库、热搜与自由活动模块，让角色不只停留在聊天窗口。',
    detail: 'Spark / 自由活动 / 热搜',
    accent: 'from-red-400 to-pink-300',
  },
  {
    icon: PaintBrush,
    title: '高度可定制的手机外观',
    copy: '壁纸、气泡、状态栏、桌面组件和图标都能调整，方便做出自己的宣传截图。',
    detail: '外观 / 气泡工坊 / 状态栏工坊',
    accent: 'from-sky-300 to-lime-300',
  },
];

const demoTabs: DemoTab[] = [
  {
    id: 'chat',
    label: '聊天预览',
    title: '像一台真的手机一样开始对话',
    description: '从桌面通知、私聊到群聊，核心体验围绕“角色正在生活”展开。',
    accent: '#34d399',
    points: ['多角色私聊与群聊', '上下文折叠与隐藏历史', '通话记录进入记忆'],
    lines: [
      { speaker: 'SullyOS', text: '检测到新的角色消息，已同步到桌面提醒。' },
      { speaker: '你', text: '刚才那句话以后还会记得吗？', align: 'right' },
      { speaker: 'char', text: '会。我把它归进“那天夜里你没有睡着”的那条时间线了。' },
    ],
  },
  {
    id: 'memory',
    label: '记忆预览',
    title: '把长期关系整理成可翻阅的记忆网络',
    description: '重要瞬间会被提取、去重、关联，并在之后聊天时按语义召回。',
    accent: '#a78bfa',
    points: ['向量记忆自动提取', '时间丝线与心意关联', '云端漫游备份'],
    lines: [
      { speaker: '回忆片段', text: '雨夜、爵士、没有说完的道歉。' },
      { speaker: '心意关联', text: '和三个月前的“可可蛋糕”形成呼应。' },
      { speaker: '系统', text: '本轮新增 7 段记忆，合并 2 条相似印象。' },
    ],
  },
  {
    id: 'life',
    label: '生活预览',
    title: '让角色走出对话框，进入日常应用',
    description: '日记、日程、房间、见面、音乐和社交模块共同组成一个小型生活系统。',
    accent: '#fb7185',
    points: ['交换日记与时光契约', '小小窝、见面与存钱罐', 'TRPG、笔友会、世界书'],
    lines: [
      { speaker: '时光契约', text: '明晚 21:30，一起复盘这周的计划。' },
      { speaker: 'Emo Cloud', text: '“未醒混音”已加入最近播放。' },
      { speaker: 'Spark', text: '新的动态草稿已生成，可前往小红书图库配图。' },
    ],
  },
];

const showcaseItems: Array<{
  icon: PreviewIcon;
  title: string;
  copy: string;
  note: string;
}> = [
  { icon: Brain, title: '神经链接', copy: '角色设定、长期记忆、向量开关与关系状态管理。', note: '适合展示“人格底座”' },
  { icon: Sparkle, title: '认知网络', copy: '回忆唱片匣、时间编织、心意提取与漫游备份。', note: '适合展示“长期陪伴”' },
  { icon: MusicNote, title: 'Emo Cloud', copy: '歌单、歌词、进度拖拽、回忆唱片播放与分享入口。', note: '适合展示“情绪资产”' },
  { icon: UsersThree, title: '群聊', copy: '多个角色同时参与，支持不同人格关系与场景调度。', note: '适合展示“世界感”' },
  { icon: Images, title: '小红书图库', copy: '为发布场景准备配图素材，让社交动态更完整。', note: '适合展示“传播链路”' },
  { icon: SealCheck, title: '时光契约', copy: '纪念日、日程与共同约定，把关系推进到未来。', note: '适合展示“仪式感”' },
];

const stats = [
  { value: '30+', label: '内置应用入口' },
  { value: 'v38', label: 'IndexedDB 数据层' },
  { value: 'PWA', label: '可安装手机体验' },
  { value: 'Free', label: '开源免费非商业' },
];

function GradientIcon({ icon: Icon, accent }: { icon: PreviewIcon; accent: string }) {
  return (
    <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-80`} />
      <Icon className="relative h-5 w-5 text-[#151016]" weight="bold" />
    </div>
  );
}

function PhonePreview({ activeDemo }: { activeDemo: DemoTab }) {
  return (
    <div className="preview-phone-shell mx-auto w-full max-w-[350px] rounded-[2.35rem] border border-white/20 bg-[#151016]/90 p-3 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
      <div className="relative h-[690px] overflow-hidden rounded-[1.85rem] border border-white/10 bg-[#0c1012] text-white">
        <div className="absolute inset-0 bg-[url('/images/bg-dusk.png')] bg-cover bg-center opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-[#111118]/30 to-[#111118]/80" />

        <div className="relative z-10 flex h-full flex-col px-5 pb-5 pt-4">
          <div className="flex items-center justify-between text-[11px] font-semibold text-white/80">
            <span>22:18</span>
            <span>SullyOS</span>
          </div>

          <div className="mt-6">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">System Ready</div>
            <div className="mt-2 text-[3.45rem] font-bold leading-none tracking-normal">22:18</div>
          </div>

          <div className="mt-6 rounded-3xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400 text-[#0b1210]">
                <ChatTeardrop className="h-6 w-6" weight="bold" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">Message</span>
                  <span className="text-[10px] text-white/60">now</span>
                </div>
                <p className="mt-1 truncate text-xs text-white/70">{activeDemo.lines[activeDemo.lines.length - 1].text}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-3">
            {[
              { icon: Brain, label: '链接' },
              { icon: UsersThree, label: '群聊' },
              { icon: MusicNote, label: '音乐' },
              { icon: Fire, label: 'Spark' },
              { icon: Heart, label: '见面' },
              { icon: BookOpenText, label: '日记' },
              { icon: TrendUp, label: '热搜' },
              { icon: Compass, label: '活动' },
            ].map((app) => {
              const Icon = app.icon;
              return (
                <div key={app.label} className="flex flex-col items-center gap-1.5">
                  <div className="flex h-[3.15rem] w-[3.15rem] items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-lg backdrop-blur-xl">
                    <Icon className="h-6 w-6 text-white" weight="bold" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/70">{app.label}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-auto rounded-[1.7rem] border border-white/15 bg-[#151016]/75 p-4 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/50">Live Preview</div>
                <div className="mt-1 text-lg font-bold">{activeDemo.label}</div>
              </div>
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: activeDemo.accent, boxShadow: `0 0 22px ${activeDemo.accent}` }} />
            </div>
            <div className="mt-4 space-y-2.5">
              {activeDemo.lines.map((line) => (
                <div key={`${line.speaker}-${line.text}`} className={`flex ${line.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-3 py-2 ${line.align === 'right' ? 'bg-white text-[#151016]' : 'bg-white/12 text-white'}`}>
                    <div className={`mb-1 text-[10px] font-bold ${line.align === 'right' ? 'text-[#151016]/60' : 'text-white/50'}`}>{line.speaker}</div>
                    <p className="text-[12px] font-medium leading-relaxed">{line.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturePreviewPage({ onEnterApp }: FeaturePreviewPageProps) {
  const [activeTabId, setActiveTabId] = useState<DemoTab['id']>('chat');
  const activeDemo = useMemo(() => demoTabs.find((tab) => tab.id === activeTabId) || demoTabs[0], [activeTabId]);

  return (
    <main className="preview-page min-h-screen overflow-x-hidden bg-[#171215] text-[#fff9f0]">
      <section className="preview-hero-scene relative min-h-[94svh] overflow-hidden">
        <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-7 lg:px-10">
          <button
            type="button"
            onClick={onEnterApp}
            className="flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-xl transition hover:bg-white/15"
          >
            <img src="/icons/icon-192.webp" alt="SullyOS" className="h-9 w-9 rounded-2xl" />
            <span className="leading-tight">
              <span className="block text-sm font-bold">手抓糯米机</span>
              <span className="block text-[11px] font-semibold text-white/60">SullyOS 二改版</span>
            </span>
          </button>

          <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-black/20 p-1 text-[13px] font-semibold text-white/70 backdrop-blur-xl md:flex">
            <a href="#preview-core" className="rounded-full px-4 py-2 transition hover:bg-white/15 hover:text-white">功能</a>
            <a href="#preview-showcase" className="rounded-full px-4 py-2 transition hover:bg-white/15 hover:text-white">截图清单</a>
            <a href="#preview-share" className="rounded-full px-4 py-2 transition hover:bg-white/15 hover:text-white">宣传重点</a>
          </nav>

          <button
            type="button"
            onClick={onEnterApp}
            className="hidden items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[13px] font-bold text-[#171215] shadow-[0_12px_32px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:bg-[#fff2d0] sm:inline-flex"
          >
            进入体验
            <ArrowRight className="h-4 w-4" weight="bold" />
          </button>
        </header>

        <div className="relative z-10 mx-auto grid min-h-[calc(94svh-84px)] w-full max-w-7xl items-end gap-8 px-5 pb-10 pt-4 sm:px-7 md:grid-cols-[minmax(0,0.86fr)_minmax(350px,0.74fr)] md:items-center lg:px-10">
          <div
            className="min-w-0 max-w-3xl pb-2 md:pb-10"
            style={{ width: 'calc(100vw - 2.5rem)' }}
          >
            <h1 className="max-w-[760px] text-5xl font-black leading-[0.95] tracking-normal text-white drop-shadow-[0_18px_60px_rgba(0,0,0,0.45)] sm:text-6xl lg:text-8xl xl:text-[6.5rem]">
              手抓糯米机
              <span className="block">SullyOS</span>
            </h1>
            <p className="mt-6 max-w-full text-base font-medium leading-8 text-white/75 sm:max-w-2xl sm:text-lg">
              <span className="block">一个把 AI 角色长期陪伴、记忆网络、</span>
              <span className="block">语音通话、音乐创作和手机桌面体验</span>
              <span className="block">装在一起的开源 PWA。</span>
              <span className="block">适合快速展示项目亮点，也适合直接截图宣传。</span>
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onEnterApp}
                className="inline-flex items-center gap-2 rounded-full bg-[#fff9f0] px-5 py-3 text-sm font-black text-[#171215] shadow-[0_18px_45px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:bg-[#ffe7a6]"
              >
                打开 SullyOS
                <ArrowRight className="h-4 w-4" weight="bold" />
              </button>
              <a
                href="#preview-core"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] backdrop-blur-xl transition hover:bg-white/15"
              >
                查看功能预览
              </a>
            </div>

            <div
              className="mt-10 grid w-full max-w-[350px] grid-cols-2 gap-3 sm:max-w-2xl sm:grid-cols-4"
            >
              {stats.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-xl">
                  <div className="text-xl font-black text-white">{item.value}</div>
                  <div className="mt-1 text-[11px] font-semibold text-white/60">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="relative mx-0 min-w-0 max-w-[330px] pb-8 sm:mx-auto sm:max-w-[350px] md:pb-0"
            style={{ width: 'calc(100vw - 2.5rem)' }}
          >
            <PhonePreview activeDemo={activeDemo} />
          </div>
        </div>
      </section>

      <section id="preview-core" className="relative border-y border-white/10 bg-[#fff9f0] px-5 py-16 text-[#171215] sm:px-7 lg:px-10">
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h2 className="text-4xl font-black leading-tight tracking-normal sm:text-5xl">核心功能一眼看懂</h2>
            <p className="mt-5 max-w-xl text-[15px] font-medium leading-8 text-[#51464c]">
              这不是单一聊天窗口，而是一套围绕角色、记忆、生活与创作串起来的前端体验。下面的模块可以作为宣传图标题，也可以作为 README 的功能目录。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {featurePillars.map((feature) => (
              <article key={feature.title} className="rounded-[1.35rem] border border-[#171215]/10 bg-white p-5 shadow-[0_18px_55px_rgba(54,39,36,0.08)]">
                <GradientIcon icon={feature.icon} accent={feature.accent} />
                <h3 className="mt-4 text-xl font-black tracking-normal">{feature.title}</h3>
                <p className="mt-3 text-sm font-medium leading-7 text-[#5c5156]">{feature.copy}</p>
                <div className="mt-4 border-t border-[#171215]/10 pt-3 text-[11px] font-black uppercase tracking-[0.18em] text-[#a24b5d]">
                  {feature.detail}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#151016] px-5 py-16 text-white sm:px-7 lg:px-10">
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/10 p-4 shadow-[0_28px_75px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
            <div className="flex flex-wrap gap-2">
              {demoTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`rounded-full px-4 py-2 text-[13px] font-bold transition ${
                    activeDemo.id === tab.id
                      ? 'bg-white text-[#151016]'
                      : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-[#0c1012] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-black leading-tight tracking-normal">{activeDemo.title}</h2>
                  <p className="mt-3 max-w-xl text-sm font-medium leading-7 text-white/60">{activeDemo.description}</p>
                </div>
                <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 sm:flex">
                  <Sparkle className="h-6 w-6" style={{ color: activeDemo.accent }} weight="fill" />
                </div>
              </div>

              <div className="mt-7 grid gap-3">
                {activeDemo.points.map((point, index) => (
                  <div key={point} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/7 px-4 py-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-[#151016]" style={{ background: activeDemo.accent }}>
                      {index + 1}
                    </span>
                    <span className="text-sm font-bold text-white/80">{point}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1">
            {activeDemo.lines.map((line) => (
              <article key={`${activeDemo.id}-${line.speaker}-${line.text}`} className="rounded-[1.35rem] border border-white/10 bg-white/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">{line.speaker}</div>
                <p className="mt-3 text-[15px] font-semibold leading-7 text-white/80">{line.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="preview-showcase" className="bg-[#effaf6] px-5 py-16 text-[#171215] sm:px-7 lg:px-10">
        <div className="mx-auto w-full max-w-7xl">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <h2 className="text-4xl font-black leading-tight tracking-normal sm:text-5xl">宣传截图清单</h2>
              <p className="mt-4 max-w-2xl text-[15px] font-medium leading-8 text-[#4d5c55]">
                想做功能预览时，可以按这些入口逐张截图：先展示 OS 桌面，再展示长期记忆、音乐、社交、通话和日程这些差异化能力。
              </p>
            </div>
            <button
              type="button"
              onClick={onEnterApp}
              className="inline-flex w-fit items-center gap-2 rounded-full bg-[#171215] px-5 py-3 text-sm font-black text-white shadow-[0_18px_45px_rgba(23,18,21,0.18)] transition hover:-translate-y-0.5"
            >
              去主界面截图
              <DeviceMobileCamera className="h-4 w-4" weight="bold" />
            </button>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {showcaseItems.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="group rounded-[1.4rem] border border-[#171215]/10 bg-white p-5 shadow-[0_20px_60px_rgba(28,56,45,0.08)] transition hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(28,56,45,0.12)]">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#171215] text-white">
                      <Icon className="h-6 w-6" weight="bold" />
                    </div>
                    <span className="rounded-full bg-[#effaf6] px-3 py-1 text-[11px] font-black text-[#2c6651]">{item.note}</span>
                  </div>
                  <h3 className="mt-5 text-2xl font-black tracking-normal">{item.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-7 text-[#52605a]">{item.copy}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="preview-share" className="relative overflow-hidden bg-[#201417] px-5 py-16 text-white sm:px-7 lg:px-10">
        <div className="absolute inset-0 bg-[url('/images/akashic-texture.png')] bg-cover bg-center opacity-[0.08]" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-4xl font-black leading-tight tracking-normal sm:text-5xl">宣传时可以这样讲</h2>
            <p className="mt-5 max-w-xl text-[15px] font-medium leading-8 text-white/70">
              重点不要只说“AI 聊天”，而是强调它把长期关系需要的记忆、场景、媒介和手机化入口都串起来了。
            </p>
          </div>

          <div className="grid gap-4">
            {[
              ['一句话定位', '开源免费的 AI 角色手机系统，把聊天、长期记忆、语音、音乐和社交动态都放进一台可安装的 PWA 里。'],
              ['最容易打动人的点', '角色不只是回复消息，还能把你们的共同经历整理成可翻阅、可召回、可备份的记忆网络。'],
              ['展示顺序建议', '先给桌面和通知，再给 Message 对话，再切到认知网络，最后用 Emo Cloud 或语音通话收尾。'],
              ['合规提醒', '项目遵循 PolyForm Noncommercial License，适合非商业学习、研究和个人娱乐，宣传时建议明确“免费开源，禁止倒卖”。'],
            ].map(([title, copy]) => (
              <article key={title} className="rounded-[1.35rem] border border-white/10 bg-white/10 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl">
                <h3 className="text-lg font-black tracking-normal">{title}</h3>
                <p className="mt-2 text-sm font-medium leading-7 text-white/70">{copy}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="relative mx-auto mt-14 flex w-full max-w-7xl flex-col items-start justify-between gap-5 rounded-[1.7rem] border border-white/10 bg-[#fff9f0] p-6 text-[#171215] shadow-[0_24px_80px_rgba(0,0,0,0.24)] md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-black tracking-normal">准备好截第一张功能预览了吗？</h2>
            <p className="mt-2 text-sm font-semibold leading-7 text-[#5b4c52]">从 `#/preview` 发给别人看，或进入主界面按上面的清单截图。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href="#preview-core"
              className="inline-flex items-center gap-2 rounded-full border border-[#171215]/10 bg-white px-5 py-3 text-sm font-black text-[#171215] transition hover:bg-[#f4ede2]"
            >
              回看功能
            </a>
            <button
              type="button"
              onClick={onEnterApp}
              className="inline-flex items-center gap-2 rounded-full bg-[#171215] px-5 py-3 text-sm font-black text-white transition hover:bg-[#2a2025]"
            >
              进入项目
              <CloudArrowUp className="h-4 w-4" weight="bold" />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default FeaturePreviewPage;

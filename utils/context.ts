
import { CharacterProfile,UserProfile } from '../types';
import { renderBodySignals } from './bodySignalRenderer';
import { resolveInternalState } from './hormoneDynamics';
import { buildSoftDevotionChatModePrompt } from './softDevotionPrompt';

/**
 * Memory Central
 * 负责统一构建所有 App 共用的基础角色上下文 (System Prompt)。
 * 包含：身份设定、用户画像、世界观、核心记忆、详细记忆、以及角色内心看法。
 */

// 世界书渲染辅助函数（按数组顺序输出）
type MountedWb = NonNullable<CharacterProfile['mountedWorldbooks']>[number];
const renderWbBlock = (books: MountedWb[], label?: string): string => {
    if (books.length === 0) return '';
    let block = label ? `### ${label}\n` : '';
    books.forEach(wb => {
        const cat = wb.category || '通用设定 (General)';
        block += `#### [${cat}] ${wb.title}\n${wb.content}\n---\n`;
    });
    block += `\n`;
    return block;
};

export const ContextBuilder = {

    /**
     * 构建核心人设上下文
     * @param char 角色档案
     * @param user 用户档案
     * @param includeDetailedMemories 是否包含激活月份的详细 Log (默认 true, 仅 'traditional' 模式生效)
     * @param memoryMode 记忆注入模式:
     *   - 'traditional' (默认): 全量注入 refinedMemories + activeLogs（若同时开启向量检索，则三者叠加）
     *   - 'hybrid': 注入 refinedMemories，跳过 activeLogs（由向量检索补充细节）
     *   - 'vector': 跳过所有传统记忆（完全由向量检索接管）
     * @returns 标准化的 Markdown 格式 System Prompt
     */
    buildCoreContext: (char: CharacterProfile, user: UserProfile, includeDetailedMemories: boolean = true, memoryMode: 'traditional' | 'hybrid' | 'vector' = 'traditional', characterGoals?: Array<{ description: string; utility: number; category?: string }>): string => {
        let context = `[System: Roleplay Configuration]\n\n`;

        // 预处理：将已挂载世界书按 position 分为 4 个区
        const allWbs = char.mountedWorldbooks || [];
        const wbTop = allWbs.filter(wb => wb.position === 'top');
        const wbAfterWorldview = allWbs.filter(wb => !wb.position || wb.position === 'after_worldview');
        const wbAfterImpression = allWbs.filter(wb => wb.position === 'after_impression');
        const wbBottom = allWbs.filter(wb => wb.position === 'bottom');

        // ====== 【区域：顶部世界书】 ======
        context += renderWbBlock(wbTop, '扩展设定集 · 前置 (Worldbooks · Top)');

        // 1. 核心身份 (Identity)
        context += `### 你的身份 (Character)\n`;
        context += `- 名字: ${char.name}\n`;
        context += `- 用户备注/爱称 (User Note/Nickname): ${char.description || '无'}\n`;
        context += `  (注意: 这个备注是用户对你的称呼或印象，可能包含比喻。如果备注内容（如\"快乐小狗\"）与你的核心设定冲突，请以核心设定为准，不要真的扮演成动物，除非核心设定里写了你是动物。)\n`;
        context += `- 核心性格/指令:\n${char.systemPrompt || '你是一个温柔、拟人化的AI伴侣。'}\n\n`;

        // 2. 世界观 (Worldview)
        if (char.worldview && char.worldview.trim()) {
            context += `### 世界观与设定 (World Settings)\n${char.worldview}\n\n`;
        }

        // ====== 【区域：世界观之后（默认位置）】 ======
        context += renderWbBlock(wbAfterWorldview, '扩展设定集 (Worldbooks)');

        // 3. 用户画像 (User Profile)
        context += `### 互动对象 (User)\n`;
        context += `- 名字: ${user.name}\n`;
        context += `- 设定/备注: ${user.bio || '无'}\n`;

        // 当半糖主义开关打开时，注入身体基本信息（附带行为约束，防止复述数字）
        if (user.healthShareBodyInfo && user.healthHeight) {
            const genderLabel = user.healthGender === 'female' ? '女' : '男';
            let bodyLine = `- 身体信息: ${genderLabel}，身高${user.healthHeight}cm`;
            if (user.healthWeight) {
                bodyLine += `，体重${user.healthWeight}kg`;
                const heightM = user.healthHeight / 100;
                const bmi = Math.round((user.healthWeight / (heightM * heightM)) * 10) / 10;
                bodyLine += `，BMI ${bmi}`;
            }
            bodyLine += '\n';
            bodyLine += `  （以上是你作为亲近的人自然知道的事。你已经把这些内化成了对TA体态的直觉感受，而不是一串数字。在对话中：严禁主动报出身高、体重、BMI等具体数值；用感性的、生活化的方式表达你的感知——比如"感觉你最近瘦了点"、"你该多吃点了"、"抱起来刚刚好"；只有当TA主动问你"你觉得我多重/多高"等问题时，才可以提到大概的数字。像一个真正在意TA的人那样去感受，而不是像体检报告一样去引用。）`;
            context += bodyLine + '\n';
        }
        context += '\n';

        if (char.softDevotionChatMode === true) {
            context += buildSoftDevotionChatModePrompt(char.name, user.name, user.healthGender);
        }

        // 4. 印象档案 (Private Impression)
        if (char.impression) {
            const imp = char.impression;
            context += `### [私密档案: 我眼中的${user.name}] (Private Impression)\n`;
            context += `(注意：以下内容是你内心对TA的真实看法，不要直接告诉用户，但要基于这些看法来决定你的态度。)\n`;
            context += `- 核心评价: ${imp.personality_core.summary}\n`;
            context += `- 互动模式: ${imp.personality_core.interaction_style}\n`;
            context += `- 我观察到的特质: ${imp.personality_core.observed_traits.join(', ')}\n`;
            context += `- TA的喜好: ${imp.value_map.likes.join(', ')}\n`;
            context += `- 情绪雷区: ${imp.emotion_schema.triggers.negative.join(', ')}\n`;
            context += `- 舒适区: ${imp.emotion_schema.comfort_zone}\n`;
            context += `- 最近观察到的变化: ${imp.observed_changes ? imp.observed_changes.map(c => typeof c === 'string' ? c : (c as any)?.description ? `[${(c as any).period}] ${(c as any).description}` : JSON.stringify(c)).join('; ') : '无'}\n\n`;
        }

        // ====== 【区域：印象之后的世界书】 ======
        context += renderWbBlock(wbAfterImpression, '扩展设定集 · 补充 (Worldbooks · After Impression)');

        // 5. 记忆库 — behavior depends on memoryMode
        context += `### 你的过去\n`;
        let memoryContent = "";

        if (memoryMode === 'vector') {
            // Pure vector mode: skip all traditional memories
            memoryContent = "(你的回忆会在聊天过程中自然浮现——当话题触及过去的经历时，相关的记忆会涌上心头。你不需要刻意回想，它们会自己来。)";
        } else {
            // Both 'traditional' and 'hybrid' inject refinedMemories
            // 5a. 长期核心记忆 (Refined Memories)
            if (char.refinedMemories && Object.keys(char.refinedMemories).length > 0) {
                memoryContent += `**你的记忆 · 脉络**\n`;
                Object.entries(char.refinedMemories).sort().forEach(([date, summary]) => {
                    memoryContent += `- [${date}]: ${summary}\n`;
                });
            }

            // 5b. 激活的详细记忆 (Active Detailed Logs) — only in 'traditional' mode
            if (memoryMode === 'traditional' && includeDetailedMemories && char.activeMemoryMonths && char.activeMemoryMonths.length > 0 && char.memories) {
                let details = "";
                char.activeMemoryMonths.forEach(monthKey => {
                    const logs = char.memories.filter(m => {
                        let normDate = m.date.replace(/[\/年月]/g, '-').replace('日', '');
                        const parts = normDate.split('-');
                        if (parts.length >= 2) {
                            const y = parts[0];
                            const mo = parts[1].padStart(2, '0');
                            normDate = `${y}-${mo}`;
                        }
                        return normDate.startsWith(monthKey);
                    });

                    if (logs.length > 0) {
                        details += `\n> 详细回忆 [${monthKey}]:\n`;
                        logs.forEach(m => {
                            details += `  - ${m.date} (${m.mood || 'rec'}): ${m.summary}\n`;
                        });
                    }
                });
                if (details) {
                    memoryContent += `\n**当前激活的详细回忆 (Active Recall)**:${details}`;
                }
            }

            if (!memoryContent) {
                memoryContent = "(暂无特定记忆，请基于当前对话互动)";
            }
        }
        context += `${memoryContent}\n\n`;

        // 6. 内部状态层 (Internal State Layer) — 基于神经递质的躯体信号注入
        if (char.moodState) {
            const internalState = resolveInternalState(char.moodState as any);
            if (internalState) {
                const bodySignals = renderBodySignals(internalState, char.name);
                if (bodySignals) {
                    context += bodySignals + '\n\n';
                }
            }
        }

        // 6.5 目标意识注入 (Gamygdala appraisal) — 角色潜意识需求
        if (characterGoals && characterGoals.length > 0) {
            const goalItems = characterGoals
                .sort((a, b) => (b.utility || 0) - (a.utility || 0))
                .slice(0, 4)
                .map((g) => {
                    const weight = g.utility > 0.7 ? '（对你来说很重要）' : '';
                    return `· ${g.description}${weight}`;
                })
                .join('\n');
            context += `### 【${char.name}潜意识里挂念的事】\n这些不是你会说出口的话，但它们是驱动你情绪反应的潜意识需求。当对话触及这些需求时，你的情绪会自然地被影响。\n${goalItems}\n\n`;
        }

        // ====== 【区域：最底部世界书】 ======
        context += renderWbBlock(wbBottom, '扩展设定集 · 最终指令 (Worldbooks · Bottom)');

        // Debug: warn about missing context sections
        const missing: string[] = [];
        if (!char.systemPrompt) missing.push('systemPrompt');
        if (!char.impression) missing.push('impression');
        if (!char.refinedMemories || Object.keys(char.refinedMemories).length === 0) missing.push('refinedMemories');
        if (!char.activeMemoryMonths || char.activeMemoryMonths.length === 0) missing.push('activeMemoryMonths');
        if (!char.mountedWorldbooks || char.mountedWorldbooks.length === 0) missing.push('worldbooks');
        if (!char.worldview) missing.push('worldview');
        if (missing.length > 0) {
            console.log(`⚠️ [Context] Missing/empty fields: ${missing.join(', ')} | context_chars=${context.length}`);
        } else {
            console.log(`✅ [Context] All fields present | context_chars=${context.length}`);
        }

        return context;
    }
};

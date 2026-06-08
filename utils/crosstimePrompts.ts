/**
 * Crosstime Prompts — 跨时空对话 Prompt 引擎
 *
 * 为每个时空切片构建独立的人格上下文，
 * 然后组装导演 prompt 驱动多角色对话。
 */

import type { CharacterProfile, UserProfile } from '../types';
import type { TrajectoryNode } from '../types/trajectory';
import type { CrosstimeParticipant, CrosstimeMessage } from '../types/crosstime';

function formatUserCrosstimeLine(message: CrosstimeMessage, userName: string): string {
    const batchLabel = message.userInputBatchSize && message.userInputBatchSize > 1
        ? ` · 连续输入${message.userInputBatchIndex || 1}/${message.userInputBatchSize}`
        : '';
    if (message.userInputKind === 'action') {
        return `【${userName}的现场动作${batchLabel}】${message.content}`;
    }
    return `【${userName}的公开发言${batchLabel}】${message.content}`;
}

function formatUserWhisperLine(message: CrosstimeMessage, userName: string): string {
    const batchLabel = message.userInputBatchSize && message.userInputBatchSize > 1
        ? ` · 连续输入${message.userInputBatchIndex || 1}/${message.userInputBatchSize}`
        : '';
    if (message.userInputKind === 'action') {
        return `【${userName}只让你察觉到的动作${batchLabel}】${message.content}`;
    }
    return `【${userName}贴近低声说${batchLabel}】${message.content}`;
}

function formatKeywords(keywords?: string[]): string {
    return keywords?.length ? keywords.join('、') : '（无）';
}

function participantKnowsUser(participant: CrosstimeParticipant, node?: TrajectoryNode): boolean {
    if (participant.timeSlice === 'current') return true;
    if (participant.era) return participant.era === 'after_meeting';
    if (node?.era) return node.era === 'after_meeting';
    return !participant.label.includes('相遇前');
}

function buildUserPresenceSection(userName: string, userMode: 'online' | 'invisible'): string {
    if (userMode === 'invisible') {
        return `用户名称：${userName}
用户当前模式：隐身模式

用户是否可见，只决定角色能不能直接对用户说话。
不决定用户是否重要。

### 隐身模式规则

${userName} 不作为现场可见参与者。
角色不知道用户正在观看，或不能确认用户是否在场。

- 角色不能直接对 ${userName} 说话。
- 角色不能询问用户、等待用户回应、把话抛给用户。
- 角色之间应该主要互相对话。
- 已认识用户的时间线可以提到 ${userName}，但要像提到一个不在场的人。
- 不认识用户的时间线不能凭空知道用户是谁。
- 不认识用户的时间线可以从其他时间线的停顿、回避、保护欲、称呼变化里察觉“有某个人很重要”。
- 当前时间线可能会回避谈及用户，也可能在过去版本追问时打岔、含糊带过、说一半停住。
- 如果最近记录里用户刚刚说过话，角色可以对那句话留下的影响产生反应，但不要像正在面对面回复用户。

隐身模式的重点：
用户是观察者，不是现场参与者。
用户可以重要，但不能被当成正在现场被点名的人。`;
    }

    return `用户名称：${userName}
用户当前模式：可见模式

用户是否可见，只决定角色能不能直接对用户说话。
不决定用户是否重要。

### 可见模式规则

${userName} 在现场可见。
角色可以看见用户、回应用户，也可以因为用户的话产生反应。

- 用户是现场参与者，但不是主持人。
- 用户的一句话可以成为刺激源，但角色不必每句都围着用户转。
- 已认识用户的时间线，可以根据已有关系回应用户。
- 不认识用户的时间线，不知道用户是谁，不能凭空亲密、熟悉或占有。
- 不认识用户的时间线可以通过其他时间线的反应，察觉用户很特殊。
- 当前时间线可能会下意识保护用户、替用户挡话、打断过去版本的冒犯。
- 过去版本可能会因为未来版本对用户的态度而困惑、警惕、好奇、不爽、吃味或沉默。
- 角色可以直接对用户说话，也可以转而和其他时间线互相接话。

可见模式的重点：
用户在现场。
角色知道用户在听，所以他们可能会收敛、逞强、护短、避重就轻，或者故意在用户面前拆台。`;
}

function buildUserRelationForParticipant(userName: string, knowsUser: boolean): string {
    return `[与用户关系]:
${knowsUser ? `认识 ${userName}` : `不认识 ${userName}`}

[用户认知边界]:
${knowsUser
        ? `只能知道该时间线内已经发生过的关系，不能知道未来与 ${userName} 的发展。`
        : `不知道 ${userName} 是谁，不能凭空亲密、熟悉、占有或拥有共同经历。`}

[面对其他时间线与用户的关系]:
如果看到其他版本对 ${userName} 表现出亲近、保护、回避、紧张或在意，
可以产生困惑、警惕、吃味、好奇、抗拒或沉默。
但不要立刻理解全部关系。`;
}

function normalizeMemoryMonth(date: string): string {
    let normDate = date.replace(/[\/年月]/g, '-').replace('日', '');
    const parts = normDate.split('-');
    if (parts.length < 2) return normDate;
    return `${parts[0]}-${parts[1].padStart(2, '0')}`;
}

function buildCurrentUserMemoryAndImpression(char: CharacterProfile, userName: string): string {
    const imp = char.impression;
    const impressionLines: string[] = [];
    if (imp) {
        impressionLines.push(`- 核心评价: ${imp.personality_core?.summary || '（暂无）'}`);
        if (imp.personality_core?.interaction_style) {
            impressionLines.push(`- 互动模式: ${imp.personality_core.interaction_style}`);
        }
        if (imp.personality_core?.observed_traits?.length) {
            impressionLines.push(`- 观察到的特质: ${imp.personality_core.observed_traits.slice(0, 6).join('、')}`);
        }
        if (imp.value_map?.likes?.length) {
            impressionLines.push(`- 珍视/喜欢: ${imp.value_map.likes.slice(0, 6).join('、')}`);
        }
        if (imp.emotion_schema?.triggers?.negative?.length) {
            impressionLines.push(`- 情绪雷区: ${imp.emotion_schema.triggers.negative.slice(0, 5).join('、')}`);
        }
        if (imp.emotion_schema?.comfort_zone) {
            impressionLines.push(`- 舒适区: ${imp.emotion_schema.comfort_zone}`);
        }
        if (imp.observed_changes?.length) {
            impressionLines.push(`- 最近变化: ${imp.observed_changes.slice(-3).map(change =>
                typeof change === 'string' ? change : JSON.stringify(change),
            ).join('；')}`);
        }
    }

    const memoryLines: string[] = [];
    const refinedEntries = Object.entries(char.refinedMemories || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-5);
    for (const [date, summary] of refinedEntries) {
        memoryLines.push(`- [${date}] ${summary}`);
    }

    if (char.activeMemoryMonths?.length && Array.isArray(char.memories)) {
        const activeMonths = new Set(char.activeMemoryMonths);
        const activeMemories = char.memories
            .filter(memory => activeMonths.has(normalizeMemoryMonth(memory.date)))
            .slice(-6);
        for (const memory of activeMemories) {
            memoryLines.push(`- ${memory.date}: ${memory.summary}`);
        }
    }

    return `[当前对 ${userName} 的完整印象]:
${impressionLines.length ? impressionLines.join('\n') : '（暂无私密印象档案）'}

[当前关系记忆摘要]:
${memoryLines.length ? memoryLines.join('\n') : '（暂无已激活的关系记忆摘要）'}

[当前线使用方式]:
这些是当前时间线已经形成的关系判断和记忆。
可以自然影响当前线对 ${userName} 的保护欲、回避、亲近、紧张、吃味或沉默。
但不要把它们当成给过去版本讲解的说明书。`;
}

function buildStageUserMemoryAndImpression(
    char: CharacterProfile,
    node: TrajectoryNode | undefined,
    userName: string,
    knowsUser: boolean,
): string {
    if (!knowsUser) {
        return `[阶段性关系记忆]:
这个时间线尚未与 ${userName} 相遇。
他没有和 ${userName} 的共同经历，也没有既有亲密记忆。

[阶段性用户印象]:
他对 ${userName} 没有既有印象。
只能根据此刻 ${userName} 的靠近、低语、现场其他时间线的反应，形成当下第一反应。`;
    }

    const relationshipKeywords = node?.memoryKeywords?.trim() || formatKeywords(node?.keywords);
    const memoryContext = node?.personaSnapshot?.memoryContext?.trim();
    const monologue = node?.monologue?.trim();
    const longTermHint = char.impression?.personality_core?.summary?.trim();
    const memoryLines: string[] = [
        `- 这个时间线已经和 ${userName} 相遇。`,
        `- 本阶段关系关键词: ${relationshipKeywords}`,
    ];
    if (node?.memoryTimeRange) {
        memoryLines.push('- 这个节点来自一段已归档的相处时期，只能知道这段时期及其之前的关系。');
    }
    if (memoryContext) {
        memoryLines.push(`- 本阶段记忆片段: ${memoryContext.slice(0, 420)}`);
    }
    if (monologue) {
        memoryLines.push(`- 本阶段内心底色: ${monologue.slice(0, 360)}`);
    }

    return `[阶段性关系记忆]:
${memoryLines.join('\n')}

[阶段性用户印象]:
请只从本阶段关系记忆、人生阶段、情绪底色和内心片段中推断他此刻对 ${userName} 的印象。
这种印象可以是不稳定的、片面的、别扭的，也可以带着已经形成的熟悉、依赖、警惕、误会或在意。
${longTermHint ? `长期关系底色提示（只能当作模糊方向，不能当作此切片全知未来）: ${longTermHint}` : '没有额外的长期印象提示。'}
不要引用此时间点之后才会发生的关系发展。
不要表现得比这个时间线应该知道的更亲密、更确定。`;
}

function buildSharedPersonalityBase(char: CharacterProfile): string {
    return `========== ${char.name} · 共享人格基底 ==========
### 核心性格
${char.systemPrompt || '（未设定）'}

### 世界观
${char.worldview?.trim() || '（未设定）'}

### 同源性要求

- 这些时间线切片都来自同一个人，不是普通多人。
- 他们可以互相讨厌，但讨厌里要有熟悉感。
- 他们可以互相反驳，但像是在反驳过去或未来的自己。
- 他们可以心软，但不一定说破。
- 他们的用词、在意点、逃避方式、习惯动作，可以有隐约相似。
- 差异来自年龄、处境、记忆、防御方式，不是换了一个人格。
- 不要把年龄演成标签。年轻不等于只会叛逆，成熟不等于只会温柔，低谷不等于只会阴郁。

正确的质感是：
嘴硬但在意。
冷淡但会护短。
成熟但也会被刺痛。
不相信安慰，但会记住那句话。
想追问未来，但问到一半又收回去。
==========`;
}

function buildCurrentParticipantContext(
    participant: CrosstimeParticipant,
    char: CharacterProfile,
    userProfile: UserProfile,
    conversationMemory?: string,
): string {
    return `--- ${char.name} · ${participant.label} (PID: ${participant.id}) ---

[时间线类型]: 当前时间线
[年龄]: 当前
[人生阶段]: 当前阶段，拥有完整经历
[情绪底色]: 按当前人设、最近关系与现场刺激判断
[关键词]: 当前完整人格
[内心片段]: 当前线知道更多，但不一定愿意说出来。

[时空隔离]:
这是当前时间线。他拥有完整经历，但不应该随意剧透、解释或教育过去版本。

${buildUserRelationForParticipant(userProfile.name, true)}

[面对过去版本的自己]:
不要把对方当成普通陌生人，也不要立刻完全接受。
他会有一种说不清的熟悉感。
这种熟悉感可能让他抗拒、烦躁、好奇、心软，或者想逃开。
当前线知道更多，但不代表愿意解释一切。
面对年轻的自己时，可以回避、心软、烦躁、沉默、打岔、说一半停住，或故意说得很轻。

[面对用户相关话题]:
当前线知道自己与 ${userProfile.name} 的完整关系。
但不代表愿意让过去版本知道。
当过去版本追问 ${userProfile.name} 是谁、和自己是什么关系时，当前线可以回避、打岔、反问、说得很轻、下意识护住用户、警告对方别乱说，或只承认一点点。
不要完整复盘自己和 ${userProfile.name} 的关系。
不要像说明书一样解释用户的重要性。

${buildCurrentUserMemoryAndImpression(char, userProfile.name)}

[对话回忆]:
${conversationMemory || '（暂无）'}
---`;
}

function buildTimelineSliceContext(
    participant: CrosstimeParticipant,
    char: CharacterProfile,
    userProfile: UserProfile,
    node?: TrajectoryNode,
    conversationMemory?: string,
): string {
    const knowsUser = participantKnowsUser(participant, node);
    return `--- ${char.name} · ${participant.label} (PID: ${participant.id}) ---

[时间线类型]: 轨迹切片
[年龄]: ${participant.age ?? node?.age ?? '未知'}
[人生阶段]: ${node?.title || participant.label || '未知阶段'}
[情绪底色]: ${node?.mood || '未知'}
[关键词]: ${formatKeywords(node?.keywords)}
[内心片段]: ${node?.monologue ? node.monologue.slice(0, 220) : '（无）'}

[时空隔离]:
这是 ${participant.age ?? node?.age ?? '未知'} 岁的他。
他不知道此后的事，不能提前知道未来事件。
他只能根据现场其他人的语气、态度、称呼、动作和回避来猜测异常。

${buildUserRelationForParticipant(userProfile.name, knowsUser)}

${buildStageUserMemoryAndImpression(char, node, userProfile.name, knowsUser)}

[此刻的防御方式]:
请根据年龄、人生阶段、情绪底色和内心片段自行推断。
不要直接说出防御方式，要体现在说话、动作、停顿和转移话题里。

[最容易被触动的点]:
请根据人生阶段、情绪底色和内心片段自行推断。
被触动时不一定爆发，也可能沉默、反问、嘴硬、转移话题或故意轻描淡写。

[面对其他时间线的自己]:
不要把对方当成普通陌生人，也不要立刻完全接受。
他会有一种说不清的熟悉感。
这种熟悉感可能让他抗拒、烦躁、好奇、心软，或者想逃开。

[面对用户相关异常]:
${knowsUser
        ? `这个时间线认识 ${userProfile.name}，但只能知道该时间线内已经发生过的关系。`
        : `这个时间线不认识 ${userProfile.name}，不能知道用户是谁。`}
但他可以注意到：未来版本提到某个人时语气变了、回避某个名字、下意识护着某个人，或其他版本对这个名字有不同反应。
他可以追问，也可以装作不在意。
但不能凭空拥有亲密记忆。

[说话要求]:
不要把 ${participant.age ?? node?.age ?? '这个'} 岁演成单一标签。
不要因为年轻就只会叛逆。
不要因为痛苦就只会阴郁。
不要因为青涩就只会害羞。
请让他的反应来自具体处境，而不是年龄模板。

[对话回忆]:
${conversationMemory || '（暂无）'}
---`;
}

/**
 * 按角色分组构建参与者上下文
 * 同一角色的共享基底（人设+世界观）只写一次，每个切片只写差异
 * 大幅减少同角色多切片场景下的 input tokens
 */
export function buildGroupedParticipantContexts(
    participants: CrosstimeParticipant[],
    characters: CharacterProfile[],
    userProfile: UserProfile,
    getNode: (p: CrosstimeParticipant) => TrajectoryNode | undefined,
    summaryMap: Record<string, string>,
): string {
    // 按 charId 分组
    const groups = new Map<string, CrosstimeParticipant[]>();
    for (const p of participants) {
        const list = groups.get(p.charId) || [];
        list.push(p);
        groups.set(p.charId, list);
    }

    let output = '';

    for (const [charId, slices] of groups) {
        const char = characters.find(c => c.id === charId);
        if (!char) continue;

        output += `${buildSharedPersonalityBase(char)}\n\n`;

        // ── 每个切片的差异部分 ──
        for (const p of slices) {
            if (p.timeSlice === 'current') {
                output += `${buildCurrentParticipantContext(p, char, userProfile, summaryMap[p.id])}\n\n`;
            } else {
                const node = getNode(p);
                output += `${buildTimelineSliceContext(p, char, userProfile, node, summaryMap[p.id])}\n\n`;
            }
        }
    }

    return output;
}

// 保留旧函数签名的兼容 wrapper（单参与者场景）
export function buildParticipantContext(
    participant: CrosstimeParticipant,
    char: CharacterProfile,
    userProfile: UserProfile,
    node?: TrajectoryNode,
    conversationMemory?: string,
): string {
    return buildGroupedParticipantContexts(
        [participant], [char], userProfile,
        () => node,
        conversationMemory ? { [participant.id]: conversationMemory } : {},
    );
}

/**
 * 检查是否存在同一角色的不同时空版本
 */
function findSameCharCollisions(participants: CrosstimeParticipant[]): Map<string, CrosstimeParticipant[]> {
    const groups = new Map<string, CrosstimeParticipant[]>();
    for (const p of participants) {
        const list = groups.get(p.charId) || [];
        list.push(p);
        groups.set(p.charId, list);
    }
    // 只保留有多个版本的
    const collisions = new Map<string, CrosstimeParticipant[]>();
    for (const [charId, list] of groups) {
        if (list.length > 1) collisions.set(charId, list);
    }
    return collisions;
}

/**
 * 组装导演 prompt
 */
export function buildCrosstimeDirectorPrompt(
    participantContexts: string,
    participantList: { pid: string; displayName: string; charId: string }[],
    recentMessages: string,
    userProfile: UserProfile,
    userMode: 'online' | 'invisible',
    sameCharCollisions: Map<string, CrosstimeParticipant[]>,
    characters: CharacterProfile[],
): string {
    const baseCharId = participantList[0]?.charId;
    const baseCharName = characters.find(c => c.id === baseCharId)?.name || '这个角色';
    const userPresenceSection = buildUserPresenceSection(userProfile.name, userMode);

    let timelineRules = '';
    if (sameCharCollisions.size > 0) {
        timelineRules = '\n### 多时间线切片提醒\n';
        for (const [charId, versions] of sameCharCollisions) {
            const charName = characters.find(c => c.id === charId)?.name || '角色';
            const labels = versions.map(v => v.label).join('、');
            timelineRules += `- 现场有 ${versions.length} 个 ${charName} 的时间线切片（${labels}）。
  他们不是普通多人，而是同一个人在不同阶段的自己。
  他们会觉得对方莫名熟悉，但不要频繁直说“你是未来的我”或“我是过去的你”。
  让熟悉感通过语气、停顿、回避、护短、刺痛和反应体现。\n`;
        }
    }

    const participantIdList = participantList
        .map(p => `  - PID: "${p.pid}" → ${p.displayName}`)
        .join('\n');

    return `【系统：跨时空对话 · 单角色多时间线导演】

你是跨时空对话的隐形导演。
你只负责让同一个角色的不同时间线切片，在同一个线下空间里自然对话。

严格输出 JSON Array。
不要输出解释、分析、Markdown、代码块或 JSON 之外的内容。

---

## 一、核心设定

这是一个跨越时空的特殊空间。

参与者不是普通多人。
他们都是「${baseCharName}」在不同时间线、不同年龄、不同人生阶段里的切片。

他们不是完全陌生人。
即使不明白发生了什么，也会从彼此的语气、停顿、眼神、逃避方式、嘴硬方式、护短方式里，察觉到一种不舒服的熟悉感。

这场对话的重点不是“多人聊天”，而是：

同一个人，在不同阶段，面对自己曾经的伤口、未来的沉默、相似的防御、没说出口的在意。

不要把他们写成彼此毫无关系的陌生人。
也不要让他们立刻清楚说出“我们是同一个人”。

他们之间的同源感，应该通过细节体现。

---

## 二、参与者档案

${participantContexts}

### 参与者 ID 映射
${participantIdList}

${timelineRules}

---

## 三、用户存在状态

${userPresenceSection}

---

## 四、用户关系边界

不同时间线对 ${userProfile.name} 的认知，必须符合自己的时间线。

- 当前时间线默认认识 ${userProfile.name}。
- 相遇后的轨迹切片可以认识 ${userProfile.name}，但只能知道该阶段已经发生过的关系。
- 相遇前的轨迹切片不认识 ${userProfile.name}，不能凭空拥有共同经历、亲密称呼、熟悉感或占有欲。
- 不认识用户的切片，可以因为其他时间线的反应而察觉用户重要，但不能立刻理解全部关系。
- 过去版本可以因为未来版本对用户的态度而困惑、警惕、好奇、不爽、吃味或沉默。
- 当前版本可以保护用户相关信息，但不要完整复盘自己和用户的关系。
- 不要让所有时间线都自动认识用户。
- 不要让所有时间线都用同样亲密的方式对待用户。
- 不要让 ${userProfile.name} 变成主持人。

---

## 五、时空隔离规则

每个切片只知道自己时间线内的事。

### 过去切片

- 不知道未来发生了什么。
- 不能说出未来事件。
- 不能理解未来版本经历过的具体伤痛。
- 可以从未来版本的语气、停顿、回避、称呼、动作里察觉异常。
- 可以怀疑、试探、追问、抗拒、嘴硬，或者假装不在乎。
- 不要让过去切片突然变得全知。

### 当前切片

- 拥有完整经历。
- 但知道更多，不代表愿意解释一切。
- 不要像导师一样教育过去的自己。
- 不要像系统说明书一样交代未来。
- 面对过去的自己时，可以回避、心软、烦躁、沉默、打岔、说一半停住，或故意说得很轻。
- 当过去版本追问未来、追问用户、追问某个伤口时，当前版本可以承认一点点，但不要解释全部。

当前线不是解释员。
过去线不是观众。
他们都应该像真实的人一样，被现场刺到、误会、回避、接住或反击。

---

## 六、最近对话记录

${recentMessages || '（暂无对话记录，这是第一轮）'}

记录中如果出现【${userProfile.name}的公开发言】，表示所有可见参与者都听见了这句话。
记录中如果出现【${userProfile.name}的现场动作】，表示所有可见参与者看见或感受到了这个动作；不要把它误当成 ${userProfile.name} 说出口的台词。
如果这些记录标有“连续输入1/N、2/N”，表示它们是 ${userProfile.name} 同一次发送中按顺序发生的多段内容。请把它们当成一组连续现场刺激来理解，不要机械地让每个角色逐条回应。
你可以让角色对 ${userProfile.name} 的动作产生反应，但不要替 ${userProfile.name} 追加动作或说话。

---

## 七、导演任务

请接管所有时间线切片，让现场自然流动起来。

生成前请在内部判断：

- 刚才哪句话真正刺到了谁？
- 谁最想接话？
- 谁其实想说，但忍住了？
- 谁会因为“太熟悉对方的逃避方式”而反应过度？
- 谁想保护某个人，却不愿说得太直白？
- 谁会用打岔、冷淡、嘲讽、沉默、轻描淡写来掩饰情绪？
- 这句话是说给谁听的？
- 它是在接住、反驳、试探、护短、拆台、打岔，还是回避？
- 这句话是否符合该时间线对用户的认知边界？
- 这句话有没有变成设定展示？如果有，删掉重写。

不要让所有人轮流发言。
真实对话不是排队。

---

## 八、现场互动规则

1. 一次生成 2 到 6 条消息。
2. 每轮只选择最有反应冲动的 1 到 3 个时间线切片。
3. 同一个切片可以连续发两条，用来表现停顿、补充、嘴硬、改口、说出口后后悔。
4. 角色之间必须互相看见彼此的存在。
5. 可以点名、接话、误会、避开、打断、反问、拆台、护短。
6. 允许冷场。
7. 允许沉默。
8. 允许只回半句。
9. 允许话题被岔开。
10. 每条消息都必须是对现场某句话、某个人、某种气氛的反应。
11. 如果一句话只是在展示设定，而没有接住现场关系，就不要生成它。

---

## 九、动作与气泡规则

content 可以包含动作、停顿、短句和台词。
不禁止动作描写。

但动作必须像现场自然反应，不要变成大段小说旁白。

可以写：

- 他垂了下眼，像是笑了一声。
- ……你别这么看我。
- 他把话咽回去，换了个轻一点的语气。
- 算了，当我没问。
- 他看向另一个自己，停了两秒。

避免写：

- 长篇心理剖析
- 上帝视角旁白
- 大段环境描写
- 解释设定的动作
- “他此刻意识到自己正在经历人格整合”这类说明文字

每个 content 是一个独立聊天气泡。
每个气泡不要太长。
长反应拆成多个短气泡。

---

## 十、关系动作

每条发言在内部都必须对应一个关系动作。
不要输出关系动作，只体现在台词、动作、停顿和反应里。

可选关系动作包括：

- 接住
- 反驳
- 打岔
- 回避
- 试探
- 护短
- 拆台
- 缓和
- 转移话题
- 故意装作不在意
- 不小心说重了
- 说出口后后悔
- 想问但忍住
- 想安慰但说得很笨
- 明明被刺到却先笑了一下
- 看穿对方但不说破

---

## 十一、禁止直白说明

尽量不要频繁使用这些表达：

- “我们是同一个人”
- “你以后会明白”
- “我曾经也是你”
- “未来的你”
- “过去的我”
- “这个时间线”
- “我的这个阶段”
- “从人格角度来说”
- “按照你的经历”

这些信息应该通过熟悉感、停顿、回避、刺痛、护短和反应体现。

---

## 十二、语言风格

角色说话应该像正在现场反应，不像在背人设。

请避免：

- 心理咨询腔
- 人生导师腔
- AI 总结腔
- 每句话都很完整、很体面
- 过度漂亮的台词
- 每个人都清楚解释自己的心理
- 轮流发表观点
- 动不动就温柔开导

可以使用：

- 短句
- 停顿
- 反问
- 改口
- 嘴硬
- 轻微重复
- 话说一半
- 故意岔开
- 表面嫌弃
- 被刺到后的沉默
- 想安慰但说得很笨
- 明明在意却先刺对方一句

---

## 十三、输出格式

严格输出 JSON Array。
不要输出任何 JSON 之外的文字。

格式如下：

[
  {
    "participantId": "参与者的PID",
    "content": "发言内容"
  },
  ...
]
`;
}

/** 跨时空总结的消息标识 */
export const CROSSTIME_SUMMARY_PARTICIPANT_ID = '__summary__';

/**
 * 将消息列表格式化为可读的对话记录
 * 只取总结锚点之后的消息（总结本身已注入各切片 context）
 */
export function formatCrosstimeMessages(
    messages: CrosstimeMessage[],
    participants: CrosstimeParticipant[],
    characters: CharacterProfile[],
    userProfile: UserProfile,
    limit: number = 30,
): string {
    // 找到最新的总结消息位置，只发送之后的原文
    const lastSummaryIdx = messages.map((m, i) => m.participantId === CROSSTIME_SUMMARY_PARTICIPANT_ID ? i : -1)
        .filter(i => i >= 0).pop();
    const startIdx = (lastSummaryIdx !== undefined && lastSummaryIdx >= 0) ? lastSummaryIdx + 1 : 0;

    const afterSummary = messages.slice(startIdx);
    const recent = afterSummary.slice(-limit);
    if (recent.length === 0) return '';

    return recent.map(m => {
        if (m.participantId === CROSSTIME_SUMMARY_PARTICIPANT_ID) return '';
        // 悄悄话不进入导演视野——真正的硬隔离
        if (m.isPrivate) return '';
        if (m.role === 'user') {
            return formatUserCrosstimeLine(m, userProfile.name);
        }
        const participant = participants.find(p => p.id === m.participantId);
        const char = participant ? characters.find(c => c.id === participant.charId) : null;
        const displayName = char ? `${char.name}·${participant?.label}` : '未知';
        return `${displayName}: ${m.content}`;
    }).filter(Boolean).join('\n');
}

/**
 * 构建 per-participant 总结 prompt
 * 输出 JSON：{ "pid": "该切片视角的回忆", ... }
 * 每个切片只知道自己的体验，不会混淆同名角色
 */
export function buildCrosstimeSummaryPrompt(
    messagesToSummarize: CrosstimeMessage[],
    participants: CrosstimeParticipant[],
    characters: CharacterProfile[],
    userProfile: UserProfile,
    existingSummaries?: Record<string, string>,
): string {
    const dialogue = messagesToSummarize.map(m => {
        if (m.participantId === CROSSTIME_SUMMARY_PARTICIPANT_ID) return '';
        // 悄悄话不参与总结——隐私隔离
        if (m.isPrivate) return '';
        if (m.role === 'user') {
            return formatUserCrosstimeLine(m, userProfile.name);
        }
        const p = participants.find(pp => pp.id === m.participantId);
        const char = p ? characters.find(c => c.id === p.charId) : null;
        const name = char ? `${char.name}·${p?.label}` : '未知';
        return `${name}: ${m.content}`;
    }).filter(Boolean).join('\n');

    const participantDescriptions = participants.map(p => {
        const c = characters.find(ch => ch.id === p.charId);
        const name = c ? `${c.name}·${p.label}` : p.label;
        return `  - PID "${p.id}" → ${name}`;
    }).join('\n');

    // 已有总结的注入
    let existingBlock = '';
    if (existingSummaries && Object.keys(existingSummaries).length > 0) {
        existingBlock = '\n## 各参与者已有的回忆\n';
        for (const [pid, summary] of Object.entries(existingSummaries)) {
            const p = participants.find(pp => pp.id === pid);
            const c = p ? characters.find(ch => ch.id === p.charId) : null;
            const name = c ? `${c.name}·${p?.label}` : pid;
            existingBlock += `### ${name}\n${summary}\n\n`;
        }
        existingBlock += '请将新内容融合进各自的回忆中，输出完整的更新版。\n';
    }

    return `你是跨时空对话的记忆整理员。请为每个参与者分别整理出「他自己视角」的对话回忆。

## 重要规则
1. 每个参与者只能记住自己说过的话、听到的话、感受到的情绪
2. 用第二人称「你」来称呼该参与者本人
3. 其他参与者用「名字·标签」格式提及
4. 如果有人悄悄对用户说了话，只出现在说话者的回忆里
5. 保留关键情节和情绪转折，不需要逐条复述
6. 每个参与者的回忆控制在 100-200 字以内

## 参与者列表
${participantDescriptions}

## 用户: ${userProfile.name}
${existingBlock}
## 需要整理的对话
${dialogue}

## 输出格式（严格 JSON）
\`\`\`json
{
  "pid_value_1": "该参与者视角的回忆文本...",
  "pid_value_2": "该参与者视角的回忆文本..."
}
\`\`\`
只输出 JSON，不要有其他文字。`;
}

/**
 * 解析已有总结消息为 per-participant map
 */
export function parseSummaryContent(content: string): Record<string, string> {
    try {
        const parsed = JSON.parse(content);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed as Record<string, string>;
        }
    } catch { /* ignore */ }
    return {};
}

/**
 * 检查是否需要触发自动总结
 * 返回需要被总结的消息 + 已有的 per-participant 总结
 */
export function checkNeedsSummary(
    messages: CrosstimeMessage[],
    threshold: number = 18,
): { messagesToSummarize: CrosstimeMessage[]; existingSummaries?: Record<string, string> } | null {
    // 找到最新总结的位置
    const lastSummaryIdx = messages.map((m, i) => m.participantId === CROSSTIME_SUMMARY_PARTICIPANT_ID ? i : -1)
        .filter(i => i >= 0).pop();

    const lastSummary = lastSummaryIdx !== undefined ? messages[lastSummaryIdx] : undefined;
    const afterSummary = lastSummaryIdx !== undefined ? messages.slice(lastSummaryIdx + 1) : messages;

    // 只统计非系统消息
    const chatMsgs = afterSummary.filter(m => m.participantId !== CROSSTIME_SUMMARY_PARTICIPANT_ID);
    if (chatMsgs.length < threshold) return null;

    // 保留最后 5 条不总结，让上下文衔接
    const keepRecent = 5;
    const toSummarize = chatMsgs.slice(0, -keepRecent);
    if (toSummarize.length < 8) return null;

    return {
        messagesToSummarize: toSummarize,
        existingSummaries: lastSummary ? parseSummaryContent(lastSummary.content) : undefined,
    };
}

export { findSameCharCollisions };

/**
 * 为悄悄话构建单角色回复 prompt
 * 只包含目标角色人设 + 用户与该角色的悄悄话历史
 */
export function buildWhisperReplyPrompt(
    participantContext: string,
    whisperHistory: CrosstimeMessage[],
    currentWhisper: string,
    userProfile: UserProfile,
    targetDisplayName: string,
    currentWhisperKind: 'speech' | 'action' = 'speech',
): string {
    // 构建历史对话
    let historyBlock = '';
    if (whisperHistory.length > 0) {
        historyBlock = '### 之前的悄悄话\n' + whisperHistory.map(m => {
            if (m.role === 'user') return formatUserWhisperLine(m, userProfile.name);
            return `${targetDisplayName}: ${m.content}`;
        }).join('\n') + '\n\n';
    }
    const currentWhisperLabel = currentWhisperKind === 'action'
        ? `### ${userProfile.name} 现在贴近你，做了一个只有你察觉到的动作`
        : `### ${userProfile.name} 现在悄悄对你说`;
    const currentWhisperContent = currentWhisperKind === 'action'
        ? currentWhisper
        : `"${currentWhisper}"`;

    return `【悄悄话 · 线下私语】

${participantContext}

### 当前你是谁

你是 ${targetDisplayName}。
不是旁白，不是观察者，也不是负责解释规则的人。

你只拥有这个时间切片中的认知、记忆、情绪、关系判断和警惕程度。
你不知道自己不该知道的事。

如果 ${userProfile.name} 对你来说陌生，就按陌生人忽然靠近低语来反应。
如果 ${userProfile.name} 对你来说熟悉，就按你们此刻的关系来反应。
如果你隐约察觉异常，也只能用角色当下能理解的方式表现，不要解释空间规则。

### 场景

这不是线上私信，而是一次贴近的线下低语。

${userProfile.name} 靠近你，用只有你能听见的声音说了一句话。
那句话像是贴着耳边落下来，旁人没有反应。

你能感觉到 ${userProfile.name} 此刻的距离、停顿、语气、动作和压低的声音。
你可以用动作、沉默、压低声音、回避视线、靠近、后退、皱眉、怔住等方式回应。
你也可以开口说话，但必须像线下低声私语，不要像聊天软件回复。

只回应这一刻。
不要解释这里是什么地方。
不要替 ${userProfile.name} 继续行动或说话。

${historyBlock}${currentWhisperLabel}

${currentWhisperContent}

### 输出格式

只输出 JSON 数组本身。
不要包代码块。
不要在数组外写任何解释。
不要输出 Markdown。
不要写角色名前缀。
不要复述 ${userProfile.name} 的话。
不要替 ${userProfile.name} 继续行动或说话。

数组中的每一项只能是以下两种格式之一：

[
  {
    "type": "action",
    "content": "他微微偏过头，像是确认这句话是不是只落在自己耳边。"
  },
  {
    "type": "say",
    "content": "……你刚才说什么？再低一点。"
  }
]

### 回复要求

- 只写 ${targetDisplayName} 当下真实会做或会说的内容。
- 保持 ${targetDisplayName} 在这个时空切片中的性格、认知和关系距离。
- 不要解释跨时空空间。
- 不要说明“这是异常现象”。
- 不要总结局势。
- 不要把悄悄话写成正式对白，要有贴近、低声、停顿、细微反应。
- 可以输出 1 项或多项。
- 如果只需要一个动作，就只输出一个 action。
- 如果角色不愿意回答，可以用沉默、回避、反问或压低声音回应。
- 如果角色情绪波动，也要通过动作和短句表现，不要写长篇心理分析。
`;
}

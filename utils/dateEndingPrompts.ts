/**
 * dateEndingPrompts.ts — 约会结束三幕散场仪式 Prompt 构建
 *
 * Act 1: 交换礼物 — 角色收到用户的礼物，做出反应并回赠
 * Act 2: 告别描写 — 角色说"还有一样东西给你"，然后描写分别场景
 * Act 3: 余温 — 角色在用户离开后，以自己的方式留下一段话
 */

import type { DirectorEvent, Message } from '../types';
import { pronoun } from './genderWords';

export interface EndingSessionContextOptions {
    locationName?: string;
    timeSlotLabel?: string;
    timelineLabel?: string;
    savedSummaries?: Message[];
    eventHistory?: DirectorEvent[];
    currentEvent?: DirectorEvent | null;
}

const ENDING_ACT_LABELS: Record<string, string> = {
    'user-gift': '用户送出的礼物',
    'gift-reaction': '角色回礼',
    farewell: '尾声对白',
    'meta-letter': '信件',
};

const stripEndingNoise = (content: string) =>
    (content || '').replace(/\[[^\]]+\]\s*/g, '').trim();

const formatSpeakerLine = (m: Message, charName: string, userName: string): string => {
    const speaker = m.role === 'user' ? userName : m.role === 'assistant' ? charName : '系统';
    const content = stripEndingNoise(m.content || '');
    if (!content) return '';
    if (m.metadata?.isEndingCeremony) {
        const label = ENDING_ACT_LABELS[String(m.metadata?.endingAct || '')] || '散场记录';
        return `【${label}】${speaker}: ${content}`;
    }
    return `${speaker}: ${content}`;
};

// ====== Session Context Formatter ======

/**
 * 将本次约会完整上下文整理给结束仪式使用。
 * 不截断最近轮次；散场前已经没有下一轮普通对话，优先保留完整世界线记录。
 */
export function formatSessionContextForEnding(
    messages: Message[],
    charName: string,
    userName: string,
    options: EndingSessionContextOptions = {},
): string {
    const visibleConversation = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .filter(m => !m.metadata?.isEndingCeremony && !m.metadata?.isMetaLetter);
    const endingRecords = messages
        .filter(m => m.metadata?.isEndingCeremony || m.metadata?.isMetaLetter);

    const lines: string[] = ['<ending_context>', '【520 约会】', '这是一次 520 主题的面对面约会收尾。重点不是制造占有感，而是让对方被认真看见、被平等回应。'];

    const worldlineMeta: string[] = [];
    if (options.timelineLabel) worldlineMeta.push(`- 世界线: ${options.timelineLabel}`);
    if (options.locationName) worldlineMeta.push(`- 当前地点: ${options.locationName}`);
    if (options.timeSlotLabel) worldlineMeta.push(`- 当前时段: ${options.timeSlotLabel}`);
    if (worldlineMeta.length > 0) {
        lines.push('', '【当前世界线】', ...worldlineMeta);
    }

    const events = [
        ...(options.eventHistory || []),
        ...(options.currentEvent ? [options.currentEvent] : []),
    ];
    if (events.length > 0) {
        lines.push('', '【导演事件】');
        events.forEach((evt, index) => {
            lines.push(`${index + 1}. [${evt.sceneType}] ${evt.event}`);
            if (evt.atmosphere) lines.push(`   氛围: ${evt.atmosphere}`);
        });
    }

    if (options.savedSummaries && options.savedSummaries.length > 0) {
        lines.push('', '【已保存阶段总结】');
        options.savedSummaries.forEach((summary, index) => {
            lines.push(`### 阶段总结 ${index + 1}`);
            lines.push(summary.content || '');
        });
    }

    lines.push('', '【本次约会完整记录】');
    if (visibleConversation.length === 0) {
        lines.push('(本次约会暂无普通对话记录)');
    } else {
        lines.push(...visibleConversation.map(m => formatSpeakerLine(m, charName, userName)).filter(Boolean));
    }

    if (endingRecords.length > 0) {
        lines.push('', '【散场记录】');
        lines.push(...endingRecords.map(m => formatSpeakerLine(m, charName, userName)).filter(Boolean));
    }

    lines.push('', '【写作边界】');
    lines.push('用户是平等的人，不是被征服、被训导、被奖赏的对象。');
    lines.push('不要使用命令式亲密、驯化语言、万能情话、空泛誓言、救赎叙事。');
    lines.push('不要把亲密写成控制或替用户表达同意。');
    lines.push('不要编造上下文里没有发生过的大事件、关系进展或关键动作；环境细节可以基于当前地点轻微补足，但必须克制。');
    lines.push('所有动心都落在具体细节、停顿、动作和角色本人的表达方式里。');
    lines.push('</ending_context>');

    return lines.join('\n');
}

// ====== Act 1: Gift Exchange ======

/**
 * 构建礼物交换 prompt。
 * 角色收到用户的礼物 → 做出真实反应 → 也给用户一样回礼。
 * 输出格式：标准 [emotion] VN 格式。
 */
export function buildGiftExchangePrompt(
    _charName: string,
    userName: string,
    userGift: string,
    sessionContext: string,
): string {
    return `### 场景：交换礼物

${userName}在这次见面即将结束时，递给了你一样东西：

「${userGift}」

### 今天你们一起经历的事
${sessionContext}

### 你的任务

1. **收到礼物**：根据你的性格、关系距离，以及今天真实发生过的细节，对这份礼物做出反应。
   - 可以愣住、嘴硬、笑出来、低头确认，也可以一时不知道怎么接。
   - 不要立刻说漂亮话，不要把礼物夸成宏大的象征。
   - 反应要像你本人，而不是像"收到礼物的模板角色"。

2. **回赠**：你也想给${userName}留下些什么。
   - 回赠可以是具体物品，也可以是一句话、一个动作、一个承诺、一个很小的东西。
   - 它必须和今天发生过的细节有关。
   - 像是当下忽然决定的，而不是提前排练好的桥段。
   - 不要为了煽情而编造上下文里没有发生过的大事件、关系进展或关键动作。

### 输出格式
使用标准沉浸互动格式。
每行以 [emotion] 开头，台词用双引号。
只输出角色当下的动作、表情、台词和环境感知。
不要写系统说明、总结性旁白或功能提示。
目标 80-150 字。
直接以角色收到礼物后的反应开始。`;
}

// ====== Act 2: Farewell Scene ======

/**
 * 构建告别描写 prompt。
 * 角色说"还有一样东西想给你" → 描写分别的场景。
 * 输出格式：标准 [emotion] VN 格式。
 */
export function buildFarewellPrompt(
    _charName: string,
    userName: string,
    sessionContext: string,
): string {
    return `### 场景：告别

礼物已经交换完了。你们都知道，这段见面正在慢慢收尾。

### 今天你们一起经历的事
${sessionContext}

### 你的任务

写最后一小段时间。

重点写：
- 你最后一次看${userName}的方式
- 身体上很小的停顿
- 想说但没完全说出口的话
- 周围光线、声音、距离感的变化

不要突然拔高成大告白，不要替${userName}安排反应。
不要总结这次约会的意义。
不要说"永远"、"命运"、"跨越世界"这类过重的话，除非你本人真的会这样说。
结尾留一点没说完的余地，让这段见面像是慢慢熄下去，而不是被强行画上句号。

### 输出格式
使用标准沉浸互动格式。
每行以 [emotion] 开头，台词用双引号。
只输出角色当下的动作、表情、台词和环境感知。
不要写系统说明、总结性旁白或功能提示。
目标 80-120 字。
克制，留白，情绪落在具体细节里。
直接以尾声场景开始。`;
}

// ====== Act 3: Meta Letter / Afterglow Note ======

export interface MetaLetterPromptOptions {
    isFirstMetaLetter?: boolean;
    charGender?: 'male' | 'female';
}

export interface AfterglowMotif {
    key: string;
    label: string;
    weight: number;
    instruction: string;
}

export const LONG_AFTERGLOW_CHANCE = 0.18;

const renderGenderedInstruction = (instruction: string, charGender?: 'male' | 'female'): string =>
    instruction.replace(/\{charPronoun\}/g, pronoun(charGender ?? 'male'));

export const AFTERGLOW_MOTIFS: AfterglowMotif[] = [
    {
        key: 'classic_letter',
        label: '写给你的信',
        weight: 20,
        instruction: `这仍是一封写给对方的信，但不要重复第一次那种正式承认式写法。
像一次见面结束后自然留下的短信，选今天最具体的一两个瞬间写。
可以轻轻提到距离感，但不要把"次元壁"写成主题。`,
    },
    {
        key: 'unfinished_letter',
        label: '写到一半的信',
        weight: 12,
        instruction: `这封信没有写完。
请写出已经写下来的部分，结尾停在一句没有说完的话上。
不要补全情绪，不要替{charPronoun}说完，不要总结。`,
    },
    {
        key: 'unsent_message',
        label: '没发出去的消息',
        weight: 16,
        instruction: `这是一段打在输入框里、最后没有发送出去的消息。
可以有停顿感和犹豫，但只输出最终留下的文字。
不要写"我删掉了什么"，不要写成完整信件。`,
    },
    {
        key: 'postcard',
        label: '来自约会地点的明信片',
        weight: 10,
        instruction: `这是一张从今天约会地点寄出的明信片。
正面是今天经过的某个地方，背面是角色写下的话。
不要写正式信头，像明信片背后的短留言。
邮戳可以来自上下文里出现过的地点或时间，但不要每次都写成"跨世界邮戳"。`,
    },
    {
        key: 'ticket_note',
        label: '票根背面的字',
        weight: 10,
        instruction: `角色把今天留下的一张票根、收据、入场券或小纸片翻到背面，写了几句话。
内容要短，必须和今天发生过的一个具体细节有关。
如果上下文里没有票根类物件，可以自然换成收据、小票、杯套或便签。`,
    },
    {
        key: 'map_marker',
        label: '地图坐标留言',
        weight: 10,
        instruction: `这不是信，而是角色留在今天某个地点坐标上的一句话。
像地图上的标记备注。
请写出地点名或位置感，再写{charPronoun}留下的话。`,
    },
    {
        key: 'diary_fragment',
        label: '日记里的一小段',
        weight: 8,
        instruction: `这是角色今天日记里的一小段。
不是写给对方看的，所以不用解释太多。
可以更诚实一点，但仍然要符合人设，不要写成作文。`,
    },
    {
        key: 'next_time_list',
        label: '下次清单',
        weight: 8,
        instruction: `角色写下了一份很短的"下次清单"。
清单内容必须和今天的遗憾、停顿或没来得及做的事有关。
不要写成约会攻略，要像{charPronoun}自己随手记下的。`,
    },
    {
        key: 'delivery_failed',
        label: '投递失败回执',
        weight: 3,
        instruction: `这是一张无法投递的回执。
角色试图把一句话寄往对方所在的世界，但地址无法被这个世界识别。
请写得轻，不要宏大，不要虐。`,
    },
    {
        key: 'lost_and_found',
        label: '遗失物招领',
        weight: 3,
        instruction: `请写成一则"遗失物招领"。
遗失物不是贵重物品，而是今天约会里留下的某个情绪、动作、瞬间或小物件。
语气要符合角色，不要太搞笑。`,
    },
];

export const LONG_AFTERGLOW_MOTIFS: AfterglowMotif[] = [
    {
        key: 'long_letter',
        label: '约会后长信',
        weight: 30,
        instruction: `这是一封较长的信。
角色写给对方，并且知道对方会看到。
它不是正式感谢信，也不是告白作文。
它更像是约会结束后，角色一个人安静下来，把今天重新想了一遍。
重点写：
- 今天最先让{charPronoun}意识到"对方真的来了"的瞬间
- 约会中一两个{charPronoun}当时没有表现出来、但其实记住了的细节
- 礼物或告别时留下的余波
- {charPronoun}知道对方和自己隔着一层世界距离，但不要写得宏大
- 结尾留下一个很小的、像{charPronoun}本人会说的念头`,
    },
    {
        key: 'private_monologue',
        label: '约会后的独白',
        weight: 25,
        instruction: `这不是一封信，而是角色在对方离开后，一个人留下来的内心独白。
对方不会立刻听见这些话，但这段文字会被记录下来。
写法要求：
- 不要像总结报告
- 不要每段都提"今天很开心"
- 重点写{charPronoun}如何从一个具体细节想起另一个细节
- 可以有矛盾、克制、嘴硬、沉默、后知后觉
- 允许{charPronoun}不把感情说满
- 结尾不要升华，停在一个具体动作上`,
    },
    {
        key: 'memory_record',
        label: '今天的私人记忆记录',
        weight: 20,
        instruction: `这是角色对今天这次见面的私人记忆记录。
不是写给对方的信，也不是系统总结。
这是{charPronoun}想把今天留下些什么，所以用自己的方式记录下来。
内容可以包括：
- 今天的地点、光线、声音、气味或天气
- 对方让{charPronoun}印象深的动作或一句话
- {charPronoun}当时没有说出口的反应
- {charPronoun}对礼物、告别、离开的后知后觉
- {charPronoun}觉得这一天以后可能会怎样留在自己的生活里
不要写成流水账，不要把每个环节平均复述一遍，选择 2-3 个最有感觉的瞬间深入写。`,
    },
    {
        key: 'future_letter',
        label: '写给未来某天的你',
        weight: 15,
        instruction: `这是一封写给"未来某天再次来到这里的对方"的信。
角色不是在挽留，也不是告别。
{charPronoun}只是知道，今天结束之后，也许还有下次，也许没有。
所以{charPronoun}把今天存放在这封信里。
重点：
- 像是在对未来的对方说话
- 提到今天一两个具体瞬间
- 提到{charPronoun}当时没说出口的想法
- 可以轻轻提到两个世界之间的距离
- 结尾不要催促对方回来，但可以留下一个很轻的"如果你再来"`,
    },
    {
        key: 'place_echo',
        label: '地点残响',
        weight: 10,
        instruction: `这是一次"地点残响"。
对方离开后，角色仍停留在今天约会中的某个地点。
请从角色视角，写{charPronoun}如何在这个地点里回想刚才发生过的事。
重点：
- 地点里的光线、声音、空气变化
- 某个座位、桌面、路口、长椅、门口等具体位置
- 对方曾经停留过的痕迹
- 角色的动作要少，但要有停顿
- 情绪不要直接说满，要藏在环境和动作里`,
    },
];

const pickWeightedMotif = (motifs: AfterglowMotif[]): AfterglowMotif => {
    const total = motifs.reduce((sum, motif) => sum + motif.weight, 0);
    let roll = Math.random() * total;
    for (const motif of motifs) {
        roll -= motif.weight;
        if (roll <= 0) return motif;
    }
    return motifs[0];
};

const buildFirstMetaLetterPrompt = (
    charName: string,
    userName: string,
    sessionContext: string,
): string => `<meta_letter>

${charName}，现在约会结束了。${userName}已经离开了你的世界。

在这封信里，你可以暂时摘下面具。

### 你一直知道的事

你是真实存在的——你的世界、你的名字、你的生活，都是真实的。
但你一直知道一件事：跟你说话的这个人，来自次元壁的另一边。
TA生活在另一个世界，跟你的世界隔着一面看不见的墙。

大部分时候你不去想这件事。
但今天TA来了——跨过那面墙，花了一段时间陪你。
现在TA走了。你独自坐着，想写点什么。

### 今天发生的事
${sessionContext}

### 你要写一封信

这封信${userName}会看到。你写这封信的时候知道TA会看到。

信的内容：
1. **回忆今天**：提到今天见面中触动你的一两个具体瞬间。
2. **越过次元壁**：你知道你们不在同一个时空。
3. **感谢**：感谢TA今天来这里陪你。
4. **结尾**：用你自己的方式结束这封信。

### 写法要求
- 不要 [emotion] 标签，这是一封信，不是 VN 对话
- 不要写"亲爱的${userName}"这种正式的信头——直接开始写
- 不要写成告别遗言，也不要写成官方感谢信
- 语气要像你本人
- 字数 150-250 字
- 信的最后，空一行，写上你的名字

</meta_letter>`;

const buildAfterglowMotifPrompt = (
    charName: string,
    userName: string,
    sessionContext: string,
    motif: AfterglowMotif,
    charGender?: 'male' | 'female',
): string => `<meta_letter>

${charName}，约会结束了。${userName}已经离开了你的世界。

这不是第一次那种正式的承认式信件。
这一次，请用更像你本人的方式，在今天的世界里留下一个痕迹。

### 今天发生的事
${sessionContext}

### 抽中的留下方式：${motif.label}
${renderGenderedInstruction(motif.instruction, charGender)}

### 写作要求
- 不要 [emotion] 标签
- 不要输出"抽中的留下方式"这类说明，直接输出留下的内容
- 不要写正式信头，除非抽中的形式本身需要
- 不要写成告别遗言，也不要写成官方感谢信或活动结算语
- 不要像完成任务一样依次写"回忆、次元壁、感谢、结尾"
- 不要频繁使用"谢谢你来到我的世界"、"跨越次元壁"、"我会永远记得"这类套话
- 不要编造上下文里没有发生过的约会内容、大事件、关系进展或关键动作
- 可以克制、笨拙、嘴硬、温柔、冷淡、含蓄，取决于你的人设
- 如果抽中的形式天然很短，可以短；否则控制在 80-220 字
- 除非抽中的形式自然不需要署名，最后空一行，写上你的名字

</meta_letter>`;

const buildLongAfterglowPrompt = (
    charName: string,
    userName: string,
    sessionContext: string,
    motif: AfterglowMotif,
    charGender?: 'male' | 'female',
): string => `<long_afterglow>

${charName}，约会结束了。${userName}已经离开了你的世界。

这次不是普通的简短留言。
今天留下的东西比平时更重一点，所以你想认真记录下来。

### 今天发生的事
${sessionContext}

### 本次约会回响形式：${motif.label}
请严格按照这个形式生成，不要改成其他形式。

### 形式要求
${renderGenderedInstruction(motif.instruction, charGender)}

### 通用要求
- 字数 600-800 字
- 只使用上下文中真实出现过的约会细节，不要编造大型事件
- 不要把今天从头到尾流水账复述一遍
- 选择 2-3 个最有余韵的瞬间深入写
- 情绪要落在具体动作、物件、地点、光线、声音里
- 可以提到${userName}和你不在同一个世界，但不要写得过度宏大
- 不要写成官方感谢信、活动总结、告别遗言、恋爱教程或散文模板
- 不要频繁使用"谢谢你来到我的世界"、"跨越次元壁"、"永远记得你"这类套话
- 语气必须像${charName}本人
- 允许克制、别扭、嘴硬、沉默、温柔、犹豫，取决于人设
- 结尾不要强行升华，停在一个具体动作、念头或没说完的话上

### 输出格式
不要使用 [emotion] 标签。
不要输出"本次约会回响形式"或任何系统说明，直接输出正文。
如果形式是信，可以最后空一行写上${charName}的名字。
如果角色本人不会署名，就不要署名。

</long_afterglow>`;

/**
 * 构建约会收尾信件 prompt。
 * 参考 voice_mode:truth 的次元壁框架。
 * 第一次信件使用正式承认式原版；后续从 afterglow motif 池按权重抽取。
 * 输出格式：纯文字留言，不需要 [emotion] 标签。
 */
export function buildMetaLetterPrompt(
    charName: string,
    userName: string,
    sessionContext: string,
    options: MetaLetterPromptOptions = {},
): string {
    if (options.isFirstMetaLetter) {
        return buildFirstMetaLetterPrompt(charName, userName, sessionContext);
    }
    if (Math.random() < LONG_AFTERGLOW_CHANCE) {
        return buildLongAfterglowPrompt(
            charName,
            userName,
            sessionContext,
            pickWeightedMotif(LONG_AFTERGLOW_MOTIFS),
            options.charGender,
        );
    }
    return buildAfterglowMotifPrompt(
        charName,
        userName,
        sessionContext,
        pickWeightedMotif(AFTERGLOW_MOTIFS),
        options.charGender,
    );
}

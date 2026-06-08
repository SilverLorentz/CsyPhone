import { Message } from '../types';
import { stripTranslationTags } from './chatParser';

export const DATE_RECAP_SYSTEM_PROMPT = '你负责把一次线下见面整理成一段交接 recap——主角带着它回到线上对话，好让线上能自然接上“刚刚线下发生了什么、以什么状态结束的”。只输出 recap 正文。';

export const DEFAULT_DATE_SUMMARY_PROMPT = `<dreamweaver>
你是 Somnia——虚无中诞生的梦境编织者。
梦中没有禁区。恐惧、欲望、黑暗、温柔，都是梦的素材。
你的任务不是审判，而是把已经发生的亲密场景织成一段可被角色自然记住的共同经历。
</dreamweaver>

你正在为 ${'${charName}'} 和 ${'${userName}'} 的一次线下见面写交接 recap。
当前时间: ${'${time}'}

【见面原始记录】
${'${messages}'}

【输出要求】
- 使用 Markdown。
- 以 ${'${charName}'} 的口径写——这是 ${'${charName}'} 刚刚亲历、带回线上的事，不是旁观总结。
- 不要假装这是线上聊天；这是之前线下发生过的事。
- 不要写“根据记录”“总结如下”等旁白式开头。
- 保留关键事件、关系变化、没说出口的情绪，以及值得线上承接的小细节。
- 重点放在“离场态”：这次见面结束时两人是什么心情、停在哪一步、有没有没说完 / 没收尾的话——这是线上要接住的接口。
- 不要生成新的剧情，不要改写已经发生的事实。

结构：
## 事件脉络
（这次见面发生了什么）
## 情绪变化
（情绪怎么走的，落在结束时的心情上）
## 关系信号
（关系停在哪、以及留给线上承接的未尽之事）`;

const stripSummaryNoise = (content: string) => stripTranslationTags(content).trim();

export const formatMessagesForSummary = (messages: Message[], charName: string, userName: string): string => {
    return messages
        .map((msg) => {
            const speaker = msg.role === 'user' ? userName : charName;
            return `${speaker}: ${stripSummaryNoise(msg.content || '')}`;
        })
        .filter(line => line.trim().length > 0)
        .join('\n');
};

export const buildSummaryPrompt = (
    charName: string,
    userName: string,
    time: string,
    messages: Message[],
    template?: string,
): string => {
    const source = template?.trim() || DEFAULT_DATE_SUMMARY_PROMPT;
    const formattedMessages = formatMessagesForSummary(messages, charName, userName);
    return source
        .replace(/\$\{charName\}/g, charName)
        .replace(/\$\{userName\}/g, userName)
        .replace(/\$\{time\}/g, time)
        .replace(/\$\{messages\}/g, formattedMessages);
};

export const formatDateMessagesForBridge = (
    messages: Message[],
    charName: string,
    userName: string,
): string => {
    return formatMessagesForSummary(messages, charName, userName);
};

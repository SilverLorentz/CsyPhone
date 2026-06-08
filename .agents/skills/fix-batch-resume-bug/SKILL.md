---
name: fix-batch-resume-bug
description: 修复批量提取「中止→继续」卡死 + checkpoint 丢失 Bug
---

# 修复批量提取断点续续机制 Bug

> 涉及文件：`utils/vectorMemoryExtractor.ts` 和 `components/character/MemoryCenter.tsx`

## Bug 概述

中止批量提取后点击「继续提取」，进度条卡住或直接显示"没有生成新的可搜存向量记忆"。  
根因：`extractingChars` 并发锁被后台 `maybeExtract()` 抢占，导致 `batchExtractFromMessages` 返回 0。

---

## 修改 1: `utils/vectorMemoryExtractor.ts`

### 1a. 让 batch 模式在锁冲突时等待而非静默返回

找到 `batchExtractFromMessages` 方法开头的锁检查（约 L640）：

```typescript
if (extractingChars.has(charId)) {
    console.log('🧠 [VectorExtract] Batch: already extracting for', charId, '— skipping');
    return 0;
}
extractingChars.add(charId);
```

替换为：

```typescript
// batch 模式优先级高于 auto — 等待 auto 完成后再执行
if (extractingChars.has(charId)) {
    console.log('🧠 [VectorExtract] Batch: auto-extract in progress, waiting up to 5s...');
    const waitStart = Date.now();
    while (extractingChars.has(charId) && Date.now() - waitStart < 5000) {
        if (signal?.aborted) throw new DOMException('Batch extraction aborted', 'AbortError');
        await new Promise(r => setTimeout(r, 500));
    }
    if (extractingChars.has(charId)) {
        console.warn('🧠 [VectorExtract] Batch: force-acquiring lock (auto-extract too slow)');
    }
}
extractingChars.add(charId);
```

### 1b. 让窗口间 3s 延迟可被 abort 中止

找到窗口间延迟代码（约 L771）：

```typescript
if (w < windows.length - 1 && !signal?.aborted) {
    await new Promise(r => setTimeout(r, 3000));
}
```

替换为：

```typescript
if (w < windows.length - 1 && !signal?.aborted) {
    await new Promise<void>(r => {
        const timer = setTimeout(r, 3000);
        if (signal) {
            const onAbort = () => { clearTimeout(timer); r(); };
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}
```

---

## 修改 2: `components/character/MemoryCenter.tsx`

### 2a. batch 返回 0 时保留 checkpoint

找到 `handleBatchChat` 的 try 成功分支（约 L435）：

```typescript
syncBatchCheckpoint(null);
if (total > 0) {
    addToast(`批量提取完成，共新增或更新 ${total} 条向量记忆`, 'success');
    return;
}

addToast('本轮提取完成，但没有生成新的可搜存向量记忆', 'info');
return;
```

替换为：

```typescript
if (total > 0) {
    syncBatchCheckpoint(null);
    addToast(`批量提取完成，共新增或更新 ${total} 条向量记忆`, 'success');
    return;
}

// total === 0: 可能是锁冲突导致的 early return，保留 checkpoint 以便重试
if (latestCheckpoint && latestCheckpoint.nextStartIdx <= latestCheckpoint.rangeEndIdx) {
    syncBatchCheckpoint(withCheckpointStatus(latestCheckpoint, 'paused'));
    addToast('提取暂未完成（可能与自动提取冲突），请稍后重试', 'info');
} else {
    syncBatchCheckpoint(null);
    addToast('本轮提取完成，但没有生成新的可搜存向量记忆', 'info');
}
return;
```

### 2b. 点击「继续/开始」后立即显示加载状态

找到 `handleBatchChat` 中设置状态的位置（约 L395-397）：

```typescript
setIsBatching(true);
setIsAborting(false);
setBatchProgress('');
```

替换为：

```typescript
setIsBatching(true);
setIsAborting(false);
setBatchProgress('正在加载消息记录…');
```

---

## 验证

修改完成后跑 `npm run build`（或 `npx tsc --noEmit`）确认无 TypeScript 编译错误。

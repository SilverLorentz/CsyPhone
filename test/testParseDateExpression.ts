import { parseDateExpression,segmentWords } from '../utils/parseDateExpression';

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function test(_label: string, input: string) {
  const r = parseDateExpression(input);
  if (r) {
    console.log(`✅ "${input}" => ${fmt(r.start)}  ~  ${fmt(r.end)}`);
  } else {
    console.log(`❌ "${input}" => null`);
  }
}

console.log('=== 相对月份 ===');
test('上个月', '上个月');
test('上月', '上月');
test('前两个月', '前两个月');
test('前三个月', '前三个月');
test('这个月', '这个月');
test('本月', '本月');

console.log('\n=== 季节 ===');
test('去年夏天', '去年夏天');
test('今年冬天', '今年冬天');
test('春天', '春天');
test('2024年秋天', '2024年秋天');

console.log('\n=== 节日 ===');
test('过年', '过年');
test('春节', '春节');
test('去年春节', '去年春节');
test('情人节', '情人节');
test('圣诞', '圣诞');
test('去年圣诞', '去年圣诞');
test('中秋', '中秋');
test('元旦', '元旦');

console.log('\n=== 绝对月份 ===');
test('去年三月', '去年三月');
test('2024年5月', '2024年5月');
test('今年十二月', '今年十二月');

console.log('\n=== 模糊时间 ===');
test('年初', '年初');
test('去年年底', '去年年底');
test('年末', '年末');
test('年中', '年中');
test('2024年年中', '2024年年中');

console.log('\n=== 无效 ===');
test('今天天气不错', '今天天气不错');
test('你好', '你好');

console.log('\n=== segmentWords ===');
console.log(segmentWords('去年夏天我们一起去看海'));
console.log(segmentWords('2024年春节'));
console.log(segmentWords('上个月的事情'));

export function parsePageRange(text:string,total:number):number[] {
  if(!text.trim()) return Array.from({length:total},(_,i)=>i+1);
  const result:number[]=[];
  for(const token of text.split(',')) {
    if(!/^\s*\d+(\s*-\s*\d+)?\s*$/.test(token)) throw new Error('예: 1-3, 5');
    const [start,end=start]=token.trim().split('-').map(Number);
    if(start<1||end>total||start>end) throw new Error(`페이지 범위는 1~${total}입니다.`);
    for(let n=start;n<=end;n++) if(!result.includes(n)) result.push(n);
  }
  return result;
}

import { useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
interface Props {label:string;value:number;min:number;max:number;step?:number;unit?:string;color?:string;onChange:(value:number)=>void;}
export function NumericDial({label,value,min,max,step=1,unit='px',color='currentColor',onChange}:Props) {
 const point=useRef<HTMLButtonElement>(null);
 const change=(value:number)=>onChange(Math.max(min,Math.min(max,Math.round(value*100)/100)));
 useEffect(()=>{const node=point.current;if(!node)return;const wheel=(event:WheelEvent)=>{event.preventDefault();onChange(Math.max(min,Math.min(max,Math.round((value+(event.deltaY<0?step:-step))*100)/100)));};node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);},[value,min,max,step,onChange]);
 return <div className="numeric-dial" title={label}><button ref={point} type="button" className="dial-dot" aria-label={`${label} · 마우스 휠로 조절`} title={`${label}: 점 위에서 마우스 휠로 조절`}><span style={{width:Math.min(16,Math.max(4,value/4+3)),height:Math.min(16,Math.max(4,value/4+3)),background:color}}/></button><input type="number" aria-label={label} value={value} min={min} max={max} step={step} onChange={e=>{if(e.target.value!==''&&Number.isFinite(e.target.valueAsNumber))change(e.target.valueAsNumber);}}/><span className="dial-steppers"><button type="button" aria-label={`${label} 증가`} title="증가" disabled={value>=max} onClick={()=>change(value+step)}><ChevronUp size={10}/></button><button type="button" aria-label={`${label} 감소`} title="감소" disabled={value<=min} onClick={()=>change(value-step)}><ChevronDown size={10}/></button></span><small>{unit}</small></div>;
}

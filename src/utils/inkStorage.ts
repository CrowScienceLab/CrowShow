// Large ink belongs in IndexedDB, never the small synchronous settings store.
let database:Promise<IDBDatabase>|undefined;
function open():Promise<IDBDatabase> {
 return database??=new Promise((resolve,reject)=>{const request=indexedDB.open('crowshow_ink',1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=undefined;reject(request.error)}});
}
export async function readInk<T>(key:string):Promise<T|null> {
 const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readonly'),request=tx.objectStore('records').get(key);request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error)});
}
async function write(key:string,value:unknown):Promise<void> {
 const db=await open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('자동 저장 중단'))});
}
type Pending={value:unknown;done?:(error?:unknown)=>void};
const pending=new Map<string,Pending>();let timer:ReturnType<typeof setTimeout>|undefined;let running:Promise<void>|undefined;
const failed=new Map<string,Pending>();
export function queueInk(key:string,value:unknown,done?:(error?:unknown)=>void) {
 pending.set(key,{value,done});if(!timer)timer=setTimeout(()=>void flushInk(),800);
}
export async function flushInk(strict=false):Promise<void> {
 if(strict)for(const [key,item] of failed)if(!pending.has(key))pending.set(key,item);
 if(timer){clearTimeout(timer);timer=undefined}
 if(!running)running=(async()=>{while(pending.size){const batch=[...pending];pending.clear();for(const [key,item] of batch){try{await write(key,item.value);failed.delete(key);item.done?.()}catch(error){failed.set(key,item);item.done?.(error)}}}})().finally(()=>{running=undefined});await running;
 if(strict&&failed.size)throw new Error('자동 저장을 완료하지 못했습니다. Notebook 또는 프로젝트 파일로 백업한 후 다시 종료하세요.');
}
// Copy legacy data transactionally before reclaiming its small localStorage slot.
export async function loadInk<T>(key:string,legacyKey:string):Promise<T|null> {
 await flushInk();
 if(failed.has(key))return failed.get(key)!.value as T;
 const existing=await readInk<T>(key);if(existing!==null)return existing;
 const legacy=localStorage.getItem(legacyKey);if(!legacy)return null;
 const value=JSON.parse(legacy) as T;await write(key,value);await write('legacy/'+legacyKey,legacy);localStorage.removeItem(legacyKey);return value;
}

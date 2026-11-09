export function downloadBytes(data:Uint8Array|string,name:string,type:string) {
  const blob=new Blob([typeof data==='string'?data:new Uint8Array(data)],{type});
  const url=URL.createObjectURL(blob); const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function encodePdf(bytes:Uint8Array) { let result=''; for(let i=0;i<bytes.length;i+=32768) result+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(result); }
export function decodePdf(base64:string) {return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}

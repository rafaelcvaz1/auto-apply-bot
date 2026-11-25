/** Decode common HTML entities before stripping markup, including escaped feeds. */
export function plain(value: unknown): string {
  let text=String(value??'');
  const named: Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  for(let i=0;i<2;i++) text=text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,key:string)=>{
    if(key[0]!=='#') return named[key.toLowerCase()]??' ';
    const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
    return n>0 && n<=0x10ffff ? String.fromCodePoint(n) : ' ';
  });
  return text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/(p|li|div|h[1-6])\s*>/gi,'. ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}

// Read-only public HTTP audit. Writes evidence only; does not change the website.
import fs from 'node:fs';
const out = 'docs/seo-audit-2026-10-16';
fs.mkdirSync(out, { recursive: true });
async function read(url) {
  const start = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
    return { requested: url, final: r.url, status: r.status, ms: Date.now()-start, html: await r.text(), robotsHeader: r.headers.get('x-robots-tag') };
  } catch(e) { return {requested:url,error:e.cause?.code || e.message}; }
}
const sitemap = await read('https://thetohfa.in/sitemap.xml');
fs.writeFileSync(out+'/live-sitemap.xml', sitemap.html || JSON.stringify(sitemap));
const urls = [...(sitemap.html || '').matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
const extra = ['/robots.txt','/feeds/google-merchant.xml','/corporate-gifts','/bridal-gifts','/this-page-does-not-exist-seo-audit'];
const queue = [...new Set([...urls,...extra.map(x=>'https://thetohfa.in'+x)])];
const results=[];
await Promise.all(Array.from({length:4},async()=>{while(queue.length){const url=queue.shift();const r=await read(url);const h=r.html||'';const schemas=[...h.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)].map(m=>{try{return JSON.parse(m[1]);}catch(e){return {error:e.message};}});const row={...r,html:undefined,bytes:Buffer.byteLength(h),title:h.match(/<title>(.*?)<\/title>/s)?.[1],canonical:h.match(/rel=["']canonical["'][^>]*href=["']([^"']+)/)?.[1],h1:[...h.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m=>m[1].replace(/<[^>]+>/g,'').trim()),schemas,productLinks:[...h.matchAll(/href=["']([^"']*\/products\/[^"']*)/g)].map(m=>m[1])};results.push(row);if(urls.indexOf(url)<2||url.includes('/products/')&& !fs.existsSync(out+'/sample-product.html')||extra.some(x=>url.endsWith(x))){fs.writeFileSync(out+'/'+(url.includes('/products/')?'sample-product.html':new URL(url).pathname.replace(/\//g,'_')||'homepage')+'.txt',h);} }}));
fs.writeFileSync(out+'/live-crawl.json',JSON.stringify({auditDate:'2026-10-16',sitemapCount:urls.length,results},null,2));
console.log(JSON.stringify({sitemapCount:urls.length,checked:results.length,statuses:results.reduce((a,r)=>(a[r.status||r.error]=(a[r.status||r.error]||0)+1,a),{}),non200:results.filter(r=>r.status!==200).map(r=>({url:r.requested,status:r.status,error:r.error})),home:results.find(r=>r.requested==='https://thetohfa.in/'),sampleProduct:results.find(r=>r.requested.includes('/products/')),seller:results.filter(r=>r.requested.includes('/seller/')).map(r=>({url:r.requested,status:r.status,canonical:r.canonical})),feed:results.find(r=>r.requested.includes('/feeds/'))},null,2));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
const out='docs/seo-audit-2026-10-16';
const crawl=JSON.parse(fs.readFileSync(out+'/live-crawl.json','utf8'));
const targets=process.argv.includes('--landing') ? ['https://www.thetohfa.in/customized-gifts','https://www.thetohfa.in/handmade-gifts'] : ['/products/','/seller/','/category/'].map(prefix=>crawl.results.find(r=>new URL(r.requested).pathname.startsWith(prefix)).final);
const browser=await puppeteer.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,userDataDir:fs.mkdtempSync(path.join(os.tmpdir(),'tohfa-seo-'))});
const results=[];
try {for(const url of targets){const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'networkidle2',timeout:30000}).catch(e=>errors.push(e.message));await new Promise(r=>setTimeout(r,2000));const result={requested:url,final:page.url(),...(await page.evaluate(()=>({title:document.title,canonical:document.querySelector('link[rel=canonical]')?.href,h1:[...document.querySelectorAll('h1')].map(e=>e.innerText),gridChildren:document.querySelector('#productsGrid')?.children.length,includeContainers:[...document.querySelectorAll('[data-include]')].map(e=>({path:e.getAttribute('data-include'),children:e.children.length})),body:document.body.innerText.slice(0,1600)}))),errors};results.push(result);console.log(JSON.stringify(result));await page.close();}}finally{await browser.close();fs.writeFileSync(out+(process.argv.includes('--landing')?'/landing-browser-check.json':'/browser-check.json'),JSON.stringify(results,null,2));}

const { chromium } = require('/mnt/Dados/01-ideias/handy/node_modules/playwright');
const fs=require('fs');
const BASE='/tmp/claude-1000/-mnt-Dados-01-ideias-central-prospeccao/c914be3e-abbb-4e46-b6e5-deaff6e43864/scratchpad';
const EXEC=process.env.HOME+'/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

const SITES={
 sulivam:{pages:['https://sulivam.com/','https://sulivam.com/blog','https://sulivam.com/work-with-us','https://sulivam.com/amazon-ses-how-to-send-emails-at-scale-with-aws-safely-and-economically/','https://sulivam.com/how-much-does-it-cost-to-maintain-an-app-servers-security-and-support-in-practice/','https://sulivam.com/categorias/artificial-intelligence/']},
 fragoso:{pages:['https://fragoso.com.br/en/','https://fragoso.com.br/en/the-firm/','https://fragoso.com.br/en/our-practice/','https://fragoso.com.br/en/professionals/','https://fragoso.com.br/en/news/','https://fragoso.com.br/en/our-history/']},
 strobel:{pages:['https://strobelcapitalista.com/en/','https://strobelcapitalista.com/en/usa/','https://strobelcapitalista.com/en/llc-americana/']},
 avhubtech:{pages:['https://avhubtech.com/','https://avhubtech.com/about-us/','https://avhubtech.com/brands/','https://avhubtech.com/services/','https://avhubtech.com/news-events/']},
};

const CLEAN=`
  [class*="whatsapp" i],[id*="whatsapp" i],[class*="chat" i][class*="widget" i],
  iframe[src*="tawk" i],iframe[src*="crisp" i],iframe[src*="jivo" i],iframe[title*="chat" i],
  [class*="jivo" i],[id*="jivo" i],[class*="tawk" i],[id*="tawk" i],[class*="crisp" i],[id*="crisp" i],
  [class*="pojo-a11y" i],[id*="pojo-a11y" i],[class*="userway" i],[id*="userway" i],
  [class*="back-to-top" i],[class*="scroll-top" i],[class*="go-top" i]{display:none !important}
  *{animation:none !important;transition:none !important}
`;
const KILL=`(()=>{
 const isCookie=el=>/cookie|consent|lgpd|gdpr/i.test((el.className||'')+' '+(el.id||''));
 for(const el of document.querySelectorAll('body *')){
  const cs=getComputedStyle(el);
  if(cs.position!=='fixed'&&cs.position!=='sticky')continue;
  const r=el.getBoundingClientRect();
  if(!r.width||!r.height)continue;
  // aviso de cookie: some mesmo que seja largo, desde que seja faixa fixa
  if(isCookie(el)&&r.height<innerHeight*.5){el.style.setProperty('display','none','important');continue;}
  if(r.width>innerWidth*.55||r.height>innerHeight*.55)continue;
  if(r.bottom>innerHeight-180&&(r.left<190||r.right>innerWidth-190))el.style.setProperty('display','none','important');
 }})()`;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
 const name=process.argv[2]; const site=SITES[name];
 const dir=`${BASE}/shots/${name}`; fs.mkdirSync(dir,{recursive:true});
 const browser=await chromium.launch({executablePath:EXEC});

 for(const mode of [{tag:'desk',vp:{width:1600,height:900},max:5200},{tag:'mob',vp:{width:430,height:900},max:4200,dpr:2},{tag:'tab',vp:{width:834,height:1120},max:4600,dpr:1.6}]){
  const ctx=await browser.newContext({viewport:mode.vp,deviceScaleFactor:mode.dpr||1,isMobile:mode.vp.width<600,hasTouch:mode.vp.width<600});
  const page=await ctx.newPage();
  let i=0;
  for(const url of site.pages){
   i++;
   try{
     await page.goto(url,{waitUntil:'load',timeout:45000});
     await page.addStyleTag({content:CLEAN}).catch(()=>{});
     await sleep(3200);
     // passa por todo o conteudo pra carregar imagens preguicosas
     let h=0;
     for(let t=0;t<6;t++){ h=await page.evaluate(()=>Math.max(document.body.scrollHeight||0,document.documentElement.scrollHeight||0,document.querySelector('main,#main,.site-main')?.scrollHeight||0)); if(h>1200)break; await sleep(800); }
     for(let y=0;y<Math.min(h,mode.max);y+=600){ await page.evaluate(v=>window.scrollTo(0,v),y); await sleep(170); }
     await page.evaluate(()=>window.scrollTo(0,0)); await sleep(700);
     await page.addStyleTag({content:CLEAN}).catch(()=>{});
     await page.evaluate(KILL).catch(()=>{});
     await sleep(400);
     const clipH=Math.max(mode.vp.height, Math.min(h||mode.vp.height, mode.max));
     await page.setViewportSize({width:mode.vp.width,height:clipH});
     await sleep(900);
     await page.addStyleTag({content:CLEAN}).catch(()=>{});
     await page.evaluate(KILL).catch(()=>{});
     await sleep(350);
     await page.screenshot({path:`${dir}/${mode.tag}-${String(i).padStart(2,'0')}.png`});
     await page.setViewportSize(mode.vp);
     console.log('  ',mode.tag,i,url.replace(/https?:\/\/[^/]+/,'')||'/','h='+clipH);
   }catch(e){ console.log('  ',mode.tag,i,url,'ERRO',e.message.slice(0,50)); }
  }
  await ctx.close();
 }
 await browser.close(); console.log(name,'shots ok');
})();

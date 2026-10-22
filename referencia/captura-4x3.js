// Capturas em portugues para o portfolio da Workana.
// Padrao da Workana: screenshot limpo de uma tela, 4:3, sem moldura e sem legenda.
const { chromium } = require('/mnt/Dados/01-ideias/handy/node_modules/playwright');
const fs = require('fs');
const OUT = '/mnt/Dados/01-ideias/central-prospeccao/saidas/videos/wk-pt';
const EXEC = process.env.HOME + '/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

const SITES = {
  sulivam: [
    'https://sulivam.com.br/',
    'https://sulivam.com.br/sistemas-personalizados',
    'https://sulivam.com.br/apps',
    'https://sulivam.com.br/design-ui-ux',
    'https://sulivam.com.br/blog',
    'https://sulivam.com.br/trabalhe-conosco',
  ],
  fragoso: [
    'https://fragoso.com.br/',
    'https://fragoso.com.br/o-escritorio/',
    'https://fragoso.com.br/nossa-atuacao/',
    'https://fragoso.com.br/profissionais/',
    'https://fragoso.com.br/noticias/',
    'https://fragoso.com.br/nossa-historia/',
  ],
  strobel: [
    'https://strobelcapitalista.com/',
    'https://strobelcapitalista.com/usa/',
    'https://strobelcapitalista.com/llc/',
    'https://strobelcapitalista.com/espanha/',
    'https://strobelcapitalista.com/paraguai-ou-uruguai/',
  ],
  avhub: [
    'https://avhubtech.com/pt-br/',
    'https://avhubtech.com/pt-br/sobre-nos/',
    'https://avhubtech.com/pt-br/marcas/',
    'https://avhubtech.com/pt-br/solucoes/',
    'https://avhubtech.com/pt-br/noticias-eventos/',
  ],
};

const CLEAN = `
  [class*="whatsapp" i],[id*="whatsapp" i],[class*="chat" i][class*="widget" i],
  iframe[src*="tawk" i],iframe[src*="crisp" i],iframe[src*="jivo" i],iframe[title*="chat" i],
  [class*="jivo" i],[id*="jivo" i],[class*="tawk" i],[id*="tawk" i],[class*="crisp" i],[id*="crisp" i],
  [class*="pojo-a11y" i],[id*="pojo-a11y" i],[class*="userway" i],[id*="userway" i],
  [class*="back-to-top" i],[class*="scroll-top" i],[class*="go-top" i]{display:none !important}
  *{animation:none !important;transition:none !important}
`;

// Remove faixas fixas (cookie, barras flutuantes) sem derrubar o layout do site.
const KILL = `(()=>{
 const isCookie=el=>/cookie|consent|lgpd|gdpr/i.test((el.className||'')+' '+(el.id||''));
 for(const el of document.querySelectorAll('body *')){
  const cs=getComputedStyle(el);
  if(cs.position!=='fixed'&&cs.position!=='sticky')continue;
  const r=el.getBoundingClientRect();
  if(!r.width||!r.height)continue;
  if(isCookie(el)&&r.height<innerHeight*.5){el.style.setProperty('display','none','important');continue;}
  if(r.width>innerWidth*.55||r.height>innerHeight*.55)continue;
  if(r.bottom>innerHeight-180&&(r.left<190||r.right>innerWidth-190))el.style.setProperty('display','none','important');
 }})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const name = process.argv[2];
  const pages = SITES[name];
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXEC });
  // 4:3 — a proporcao que a Workana aceita
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await ctx.newPage();

  let i = 0;
  for (const url of pages) {
    i++;
    const file = `${OUT}/${name}-${String(i).padStart(2, '0')}.jpg`;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.addStyleTag({ content: CLEAN }).catch(() => {});
      await sleep(3000);
      // passa pelo conteudo pra disparar imagens preguicosas, depois volta ao topo
      for (let y = 0; y < 3600; y += 600) {
        await page.evaluate((v) => window.scrollTo(0, v), y);
        await sleep(160);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(800);
      await page.addStyleTag({ content: CLEAN }).catch(() => {});
      await page.evaluate(KILL).catch(() => {});
      await sleep(400);
      await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
      console.log('ok  ', file, url);
    } catch (e) {
      console.log('FALHOU', url, e.message.split('\n')[0]);
    }
  }
  await browser.close();
})();

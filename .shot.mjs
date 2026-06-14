import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const PORT = process.env.PORT || 8099;
const base = `http://localhost:${PORT}/`;

// ---- mock data so the UI renders without network ----
const cats = [["news","News"],["sports","Sports"],["movies","Movies"],["music","Music"],["entertainment","Entertainment"],["kids","Kids"],["documentary","Documentary"]];
const countries = [["US","United States","🇺🇸"],["GB","United Kingdom","🇬🇧"],["CA","Canada","🇨🇦"],["DE","Germany","🇩🇪"],["JP","Japan","🇯🇵"],["BR","Brazil","🇧🇷"]];
const names = ["Bloomberg","Fox Sports","NASA TV","MTV Live","Cartoon Hub","Cinema Noir","Red Bull TV","Sky News","Pluto Movies","Jazz 24","Anime X","Stadium","Euronews","Classic Films","Kids Zone","Tech Today","Nature HD","Comedy Central","Samsung Music","Pop Hits"];
const chans = names.map((n,i)=>({
  id:`ch${i}`, name:n, logo:"", country:countries[i%countries.length][0],
  categories:[cats[i%cats.length][0]], is_nsfw:false, network: i%2?"Samsung TV Plus":"Pluto TV"
}));
const streams = chans.map(c=>({channel:c.id, url:`https://example.com/${c.id}.m3u8`}));
const catsJson = cats.map(([id,name])=>({id,name}));
const countriesJson = countries.map(([code,name,flag])=>({code,name,flag}));

const routes = {
  'channels.json': chans, 'streams.json': streams, 'categories.json': catsJson, 'countries.json': countriesJson,
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function shoot(name, {width,height,isMobile}, steps) {
  const ctx = await browser.newContext({ viewport:{width,height}, deviceScaleFactor:2, isMobile, hasTouch:isMobile });
  const page = await ctx.newPage();
  await page.route('**/*', (route)=>{
    const u = route.request().url();
    for (const k in routes) if (u.includes(k)) return route.fulfill({ contentType:'application/json', body: JSON.stringify(routes[k]) });
    if (u.endsWith('.m3u8')) return route.fulfill({ contentType:'application/vnd.apple.mpegurl', body:'#EXTM3U' });
    if (u.includes('hls.js')) return route.fulfill({ contentType:'application/javascript', body:'window.Hls=undefined;' });
    if (u.startsWith(base) || u.includes('localhost')) return route.continue();
    if (/\.(png|jpg|jpeg|svg|webp|gif)/.test(u)) return route.fulfill({ status:404, body:'' });
    return route.fulfill({ status:204, body:'' });
  });
  await page.goto(base, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (steps) await steps(page);
  await page.screenshot({ path:`/home/user/IPTV/.shots/${name}.png` });
  await ctx.close();
}

await shoot('home-mobile', {width:390,height:844,isMobile:true});
await shoot('home-desktop', {width:1280,height:840,isMobile:false});
await shoot('grid-desktop', {width:1280,height:840,isMobile:false}, async (p)=>{ await p.click('[data-view="categories"]').catch(()=>{}); await p.waitForTimeout(1200); });

await browser.close();
console.log('done');

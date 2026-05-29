function json(data, status=200){
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json','access-control-allow-origin':'*','cache-control':'no-store'}});
}
function dateIST(d=new Date()){return new Date(d).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});}
function timeIST(d=new Date()){return new Date(d).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
function dtIST(d=new Date()){return new Date(d).toLocaleString('sv-SE',{timeZone:'Asia/Kolkata'}).replace('T',' ');}
function slotFromTime(t){const m=String(t||'').match(/(\d{1,2}):(\d{2})/);if(!m)return null;return String(+m[1]).padStart(2,'0')+':'+(+m[2]<30?'00':'30');}
function slotFromDate(d){return slotFromTime(timeIST(d));}
function fToC(f){return f!=null&&f!==''&&!Number.isNaN(Number(f))?+((Number(f)-32)*5/9).toFixed(1):null;}
function n(v){if(v==null||v===''||v==='M')return null;const x=Number(v);return Number.isFinite(x)?x:null;}
function s(v){return v==null?'':String(v);}
function first(...v){return v.find(x=>x!==undefined&&x!==null&&x!=='');}
function hash(str){let h=0;str=String(str||'');for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}return String(h);}
async function getJson(url){
  const r=await fetch(url,{headers:{'user-agent':'VILK-Cloudflare-D1/1.0','accept':'application/json,*/*'}});
  const t=await r.text();
  if(!r.ok) throw new Error(r.status+': '+t.slice(0,180));
  return JSON.parse(t);
}
function parseWU(d){
 const root=Array.isArray(d?.observations)?d.observations[0]:(d?.observation||d||{}), imp=root.imperial||{}, met=root.metric||{}, metric=!!root.metric&&!root.imperial;
 const temp=first(imp.temp,root.temperature,root.temp,met.temp), dew=first(imp.dewpt,root.temperatureDewPoint,root.dewpt,met.dewpt), wind=first(imp.windSpeed,root.windSpeed,met.windSpeed);
 const peak=first(imp.temperatureMaxSince7Am,root.temperatureMaxSince7Am,root.tempMaxSince7Am,root.temperatureMax24Hour,met.temperatureMaxSince7Am,met.tempMaxSince7Am);
 const epoch=first(root.validTimeUtc,root.obsTimeUtc,root.epoch,'');let od=null;if(epoch!==''){const x=Number(epoch);if(!Number.isNaN(x))od=new Date(x>9999999999?x:x*1000);}if(!od)od=new Date();
 return {obs_date:dateIST(od),obs_time:timeIST(od),slot:slotFromDate(od),temp_c:metric?n(temp):fToC(temp),dewpoint_c:metric?n(dew):fToC(dew),peak_since_7am_c:metric?n(peak):fToC(peak),humidity:first(root.relativeHumidity,imp.relativeHumidity,root.humidity,imp.humidity,null),wind_kph:metric?n(wind):(wind!=null?+(Number(wind)*1.60934).toFixed(1):null),condition:first(root.wxPhraseLong,root.wxPhraseShort,root.phrase,root.cloudCoverPhrase,''),source:first(root.stationID,root.stationId,root.icaoCode,'VILK')};
}
function parseForecast(fc){
 const maxF=fc?.temperatureMax||fc?.calendarDayTemperatureMax||[], maxM=fc?.metric?.temperatureMax||[], rain=fc?.daypart?.[0]?.precipChance||[], phr=fc?.daypart?.[0]?.wxPhraseShort||fc?.daypart?.[0]?.wxPhraseLong||[];
 const maxC=[0,1,2,3,4].map(i=>maxF[i]!=null?fToC(maxF[i]):(maxM[i]!=null?n(maxM[i]):null));
 return {forecast_date:dateIST(),fetched_at:timeIST(),today_c:maxC[0],tmr_c:maxC[1],d2_c:maxC[2],d3_c:maxC[3],d4_c:maxC[4],rain_pct:rain[0]??rain[1]??null,phrase:phr[0]||phr[1]||'',raw_hash:hash(JSON.stringify({maxC,r:rain[0],p:phr[0]}))};
}
async function collect(env){
 const out={ok:true,today_ist:dateIST()};
 const WU_KEY=env.WU_KEY||'e1f10a1e78da46f5b10a1e78da96f525', ICAO=env.WU_ICAO||'VILK', IATA=env.WU_IATA||'LKO', GEO=env.WU_GEOCODE||'26.738,80.857';

 try{
  let data=null;
  for(const u of [
    `https://api.weather.com/v3/wx/observations/current?icaoCode=${ICAO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,
    `https://api.weather.com/v3/wx/observations/current?iataCode=${IATA}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,
    `https://api.weather.com/v3/wx/observations/current?geocode=${GEO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`
  ]){try{data=await getJson(u);break;}catch(e){}}
  const o=parseWU(data||{});
 // WU obs_time is the real Weather.com observation timestamp.
// Same obs_time = cached/repeated observation -> skip.
// New obs_time = save, even if temp is exactly the same.

const ex = await env.DB.prepare(
  "SELECT id FROM wu_obs WHERE obs_date=? AND obs_time=? LIMIT 1"
).bind(
  o.obs_date,
  o.obs_time
).first();

if(ex){
  out.wu = {
    ok:true,
    saved:false,
    duplicate:true,
    reason:"same WU obs_time cached/repeated",
    temp:o.temp_c,
    obsTime:o.obs_time,
    slot:o.slot
  };
}else{
  await env.DB.prepare(
    `INSERT INTO wu_obs
    (obs_date,obs_time,slot,temp_c,dewpoint_c,peak_since_7am_c,humidity,wind_kph,condition,source,fetched_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    o.obs_date,
    o.obs_time,
    o.slot,
    o.temp_c,
    o.dewpoint_c,
    o.peak_since_7am_c,
    o.humidity,
    o.wind_kph,
    o.condition,
    o.source,
    timeIST()
  ).run();

  out.wu = {
    ok:true,
    saved:true,
    duplicate:false,
    reason:"new WU obs_time",
    temp:o.temp_c,
    obsTime:o.obs_time,
    slot:o.slot
  };
}
 }catch(e){out.wu={ok:false,error:e.message};}

 try{
  let data=null;
  for(const u of [
    `https://api.weather.com/v3/wx/forecast/daily/5day?icaoCode=${ICAO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,
    `https://api.weather.com/v3/wx/forecast/daily/5day?iataCode=${IATA}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,
    `https://api.weather.com/v3/wx/forecast/daily/5day?geocode=${GEO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`
  ]){try{data=await getJson(u);break;}catch(e){}}
  const fc=parseForecast(data||{});
  const ex=await env.DB.prepare("SELECT id FROM forecast WHERE forecast_date=? AND raw_hash=? LIMIT 1").bind(fc.forecast_date,fc.raw_hash).first();
  if(ex) out.forecast={ok:true,saved:false,duplicate:true,today_c:fc.today_c};
  else{
    await env.DB.prepare(`INSERT INTO forecast (forecast_date,fetched_at,today_c,tmr_c,d2_c,d3_c,d4_c,rain_pct,phrase,raw_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(fc.forecast_date,fc.fetched_at,fc.today_c,fc.tmr_c,fc.d2_c,fc.d3_c,fc.d4_c,fc.rain_pct,fc.phrase,fc.raw_hash).run();
    out.forecast={ok:true,saved:true,duplicate:false,today_c:fc.today_c};
  }
 }catch(e){out.forecast={ok:false,error:e.message};}

 try{
  const r=await fetch('https://aviationweather.gov/api/data/metar?ids=VILK&format=json&hours=12');
  const arr=await r.json(); let saved=0,duplicate=0,skipped=0;
  for(const m of (Array.isArray(arr)?arr:[])){
    const raw=m.rawOb||''; if(!raw) continue;
    const d=m.obsTime?new Date(+m.obsTime*1000):null; if(!d||isNaN(d)){skipped++;continue;}
    const ex=await env.DB.prepare("SELECT id FROM metar WHERE raw_metar=? LIMIT 1").bind(raw).first();
    if(ex){duplicate++;continue;}
    await env.DB.prepare(`INSERT INTO metar (obs_date,valid_utc,valid_ist,slot,raw_metar,temp_c,dewpoint_c,wind_kt,wind_dir,visibility,wx,nosig,becmg,tempo,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(dateIST(d),d.toISOString(),dtIST(d),slotFromDate(d),raw,n(m.temp),n(m.dewp),n(m.wspd),s(m.wdir),s(m.visib),s(m.wxString),/\bNOSIG\b/i.test(raw)?1:0,/\bBECMG\b/i.test(raw)?1:0,/\bTEMPO\b/i.test(raw)?1:0,timeIST()).run();
    saved++;
  }
  out.metar={ok:true,saved,duplicate,skipped,seen:Array.isArray(arr)?arr.length:0};
 }catch(e){out.metar={ok:false,error:e.message};}
 return out;
}
async function history(env, day){
 const wu=await env.DB.prepare("SELECT * FROM wu_obs WHERE obs_date=? ORDER BY created_at ASC LIMIT 3000").bind(day).all();
 const mt=await env.DB.prepare("SELECT * FROM metar WHERE obs_date=? ORDER BY valid_utc ASC LIMIT 2000").bind(day).all();
 const fc=await env.DB.prepare("SELECT * FROM forecast WHERE forecast_date=? ORDER BY created_at ASC LIMIT 500").bind(day).all();
 const rows={};
 for(const x of (wu.results||[])){if(!x.slot)continue; rows[x.slot]=rows[x.slot]||[]; rows[x.slot].push({temp_c:x.temp_c,humidity:x.humidity,wind_kph:x.wind_kph,condition:x.condition||'',saved_at:x.obs_time,fetched_at:x.fetched_at||''});}
 return {ok:true,today_ist:day,wu_obs_rows:rows,metar_rows:mt.results||[],forecast_rows:fc.results||[],meta:{wu_count:(wu.results||[]).length,metar_count:(mt.results||[]).length,forecast_count:(fc.results||[]).length,latest_wu:(wu.results||[]).at(-1)||null,latest_metar:(mt.results||[]).at(-1)||null,latest_forecast:(fc.results||[]).at(-1)||null}};
}
export default {
 async fetch(request, env){
  const url=new URL(request.url);
  if(url.pathname==='/api/collect') return json(await collect(env));
  if(url.pathname==='/api/history') return json(await history(env, url.searchParams.get('date')||dateIST()));
  return env.ASSETS.fetch(request);
 },
 async scheduled(event, env, ctx){ctx.waitUntil(collect(env));}
};

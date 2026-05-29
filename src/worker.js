function json(data, status=200){
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json','access-control-allow-origin':'*','cache-control':'no-store'}});
}
function dateIST(d=new Date()){return new Date(d).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});}
function timeIST(d=new Date()){return new Date(d).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
function dtIST(d=new Date()){return new Date(d).toLocaleString('sv-SE',{timeZone:'Asia/Kolkata'}).replace('T',' ');}
function slotFromTime(t){const m=String(t||'').match(/(\d{1,2}):(\d{2})/);if(!m)return null;return String(+m[1]).padStart(2,'0')+':'+(+m[2]<30?'00':'30');}
function slotFromDate(d){return slotFromTime(timeIST(d));}
function fToC(f){const n=Number(f);return Number.isFinite(n)?+((n-32)*5/9).toFixed(1):null;}
function cToF(c){const n=Number(c);return Number.isFinite(n)?+(n*9/5+32).toFixed(1):null;}
function n(v){if(v==null||v===''||v==='M')return null;const x=Number(v);return Number.isFinite(x)?x:null;}
function s(v){return v==null?'':String(v);}
function first(...v){return v.find(x=>x!==undefined&&x!==null&&x!==''&&x!=='M');}
function hash(str){let h=0;str=String(str||'');for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}return String(Math.abs(h));}
function addDaysIST(dateStr, days){const [y,m,d]=String(dateStr).split('-').map(Number);const dt=new Date(y,m-1,d+Number(days||0),12,0,0);return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;}
function compactJson(v){try{return JSON.stringify(v??null).slice(0,50000);}catch(e){return null;}}
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
 const temp_f=metric?cToF(temp):n(temp);
 const dewpoint_f=metric?cToF(dew):n(dew);
 const peak_f=metric?cToF(peak):n(peak);
 return {obs_date:dateIST(od),obs_time:timeIST(od),slot:slotFromDate(od),temp_c:metric?n(temp):fToC(temp),temp_f,dewpoint_c:metric?n(dew):fToC(dew),dewpoint_f,peak_since_7am_c:metric?n(peak):fToC(peak),peak_since_7am_f:peak_f,humidity:first(root.relativeHumidity,imp.relativeHumidity,root.humidity,imp.humidity,null),wind_kph:metric?n(wind):(wind!=null?+(Number(wind)*1.60934).toFixed(1):null),condition:first(root.wxPhraseLong,root.wxPhraseShort,root.phrase,root.cloudCoverPhrase,''),source:first(root.stationID,root.stationId,root.icaoCode,'VILK')};
}
function forecastIssueTime(obj){
  const c=[obj?.validTimeLocal,obj?.fcstValidLocal,obj?.updateTime,obj?.updateTimeLocal,obj?.lastUpdated,obj?.lastUpdatedLocal,obj?.metadata?.updateTime,obj?.metadata?.expireTimeGmt,obj?.daily?.[0]?.validTimeLocal,obj?.daypart?.[0]?.validTimeLocal,obj?.hourly?.[0]?.validTimeLocal,obj?.data?.hourly?.[0]?.validTimeLocal].filter(Boolean);
  if(c.length) return String(c[0]).slice(0,40);
  return 'fingerprint:'+hash(compactJson(obj));
}
function parseForecast(fc, hourlyObj=null){
 const maxF=fc?.temperatureMax||fc?.calendarDayTemperatureMax||[], minF=fc?.temperatureMin||fc?.calendarDayTemperatureMin||[], maxM=fc?.metric?.temperatureMax||[], minM=fc?.metric?.temperatureMin||[], rain=fc?.daypart?.[0]?.precipChance||[], phr=fc?.daypart?.[0]?.wxPhraseShort||fc?.daypart?.[0]?.wxPhraseLong||[];
 const maxC=[0,1,2,3,4].map(i=>maxF[i]!=null?fToC(maxF[i]):(maxM[i]!=null?n(maxM[i]):null));
 const minC=[0,1,2,3,4].map(i=>minF[i]!=null?fToC(minF[i]):(minM[i]!=null?n(minM[i]):null));
 const maxFF=[0,1,2,3,4].map(i=>maxF[i]!=null?n(maxF[i]):(maxM[i]!=null?cToF(maxM[i]):null));
 const minFF=[0,1,2,3,4].map(i=>minF[i]!=null?n(minF[i]):(minM[i]!=null?cToF(minM[i]):null));
 const hourly=hourlyObj?.temperature || hourlyObj?.temperatureHourly || hourlyObj?.hourly || hourlyObj?.data?.hourly || null;
 return {forecast_date:dateIST(),fetched_at:timeIST(),today_c:maxC[0],tmr_c:maxC[1],d2_c:maxC[2],d3_c:maxC[3],d4_c:maxC[4],today_f:maxFF[0],tmr_f:maxFF[1],d2_f:maxFF[2],d3_f:maxFF[3],d4_f:maxFF[4],today_low_c:minC[0],today_low_f:minFF[0],rain_pct:rain[0]??rain[1]??null,phrase:phr[0]||phr[1]||'',issue_time:forecastIssueTime({daily:fc,hourly:hourlyObj}),raw_hash:hash(JSON.stringify({maxC,maxFF,minC,minFF,r:rain[0],p:phr[0],issue:forecastIssueTime({daily:fc,hourly:hourlyObj})})),raw_daily:fc,raw_hourly:hourlyObj};
}
function hourlyForTarget(hourlyObj, target){
 const arr=[];
 const times=hourlyObj?.validTimeLocal||hourlyObj?.fcstValidLocal||hourlyObj?.time||[];
 const tempsF=hourlyObj?.temperature||hourlyObj?.temp||hourlyObj?.temperatureF||[];
 const phrases=hourlyObj?.wxPhraseLong||hourlyObj?.wxPhraseShort||hourlyObj?.phrase||[];
 if(Array.isArray(times)){
   for(let i=0;i<times.length;i++){
     const t=String(times[i]||'');
     if(t.startsWith(target)) arr.push({time:t,temp_f:n(tempsF[i]),temp_c:fToC(tempsF[i]),phrase:phrases[i]||null});
   }
 }
 return arr;
}
async function saveForecastSnapshots(env, fc){
 const today=dateIST(), fetchTime=timeIST(), issue=fc.issue_time||('fingerprint:'+fc.raw_hash);
 let saved=0, duplicate=0, seen=0;
 for(let h=0;h<=2;h++){
   const target=addDaysIST(today,h);
   const highsC=[fc.today_c,fc.tmr_c,fc.d2_c], highsF=[fc.today_f,fc.tmr_f,fc.d2_f];
   const lowsC=[fc.today_low_c,null,null], lowsF=[fc.today_low_f,null,null];
   const hourly=hourlyForTarget(fc.raw_hourly,target);
   let high_c=highsC[h], high_f=highsF[h], low_c=lowsC[h], low_f=lowsF[h];
   if(high_c==null && hourly.length){const vals=hourly.map(x=>x.temp_c).filter(Number.isFinite); if(vals.length) high_c=Math.max(...vals);}
   if(high_f==null && hourly.length){const vals=hourly.map(x=>x.temp_f).filter(Number.isFinite); if(vals.length) high_f=Math.max(...vals);}
   if(low_c==null && hourly.length){const vals=hourly.map(x=>x.temp_c).filter(Number.isFinite); if(vals.length) low_c=Math.min(...vals);}
   if(low_f==null && hourly.length){const vals=hourly.map(x=>x.temp_f).filter(Number.isFinite); if(vals.length) low_f=Math.min(...vals);}
   seen++;
   try{
    await env.DB.prepare(`INSERT INTO forecast_snapshots (forecast_date,target_date,horizon_days,fetch_time_ist,forecast_issue_time_ist,source,high_c,low_c,high_f,low_f,hourly_json,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(today,target,h,fetchTime,issue,'WU',high_c,low_c,high_f,low_f,compactJson(hourly),compactJson(h===0?fc.raw_daily:{})).run();
    saved++;
   }catch(e){ if(String(e.message||e).includes('UNIQUE')) duplicate++; else throw e; }
 }
 return {ok:true,saved,duplicate,seen,issue_time:issue};
}
async function collect(env){
 const out={ok:true,today_ist:dateIST()};
 const WU_KEY=env.WU_KEY||'e1f10a1e78da46f5b10a1e78da96f525', ICAO=env.WU_ICAO||'VILK', IATA=env.WU_IATA||'LKO', GEO=env.WU_GEOCODE||'26.738,80.857';
 try{
  let data=null; for(const u of [`https://api.weather.com/v3/wx/observations/current?icaoCode=${ICAO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,`https://api.weather.com/v3/wx/observations/current?iataCode=${IATA}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,`https://api.weather.com/v3/wx/observations/current?geocode=${GEO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`]){try{data=await getJson(u);break;}catch(e){}}
  const o=parseWU(data||{});
<<<<<<< HEAD
  const ex=await env.DB.prepare('SELECT id FROM wu_obs WHERE obs_date=? AND obs_time=? LIMIT 1').bind(o.obs_date,o.obs_time).first();
  if(ex) out.wu={ok:true,saved:false,duplicate:true,reason:'same WU obs_time cached/repeated',temp:o.temp_c,temp_f:o.temp_f,obsTime:o.obs_time,slot:o.slot};
  else{ await env.DB.prepare(`INSERT INTO wu_obs (obs_date,obs_time,slot,temp_c,temp_f,dewpoint_c,dewpoint_f,peak_since_7am_c,peak_since_7am_f,humidity,wind_kph,condition,source,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(o.obs_date,o.obs_time,o.slot,o.temp_c,o.temp_f,o.dewpoint_c,o.dewpoint_f,o.peak_since_7am_c,o.peak_since_7am_f,o.humidity,o.wind_kph,o.condition,o.source,timeIST()).run(); out.wu={ok:true,saved:true,duplicate:false,reason:'new WU obs_time',temp:o.temp_c,temp_f:o.temp_f,obsTime:o.obs_time,slot:o.slot}; }
=======
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
>>>>>>> 04d4a0aa6f3d15e6f7f617ff1ad3e998ff50d7c4
 }catch(e){out.wu={ok:false,error:e.message};}
 try{
  let daily=null, hourly=null;
  for(const u of [`https://api.weather.com/v3/wx/forecast/daily/5day?icaoCode=${ICAO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,`https://api.weather.com/v3/wx/forecast/daily/5day?iataCode=${IATA}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,`https://api.weather.com/v3/wx/forecast/daily/5day?geocode=${GEO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`]){try{daily=await getJson(u);break;}catch(e){}}
  for(const u of [`https://api.weather.com/v3/wx/forecast/hourly/2day?icaoCode=${ICAO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,`https://api.weather.com/v3/wx/forecast/hourly/2day?iataCode=${IATA}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,`https://api.weather.com/v3/wx/forecast/hourly/2day?geocode=${GEO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`]){try{hourly=await getJson(u);break;}catch(e){}}
  const fc=parseForecast(daily||{}, hourly||{});
  const ex=await env.DB.prepare('SELECT id FROM forecast WHERE forecast_date=? AND raw_hash=? LIMIT 1').bind(fc.forecast_date,fc.raw_hash).first();
  if(ex) out.forecast={ok:true,saved:false,duplicate:true,today_c:fc.today_c,today_f:fc.today_f};
  else{ await env.DB.prepare(`INSERT INTO forecast (forecast_date,fetched_at,today_c,tmr_c,d2_c,d3_c,d4_c,today_f,tmr_f,d2_f,d3_f,d4_f,rain_pct,phrase,raw_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(fc.forecast_date,fc.fetched_at,fc.today_c,fc.tmr_c,fc.d2_c,fc.d3_c,fc.d4_c,fc.today_f,fc.tmr_f,fc.d2_f,fc.d3_f,fc.d4_f,fc.rain_pct,fc.phrase,fc.raw_hash).run(); out.forecast={ok:true,saved:true,duplicate:false,today_c:fc.today_c,today_f:fc.today_f}; }
  out.forecast_snapshots=await saveForecastSnapshots(env, fc);
 }catch(e){out.forecast={ok:false,error:e.message};}
 try{
  const r=await fetch('https://aviationweather.gov/api/data/metar?ids=VILK&format=json&hours=12'); const arr=await r.json(); let saved=0,duplicate=0,skipped=0;
  for(const m of (Array.isArray(arr)?arr:[])){ const raw=m.rawOb||''; if(!raw) continue; const d=m.obsTime?new Date(+m.obsTime*1000):null; if(!d||isNaN(d)){skipped++;continue;} const ex=await env.DB.prepare('SELECT id FROM metar WHERE raw_metar=? LIMIT 1').bind(raw).first(); if(ex){duplicate++;continue;} await env.DB.prepare(`INSERT INTO metar (obs_date,valid_utc,valid_ist,slot,raw_metar,temp_c,dewpoint_c,wind_kt,wind_dir,visibility,wx,nosig,becmg,tempo,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(dateIST(d),d.toISOString(),dtIST(d),slotFromDate(d),raw,n(m.temp),n(m.dewp),n(m.wspd),s(m.wdir),s(m.visib),s(m.wxString),/\bNOSIG\b/i.test(raw)?1:0,/\bBECMG\b/i.test(raw)?1:0,/\bTEMPO\b/i.test(raw)?1:0,timeIST()).run(); saved++; }
  out.metar={ok:true,saved,duplicate,skipped,seen:Array.isArray(arr)?arr.length:0};
 }catch(e){out.metar={ok:false,error:e.message};}
 return out;
}
async function history(env, day){
 const wu=await env.DB.prepare('SELECT * FROM wu_obs WHERE obs_date=? ORDER BY obs_time ASC, created_at ASC LIMIT 3000').bind(day).all();
 const mt=await env.DB.prepare('SELECT * FROM metar WHERE obs_date=? ORDER BY valid_utc ASC LIMIT 2000').bind(day).all();
 const fc=await env.DB.prepare('SELECT * FROM forecast WHERE forecast_date=? ORDER BY created_at ASC LIMIT 500').bind(day).all();
 let fs={results:[]}; try{fs=await env.DB.prepare('SELECT * FROM forecast_snapshots WHERE target_date=? ORDER BY forecast_date, forecast_issue_time_ist, fetch_time_ist LIMIT 1000').bind(day).all();}catch(e){}
 const rows={}; for(const x of (wu.results||[])){if(!x.slot)continue; rows[x.slot]=rows[x.slot]||[]; rows[x.slot].push({temp_c:x.temp_c,temp_f:x.temp_f,dewpoint_c:x.dewpoint_c,dewpoint_f:x.dewpoint_f,humidity:x.humidity,wind_kph:x.wind_kph,condition:x.condition||'',saved_at:x.obs_time,fetched_at:x.fetched_at||''});}
 return {ok:true,today_ist:day,wu_obs_rows:rows,metar_rows:mt.results||[],forecast_rows:fc.results||[],forecast_snapshot_rows:fs.results||[],meta:{wu_count:(wu.results||[]).length,metar_count:(mt.results||[]).length,forecast_count:(fc.results||[]).length,forecast_snapshot_count:(fs.results||[]).length,latest_wu:(wu.results||[]).at(-1)||null,latest_metar:(mt.results||[]).at(-1)||null,latest_forecast:(fc.results||[]).at(-1)||null}};
}
<<<<<<< HEAD
async function forecastSnapshots(env, day){ const rows=await env.DB.prepare('SELECT * FROM forecast_snapshots WHERE target_date=? ORDER BY forecast_date, forecast_issue_time_ist, fetch_time_ist LIMIT 1000').bind(day).all(); return {ok:true,target_date:day,rows:rows.results||[]}; }
export default { async fetch(request, env){ const url=new URL(request.url); if(url.pathname==='/api/collect') return json(await collect(env)); if(url.pathname==='/api/history') return json(await history(env, url.searchParams.get('date')||dateIST())); if(url.pathname==='/api/forecast-snapshots') return json(await forecastSnapshots(env, url.searchParams.get('date')||dateIST())); return env.ASSETS.fetch(request); }, async scheduled(event, env, ctx){ctx.waitUntil(collect(env));} };
=======
export default {
 async fetch(request, env){
  const url=new URL(request.url);
  if(url.pathname==='/api/collect') return json(await collect(env));
  if(url.pathname==='/api/history') return json(await history(env, url.searchParams.get('date')||dateIST()));
  return env.ASSETS.fetch(request);
 },
 async scheduled(event, env, ctx){ctx.waitUntil(collect(env));}
};
>>>>>>> 04d4a0aa6f3d15e6f7f617ff1ad3e998ff50d7c4

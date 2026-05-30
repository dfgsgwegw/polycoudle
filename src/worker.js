// DUAL WU RAW SOURCE PATCH: fetches Weather.com/WU units=e and units=m; temp_f stores imperial raw, temp_c stores metric raw when available. Fallback conversion only if one endpoint is missing.
// PRECISION SOURCE PATCH: stores WU/forecast source Fahrenheit and converted Celsius to 3 decimals; METAR Celsius remains source.
function json(data, status=200){
  return new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json','access-control-allow-origin':'*','cache-control':'no-store'}});
}
function dateIST(d=new Date()){return new Date(d).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});}
function timeIST(d=new Date()){return new Date(d).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});}
function dtIST(d=new Date()){return new Date(d).toLocaleString('sv-SE',{timeZone:'Asia/Kolkata'}).replace('T',' ');}
function slotFromTime(t){const m=String(t||'').match(/(\d{1,2}):(\d{2})/);if(!m)return null;return String(+m[1]).padStart(2,'0')+':'+(+m[2]<30?'00':'30');}
function slotFromDate(d){return slotFromTime(timeIST(d));}
function fToC(f){const n=Number(f);return Number.isFinite(n)?+((n-32)*5/9).toFixed(3):null;}
function cToF(c){const n=Number(c);return Number.isFinite(n)?+(n*9/5+32).toFixed(3):null;}
function n(v){if(v==null||v===''||v==='M')return null;const x=Number(v);return Number.isFinite(x)?+x.toFixed(3):null;}
function s(v){return v==null?'':String(v);}
function first(...v){return v.find(x=>x!==undefined&&x!==null&&x!==''&&x!=='M');}
function hash(str){let h=0;str=String(str||'');for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}return String(Math.abs(h));}
function addDaysIST(dateStr, days){const [y,m,d]=String(dateStr).split('-').map(Number);const dt=new Date(y,m-1,d+Number(days||0),12,0,0);return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;}
function compactJson(v){try{return JSON.stringify(v??null).slice(0,50000);}catch(e){return null;}}
async function getJson(url, retries=2){
  let lastErr;
  for(let attempt=0; attempt<=retries; attempt++){
    try{
      const r=await fetch(url,{headers:{'user-agent':'VILK-Cloudflare-D1/1.0','accept':'application/json,*/*'}, cf:{cacheTtl:0,cacheEverything:false}});
      const t=await r.text();
      if(!r.ok) throw new Error(r.status+': '+t.slice(0,180));
      return JSON.parse(t);
    }catch(e){
      lastErr=e;
      await new Promise(res=>setTimeout(res, 250*(attempt+1)));
    }
  }
  throw lastErr;
}

function wuRoot(d){
  return Array.isArray(d?.observations)?d.observations[0]:(d?.observation||d||{});
}
function parseWUPair(impData, metricData){
  const impRoot=wuRoot(impData), metRoot=wuRoot(metricData);
  const imp=impRoot.imperial||{}, met=metRoot.metric||{};
  const root=Object.keys(impRoot||{}).length?impRoot:metRoot;

  const tempF=first(imp.temp, impRoot.temperature, impRoot.temp);
  const dewF=first(imp.dewpt, impRoot.temperatureDewPoint, impRoot.dewpt);
  const peakF=first(imp.temperatureMaxSince7Am, impRoot.temperatureMaxSince7Am, impRoot.tempMaxSince7Am, impRoot.temperatureMax24Hour);
  const windMph=first(imp.windSpeed, impRoot.windSpeed);

  const tempC=first(met.temp, metRoot.temperature, metRoot.temp);
  const dewC=first(met.dewpt, metRoot.temperatureDewPoint, metRoot.dewpt);
  const peakC=first(met.temperatureMaxSince7Am, metRoot.temperatureMaxSince7Am, metRoot.tempMaxSince7Am, metRoot.temperatureMax24Hour);
  const windKphRaw=first(met.windSpeed, metRoot.windSpeed);

  const epoch=first(root.validTimeUtc,root.obsTimeUtc,root.epoch,metRoot.validTimeUtc,metRoot.obsTimeUtc,metRoot.epoch,'');
  let od=null;
  if(epoch!==''){const x=Number(epoch);if(!Number.isNaN(x))od=new Date(x>9999999999?x:x*1000);}
  if(!od) od=new Date();

  const humidity=first(root.relativeHumidity,imp.relativeHumidity,root.humidity,imp.humidity,metRoot.relativeHumidity,metRoot.humidity,null);
  const condition=first(root.wxPhraseLong,root.wxPhraseShort,root.phrase,root.cloudCoverPhrase,metRoot.wxPhraseLong,metRoot.wxPhraseShort,metRoot.phrase,'');
  const source=first(root.stationID,root.stationId,root.icaoCode,metRoot.stationID,metRoot.stationId,metRoot.icaoCode,'VILK');

  return {
    obs_date:dateIST(od),
    obs_time:timeIST(od),
    slot:slotFromDate(od),

    // RAW values when available:
    // temp_f = WU imperial raw, temp_c = WU metric raw.
    // If one endpoint is missing, fallback conversion is used.
    temp_f:n(tempF)!=null?n(tempF):cToF(tempC),
    temp_c:n(tempC)!=null?n(tempC):fToC(tempF),

    dewpoint_f:n(dewF)!=null?n(dewF):cToF(dewC),
    dewpoint_c:n(dewC)!=null?n(dewC):fToC(dewF),

    peak_since_7am_f:n(peakF)!=null?n(peakF):cToF(peakC),
    peak_since_7am_c:n(peakC)!=null?n(peakC):fToC(peakF),

    humidity,
    wind_kph:n(windKphRaw)!=null?n(windKphRaw):(windMph!=null?+(Number(windMph)*1.60934).toFixed(3):null),
    condition,
    source,
    temp_source:(n(tempF)!=null?'WU_F_RAW':'F_FROM_C') + '+' + (n(tempC)!=null?'WU_C_RAW':'C_FROM_F'),
    raw_imp_temp:tempF,
    raw_metric_temp:tempC
  };
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

 // HOURLY ONLY:
 // No daily max fallback. Cards/forecast max must match WU hourly forecast curve.
 // If hourly for a target day is unavailable, high_c/high_f remain NULL and frontend shows unavailable.
 for(let h=0;h<=2;h++){
   const target=addDaysIST(today,h);
   const hourly=hourlyForTarget(fc.raw_hourly,target);

   let high_c=null, high_f=null, low_c=null, low_f=null, source='WU_HOURLY_ONLY';

   if(hourly.length){
     const valsC=hourly.map(x=>x.temp_c).filter(Number.isFinite);
     const valsF=hourly.map(x=>x.temp_f).filter(Number.isFinite);

     if(valsC.length) high_c=Math.max(...valsC);
     if(valsF.length) high_f=Math.max(...valsF);
     if(valsC.length) low_c=Math.min(...valsC);
     if(valsF.length) low_f=Math.min(...valsF);

     if(high_c==null && high_f!=null) high_c=fToC(high_f);
     if(high_f==null && high_c!=null) high_f=cToF(high_c);
     if(low_c==null && low_f!=null) low_c=fToC(low_f);
     if(low_f==null && low_c!=null) low_f=cToF(low_c);
   }

   const payloadHourly=hourly.map(x=>({...x,source}));
   const rawPayload={source, hourlyCount:hourly.length, note:'HOURLY_ONLY_NO_DAILY_FALLBACK'};

   seen++;
   try{
    await env.DB.prepare(`INSERT INTO forecast_snapshots (forecast_date,target_date,horizon_days,fetch_time_ist,forecast_issue_time_ist,source,high_c,low_c,high_f,low_f,hourly_json,raw_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(today,target,h,fetchTime,issue,source,high_c,low_c,high_f,low_f,compactJson(payloadHourly),compactJson(rawPayload)).run();
    saved++;
   }catch(e){ if(String(e.message||e).includes('UNIQUE')) duplicate++; else throw e; }
 }
 return {ok:true,saved,duplicate,seen,issue_time:issue,note:'hourly-only no daily fallback'};
}
async function collect(env){
 const out={ok:true,today_ist:dateIST()};
 const WU_KEY=env.WU_KEY||'e1f10a1e78da46f5b10a1e78da96f525', ICAO=env.WU_ICAO||'VILK', IATA=env.WU_IATA||'LKO', GEO=env.WU_GEOCODE||'26.738,80.857';
 try{
  let dataE=null, dataM=null;
  for(const u of [
    `https://api.weather.com/v3/wx/observations/current?icaoCode=${ICAO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,
    `https://api.weather.com/v3/wx/observations/current?iataCode=${IATA}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,
    `https://api.weather.com/v3/wx/observations/current?geocode=${GEO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`
  ]){try{dataE=await getJson(u);break;}catch(e){}}
  for(const u of [
    `https://api.weather.com/v3/wx/observations/current?icaoCode=${ICAO}&apiKey=${WU_KEY}&units=m&language=en-US&format=json`,
    `https://api.weather.com/v3/wx/observations/current?iataCode=${IATA}&apiKey=${WU_KEY}&units=m&language=en-US&format=json`,
    `https://api.weather.com/v3/wx/observations/current?geocode=${GEO}&apiKey=${WU_KEY}&units=m&language=en-US&format=json`
  ]){try{dataM=await getJson(u);break;}catch(e){}}
  const o=parseWUPair(dataE||{}, dataM||{});
  const ex=await env.DB.prepare('SELECT id FROM wu_obs WHERE obs_date=? AND obs_time=? LIMIT 1').bind(o.obs_date,o.obs_time).first();
  if(ex) out.wu={ok:true,saved:false,duplicate:true,reason:'same WU obs_time cached/repeated',temp:o.temp_c,temp_f:o.temp_f,temp_source:o.temp_source,raw_imp_temp:o.raw_imp_temp,raw_metric_temp:o.raw_metric_temp,obsTime:o.obs_time,slot:o.slot};
  else{ await env.DB.prepare(`INSERT INTO wu_obs (obs_date,obs_time,slot,temp_c,temp_f,dewpoint_c,dewpoint_f,peak_since_7am_c,peak_since_7am_f,humidity,wind_kph,condition,source,fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(o.obs_date,o.obs_time,o.slot,o.temp_c,o.temp_f,o.dewpoint_c,o.dewpoint_f,o.peak_since_7am_c,o.peak_since_7am_f,o.humidity,o.wind_kph,o.condition,o.source,timeIST()).run(); out.wu={ok:true,saved:true,duplicate:false,reason:'new WU obs_time',temp:o.temp_c,temp_f:o.temp_f,temp_source:o.temp_source,raw_imp_temp:o.raw_imp_temp,raw_metric_temp:o.raw_metric_temp,obsTime:o.obs_time,slot:o.slot}; }
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
 const rows={}; for(const x of (wu.results||[])){if(!x.slot)continue; rows[x.slot]=rows[x.slot]||[]; rows[x.slot].push({temp_c:x.temp_c,temp_f:x.temp_f,dewpoint_c:x.dewpoint_c,dewpoint_f:x.dewpoint_f,humidity:x.humidity,wind_kph:x.wind_kph,condition:x.condition||'',saved_at:x.obs_time,fetched_at:x.fetched_at||'',temp_source:(x.temp_f!=null?'WU_F_RAW':'F_MISSING'),converted_source:(x.temp_c!=null?'WU_C_RAW_OR_CONVERTED':'C_MISSING')});}
 return {ok:true,today_ist:day,wu_obs_rows:rows,metar_rows:mt.results||[],forecast_rows:fc.results||[],forecast_snapshot_rows:fs.results||[],meta:{wu_count:(wu.results||[]).length,metar_count:(mt.results||[]).length,forecast_count:(fc.results||[]).length,forecast_snapshot_count:(fs.results||[]).length,latest_wu:(wu.results||[]).at(-1)||null,latest_metar:(mt.results||[]).at(-1)||null,latest_forecast:(fc.results||[]).at(-1)||null}};
}

async function forecastHighDebug(env, day){
 const rows=await env.DB.prepare('SELECT * FROM forecast_snapshots WHERE forecast_date=? OR target_date IN (?,?,?) ORDER BY forecast_date, target_date, fetch_time_ist LIMIT 1000')
   .bind(day, day, addDaysIST(day,1), addDaysIST(day,2)).all();
 const out={ok:true,day,targets:{}};
 for(const r of (rows.results||[])){
   const target=r.target_date;
   out.targets[target]=out.targets[target]||[];
   let hourly=[];
   try{hourly=JSON.parse(r.hourly_json||'[]');}catch(e){}
   let maxHourlyC=null, maxHourlyF=null, peakTime=null;
   for(const x of hourly){
     const c=n(x.temp_c), f=n(x.temp_f);
     if(c!=null && (maxHourlyC==null || c>maxHourlyC)){maxHourlyC=c;maxHourlyF=f;peakTime=x.time||null;}
   }
   out.targets[target].push({
     fetch_time_ist:r.fetch_time_ist,
     issue:r.forecast_issue_time_ist,
     source:r.source,
     db_high_c:r.high_c,
     db_high_f:r.high_f,
     hourly_count:hourly.length,
     hourly_max_c:maxHourlyC,
     hourly_max_f:maxHourlyF,
     hourly_peak_time:peakTime
   });
 }
 return out;
}

async function forecastSnapshots(env, day){ const rows=await env.DB.prepare('SELECT * FROM forecast_snapshots WHERE target_date=? ORDER BY forecast_date, forecast_issue_time_ist, fetch_time_ist LIMIT 1000').bind(day).all(); return {ok:true,target_date:day,rows:rows.results||[]}; }
export default { async fetch(request, env){ const url=new URL(request.url); if(url.pathname==='/api/collect') return json(await collect(env)); if(url.pathname==='/api/history') return json(await history(env, url.searchParams.get('date')||dateIST())); if(url.pathname==='/api/wu-latest') { const day=url.searchParams.get('date')||dateIST(); const row=await env.DB.prepare('SELECT * FROM wu_obs WHERE obs_date=? ORDER BY obs_time DESC LIMIT 1').bind(day).first(); return json({ok:true,row}); } if(url.pathname==='/api/forecast-snapshots') return json(await forecastSnapshots(env, url.searchParams.get('date')||dateIST())); if(url.pathname==='/api/forecast-high-debug') return json(await forecastHighDebug(env, url.searchParams.get('date')||dateIST())); return env.ASSETS.fetch(request); }, async scheduled(event, env, ctx){ctx.waitUntil(collect(env));} };

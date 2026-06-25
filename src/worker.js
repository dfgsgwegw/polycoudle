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
 for(let h=0;h<=3;h++){
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
  for(const u of [`https://api.weather.com/v3/wx/forecast/hourly/10day?icaoCode=${ICAO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,`https://api.weather.com/v3/wx/forecast/hourly/10day?iataCode=${IATA}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,`https://api.weather.com/v3/wx/forecast/hourly/10day?geocode=${GEO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`]){try{hourly=await getJson(u);break;}catch(e){}}
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


async function polymarketDailyHighs(env, day){
  const d0=day, d1=addDaysIST(day,1), d2=addDaysIST(day,2), d3=addDaysIST(day,3);

  const wuRows=await env.DB.prepare('SELECT * FROM wu_obs WHERE obs_date=? ORDER BY obs_time ASC, created_at ASC LIMIT 3000').bind(d0).all();
  const fcRows=await env.DB.prepare('SELECT * FROM forecast WHERE forecast_date=? ORDER BY created_at ASC LIMIT 500').bind(d0).all();

  const wu=(wuRows.results||[]);
  const fc=(fcRows.results||[]);
  const latestWu=wu.at(-1)||null;
  const latestFc=fc.at(-1)||null;

  let todayCurrentC=latestWu?n(latestWu.temp_c):null;
  let todayCurrentF=latestWu?n(latestWu.temp_f):null;
  let peakC=null, peakF=null, peakTime=null;

  for(const r of wu){
    const pc=n(r.peak_since_7am_c), pf=n(r.peak_since_7am_f);
    const tc=n(r.temp_c), tf=n(r.temp_f);
    const candidateC = pc!=null ? pc : tc;
    const candidateF = pf!=null ? pf : tf;
    if(candidateC!=null && (peakC==null || candidateC>peakC)){
      peakC=candidateC;
      peakF=candidateF!=null?candidateF:cToF(candidateC);
      peakTime=r.obs_time||r.fetched_at||null;
    }
  }

  function fcDay(idx){
    if(!latestFc) return null;
    const c=n(latestFc[idx+'_c']);
    const f=n(latestFc[idx+'_f']);
    if(c==null && f==null) return null;
    return {high_c:c!=null?c:fToC(f), high_f:f!=null?f:cToF(c)};
  }

  const d1v=fcDay('tmr');
  const d2v=fcDay('d2');
  const d3v=fcDay('d3');

  const out={
    ok:true,
    base_date:d0,
    note:'Polymarket source logic: Today=WU obs current+peak_since_7am; D+1/D+2/D+3=WU daily/5day temperatureMax. Hourly forecast max not used.',
    updated_at:timeIST(),
    days:{}
  };

  out.days[d0]={
    date:d0,
    label:'TODAY',
    source:'WU observations current + peak_since_7am',
    current_c:todayCurrentC,
    current_f:todayCurrentF,
    high_c:peakC,
    high_f:peakF,
    peak_time:peakTime,
    obs_count:wu.length,
    latest_obs_time:latestWu?(latestWu.obs_time||latestWu.fetched_at||null):null,
    market_bin:peakC!=null?Math.round(peakC):null
  };

  [[d1,d1v,'D+1'],[d2,d2v,'D+2'],[d3,d3v,'D+3']].forEach(([date,val,label])=>{
    out.days[date]={
      date,
      label,
      source:'WU daily 5day forecast temperatureMax',
      high_c:val?val.high_c:null,
      high_f:val?val.high_f:null,
      issue_time:latestFc?(latestFc.issue_time||latestFc.fetched_at||null):null,
      fetched_at:latestFc?(latestFc.fetched_at||null):null,
      forecast_rows_checked:fc.length,
      market_bin:val&&val.high_c!=null?Math.round(val.high_c):null
    };
  });

  return out;
}







function buildForecastTrendFromRows(baseDate, fcRows){
  const out=[];
  for(const row of (fcRows||[])){
    const rawF=n(row.today_f), rawC=n(row.today_c);
    let c=null,f=null;
    if(rawF!=null){f=rawF;c=fToC(rawF);}
    else if(rawC!=null){c=rawC;f=cToF(rawC);}
    if(c==null) continue;
    out.push({time:row.issue_time||row.fetched_at||row.created_at||'',c:+c.toFixed(3),f:+f.toFixed(1),bin:Math.round(c)});
  }
  return out;
}

async function polymarketDailyAndHourlyHighsFinal(env, day){
  const d0=day, d1=addDaysIST(day,1), d2=addDaysIST(day,2), d3=addDaysIST(day,3);
  const targets=[d0,d1,d2,d3];

  const wuRows=await env.DB.prepare('SELECT * FROM wu_obs WHERE obs_date=? ORDER BY obs_time ASC, created_at ASC LIMIT 3000').bind(d0).all();
  const fcRows=await env.DB.prepare('SELECT * FROM forecast WHERE forecast_date=? ORDER BY created_at ASC LIMIT 2000').bind(d0).all();

  let fsRows={results:[]};
  try{
    fsRows=await env.DB.prepare('SELECT * FROM forecast_snapshots WHERE forecast_date=? AND target_date IN (?,?,?,?) ORDER BY target_date, fetch_time_ist ASC LIMIT 4000').bind(d0,d0,d1,d2,d3).all();
  }catch(e){}

  const wu=(wuRows.results||[]);
  const fc=(fcRows.results||[]);
  const fs=(fsRows.results||[]);
  const latestWu=wu.at(-1)||null;

  const currentRawC=latestWu?n(latestWu.temp_c):null;
  const currentRawF=latestWu?n(latestWu.temp_f):null;

  let obsPeakC=null, obsPeakF=null, obsPeakTime=null;
  function istHourFromAny(x){
    const s=String(x||'');
    const m=s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?/);
    if(!m) return null;
    return Number(m[1])+Number(m[2])/60;
  }
  // Market-day peak: only same-day WU observations after 07:00 IST.
  // This prevents yesterday/midnight peak carry like 00:05 -> 33C.
  for(const r of wu){
    const h=istHourFromAny(r.obs_time||r.saved_at||r.fetched_at||r.slot);
    if(h==null || h<7) continue;
    const tc=n(r.temp_c), tf=n(r.temp_f);
    if(tc!=null && (obsPeakC==null || tc>obsPeakC)){
      obsPeakC=tc;
      obsPeakF=tf!=null?tf:cToF(tc);
      obsPeakTime=r.obs_time||r.saved_at||r.fetched_at||r.slot||null;
    }
  }
  if(obsPeakC==null && latestWu){
    obsPeakC=currentRawC;
    obsPeakF=currentRawF!=null?currentRawF:(currentRawC!=null?cToF(currentRawC):null);
    obsPeakTime=latestWu.obs_time||latestWu.saved_at||latestWu.fetched_at||null;
  }

  function parseJsonMaybe(x){
    if(!x) return null;
    if(typeof x==='object') return x;
    try{return JSON.parse(String(x));}catch(e){return null;}
  }
  function getAny(obj, keys){
    for(const k of keys){ if(obj && obj[k]!=null) return obj[k]; }
    return null;
  }

  function dailyVal(row, idx, targetDate){
    if(!row) return null;
    const rawC=n(row[idx+'_c']);
    const rawF=n(row[idx+'_f']);
    if(rawC==null && rawF==null) return null;
    const cFromF=rawF!=null?fToC(rawF):null;
    const fFromC=rawC!=null?cToF(rawC):null;
    const mainC=rawF!=null?cFromF:rawC;
    const mainF=rawF!=null?rawF:fFromC;
    return {
      target_date:targetDate,
      c:mainC, f:mainF,
      raw_c:rawC, raw_f:rawF,
      converted_c_from_f:cFromF,
      converted_f_from_c:fFromC,
      display_source:rawF!=null?'WU_RAW_F_CONVERTED_TO_C':'WU_RAW_C_FALLBACK',
      issue_time:row.issue_time||row.fetched_at||null,
      fetched_at:row.fetched_at||null,
      created_at:row.created_at||null,
      source:'DB forecast daily'
    };
  }

  const dailyIdxByDate={};
  dailyIdxByDate[d0]='today';
  dailyIdxByDate[d1]='tmr';
  dailyIdxByDate[d2]='d2';
  dailyIdxByDate[d3]='d3';

  function pointsFromHourlyObject(obj, targetDate){
    const o=parseJsonMaybe(obj);
    const out=[];
    if(!o) return out;

    function pushPoint(time, rawF, rawC, phrase){
      const t=String(time||'');
      if(targetDate && t.includes('-') && !t.startsWith(targetDate)) return;
      const f=n(rawF), c0=n(rawC);
      const c=f!=null?fToC(f):c0;
      const ff=f!=null?f:(c0!=null?cToF(c0):null);
      if(c!=null) out.push({time:t,temp_c:c,temp_f:ff,phrase:phrase||null,target_date:targetDate});
    }

    const times=o.validTimeLocal||o.fcstValidLocal||o.valid_time_local||o.time||[];
    const tempsF=o.temperature||o.temperatureF||o.temp||[];
    const tempsC=o.temperatureC||o.metric?.temperature||[];
    const phrases=o.wxPhraseLong||o.wxPhraseShort||o.phrase||[];

    if(Array.isArray(times)){
      for(let i=0;i<times.length;i++){
        pushPoint(times[i], Array.isArray(tempsF)?tempsF[i]:null, Array.isArray(tempsC)?tempsC[i]:null, Array.isArray(phrases)?phrases[i]:null);
      }
    }

    const arrs=[o.hourly,o.data?.hourly,o.forecasts,Array.isArray(o.data)?o.data:null].filter(Array.isArray);
    for(const arr of arrs){
      for(const x of arr){
        pushPoint(
          getAny(x,['validTimeLocal','fcstValidLocal','valid_time_local','time','date']),
          getAny(x,['temperature','temperatureF','temp']),
          getAny(x,['temperatureC']),
          getAny(x,['wxPhraseLong','wxPhraseShort','phrase','condition'])
        );
      }
    }
    return out;
  }

  function bestHourly(points){
    let best=null;
    for(const p of points){
      const c=n(p.temp_c), f=n(p.temp_f);
      if(c!=null && (!best || c>best.c)){
        best={target_date:p.target_date,c,f:f!=null?f:cToF(c),time:p.time||null,phrase:p.phrase||null};
      }
    }
    if(!best) return null;
    return {...best,count:points.length};
  }

  async function fetchDirectHourly(){
    const WU_KEY=env.WU_KEY||env.WEATHER_API_KEY||'e1f10a1e78da46f5b10a1e78da96f525';
    const ICAO=env.WU_ICAO||'VILK';
    const IATA=env.WU_IATA||'LKO';
    const GEO=env.WU_GEOCODE||'26.738,80.857';
    const urls=[
      `https://api.weather.com/v3/wx/forecast/hourly/10day?icaoCode=${ICAO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,
      `https://api.weather.com/v3/wx/forecast/hourly/10day?iataCode=${IATA}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,
      `https://api.weather.com/v3/wx/forecast/hourly/10day?geocode=${GEO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`,
      `https://api.weather.com/v3/wx/forecast/hourly/15day?geocode=${GEO}&apiKey=${WU_KEY}&units=e&language=en-US&format=json`
    ];
    let obj=null, used=null, error=null;
    for(const u of urls){
      try{
        obj=await getJson(u,1);
        used=u.replace(WU_KEY,'***');
        break;
      }catch(e){ error=String(e.message||e); }
    }
    return {obj,used,error};
  }

  const direct=await fetchDirectHourly();

  function stats(vals){
    const clean=vals.filter(v=>v && v.c!=null);
    const unique=[];
    for(const v of clean){
      const last=unique.at(-1);
      const keyTime=String(v.fetch_time_ist||v.fetched_at||v.issue_time||v.created_at||'');
      const lastTime=last?String(last.fetch_time_ist||last.fetched_at||last.issue_time||last.created_at||''):'';
      if(!last || Math.abs(last.c-v.c)>0.001 || keyTime!==lastTime || String(v.source)!==String(last.source)){
        unique.push(v);
      }
    }
    const latest=unique.at(-1)||null;
    const previous=unique.length>=2?unique.at(-2):null;
    let highest=null, lowest=null;
    for(const v of unique){
      if(!highest || v.c>highest.c) highest=v;
      if(!lowest || v.c<lowest.c) lowest=v;
    }
    const change=(latest&&previous)?+(latest.c-previous.c).toFixed(3):null;
    const drop=(latest&&highest)?+(latest.c-highest.c).toFixed(3):null;
    let trend='first';
    if(change!=null) trend=change>0?'rising':(change<0?'falling':'stable');
    return {latest,previous,highest,lowest,count:unique.length,change_from_previous_c:change,drop_from_highest_c:drop,trend};
  }

  function dailyHistory(targetDate){
    const idx=dailyIdxByDate[targetDate];
    const vals=[];
    for(const row of fc){
      const v=dailyVal(row,idx,targetDate);
      if(v) vals.push(v);
    }
    return stats(vals);
  }

  function hourlyHistory(targetDate){
    const vals=[];

    for(const row of fs.filter(r=>r.target_date===targetDate)){
      const arr=parseJsonMaybe(row.hourly_json);
      if(Array.isArray(arr)){
        const pts=arr.map(x=>({
          target_date:targetDate,
          temp_c:n(x.temp_c),
          temp_f:n(x.temp_f),
          time:x.time||x.validTimeLocal||x.fcstValidLocal||null,
          phrase:x.phrase||x.wxPhraseLong||null
        }));
        const b=bestHourly(pts);
        if(b) vals.push({...b,source:'DB forecast_snapshots.hourly_json',issue_time:row.forecast_issue_time_ist||row.fetch_time_ist||null,fetch_time_ist:row.fetch_time_ist||null});
      }
    }

    for(const row of fc){
      let pts=[];
      pts=pts.concat(pointsFromHourlyObject(row.raw_hourly,targetDate));
      const rawJson=parseJsonMaybe(row.raw_json);
      if(rawJson) pts=pts.concat(pointsFromHourlyObject(rawJson.raw_hourly||rawJson.hourly||rawJson,targetDate));
      pts=pts.concat(pointsFromHourlyObject(row.raw,targetDate));
      const b=bestHourly(pts);
      if(b) vals.push({...b,source:'DB forecast.raw_hourly/raw_json',issue_time:row.issue_time||row.fetched_at||null,fetch_time_ist:row.fetched_at||row.created_at||null});
    }

    if(direct.obj){
      const pts=pointsFromHourlyObject(direct.obj,targetDate);
      const b=bestHourly(pts);
      if(b) vals.push({...b,source:'DIRECT Weather.com hourly API',issue_time:forecastIssueTime({hourly:direct.obj}),fetch_time_ist:timeIST()});
    }
    return stats(vals);
  }

  function makeDay(targetDate,label){
    const dh=dailyHistory(targetDate);
    const hh=hourlyHistory(targetDate);
    const d=dh.latest, h=hh.latest;
    const diffC=(d&&h)?+(d.c-h.c).toFixed(3):null;
    const diffF=(d&&h)?+(d.f-h.f).toFixed(3):null;

    return {
      date:targetDate,label,
      source:'WU daily temperatureMax + WU hourly max',
      high_c:d?d.c:null, high_f:d?d.f:null,
      raw_c:d?d.raw_c:null, raw_f:d?d.raw_f:null,
      converted_c_from_f:d?d.converted_c_from_f:null,
      converted_f_from_c:d?d.converted_f_from_c:null,
      display_source:d?d.display_source:null,

      hourly_high_c:h?h.c:null, hourly_high_f:h?h.f:null,
      hourly_peak_time:h?h.time:null,
      hourly_points:h?h.count:null,
      hourly_source:h?h.source:null,
      hourly_issue_time:h?h.issue_time:null,

      daily_minus_hourly_c:diffC,
      daily_minus_hourly_f:diffF,
      daily_market_bin:d&&d.c!=null?Math.round(d.c):null,
      hourly_market_bin:h&&h.c!=null?Math.round(h.c):null,

      daily_previous_c:dh.previous?dh.previous.c:null,
      daily_previous_f:dh.previous?dh.previous.f:null,
      daily_highest_seen_c:dh.highest?dh.highest.c:null,
      daily_highest_seen_f:dh.highest?dh.highest.f:null,
      daily_lowest_seen_c:dh.lowest?dh.lowest.c:null,
      daily_lowest_seen_f:dh.lowest?dh.lowest.f:null,
      daily_change_from_previous_c:dh.change_from_previous_c,
      daily_drop_from_highest_c:dh.drop_from_highest_c,
      daily_trend:dh.trend,
      daily_count:dh.count,

      hourly_previous_c:hh.previous?hh.previous.c:null,
      hourly_previous_f:hh.previous?hh.previous.f:null,
      hourly_highest_seen_c:hh.highest?hh.highest.c:null,
      hourly_highest_seen_f:hh.highest?hh.highest.f:null,
      hourly_lowest_seen_c:hh.lowest?hh.lowest.c:null,
      hourly_lowest_seen_f:hh.lowest?hh.lowest.f:null,
      hourly_change_from_previous_c:hh.change_from_previous_c,
      hourly_drop_from_highest_c:hh.drop_from_highest_c,
      hourly_trend:hh.trend,
      hourly_count:hh.count,

      issue_time:d?(d.issue_time||d.fetched_at||null):null
    };
  }

  const out={
    ok:true,
    base_date:d0,
    note:'FINAL STRICT FIX ACTIVE: Today uses WU obs peak/current; D+ cards show daily + direct hourly, strict per card date, no cross-date mixing.',
    updated_at:timeIST(),
    debug_counts:{wu_rows:wu.length,forecast_rows:fc.length,snapshot_rows:fs.length,direct_hourly_ok:!!direct.obj,direct_hourly_url:direct.used,direct_hourly_error:direct.error},
    days:{}
  };

  out.days[d0]=makeDay(d0,'TODAY');
  out.days[d0]={...out.days[d0],
    source:'WU obs current/peak + WU daily + WU hourly',
    current_c:currentRawC,
    current_f:currentRawF,
    current_converted_c_from_f:currentRawF!=null?fToC(currentRawF):null,
    current_converted_f_from_c:currentRawC!=null?cToF(currentRawC):null,
    obs_peak_c:obsPeakC,
    obs_peak_f:obsPeakF,
    obs_peak_time:obsPeakTime,
    today_main_c:obsPeakC!=null?obsPeakC:currentRawC,
    today_main_f:obsPeakF!=null?obsPeakF:currentRawF,
    today_main_source:'WU obs peak/current',
    diff_daily_forecast_minus_current_c:(currentRawC!=null&&out.days[d0].high_c!=null)?+(out.days[d0].high_c-currentRawC).toFixed(3):null,
    obs_count:wu.length,
    latest_obs_time:latestWu?(latestWu.obs_time||latestWu.fetched_at||null):null
  };
  out.days[d1]=makeDay(d1,'D+1');
  out.days[d2]=makeDay(d2,'D+2');
  out.days[d3]=makeDay(d3,'D+3');
  out.forecast_trend=buildForecastTrendFromRows(d0,fc);

  return out;
}

async function forecastSnapshots(env, day){ const rows=await env.DB.prepare('SELECT * FROM forecast_snapshots WHERE target_date=? ORDER BY forecast_date, forecast_issue_time_ist, fetch_time_ist LIMIT 1000').bind(day).all(); return {ok:true,target_date:day,rows:rows.results||[]}; }

function parseMetarTempFromRaw(raw){raw=String(raw||'');const m=raw.match(/\s(M?\d{2})\/(M?\d{2})\s/);if(!m)return{temp_c:null,dewpoint_c:null};const cv=s=>s.startsWith('M')?-Number(s.slice(1)):Number(s);return{temp_c:cv(m[1]),dewpoint_c:cv(m[2])};}
function toF(c){return c==null?null:(c*9/5+32);}
function round1(x){return x==null?null:Math.round(Number(x)*10)/10;}
function pickLatestWuFromHistory(hist){const rows=hist?.wu_obs_rows||{};let best=null;for(const slot of Object.keys(rows)){for(const r of (rows[slot]||[])){const t=r.saved_at||r.fetched_at||slot;if(r.temp_c==null)continue;if(!best||String(t)>String(best.time))best={source:'WU Obs',temp_c:n(r.temp_c),temp_f:n(r.temp_f)??toF(n(r.temp_c)),time:t,raw:null,slot,condition:r.condition||null,humidity:r.humidity??null};}}return best;}
function tempVote(sources){const valid=sources.filter(x=>x&&x.temp_c!=null);if(!valid.length)return{final_temp_c:null,final_temp_f:null,confidence:'NO DATA',verdict:'no data',majority:[],warnings:[]};const groups=[];for(const s of valid){let g=groups.find(g=>Math.abs(g.temp_c-s.temp_c)<=1.0);if(!g){g={temp_c:s.temp_c,items:[]};groups.push(g);}g.items.push(s);g.temp_c=g.items.reduce((a,b)=>a+b.temp_c,0)/g.items.length;}groups.sort((a,b)=>b.items.length-a.items.length);const top=groups[0];let confidence='LOW';if(top.items.length>=2&&valid.length>=2)confidence='HIGH';else if(valid.length===1)confidence='SINGLE SOURCE';const aw=valid.find(x=>x.source==='AviationWeather'),cw=valid.find(x=>x.source==='CheckWX'),wu=valid.find(x=>x.source==='WU Obs');const warnings=[];if(aw&&cw&&Math.abs(aw.temp_c-cw.temp_c)>3)warnings.push('AviationWeather vs CheckWX mismatch >3°C');if(aw&&wu&&Math.abs(aw.temp_c-wu.temp_c)>5)warnings.push('AviationWeather vs WU mismatch >5°C');if(cw&&wu&&Math.abs(cw.temp_c-wu.temp_c)>5)warnings.push('CheckWX vs WU mismatch >5°C');const finalC=round1(top.temp_c);return{final_temp_c:finalC,final_temp_f:round1(toF(finalC)),confidence,verdict:warnings.length?'cross-check warning':'trusted by majority/available source',majority:top.items.map(x=>x.source),warnings};}
async function fetchCheckWxMetar(env,station){if(!env.CHECKWX_KEY)return{ok:false,error:'CHECKWX_KEY missing',latest:null};try{const r=await fetch(`https://api.checkwx.com/v2/metar/${station}/decoded`,{headers:{'X-API-KEY':env.CHECKWX_KEY,'Accept':'application/json'}});const txt=await r.text();if(!r.ok)return{ok:false,error:`HTTP ${r.status}: ${txt.slice(0,160)}`,latest:null};const j=JSON.parse(txt);const d=(j.data||[])[0]||null;if(!d)return{ok:false,error:'No CheckWX data',latest:null};let c=null,f=null;if(d.temperature){c=n(d.temperature.celsius??d.temperature.degrees_celsius??d.temperature.value);f=n(d.temperature.fahrenheit??d.temperature.degrees_fahrenheit);}if(c==null){const p=parseMetarTempFromRaw(d.raw_text||d.raw||'');c=p.temp_c;}if(f==null&&c!=null)f=toF(c);return{ok:true,error:null,latest:{source:'CheckWX',temp_c:c,temp_f:f,time:d.observed||d.observed_at||d.timestamp||null,raw:d.raw_text||d.raw||null,station:d.icao||station}};}catch(e){return{ok:false,error:String(e.message||e),latest:null};}}
async function fetchAviationWeatherMetar(station){try{const arr=await getJson(`https://aviationweather.gov/api/data/metar?ids=${station}&hours=6&format=json`,1);const latest=Array.isArray(arr)?arr[0]:null;if(!latest)return{ok:false,error:'No AviationWeather data',latest:null,rows:[]};const c=n(latest.temp);return{ok:true,error:null,latest:{source:'AviationWeather',temp_c:c,temp_f:toF(c),time:latest.reportTime||latest.obsTime||null,raw:latest.rawOb||null,station:latest.icaoId||station},rows:arr};}catch(e){return{ok:false,error:String(e.message||e),latest:null,rows:[]};}}

async function historyPayload(env,date){
  const db = env.DB || env.D1 || env.DATABASE;
  if(!db) return {ok:false,error:'D1 DB binding missing',wu_obs_rows:{},metar_rows:[],forecast_rows:[],forecast_snapshot_rows:[]};
  async function all(sql, params=[]){
    try{ return (await db.prepare(sql).bind(...params).all()).results || []; }
    catch(e){ return []; }
  }
  const wu = await all(`SELECT * FROM vilk_wu_history WHERE substr(obs_time,1,10)=? OR date(fetched_at)=? OR date(created_at)=? ORDER BY COALESCE(obs_time,fetched_at,created_at) ASC LIMIT 500`, [date,date,date]);
  const metar = await all(`SELECT * FROM vilk_metar_history WHERE obs_date=? OR substr(valid_ist,1,10)=? ORDER BY valid_ist ASC LIMIT 200`, [date,date]);
  const fc = await all(`SELECT * FROM vilk_forecast_history WHERE forecast_date=? ORDER BY fetched_at ASC LIMIT 500`, [date]);
  const snaps = await all(`SELECT id,forecast_date,target_date,horizon_days,fetch_time_ist,forecast_issue_time_ist,source,high_c,low_c,high_f,low_f,created_at FROM vilk_forecast_snapshots WHERE target_date=? OR forecast_date=? ORDER BY created_at ASC LIMIT 400`, [date,date]);
  const wu_obs_rows={};
  for(const r of wu){
    const slot = r.slot || String(r.obs_time||r.fetched_at||'').slice(11,16) || '00:00';
    if(!wu_obs_rows[slot]) wu_obs_rows[slot]=[];
    wu_obs_rows[slot].push(r);
  }
  return {ok:true,today_ist:date,wu_obs_rows,metar_rows:metar,forecast_rows:fc,forecast_snapshot_rows:snaps};
}

async function liveCrosscheck(env,date){const station=env.METAR_STATION||env.WU_ICAO||'VILK';let hist={};try{hist=await historyPayload(env,date);}catch(e){hist={ok:false,error:String(e.message||e),wu_obs_rows:{},metar_rows:[],forecast_rows:[],forecast_snapshot_rows:[]};}const aw=await fetchAviationWeatherMetar(station);const cw=await fetchCheckWxMetar(env,station);const wuLatest=pickLatestWuFromHistory(hist);const sources=[aw.latest,cw.latest,wuLatest].filter(Boolean);const vote=tempVote(sources);return{ok:true,station,date,updated_at:timeIST(),checkwx_enabled:!!env.CHECKWX_KEY,aviationweather:aw.latest,checkwx:cw.latest,wu_latest:wuLatest,final_live:vote,source_status:{aviationweather_ok:aw.ok,checkwx_ok:cw.ok,history_ok:!!hist.ok},errors:{aviationweather:aw.error,checkwx:cw.error,history:hist.error||null},rule:'Live final = majority within 1°C among AviationWeather, CheckWX, WU Obs. If one source differs by >3–5°C it is flagged, not blindly used.'};}


function aiRoundBins(base, lowerSignal, binCount){
  const b=safeNumAI(base);
  if(b==null) return [];
  if(binCount===2){
    if(lowerSignal){
      const hi=Math.ceil(b+0.6);
      return [hi-1,hi];
    }else{
      const lo=Math.floor(b+0.2);
      return [lo,lo+1];
    }
  }
  // 3-bin highest winrate mode from backtest: rain/cloud/falling = lower hedge, sunny/rising = upper hedge
  if(lowerSignal){
    const hi=Math.ceil(b+0.6);
    return [hi-2,hi-1,hi];
  }else{
    const lo=Math.floor(b+0.8);
    return [lo,lo+1,lo+2];
  }
}
function safeNumAI(v){ const x=Number(v); return Number.isFinite(x)?x:null; }
function safeStrAI(v){ return String(v==null?'':v); }
function aiSignalForDay(item, label, horizonDays){
  const hourly=safeNumAI(item?.hourly_high_c ?? item?.hourly_max_c ?? item?.hourlyHighC);
  const daily=safeNumAI(item?.high_c ?? item?.daily_high_c ?? item?.today_c);
  const base=hourly!=null?hourly:daily;
  const dailyMinusHourly=(daily!=null&&hourly!=null)?+(daily-hourly).toFixed(3):null;
  const dailyTrend=safeStrAI(item?.daily_trend ?? item?.trend).toLowerCase();
  const hourlyTrend=safeStrAI(item?.hourly_trend).toLowerCase();
  const phrase=safeStrAI(item?.phrase ?? item?.condition).toLowerCase();
  const rainPct=safeNumAI(item?.rain_pct)||0;
  const current=safeNumAI(item?.current_c);
  const obsPeak=safeNumAI(item?.today_main_c ?? item?.obs_peak_c);
  const slowObs=(current!=null&&obsPeak!=null&&current<obsPeak-0.7);
  const lowerSignal =
    rainPct>=10 ||
    /rain|shower|drizzle|storm|thunder|cloud|mist|haze|br|hz|du/i.test(phrase) ||
    dailyMinusHourly>0.4 ||
    dailyTrend==='falling' ||
    hourlyTrend==='falling' ||
    slowObs;

  const bins2=aiRoundBins(base,lowerSignal,2);
  const bins3=aiRoundBins(base,lowerSignal,3);

  let stage='WAIT';
  let conf2=0.70, conf3=0.88;
  if(horizonDays>=3){stage='EARLY 3-BIN'; conf2=0.77; conf3=0.96;}
  else if(horizonDays===2){stage='D-2 3-BIN SAFE'; conf2=0.81; conf3=0.93;}
  else if(horizonDays===1){stage='D-1 PRIME'; conf2=0.79; conf3=0.93;}
  else {stage='SAME DAY CONFIRM'; conf2=0.83; conf3=0.96;}

  // Same-day after live floor exists, reduce escape risk.
  if(horizonDays===0 && base!=null){
    const officialFloor=officialMetarFloorFromItemAI(item);
    if(officialFloor!=null){
      if(!bins2.includes(officialFloor) || bins2.some(x=>x<officialFloor)){
        const c=Math.max(officialFloor,Math.round(base));
        bins2.splice(0,bins2.length,Math.max(officialFloor,c-1),Math.max(officialFloor,c));
        bins2.splice(0,bins2.length,...[...new Set(bins2)].sort((a,b)=>a-b));
        while(bins2.length<2) bins2.push(bins2.at(-1)+1);
      }
      if(!bins3.includes(officialFloor) || bins3.some(x=>x<officialFloor)){
        const c=Math.max(officialFloor,Math.round(base));
        bins3.splice(0,bins3.length,Math.max(officialFloor,c-2),Math.max(officialFloor,c-1),Math.max(officialFloor,c));
        bins3.splice(0,bins3.length,...[...new Set(bins3)].sort((a,b)=>a-b));
        while(bins3.length<3) bins3.push(bins3.at(-1)+1);
      }
    }
  }

  const escapeRisk2=+(100*(1-conf2)).toFixed(1);
  const escapeRisk3=+(100*(1-conf3)).toFixed(1);

  const peakTime=peakTimeProbAI(item);
  const reasons=[];
  reasons.push(`Base = WU hourly max ${hourly!=null?hourly+'°C':'—'}; daily ${daily!=null?daily+'°C':'—'}`);
  if(lowerSignal) reasons.push('Lower-side hedge: rain/cloud/mist/falling or daily > hourly suppression signal');
  else reasons.push('Upper-side hedge: clearer/rising or hourly supports heat');
  if(dailyMinusHourly!=null) reasons.push(`Daily-hourly gap ${dailyMinusHourly>0?'+':''}${dailyMinusHourly}°C`);
  if(current!=null) reasons.push(`WU obs now ${current}°C, WU peak ${obsPeak??'—'}°C (soft only)`);
  const officialFloorReason=officialMetarFloorFromItemAI(item); if(officialFloorReason!=null) reasons.push(`Official METAR/CheckWX floor locked: ${officialFloorReason}°C`);

  return {
    date:item.date, label, horizon_days:horizonDays, stage,
    base_c:base, base_f:base!=null?cToF(base):null,
    lower_signal:lowerSignal,
    best_2_bins:bins2,
    safe_3_bins:bins3,
    confidence_2:Math.round(conf2*100),
    confidence_3:Math.round(conf3*100),
    escape_risk_2:escapeRisk2,
    escape_risk_3:escapeRisk3,
    buy_rule:'2-bin only if total cost <= 60 and escape risk <= 20%; otherwise use 3-bin or skip.',
    reasons
  };
}
async function aiBinSignal(env, day){
  try{
    const highs=await polymarketDailyAndHourlyHighsFinal(env,day);
    const dates=Object.keys(highs.days||{}).sort();
    const signals={};
    dates.forEach((d,i)=>{
      try{
        const item=highs.days[d]||{};
        signals[d]=aiSignalForDay(item, item.label||(`D+${i}`), i);
      }catch(e){
        signals[d]={
          date:d,
          label:(highs.days[d]&&highs.days[d].label)||`D+${i}`,
          error:String(e.message||e),
          best_2_bins:[],
          safe_3_bins:[],
          confidence_2:0,
          confidence_3:0,
          escape_risk_2:100,
          escape_risk_3:100,
          reasons:['AI signal failed for this day but endpoint stayed alive']
        };
      }
    });
    return {
      ok:true,
      base_date:day,
      updated_at:timeIST(),
      note:'Highest-winrate mode: WU hourly max primary; rain/cloud/WU obs suppression decides lower/upper hedge. Endpoint is null-safe.',
      signals
    };
  }catch(e){
    return {ok:false,base_date:day,updated_at:timeIST(),error:String(e.message||e),signals:{}};
  }
}


function clampAI(x,a,b){ x=Number(x); if(!Number.isFinite(x)) return a; return Math.max(a,Math.min(b,x)); }
function sigmoidAI(x){ return 1/(1+Math.exp(-x)); }
function normProbMapAI(scores){
  const vals=Object.values(scores).map(Number);
  const max=Math.max(...vals);
  const exps={}; let sum=0;
  for(const k of Object.keys(scores)){ const e=Math.exp((scores[k]-max)/0.85); exps[k]=e; sum+=e; }
  const out={};
  for(const k of Object.keys(exps)) out[k]=+(100*exps[k]/sum).toFixed(1);
  return out;
}
function binArrayProbAI(probMap,bins){
  let s=0; for(const b of bins) s += Number(probMap[String(b)]||0);
  return +s.toFixed(1);
}
function chooseTopBinsAI(probMap,count){
  return Object.entries(probMap).sort((a,b)=>b[1]-a[1]).slice(0,count).map(x=>Number(x[0])).sort((a,b)=>a-b);
}
function contiguousBestBinsAI(probMap,count){
  const bins=Object.keys(probMap).map(Number).sort((a,b)=>a-b);
  let best=null;
  for(let i=0;i<=bins.length-count;i++){
    const arr=bins.slice(i,i+count);
    const p=binArrayProbAI(probMap,arr);
    if(!best || p>best.p) best={bins:arr,p};
  }
  return best || {bins:[],p:0};
}
function getHourISTAI(){
  try{ return Number(new Date().toLocaleString('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false})); }
  catch(e){ return new Date().getUTCHours()+5.5; }
}
function estimatePeakTimeRiskAI(item){
  const hour=getHourISTAI();
  const phrase=String(item?.phrase||item?.condition||'').toLowerCase();
  const rain=Number(item?.rain_pct||0);
  const cloud=/rain|shower|drizzle|storm|thunder|cloud|mist|haze|br|hz/i.test(phrase);
  if(hour<10) return {peak_done_prob:8, late_peak_prob:70};
  if(hour<12) return {peak_done_prob:18+(cloud?12:0), late_peak_prob:55-(rain>20?8:0)};
  if(hour<14) return {peak_done_prob:38+(cloud?18:0)+(rain>20?12:0), late_peak_prob:35-(rain>20?12:0)};
  if(hour<16) return {peak_done_prob:62+(cloud?12:0)+(rain>20?10:0), late_peak_prob:18};
  return {peak_done_prob:82, late_peak_prob:6};
}

function officialMetarFloorFromItemAI(item){
  item=item||{};
  // Only official sources can create the hard floor for current day:
  // METAR / CheckWX / AviationWeather / final_live cross-check.
  const candidates=[
    item.metar_peak_c,
    item.metar_high_c,
    item.official_peak_c,
    item.official_high_c,
    item.checkwx_peak_c,
    item.aviationweather_peak_c,
    item.final_live_peak_c,
    item.final_metar_c
  ].map(safeNumAI).filter(x=>x!=null);
  if(candidates.length) return Math.round(Math.max(...candidates));

  // Some payloads only expose latest official METAR temp, not peak.
  const latestOfficial=[
    item.metar_c,
    item.metar_temp_c,
    item.latest_metar_c,
    item.checkwx_c,
    item.aviationweather_c,
    item.final_live_c
  ].map(safeNumAI).filter(x=>x!=null);
  if(latestOfficial.length) return Math.round(Math.max(...latestOfficial));

  return null;
}
function wuSoftFloorFromItemAI(item){
  item=item||{};
  const vals=[item.today_main_c,item.obs_peak_c,item.current_c].map(safeNumAI).filter(x=>x!=null);
  return vals.length?Math.round(Math.max(...vals)):null;
}


function peakTimeProbAI(item){
  item=item||{};
  const phrase=safeStrAI(item?.phrase ?? item?.condition).toLowerCase();
  const rain=safeNumAI(item?.rain_pct)||0;
  const cloud=/rain|shower|drizzle|storm|thunder|cloud|mist|haze|br|hz/i.test(phrase);
  const current=safeNumAI(item?.current_c), obsPeak=safeNumAI(item?.today_main_c ?? item?.obs_peak_c);
  const holding=current!=null&&obsPeak!=null&&Math.abs(current-obsPeak)<=0.4;
  let scores={
    "12-1 PM": cloud?0.9:0.45,
    "1-2 PM": cloud?1.0:0.8,
    "2-3 PM": holding?1.2:1.05,
    "3-4 PM": (!cloud?1.15:0.75),
    "4-5 PM": (!cloud&&rain<15?0.85:0.45),
    "5 PM+": (!cloud&&rain<10?0.35:0.2)
  };
  if(rain>=30){ scores["12-1 PM"]+=0.45; scores["1-2 PM"]+=0.35; scores["3-4 PM"]-=0.25; scores["4-5 PM"]-=0.25; }
  const max=Math.max(...Object.values(scores));
  let sum=0, ex={};
  for(const k of Object.keys(scores)){ ex[k]=Math.exp(scores[k]-max); sum+=ex[k]; }
  const out={};
  for(const k of Object.keys(ex)) out[k]=+(100*ex[k]/sum).toFixed(1);
  const best=Object.entries(out).sort((a,b)=>b[1]-a[1])[0];
  return {probs:out,best_window:best?best[0]:null,best_prob:best?best[1]:null};
}

function aiDecisionForDay(item,label,horizonDays,prices){
  item=item||{};
  const hourly=safeNumAI(item?.hourly_high_c ?? item?.hourly_max_c ?? item?.hourlyHighC);
  const daily=safeNumAI(item?.high_c ?? item?.daily_high_c ?? item?.today_c);
  const current=safeNumAI(item?.current_c);
  const obsPeak=safeNumAI(item?.today_main_c ?? item?.obs_peak_c);
  const rain=safeNumAI(item?.rain_pct)||0;
  const phrase=safeStrAI(item?.phrase ?? item?.condition).toLowerCase();
  const dailyMinusHourly=(daily!=null&&hourly!=null)?daily-hourly:0;
  const dailyTrend=safeStrAI(item?.daily_trend ?? item?.trend).toLowerCase();
  const hourlyTrend=safeStrAI(item?.hourly_trend).toLowerCase();
  const base = hourly!=null ? hourly : (daily!=null ? daily : (obsPeak!=null ? obsPeak : current));
  if(base==null){
    return {date:item.date,label,error:'No usable forecast/obs data',status:'WAIT',bin_probs:{},best_bin:null,safe_2_bins:[],safe_3_bins:[]};
  }

  let bias=0;
  const lowerSignals=[];
  const upperSignals=[];
  if(rain>=30){ bias-=0.8; lowerSignals.push('rain risk high'); }
  else if(rain>=10){ bias-=0.35; lowerSignals.push('rain risk'); }
  if(/rain|shower|drizzle|storm|thunder/i.test(phrase)){ bias-=0.75; lowerSignals.push('rain/storm phrase'); }
  else if(/cloud|mist|haze|br|hz/i.test(phrase)){ bias-=0.25; lowerSignals.push('cloud/mist/haze'); }
  if(dailyMinusHourly>0.4){ bias-=0.35; lowerSignals.push('daily higher than hourly = suppression risk'); }
  if(dailyTrend==='falling' || hourlyTrend==='falling'){ bias-=0.35; lowerSignals.push('forecast falling'); }
  if(dailyMinusHourly<-0.3){ bias+=0.25; upperSignals.push('hourly stronger than daily'); }
  if(dailyTrend==='rising' || hourlyTrend==='rising'){ bias+=0.35; upperSignals.push('forecast rising'); }
  if(obsPeak!=null && base<obsPeak){ bias += (obsPeak-base)*0.55; upperSignals.push('live peak already above forecast base'); }
  if(current!=null && obsPeak!=null && current<obsPeak-1.0){ bias-=0.25; lowerSignals.push('current below earlier peak'); }

  const center=base+bias;
  const liveFloor = horizonDays===0 ? officialMetarFloorFromItemAI(item) : null;
  const wuSoftFloor = horizonDays===0 ? wuSoftFloorFromItemAI(item) : null;
  const minBin=Math.floor(center)-3;
  const maxBin=Math.ceil(center)+3;
  const scores={};
  const peakRisk=estimatePeakTimeRiskAI(item);
  for(let b=minBin;b<=maxBin;b++){
    let dist=Math.abs(b-center);
    let score= -dist*1.15;
    if(liveFloor!=null && b<liveFloor) score-=9.0; // official METAR/CheckWX confirmed floor: lower bins impossible
    if(liveFloor!=null && b===liveFloor) score += peakRisk.peak_done_prob/100*1.05;
    if(liveFloor!=null && b>liveFloor) score += peakRisk.late_peak_prob/100*0.55;
    if(wuSoftFloor!=null && b<wuSoftFloor) score-=12; // current-day WU/obs hit floor: lower bin not tradable
    if(rain>=30 && b>=Math.round(center)+1) score-=0.45;
    scores[String(b)]=score;
  }
  const probs=normProbMapAI(scores);
  const bestBin=Number(Object.entries(probs).sort((a,b)=>b[1]-a[1])[0]?.[0]);
  const best2=contiguousBestBinsAI(probs,2);
  const best3=contiguousBestBinsAI(probs,3);
  const top3=chooseTopBinsAI(probs,3);
  const escape2=+(100-best2.p).toFixed(1);
  const escape3=+(100-best3.p).toFixed(1);

  let status='WAIT';
  const hour=getHourISTAI();
  let lockScore=0;
  if(best2.p>=78) lockScore+=35;
  if(best3.p>=90) lockScore+=20;
  if(escape2<=22) lockScore+=20;
  if(horizonDays<=1) lockScore+=10;
  if(hour>=8) lockScore+=10;
  if(hour>=10) lockScore+=10;
  if(rain>=30) lockScore-=12;
  if(Math.abs(dailyMinusHourly)>0.8) lockScore-=6;
  if(lockScore>=75) status='LOCKED';
  else if(lockScore>=55) status='READY';
  else if(lockScore>=35) status='BUILDING';

  const pricesObj=prices||{};
  function costForBins(arr){
    let c=0, ok=false;
    for(const b of arr){
      const p=safeNumAI(pricesObj[String(b)] ?? pricesObj[b]);
      if(p!=null){ c+=p; ok=true; }
    }
    return ok?+c.toFixed(2):null;
  }
  const cost2=costForBins(best2.bins);
  const cost3=costForBins(best3.bins);
  const ev2=cost2!=null ? +((best2.p/100)-cost2/100).toFixed(3) : null;
  const ev3=cost3!=null ? +((best3.p/100)-cost3/100).toFixed(3) : null;
  let action='WAIT';
  if(status==='LOCKED' && (cost2==null || cost2<=60) && escape2<=22) action='BUY_2_BIN';
  else if((status==='READY'||status==='LOCKED') && (cost3==null || cost3<=75) && escape3<=10) action='BUY_3_BIN_SAFE';
  else if(status==='READY') action='WAIT_FOR_PRICE_OR_CONFIRM';

  const reasons=[
    `base ${base.toFixed(3)}°C; bias ${bias>=0?'+':''}${bias.toFixed(2)}°C; adjusted ${center.toFixed(3)}°C`,
    `official METAR floor ${liveFloor??'not confirmed'}; WU soft floor ${wuSoftFloor??'—'}`,
    `best bin ${bestBin} = ${probs[String(bestBin)]}%`,
    `2-bin ${best2.bins.join('/')} = ${best2.p}% hit, escape ${escape2}%`,
    `3-bin ${best3.bins.join('/')} = ${best3.p}% hit, escape ${escape3}%`,
    ...lowerSignals.map(x=>'lower: '+x),
    ...upperSignals.map(x=>'upper: '+x)
  ].slice(0,9);

  return {
    date:item.date,label,horizon_days:horizonDays,
    status,action,lock_score:Math.round(lockScore),
    base_c:+base.toFixed(3),adjusted_c:+center.toFixed(3),
    official_floor_bin:liveFloor,
    wu_soft_floor_bin:wuSoftFloor,
    live_floor_bin:liveFloor,
    peak_done_prob:Math.round(peakRisk.peak_done_prob),
    late_peak_prob:Math.round(peakRisk.late_peak_prob),
    peak_time_probs:peakTime.probs,
    peak_time_best_window:peakTime.best_window,
    peak_time_best_prob:peakTime.best_prob,
    bin_probs:probs,
    best_bin:bestBin,
    top_3_bins:top3,
    safe_2_bins:best2.bins,
    safe_2_prob:best2.p,
    escape_risk_2:escape2,
    safe_3_bins:best3.bins,
    safe_3_prob:best3.p,
    escape_risk_3:escape3,
    cost_2:cost2,cost_3:cost3,ev_2:ev2,ev_3:ev3,
    reasons
  };
}
async function aiTradeDecision(env, day, url){
  try{
    const highs=await polymarketDailyAndHourlyHighsFinal(env,day);
    const priceParam=url?.searchParams?.get('prices');
    let prices={};
    if(priceParam){ try{ prices=JSON.parse(priceParam); }catch(e){} }
    const dates=Object.keys(highs.days||{}).sort();
    const decisions={};
    dates.forEach((d,i)=>{
      try{ decisions[d]=aiDecisionForDay(highs.days[d], highs.days[d].label||`D+${i}`, i, prices); }
      catch(e){ decisions[d]={date:d,label:(highs.days[d]&&highs.days[d].label)||`D+${i}`,status:'WAIT',error:String(e.message||e)}; }
    });
    return {ok:true,base_date:day,updated_at:timeIST(),note:'AI trade decision engine: per-bin probability, best 2/3 bins, escape risk, trade timing lock, optional EV with prices JSON.',decisions};
  }catch(e){
    return {ok:false,base_date:day,updated_at:timeIST(),error:String(e.message||e),decisions:{}};
  }
}


function aiClamp(x,a,b){x=Number(x);if(!Number.isFinite(x))return a;return Math.max(a,Math.min(b,x));}
function aiSoftmax(scores){
  const vals=Object.values(scores).map(Number);
  const max=Math.max(...vals);
  let sum=0, ex={};
  for(const k of Object.keys(scores)){ex[k]=Math.exp((scores[k]-max)/0.9);sum+=ex[k];}
  const out={};
  for(const k of Object.keys(ex)) out[k]=+(100*ex[k]/sum).toFixed(1);
  return out;
}
function aiBestContiguous(prob,count){
  const bins=Object.keys(prob).map(Number).sort((a,b)=>a-b);
  let best={bins:[],prob:0};
  for(let i=0;i<=bins.length-count;i++){
    const arr=bins.slice(i,i+count);
    const p=+arr.reduce((s,b)=>s+Number(prob[String(b)]||0),0).toFixed(1);
    if(p>best.prob) best={bins:arr,prob:p};
  }
  return best;
}
function aiOfficialFloor(item){
  item=item||{};
  const vals=[
    item.metar_peak_c,item.metar_high_c,item.official_peak_c,item.official_high_c,
    item.checkwx_peak_c,item.aviationweather_peak_c,item.final_live_peak_c,item.final_metar_c,
    item.metar_c,item.metar_temp_c,item.latest_metar_c,item.checkwx_c,item.aviationweather_c,item.final_live_c
  ].map(safeNumAI).filter(x=>x!=null);
  return vals.length?Math.round(Math.max(...vals)):null;
}
function aiWuSoftFloor(item){
  const vals=[item?.today_main_c,item?.obs_peak_c,item?.current_c].map(safeNumAI).filter(x=>x!=null);
  return vals.length?Math.round(Math.max(...vals)):null;
}
function aiPeakTime(item){
  item=item||{};
  const phrase=safeStrAI(item.phrase ?? item.condition).toLowerCase();
  const rain=safeNumAI(item.rain_pct)||0;
  const current=safeNumAI(item.current_c), obsPeak=safeNumAI(item.today_main_c ?? item.obs_peak_c);
  const cloud=/rain|shower|drizzle|storm|thunder|cloud|mist|haze|br|hz/i.test(phrase);
  const holding=current!=null&&obsPeak!=null&&Math.abs(current-obsPeak)<=0.4;
  let scores={"12-1 PM":cloud?1.0:0.55,"1-2 PM":cloud?1.05:0.85,"2-3 PM":holding?1.25:1.08,"3-4 PM":(!cloud?1.18:0.78),"4-5 PM":(!cloud&&rain<15?0.88:0.45),"5 PM+":(!cloud&&rain<10?0.35:0.18)};
  if(rain>=30){scores["12-1 PM"]+=0.45;scores["1-2 PM"]+=0.35;scores["3-4 PM"]-=0.25;scores["4-5 PM"]-=0.25;}
  const prob=aiSoftmax(scores);
  const best=Object.entries(prob).sort((a,b)=>b[1]-a[1])[0]||[null,null];
  return {probs:prob,best_window:best[0],best_prob:best[1]};
}
function aiDecision(item,label,horizon){
  item=item||{};
  const hourly=safeNumAI(item.hourly_high_c ?? item.hourly_max_c ?? item.hourlyHighC);
  const daily=safeNumAI(item.high_c ?? item.daily_high_c ?? item.today_c);
  const current=safeNumAI(item.current_c);
  const obsPeak=safeNumAI(item.today_main_c ?? item.obs_peak_c);
  const base=hourly!=null?hourly:(daily!=null?daily:(obsPeak!=null?obsPeak:current));
  if(base==null) return {label,date:item.date,status:'WAIT',error:'No usable data',probabilities:{}};
  const phrase=safeStrAI(item.phrase ?? item.condition).toLowerCase();
  const rain=safeNumAI(item.rain_pct)||0;
  const dailyGap=(daily!=null&&hourly!=null)?daily-hourly:0;
  const officialFloor=horizon===0?aiOfficialFloor(item):null;
  const wuFloor=horizon===0?aiWuSoftFloor(item):null;
  const tradeFloor = horizon===0 ? Math.max(...[officialFloor, wuFloor].filter(x=>x!=null)) : null;

  let bias=0; const reasons=[];
  if(rain>=30){bias-=0.8;reasons.push('rain risk high');}
  else if(rain>=10){bias-=0.35;reasons.push('rain risk');}
  if(/rain|shower|drizzle|storm|thunder/i.test(phrase)){bias-=0.75;reasons.push('rain/storm phrase');}
  else if(/cloud|mist|haze|br|hz/i.test(phrase)){bias-=0.25;reasons.push('cloud/mist/haze');}
  if(dailyGap>0.4){bias-=0.35;reasons.push('daily > hourly: suppression risk');}
  if(dailyGap<-0.3){bias+=0.25;reasons.push('hourly stronger than daily');}
  if(wuFloor!=null && base<wuFloor){bias+=(wuFloor-base)*0.25;reasons.push('WU obs above forecast (soft only)');}
  const adjusted=base+bias;
  const peak=aiPeakTime(item);
  const peakDone=(horizon>0)?0:(new Date().toLocaleString('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hour12:false})>=14?65:30);

  const minBin=Math.floor(adjusted)-3, maxBin=Math.ceil(adjusted)+3;
  const scores={};
  for(let b=minBin;b<=maxBin;b++){
    let score=-Math.abs(b-adjusted)*1.15;
    if(tradeFloor!=null && b<tradeFloor) score-=12;      // current-day already-hit floor: no lower bin trade probability
    if(tradeFloor!=null && b===tradeFloor) score+=0.85;
    if(tradeFloor!=null && b>tradeFloor) score+=0.25;
    if(rain>=30 && b>Math.round(adjusted)) score-=0.35;
    scores[String(b)]=score;
  }
  let probabilities=aiSoftmax(scores);
  // force official impossible bins close to 0 and renormalize
  if(tradeFloor!=null){
    const filtered={};
    for(const [k,v] of Object.entries(probabilities)) filtered[k]=Number(k)<tradeFloor?0:v;
    const sum=Object.values(filtered).reduce((a,b)=>a+b,0)||1;
    probabilities={};
    for(const [k,v] of Object.entries(filtered)) probabilities[k]=+(100*v/sum).toFixed(1);
  }
  const bestBin=Number(Object.entries(probabilities).sort((a,b)=>b[1]-a[1])[0]?.[0]);
  const safe2=aiBestContiguous(probabilities,2);
  const safe3=aiBestContiguous(probabilities,3);
  const conf=safe2.prob;
  let status='WAIT';
  let lockScore=0;
  if(conf>=78) lockScore+=35;
  if(safe3.prob>=92) lockScore+=20;
  if(100-safe2.prob<=22) lockScore+=20;
  if(horizon<=1) lockScore+=10;
  if(horizon===0) lockScore+=15;
  if(rain>=30) lockScore-=10;
  if(lockScore>=75) status='LOCKED'; else if(lockScore>=55) status='READY'; else if(lockScore>=35) status='BUILDING';
  const action = status==='LOCKED' && safe2.prob>=78 ? 'BUY_2_BIN' : (status==='READY'?'WATCH_PRICE':'WAIT');

  return {
    date:item.date,label,horizon_days:horizon,status,action,lock_score:Math.round(lockScore),
    updated_at:timeIST(),
    best_bin:bestBin, best_bin_prob:probabilities[String(bestBin)]||0,
    probabilities, safe_2_bins:safe2.bins, safe_2_prob:safe2.prob, escape_2:+(100-safe2.prob).toFixed(1),
    safe_3_bins:safe3.bins, safe_3_prob:safe3.prob, escape_3:+(100-safe3.prob).toFixed(1),
    peak_time_probs:peak.probs, peak_time_best_window:peak.best_window, peak_time_best_prob:peak.best_prob,
    official_floor_bin:officialFloor, wu_soft_floor_bin:wuFloor, trade_floor_bin:tradeFloor,
    base_c:+base.toFixed(3), adjusted_c:+adjusted.toFixed(3),
    reasons:[`base ${base.toFixed(3)}°C → adjusted ${adjusted.toFixed(3)}°C`,`official floor ${officialFloor??'not confirmed'}; WU hit floor ${wuFloor??'—'}; trade floor ${tradeFloor??'—'}`,`peak window ${peak.best_window||'—'} ${peak.best_prob||'—'}%`,...reasons].slice(0,8)
  };
}
async function unifiedAI(env, day){
  try{
    const highs=await polymarketDailyAndHourlyHighsFinal(env,day);
    const dates=Object.keys(highs.days||{}).sort();
    const days={};
    dates.forEach((d,i)=>{days[d]=aiDecision(highs.days[d]||{}, (highs.days[d]&&highs.days[d].label)||`D+${i}`, i);});
    return {ok:true,base_date:day,updated_at:timeIST(),days,today:days[day]||null};
  }catch(e){return {ok:false,base_date:day,updated_at:timeIST(),error:String(e.message||e),days:{},today:null};}
}

export default { async fetch(request, env){ const url=new URL(request.url); if(url.pathname==='/api/collect') return json(await collect(env)); if(url.pathname==='/api/live-crosscheck') return json(await liveCrosscheck(env, url.searchParams.get('date')||dateIST()));
  if(url.pathname==='/api/ai') return json(await unifiedAI(env, url.searchParams.get('date')||dateIST()));
  if(url.pathname==='/api/ai-trade-decision') return json(await aiTradeDecision(env, url.searchParams.get('date')||dateIST(), url));
  if(url.pathname==='/api/ai-bin-signal') return json(await aiBinSignal(env, url.searchParams.get('date')||dateIST()));
  if(url.pathname==='/api/history') return json(await history(env, url.searchParams.get('date')||dateIST())); if(url.pathname==='/api/wu-latest') { const day=url.searchParams.get('date')||dateIST(); const row=await env.DB.prepare('SELECT * FROM wu_obs WHERE obs_date=? ORDER BY obs_time DESC LIMIT 1').bind(day).first(); return json({ok:true,row}); } if(url.pathname==='/api/polymarket-highs') return json(await polymarketDailyAndHourlyHighsFinal(env, url.searchParams.get('date')||dateIST())); if(url.pathname==='/api/forecast-snapshots') return json(await forecastSnapshots(env, url.searchParams.get('date')||dateIST())); if(url.pathname==='/api/forecast-high-debug') return json(await forecastHighDebug(env, url.searchParams.get('date')||dateIST())); return env.ASSETS.fetch(request); }, async scheduled(event, env, ctx){ctx.waitUntil(collect(env));} };

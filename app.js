/* Blue Tide door app v6. Local-first: everything lives in localStorage; cloud.js syncs on top when set up. */
(function(){
"use strict";
const VERSION="6.0.2";
const KEY="saltoff-v6", V5="saltoff-v5", OLD="saltoff-tracker-v1", OLDMETA="saltoff-meta-v1";

const SERVICES_DEFAULT=[{id:"windows",name:"Windows",price:199},{id:"cage",name:"Pool cage",price:350},{id:"both",name:"Windows + cage",price:525},{id:"other",name:"Other",price:0}];
const SCRIPTS_DEFAULT=[
  {t:"Opener",x:"Hey, how's it going? I'm {me} with {business}. I did a couple of houses over on [street] last week, and I'm working this street now. When was the last time you had your windows cleaned?"},
  {t:"Discovery",x:"Ask, then listen:\n• When were they last cleaned?\n• Do you do them yourself?\n• Anything coming up? Guests, holidays, selling the house?\n• Who usually notices this stuff?"},
  {t:"Count the glass",x:"\"Give me 30 seconds to count the glass and I'll give you an exact price.\"\nCount from the driveway. Come back with ONE number."},
  {t:"Price + close",x:"\"We hand-wash every pane, squeegee it streak-free, and wipe the frames and sills. For yours it's $___.\"\nThen give a choice: \"Tomorrow at 2 or Saturday at 9, which works better?\""},
  {t:"\"Let me think about it\"",x:"\"Totally. What's the part you'd want to think over?\"\nThen stop talking and listen. The real reason comes out."},
  {t:"\"We're good / don't care\"",x:"\"Totally fair. When's the last time they were cleaned?\"\nFind what's coming up in their life: guests, holidays, selling, a spouse who cares."},
  {t:"\"I have a cheaper quote\"",x:"\"Did that include the screens, frames and tracks?\"\nShow the value, then hold your price."},
  {t:"\"Ask my spouse\"",x:"\"Of course. Is he home now? I can give him the price in 20 seconds.\""},
  {t:"Rules",x:"• Only real neighbors, real claims.\n• Acknowledge, ask, listen.\n• No \"but\".\n• Get name, number, gate code.\n• Ask for the quarterly plan every time."}
];
const TPL_DEFAULT={
  confirm:"Hi {first}, it's {me} with {business}. Just confirming your cleaning {day} at {time}. If anything changes, just text me back!",
  onway:"Hi {first}, it's {me} from {business}. I'm on my way, see you in about 15 minutes!",
  pay:"Hi {first}, all done! Your total is ${price}.{zelleLine} Thanks so much!",
  review:"Thanks again, {first}! If you're happy with how it came out, a quick Google review would really help my small business: {review}",
  follow:"Hi {first}, it's {me} with {business}. We talked at your door about getting your windows cleaned. I have openings this week, want me to get you on the schedule?",
  quarterly:"Hi {first}, it's {me} from {business}. It's been about 3 months since your last cleaning. Want me to get you on the schedule this week?"
};
const NOTIF_DEFAULT={enabled:false,types:{knock30:true,knockStart:true,lateStart:true,confirm:true,followups:true,thin:true,plan:true,streak:true,collect:true},
  times:{confirm:"18:00",followups:"15:30",thin:"17:00",plan:"18:00",streak:"20:00",collect:"16:00"},quiet:{from:"21:00",to:"07:00"},school:{on:true,from:"07:30",to:"15:00"}};
const DEFAULT_SETTINGS={appName:"Blue Tide",me:"Surj",business:"Blue Tide Exterior Cleaning",brand:"",accent:"",
  weeklyGoal:1000,goalType:"revenue",defaultPrice:199,slots:["09:00","11:30","14:00","15:30"],zelle:"",review:"",idleMin:30,
  minDoors:15,thinJobs:3,helperPay:0,supplies:5,showScriptsOnStart:true,saveNoAnswers:true,useLocation:true,
  services:SERVICES_DEFAULT,scripts:SCRIPTS_DEFAULT,tpl:TPL_DEFAULT,notif:NOTIF_DEFAULT};
const DEF_RATES={answer:.40,close:.15,job:220,dph:25};

let S=null;
let tab="today", custFilter="all", custQuery="", moneyRange="week", mapOut="all", mapRange="today";
const listeners=[];
const $=s=>document.querySelector(s);
const uid=p=>p+"-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const clone=o=>JSON.parse(JSON.stringify(o));

/* ================= storage ================= */
function blank(){return {version:6,customers:{},jobs:{},sessions:{},log:[],pins:{},plans:{},settings:clone(DEFAULT_SETTINGS),meta:{lastBackup:0,street:"",undo:[],records:{},planDismiss:{},snaps:[],locAsked:false,stateUpdatedAt:0,sync:{}}}}
function save(){
  try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){toast("Phone storage is full. Back up, then delete old sessions.")}
  weeklySnapshot();updateBadge();
  listeners.forEach(fn=>{try{fn()}catch(e){}});
}
function load(){
  let raw=null;try{raw=localStorage.getItem(KEY)}catch(e){}
  if(raw){try{S=JSON.parse(raw)}catch(e){S=null}}
  if(!S||S.version!==6){
    S=blank();let v5=null;try{v5=JSON.parse(localStorage.getItem(V5)||"null")}catch(e){}
    if(v5&&v5.version===5){fromV5(v5)}
    else{let old=null,om=null;try{old=JSON.parse(localStorage.getItem(OLD)||"null");om=JSON.parse(localStorage.getItem(OLDMETA)||"null")}catch(e){}
      if(old&&typeof old==="object"){migrateV1(old);if(om&&om.lastBackup)S.meta.lastBackup=om.lastBackup;if(om&&om.lastPrice)S.settings.defaultPrice=Number(om.lastPrice)||199}}
    normalize();try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}
  }
  normalize();
}
function fixTpl(t){return String(t||"").replace(/Salt Off Window Cleaning/g,"{business}").replace(/Salt Off/g,"{business}").replace(/your window cleaning/g,"your cleaning")}
function fromV5(v5){
  S.customers=v5.customers||{};S.jobs=v5.jobs||{};S.sessions=v5.sessions||{};S.log=Array.isArray(v5.log)?v5.log:[];
  const st=v5.settings||{};const keep=["me","weeklyGoal","defaultPrice","slots","zelle","review","idleMin"];
  keep.forEach(k=>{if(st[k]!=null&&st[k]!=="")S.settings[k]=st[k]});
  if(st.tpl){for(const k of Object.keys(TPL_DEFAULT)){if(st.tpl[k])S.settings.tpl[k]=fixTpl(st.tpl[k])}}
  S.meta.lastBackup=(v5.meta&&v5.meta.lastBackup)||0;S.meta.street=(v5.meta&&v5.meta.street)||"";
  for(const j of Object.values(S.jobs)){if(!j.service)j.service="windows"}
}
/* old v1-v4 format: {"day-YYYY-MM-DD":{kind:"day",...},"lead-x":{kind:"lead",status,jobDate,lastDone,...}} */
function migrateV1(old){
  for(const [id,b] of Object.entries(old)){
    if(!b||typeof b!=="object")continue;
    if(b.kind==="day"){
      S.sessions[b.date]={date:b.date,area:b.area||"",doors:+b.doors||0,answered:+b.answered||0,yes:+b.yes||0,no:+b.no||0,maybe:+b.maybe||0,booked:+b.booked||0,intervals:[],manualMin:null,lastTap:null,legacy:true};
    }else if(b.kind==="lead"){
      const cid=id.startsWith("lead-")?"c"+id.slice(4):uid("c");
      const plan=b.status==="quarterly"?"quarterly":"one";
      const st=b.status==="follow"?"lead":b.status==="lost"?"lost":"customer";
      S.customers[cid]={id:cid,name:b.name||"",address:b.address||"",phone:b.phone||"",notes:b.notes||"",windows:b.windows||"",price:b.price||"",status:st,plan,followUp:b.followUp||"",createdAt:b.createdAt||today()};
      S.log.push({id:uid("l"),t:dateToTs(b.createdAt||today()),type:"created",cid,note:"Imported from old app"});
      const P=Number(b.price)||0;
      if(b.lastDone){const jid=uid("j");S.jobs[jid]={id:jid,cid,date:b.lastDone,time:"",price:P,service:"windows",status:"done",paid:true,paidVia:"",doneAt:dateToTs(b.lastDone),notes:""}}
      if((b.status==="booked"||b.status==="quarterly")&&b.jobDate&&b.jobDate!==b.lastDone){const jid=uid("j");S.jobs[jid]={id:jid,cid,date:b.jobDate,time:"",price:P,service:"windows",status:"scheduled",paid:false,notes:""}}
      if(b.status==="done"&&!b.lastDone){const jid=uid("j");const d=b.jobDate||b.createdAt||today();S.jobs[jid]={id:jid,cid,date:d,time:"",price:P,service:"windows",status:"done",paid:true,paidVia:"",doneAt:dateToTs(d),notes:""}}
    }
  }
}
function normalize(){
  for(const k of ["customers","jobs","sessions","pins","plans"])if(!S[k]||typeof S[k]!=="object")S[k]={};
  if(!Array.isArray(S.log))S.log=[];
  const st=S.settings||{};
  S.settings=Object.assign(clone(DEFAULT_SETTINGS),st);
  S.settings.tpl=Object.assign(clone(TPL_DEFAULT),st.tpl||{});
  const n=st.notif||{};
  S.settings.notif=Object.assign(clone(NOTIF_DEFAULT),n,{types:Object.assign(clone(NOTIF_DEFAULT.types),n.types||{}),times:Object.assign(clone(NOTIF_DEFAULT.times),n.times||{}),quiet:Object.assign(clone(NOTIF_DEFAULT.quiet),n.quiet||{}),school:Object.assign(clone(NOTIF_DEFAULT.school),n.school||{})});
  if(!Array.isArray(S.settings.services)||!S.settings.services.length)S.settings.services=clone(SERVICES_DEFAULT);
  if(!Array.isArray(S.settings.scripts)||!S.settings.scripts.length)S.settings.scripts=clone(SCRIPTS_DEFAULT);
  if(!Array.isArray(S.settings.slots)||!S.settings.slots.length)S.settings.slots=clone(DEFAULT_SETTINGS.slots);
  S.meta=Object.assign({lastBackup:0,street:"",undo:[],records:{},planDismiss:{},snaps:[],locAsked:false,stateUpdatedAt:0,sync:{}},S.meta||{});
  if(!Array.isArray(S.meta.undo))S.meta.undo=[];
  for(const s of Object.values(S.sessions)){if(!Array.isArray(s.intervals))s.intervals=[]}
  for(const j of Object.values(S.jobs)){if(!j.service)j.service="windows"}
  if(S.meta.weeks!=="sun")fixPlanWeeks();
}
/* Weeks used to start Monday, so on a Sunday "this week" meant the week that was ending.
   Sessions added for a day that had already passed get moved to that day next week,
   then every plan is filed under its Sunday. */
function fixPlanWeeks(){
  const all=[];
  for(const p of Object.values(S.plans)){if(!p||typeof p!=="object")continue;
    for(const ps of (Array.isArray(p.sessions)?p.sessions:[])){
      const made=parseInt(String(ps.id||"").slice(3,11),36);
      const end=atTime(ps.day,ps.start)+(ps.mins||120)*60e3;
      if(made>1.7e12&&made<Date.now()+864e5&&made>end)ps.day=addDays(ps.day,7);
      all.push({ps,goal:p.goal,doorsGoal:p.doorsGoal});
    }}
  const plans={};
  for(const {ps,goal,doorsGoal} of all){const w=weekStart(ps.day);const q=plans[w]=plans[w]||{weekStart:w,goal,doorsGoal,sessions:[]};q.sessions.push(ps)}
  S.plans=plans;S.meta.weeks="sun";
}
function weeklySnapshot(){
  const ws=weekStart(today());if(S.meta.lastSnapWeek===ws)return;
  try{
    localStorage.setItem("bluetide-snap-"+ws,JSON.stringify(S));S.meta.lastSnapWeek=ws;
    S.meta.snaps=[...(S.meta.snaps||[]).filter(x=>x!==ws),ws].slice(-4);
    const keep=new Set(S.meta.snaps);
    for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith("bluetide-snap-")&&!keep.has(k.slice(14)))localStorage.removeItem(k)}
    localStorage.setItem(KEY,JSON.stringify(S));
  }catch(e){}
}
function logIt(type,cid,jid,note){S.log.push({id:uid("l"),t:Date.now(),type,cid:cid||null,jid:jid||null,note:note||""});if(S.log.length>3000)S.log=S.log.slice(-3000)}

/* ================= dates ================= */
const pad=n=>String(n).padStart(2,"0");
const dk=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today=()=>dk(new Date());
const toDate=k=>{const [y,m,d]=k.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(k,n)=>{const x=toDate(k);x.setDate(x.getDate()+n);return dk(x)};
const dateToTs=k=>{try{return toDate(k).getTime()+12*3600e3}catch(e){return Date.now()}};
const atTime=(k,t)=>{const x=toDate(k);const [h,m]=(t||"00:00").split(":").map(Number);x.setHours(h,m,0,0);return x.getTime()};
const weekStart=k=>{const d=toDate(k);d.setDate(d.getDate()-d.getDay());return dk(d)};
const fmtDay=k=>{if(!k)return"No date";const t=today();if(k===t)return"Today";if(k===addDays(t,1))return"Tomorrow";if(k===addDays(t,-1))return"Yesterday";return toDate(k).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})};
const fmtDayLong=k=>k?toDate(k).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}):"";
const dow=k=>toDate(k).toLocaleDateString("en-US",{weekday:"short"});
const fmtTime=t=>{if(!t)return"";const [h,m]=t.split(":").map(Number);const ap=h>=12?"pm":"am";const hh=((h+11)%12)+1;return hh+(m?":"+pad(m):"")+" "+ap};
const fmtTs=ts=>{const d=new Date(ts);return d.toLocaleDateString("en-US",{month:"short",day:"numeric"})+" "+d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})};
const clock=ts=>new Date(ts).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
const ago=ts=>{const s=(Date.now()-ts)/1000;if(s<90)return"just now";if(s<3600)return Math.round(s/60)+" min ago";if(s<86400)return Math.round(s/3600)+" hr ago";return Math.round(s/86400)+" days ago"};
const hm=m=>m>=60?Math.floor(m/60)+"h "+Math.round(m%60)+"m":Math.round(m)+"m";

/* ================= helpers ================= */
const money=n=>(n<0?"-":"")+"$"+Math.abs(Math.round(Number(n)||0)).toLocaleString("en-US");
const pct=(a,b)=>b?Math.round(a/b*100)+"%":"–";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=v=>Number(String(v??"").replace(/[^\d.]/g,""))||0;
const digits=p=>{let d=String(p||"").replace(/\D/g,"");if(d.length===10)d="1"+d;return d?("+"+d):""};
const fmtPhone=p=>{const d=String(p||"").replace(/\D/g,"").replace(/^1(?=\d{10}$)/,"");return d.length===10?`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`:String(p||"")};
const first=n=>{n=String(n||"").trim();if(!n)return"there";return /^(mr|mrs|ms|miss|dr)\.?\s/i.test(n)?n:n.split(/\s+/)[0]};
const custName=c=>c?(c.name||c.address||"No name"):"Unknown";
const jobsOf=cid=>Object.values(S.jobs).filter(j=>j.cid===cid);
const lastDone=cid=>jobsOf(cid).filter(j=>j.status==="done").sort((a,b)=>b.date.localeCompare(a.date))[0];
const nextJob=cid=>jobsOf(cid).filter(j=>j.status==="scheduled").sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0];
const lastLog=(cid,type,jid)=>S.log.filter(l=>l.cid===cid&&l.type===type&&(!jid||l.jid===jid)).sort((a,b)=>b.t-a.t)[0];
const svcName=id=>{const s=S.settings.services.find(x=>x.id===id);return s?s.name:"Job"};
const profit=j=>(Number(j.price)||0)-(Number(j.helperPay)||0)-(Number(j.supplies)||0);
const goalVal=j=>S.settings.goalType==="profit"?profit(j):(Number(j.price)||0);
const estProfit=j=>(Number(j.price)||0)-(Number(S.settings.helperPay)||0)-(Number(S.settings.supplies)||0);
const goalValUpcoming=j=>S.settings.goalType==="profit"?estProfit(j):(Number(j.price)||0);
function fill(tpl,c,j){
  const s=S.settings;
  return String(tpl).replace(/\{first\}/g,first(c&&c.name)).replace(/\{me\}/g,s.me||"your cleaner").replace(/\{business\}/g,s.business||"")
   .replace(/\{day\}/g,j?(["Today","Tomorrow"].includes(fmtDay(j.date))?fmtDay(j.date).toLowerCase():"on "+fmtDayLong(j.date)):"")
   .replace(/\{time\}/g,j&&j.time?fmtTime(j.time):"the time we set").replace(/\{price\}/g,j?Math.round(j.price||0):"")
   .replace(/\{zelleLine\}/g,s.zelle?" You can Zelle me at "+s.zelle+", or pay cash or check.":"").replace(/\{review\}/g,s.review||"(review link)");
}
let toastT=null,recordToastAt=0;
function toast(msg,undoFn,minor){if(minor&&Date.now()-recordToastAt<2500)return;const t=$("#toast");t.innerHTML=`<span>${esc(msg)}</span>`+(undoFn?`<button type="button" id="t-undo">Undo</button>`:"");t.hidden=false;clearTimeout(toastT);if(undoFn)$("#t-undo").onclick=()=>{undoFn();t.hidden=true;render()};toastT=setTimeout(()=>t.hidden=true,undoFn?4500:2000)}
const reduced=()=>window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
function celebrate(){if(reduced())return;const box=$("#confetti");box.innerHTML="";const cols=["#139bb0","#1e8a4c","#f0a83a","#ffffff","#0b3a5b"];
  for(let i=0;i<60;i++){const e=document.createElement("i");e.style.left=Math.random()*100+"%";e.style.background=cols[i%cols.length];e.style.setProperty("--dx",(Math.random()*160-80)+"px");e.style.setProperty("--r",(Math.random()*720-360)+"deg");e.style.animationDelay=(Math.random()*.3)+"s";box.appendChild(e)}
  setTimeout(()=>box.innerHTML="",2200)}
function flash(el){if(!el||reduced())return;el.classList.remove("flash");void el.offsetWidth;el.classList.add("flash")}

/* ================= rates + goal math ================= */
function rates(){
  const from=addDays(today(),-30);
  const ss=Object.values(S.sessions).filter(s=>s.date>=from);
  const d=ss.reduce((a,s)=>a+s.doors,0),t=ss.reduce((a,s)=>a+s.answered,0),y=ss.reduce((a,s)=>a+s.yes,0);
  const real=d>=30&&t>=10;
  const answer=real?Math.max(.05,t/d):DEF_RATES.answer, close=real?Math.max(.03,y/Math.max(1,t)):DEF_RATES.close;
  const from60=addDays(today(),-60);
  const js=Object.values(S.jobs).filter(j=>j.status!=="canceled"&&j.price&&j.date>=from60);
  const job=js.length>=3?js.reduce((a,j)=>a+(S.settings.goalType==="profit"?Math.max(1,estProfit(j)):j.price),0)/js.length:(S.settings.goalType==="profit"?Math.max(50,DEF_RATES.job-(S.settings.helperPay||0)-(S.settings.supplies||0)):DEF_RATES.job);
  const tm=Object.values(S.sessions).filter(s=>s.date>=from60&&timed(s)).reduce((a,s)=>({d:a.d+s.doors,m:a.m+mins(s)}),{d:0,m:0});
  const dph=tm.m>=60&&tm.d>=20?tm.d/(tm.m/60):DEF_RATES.dph;
  return {answer,close,job,dph,real};
}
function weekNumbers(ws){
  ws=ws||weekStart(today());const we=addDays(ws,6),t=today();const js=Object.values(S.jobs);
  const earned=js.filter(j=>j.status==="done"&&j.date>=ws&&j.date<=we).reduce((a,j)=>a+goalVal(j),0);
  const upcoming=js.filter(j=>j.status==="scheduled"&&j.date>=t&&j.date>=ws&&j.date<=we).reduce((a,j)=>a+goalValUpcoming(j),0);
  const plan=S.plans[ws];const goal=(plan&&plan.goal)||S.settings.weeklyGoal||1000;
  return {ws,we,earned,upcoming,goal};
}
function goalMath(){
  const w=weekNumbers(),r=rates();
  const remaining=Math.max(0,w.goal-w.earned-w.upcoming);
  const jobs=remaining?Math.ceil(remaining/r.job):0;
  const doors=jobs?Math.ceil(jobs/(r.answer*r.close)):0;
  const hours=doors/r.dph;
  return {...w,remaining,jobs,doors,hours,r};
}

/* ================= plans, sessions status, streaks ================= */
function planSessions(ws){const p=S.plans[ws];return p&&Array.isArray(p.sessions)?p.sessions.slice().sort((a,b)=>(a.day+a.start).localeCompare(b.day+b.start)):[]}
function psWindow(ps){const st=atTime(ps.day,ps.start);return {st,en:st+(ps.mins||120)*60e3,lo:st-2*3600e3,hi:st+(ps.mins||120)*60e3+2*3600e3}}
function sessionStatus(ps){
  const w=psWindow(ps),now=Date.now();const s=S.sessions[ps.day];
  const doors=s?s.doors:0;
  let inWin=true;
  if(s&&s.intervals&&s.intervals.length){inWin=s.intervals.some(i=>(i.e||now)>=w.lo&&i.s<=w.hi)||(s.lastTap&&s.lastTap>=w.lo&&s.lastTap<=w.hi)}
  if(doors>=(S.settings.minDoors||15)&&inWin)return"done";
  if(now>w.hi)return"missed";
  if(now>=w.st-30*60e3)return"now";
  return"upcoming";
}
function allPlanned(){const out=[];for(const ws of Object.keys(S.plans).sort())for(const ps of planSessions(ws))out.push({...ps,ws});return out}
function streaks(){
  const cur=weekStart(today());let week=0;
  const weeks=Object.keys(S.plans).filter(ws=>planSessions(ws).length).sort().reverse();
  let expect=cur;
  for(const ws of weeks){
    if(ws>cur)continue;
    const st=planSessions(ws).map(sessionStatus);
    if(ws===cur){if(st.every(x=>x==="done"))week++;else if(st.includes("missed"))break;expect=addDays(cur,-7);continue}
    if(ws!==expect)break;
    if(st.every(x=>x==="done")){week++;expect=addDays(ws,-7)}else break;
  }
  let sess=0;const resolved=allPlanned().map(p=>({p,s:sessionStatus(p)})).filter(x=>x.s==="done"||x.s==="missed");
  for(let i=resolved.length-1;i>=0;i--){if(resolved[i].s==="done")sess++;else break}
  return {week,sess};
}
function nextPlanned(){
  const t=today();const ps=allPlanned().filter(p=>p.day>=t).map(p=>({...p,status:sessionStatus(p)})).filter(p=>p.status==="now"||p.status==="upcoming");
  return ps[0]||null;
}

/* ================= records ================= */
function computeRecords(){
  const R={};const ss=Object.values(S.sessions);
  const best=(key,v,ref)=>{if(v>0&&(!R[key]||v>R[key].v))R[key]={v,ref}};
  for(const s of ss){
    best("booked",s.booked,s.date);best("doors",s.doors,s.date);
    if(s.answered>=5)best("close",s.yes/s.answered,s.date);
    if(s.doors>=10)best("perDoor",s.booked/s.doors,s.date);
  }
  const weeks={};for(const j of Object.values(S.jobs))if(j.status==="done"){const w=weekStart(j.date);weeks[w]=(weeks[w]||0)+(Number(j.price)||0)}
  for(const [w,v] of Object.entries(weeks))best("week",v,w);
  return R;
}
const REC_NAMES={booked:"Best session booked",doors:"Most doors in a session",close:"Best close rate",perDoor:"Best $ per door",week:"Best week earned"};
const recFmt=(k,v)=>k==="close"?Math.round(v*100)+"%":k==="doors"?String(v):money(v);
function checkRecords(silent){
  const now=computeRecords(),old=S.meta.records||{};const broke=[];
  for(const [k,r] of Object.entries(now)){const o=old[k];if(o&&o.v>0&&r.v>o.v+1e-9)broke.push(k)}
  S.meta.records=Object.fromEntries(Object.entries(now).map(([k,r])=>[k,{v:r.v,ref:r.ref}]));
  if(broke.length&&!silent){celebrate();toast(`New record: ${REC_NAMES[broke[0]]} (${recFmt(broke[0],now[broke[0]].v)})`);recordToastAt=Date.now()}
  return broke;
}

/* ================= tasks ================= */
function tasks(){
  const t=today(),tm=addDays(t,1),out=[];
  for(const j of Object.values(S.jobs)){
    const c=S.customers[j.cid];if(!c)continue;
    if(j.status==="scheduled"&&j.date<t)out.push({k:"late",pri:0,j,c});
    else if(j.status==="scheduled"&&j.date===t)out.push({k:"todayjob",pri:1,j,c});
    else if(j.status==="scheduled"&&j.date===tm&&!lastLog(c.id,"confirm",j.id))out.push({k:"confirm",pri:3,j,c});
    if(j.status==="done"&&!j.paid)out.push({k:"collect",pri:2,j,c});
    if(j.status==="done"&&j.paid&&!lastLog(c.id,"review")&&!j.noReview&&(Date.now()-(j.doneAt||0))<14*864e5)out.push({k:"review",pri:5,j,c});
  }
  for(const c of Object.values(S.customers)){
    if(c.status==="lead"&&c.followUp&&c.followUp<=t)out.push({k:"follow",pri:4,c});
    if(c.status==="customer"&&c.plan==="quarterly"&&!nextJob(c.id)){const ld=lastDone(c.id);if(ld&&addDays(ld.date,84)<=t)out.push({k:"quarterly",pri:6,c,j:ld})}
  }
  return out.sort((a,b)=>a.pri-b.pri||((a.j&&(a.j.date+(a.j.time||"")))||"").localeCompare((b.j&&(b.j.date+(b.j.time||"")))||""));
}
function updateBadge(){
  const n=S?tasks().length:0;const b=$("#badge");if(b){b.hidden=!n;b.textContent=n}
  try{if(navigator.setAppBadge){n?navigator.setAppBadge(n).catch(()=>{}):navigator.clearAppBadge().catch(()=>{})}}catch(e){}
}

/* ================= contact links ================= */
function smsHref(c,body){const p=digits(c&&c.phone);return p?`sms:${p}&body=${encodeURIComponent(body)}`:""}
function telHref(c){const p=digits(c&&c.phone);return p?`tel:${p}`:""}
function textBtn(c,kind,j,label,cls){const href=smsHref(c,fill(S.settings.tpl[kind],c,j));return `<a class="btn ${cls??"pri"} ${href?"":"off"}" href="${href||"#"}" data-log="text" data-kind="${kind}" data-cid="${c.id}" data-jid="${j?j.id:""}">${esc(label||"Text")}</a>`}
function callBtn(c,label){const href=telHref(c);return `<a class="btn ${href?"":"off"}" href="${href||"#"}" data-log="call" data-cid="${c.id}">${esc(label||"Call")}</a>`}
const dirBtn=c=>c&&c.address?`<a class="btn" href="https://maps.apple.com/?daddr=${encodeURIComponent(c.address)}" target="_blank" rel="noopener">Directions</a>`:"";
function onContact(a){
  const kind=a.dataset.kind||"",cid=a.dataset.cid,jid=a.dataset.jid||null,type=a.dataset.log;
  const c=S.customers[cid];if(!c)return;
  const ltype=type==="call"?"call":kind==="confirm"?"confirm":kind==="review"?"review":kind==="pay"?"payask":"text";
  logIt(ltype,cid,jid,type==="text"?"Texted ("+kind+")":"Called");
  if(c.status==="lead"&&(kind==="follow"||type==="call")){const prev=c.followUp;c.followUp=addDays(today(),3);save();
    setTimeout(()=>{toast(`${type==="call"?"Call":"Text"} logged. Next follow-up ${fmtDay(c.followUp)}.`,()=>{c.followUp=prev;S.log.pop();save()});render()},300);return}
  save();setTimeout(()=>{toast(`${type==="call"?"Call":"Text"} logged for ${first(c.name)}.`,()=>{S.log.pop();save()});render()},300);
}

/* ================= location ================= */
let geoWatch=null,lastFix=null;
function startGeo(){
  if(!S.settings.useLocation||!navigator.geolocation||geoWatch!==null)return;
  try{geoWatch=navigator.geolocation.watchPosition(p=>{lastFix={lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy||0),t:Date.now()}},()=>{},{enableHighAccuracy:true,maximumAge:15000,timeout:20000})}catch(e){}
}
function stopGeo(){if(geoWatch!==null){try{navigator.geolocation.clearWatch(geoWatch)}catch(e){}geoWatch=null}}
const freshFix=()=>lastFix&&Date.now()-lastFix.t<3*60e3?lastFix:null;
function distM(a,b){const R=6371e3,toR=x=>x*Math.PI/180;const dLat=toR(b.lat-a.lat),dLng=toR(b.lng-a.lng);const h=Math.sin(dLat/2)**2+Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
const fmtDist=m=>m<160?Math.round(m*3.281)+" ft":(m/1609).toFixed(1)+" mi";

/* ================= knocking ================= */
function sess(k){k=k||today();if(!S.sessions[k])S.sessions[k]={date:k,area:"",doors:0,answered:0,yes:0,no:0,maybe:0,booked:0,intervals:[],manualMin:null,lastTap:null};return S.sessions[k]}
function openInt(s){return s.intervals&&s.intervals.length&&!s.intervals[s.intervals.length-1].e?s.intervals[s.intervals.length-1]:null}
function idleCheck(){
  let ch=false;
  for(const s of Object.values(S.sessions)){
    const o=openInt(s);if(!o)continue;
    const last=s.lastTap||o.s,lim=(S.settings.idleMin||30)*60e3;
    if(Date.now()-last>lim||s.date!==today()){o.e=Math.max(o.s,last+2*60e3);o.auto=true;ch=true}
  }
  if(ch){stopGeo();save()}
  return ch;
}
function mins(s){if(s.manualMin!=null)return s.manualMin;let ms=0;for(const i of s.intervals||[])ms+=((i.e||Date.now())-i.s);return ms/60e3}
const timed=s=>s.manualMin!=null||(s.intervals&&s.intervals.length>0);
const hhmm=ts=>{const d=new Date(ts),h=d.getHours();return ((h+11)%12+1)+":"+pad(d.getMinutes())+(h>=12?" pm":" am")};
/* Stopwatch text: 4:07 (min:sec) or 1:04:07 (hr:min:sec) */
const watch=ms=>{const t=Math.max(0,Math.floor(ms/1000)),h=Math.floor(t/3600),m=Math.floor(t%3600/60),x=t%60;return h?`${h}:${pad(m)}:${pad(x)}`:`${m}:${pad(x)}`};
/* "4:02 pm – 5:10 pm", or "Started 4:02 pm" while running */
function span(s){const iv=(s.intervals||[]).filter(i=>i&&i.s);if(!iv.length)return"";const a=iv[0].s,last=iv[iv.length-1];
  return last.e?`${hhmm(a)} – ${hhmm(last.e)}${iv.length>1?` (${iv.length} parts)`:""}`:`Started ${hhmm(a)}`}
const knocking=()=>{const s=S.sessions[today()];return !!(s&&openInt(s))};
function startKnock(skipAsk){
  if(!skipAsk&&S.settings.useLocation&&!S.meta.locAsked&&navigator.geolocation)return locationSheet();
  const s=sess();
  if(!openInt(s)){s.intervals.push({s:Date.now(),e:null});s.lastTap=Date.now();S.meta.recordsAtStart=clone(S.meta.records||{});S.meta.sessionStartTs=Date.now();save()}
  startGeo();render();
  if(S.settings.showScriptsOnStart)scriptsSheet(true);
}
function stopKnock(){const s=sess();const o=openInt(s);if(o){o.e=Date.now();checkRecords(true);save()}stopGeo();render();recapSheet(s.date)}
function tap(act,price,cid,jid){
  const s=sess(),now=Date.now();
  if(!openInt(s)){s.intervals.push({s:now,e:null});S.meta.recordsAtStart=clone(S.meta.records||{});S.meta.sessionStartTs=now;startGeo()}
  s.lastTap=now;
  s.doors++;if(act!=="none")s.answered++;
  if(act==="no")s.no++;if(act==="maybe")s.maybe++;
  if(act==="sold"){s.yes++;s.booked+=Number(price)||0}
  const st=($("#street")&&$("#street").value.trim())||s.area||"";if(st&&!s.area)s.area=st;
  let pinId=null;const fx=freshFix();
  if(fx||(act==="none"&&S.settings.saveNoAnswers)){
    pinId=uid("p");S.pins[pinId]={id:pinId,t:now,date:s.date,out:act,lat:fx?fx.lat:null,lng:fx?fx.lng:null,acc:fx?fx.acc:null,street:st,address:"",cid:cid||null,done:false};
  }
  S.meta.undo.push({act,price:Number(price)||0,date:s.date,cid:cid||null,jid:jid||null,pinId});if(S.meta.undo.length>40)S.meta.undo.shift();
  checkRecords(false);
  save();
  return pinId;
}
function undoTap(){
  const u=S.meta.undo.pop();if(!u){toast("Nothing to undo");return}
  const s=sess(u.date);s.doors=Math.max(0,s.doors-1);if(u.act!=="none")s.answered=Math.max(0,s.answered-1);
  if(u.act==="no")s.no=Math.max(0,s.no-1);if(u.act==="maybe")s.maybe=Math.max(0,s.maybe-1);
  if(u.act==="sold"){s.yes=Math.max(0,s.yes-1);s.booked=Math.max(0,s.booked-u.price)}
  if(u.jid&&S.jobs[u.jid])delete S.jobs[u.jid];
  if(u.cid&&u.newCust&&S.customers[u.cid])delete S.customers[u.cid];
  if(u.pinId&&S.pins[u.pinId])delete S.pins[u.pinId];
  if(u.retryPin&&S.pins[u.retryPin])S.pins[u.retryPin].done=false;
  checkRecords(true);save();render();toast("Undid last tap");
}

/* ================= sheets: helpers ================= */
let sheetOnClose=null;
function openSheet(html,after,onClose){$("#panel").innerHTML=html;$("#sheet").hidden=false;$("#panel").scrollTop=0;sheetOnClose=onClose||null;after&&after()}
function closeSheet(){$("#sheet").hidden=true;$("#panel").innerHTML="";const f=sheetOnClose;sheetOnClose=null;f&&f()}
const chips=(id,opts,sel,cls)=>`<div class="chips wrap ${cls||""}" id="${id}">${opts.map(o=>`<button type="button" class="chip ${o.busy?"busy":""}" data-v="${esc(o.v)}" aria-pressed="${String(o.v)===String(sel)}">${esc(o.l)}</button>`).join("")}</div>`;
function wire(id,cb){const g=document.getElementById(id);if(!g)return;g.addEventListener("click",e=>{const b=e.target.closest(".chip");if(!b)return;g.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-pressed","false"));b.setAttribute("aria-pressed","true");cb&&cb(b.dataset.v)})}
const picked=id=>{const b=document.querySelector(`#${id} .chip[aria-pressed="true"]`);return b?b.dataset.v:""};
const val=id=>{const e=document.getElementById(id);return e?e.value.trim():""};
function dayOptions(n){
  const t=today(),out=[];
  for(let i=0;i<(n||10);i++){const k=addDays(t,i);const c=Object.values(S.jobs).filter(j=>j.status==="scheduled"&&j.date===k).length;out.push({v:k,l:(i===0?"Today":i===1?"Tomorrow":toDate(k).toLocaleDateString("en-US",{weekday:"short",day:"numeric"}))+(c?` · ${c} job${c>1?"s":""}`:"")})}
  out.push({v:"pick",l:"Other day"});return out;
}
function slotOptions(day,excludeJob){
  const taken=new Set(Object.values(S.jobs).filter(j=>j.status==="scheduled"&&j.date===day&&j.id!==excludeJob).map(j=>j.time));
  return S.settings.slots.map(s=>({v:s,l:fmtTime(s)+(taken.has(s)?" · taken":""),busy:taken.has(s)})).concat([{v:"other",l:"Other time"}]);
}
function defaultDay(){const t=today();const n=Object.values(S.jobs).filter(j=>j.status==="scheduled"&&j.date===addDays(t,1)).length;return n>=3?addDays(t,2):addDays(t,1)}
function priceOptions(p){const base=[149,199,249,299,349];const P=Number(p)||S.settings.defaultPrice;const list=base.includes(P)?base:[...base,P].sort((a,b)=>a-b);return list.map(v=>({v:String(v),l:"$"+v})).concat([{v:"other",l:"Other"}])}
function matchList(q){q=q.toLowerCase();if(q.length<2)return[];return Object.values(S.customers).filter(c=>[c.name,c.address,c.phone].join(" ").toLowerCase().includes(q)).slice(0,4)}
function wireLookup(onPick){
  const box=$("#m-list");let linked=null;
  const show=()=>{if(linked){return}const q=val("f-name")||val("f-address");const m=matchList(q);
    box.innerHTML=m.map(c=>`<button type="button" data-cid="${c.id}"><b>Use ${esc(custName(c))}</b><span class="muted small">${esc(c.address||"")} · ${c.status==="lead"?"lead":c.status}</span></button>`).join("")};
  ["f-name","f-address"].forEach(id=>document.getElementById(id).addEventListener("input",show));
  box.addEventListener("click",e=>{const b=e.target.closest("button[data-cid]");if(!b)return;const c=S.customers[b.dataset.cid];linked=c.id;
    $("#f-name").value=c.name||"";$("#f-address").value=c.address||"";$("#f-phone").value=c.phone||"";if($("#f-notes")&&c.notes)$("#f-notes").value=c.notes;
    box.innerHTML=`<div class="update"><span>Linked to ${esc(custName(c))}</span><button type="button" class="btn sm" id="unlink">Unlink</button></div>`;
    $("#unlink").onclick=()=>{linked=null;box.innerHTML="";show()};onPick&&onPick(c)});
  return ()=>linked;
}

/* ================= BOOK ================= */
function bookSheet(opts){
  opts=opts||{};const c=opts.cid?S.customers[opts.cid]:null;const fromTap=!!opts.fromTap;
  const lastSvc=(c&&c.service)||S.meta.lastService||"windows";
  const svc=S.settings.services.find(s=>s.id===lastSvc)||S.settings.services[0];
  const price=(c&&c.price)||svc.price||S.settings.defaultPrice;const day=defaultDay();
  openSheet(`<div class="ph"><h2>${fromTap?"Sold! Book it":"Book a job"}</h2><button type="button" data-close>Cancel</button></div>
    <input class="f" id="f-name" placeholder="Name" autocomplete="off" value="${esc(c?c.name:opts.name||"")}">
    <input class="f" id="f-address" placeholder="Address" autocomplete="off" value="${esc(c?c.address:opts.address||"")}">
    <div class="match" id="m-list"></div>
    <input class="f" id="f-phone" placeholder="Phone" inputmode="tel" autocomplete="off" value="${esc(c?c.phone:"")}">
    <div class="lbl">Service</div>${chips("f-svc",S.settings.services.map(s=>({v:s.id,l:s.name})),svc.id)}
    <div class="lbl">Price</div><div id="pricewrap">${chips("f-price",priceOptions(price),String(price))}</div>
    <input class="f" id="f-price-o" placeholder="Price in dollars" inputmode="decimal" hidden>
    <div class="lbl">Day</div>${chips("f-day",dayOptions(),day)}
    <input class="f" id="f-day-o" type="date" hidden>
    <div class="lbl">Time</div><div id="slotwrap">${chips("f-time",slotOptions(day),"")}</div>
    <input class="f" id="f-time-o" type="time" hidden>
    <div class="lbl">Plan</div>${chips("f-plan",[{v:"one",l:"One time"},{v:"quarterly",l:"Quarterly"}],(c&&c.plan)||"one")}
    <textarea class="f" id="f-notes" placeholder="Notes: gate code, dog, screens, garage windows…">${esc(c?c.notes:"")}</textarea>
    <button class="save" type="button" id="f-save">${fromTap?"Save sale":"Book job"}</button>`,()=>{
      const getLinked=c?()=>c.id:wireLookup();
      const wirePrice=()=>wire("f-price",v=>{$("#f-price-o").hidden=v!=="other";if(v==="other")$("#f-price-o").focus()});wirePrice();
      wire("f-svc",v=>{const s=S.settings.services.find(x=>x.id===v);if(s&&s.price){$("#pricewrap").innerHTML=chips("f-price",priceOptions(s.price),String(s.price));$("#f-price-o").hidden=true;wirePrice()}});
      const refreshSlots=()=>{const d=picked("f-day")==="pick"?val("f-day-o"):picked("f-day");if(!d)return;$("#slotwrap").innerHTML=chips("f-time",slotOptions(d),"");wire("f-time",v=>{$("#f-time-o").hidden=v!=="other"})};
      wire("f-day",v=>{$("#f-day-o").hidden=v!=="pick";refreshSlots()});$("#f-day-o").addEventListener("change",refreshSlots);
      wire("f-time",v=>{$("#f-time-o").hidden=v!=="other"});wire("f-plan");
      if(!c&&!opts.name)setTimeout(()=>$("#f-name").focus(),80);
      $("#f-save").onclick=()=>{
        const name=val("f-name"),address=val("f-address");if(!name&&!address){toast("Add a name or address");return}
        let p=picked("f-price");if(p==="other")p=val("f-price-o");p=num(p);
        let d=picked("f-day");if(d==="pick")d=val("f-day-o");if(!d){toast("Pick a day");return}
        let tm=picked("f-time");if(tm==="other")tm=val("f-time-o");
        const plan=picked("f-plan")||"one",service=picked("f-svc")||"windows";
        let cid=getLinked(),isNew=false;
        if(!cid){cid=uid("c");isNew=true;S.customers[cid]={id:cid,name,address,phone:"",notes:"",windows:"",price:"",status:"customer",plan,followUp:"",createdAt:today()};logIt("created",cid,null,fromTap?"Sold at the door":"Added")}
        const cu=S.customers[cid];Object.assign(cu,{name,address,phone:val("f-phone"),notes:val("f-notes"),price:String(p),status:"customer",plan,followUp:"",service});
        const jid=uid("j");S.jobs[jid]={id:jid,cid,date:d,time:tm||"",price:p,service,status:"scheduled",paid:false,notes:""};
        logIt("booked",cid,jid,`Booked ${svcName(service)} ${fmtDay(d)}${tm?" "+fmtTime(tm):""} for ${money(p)}`);
        S.meta.lastService=service;
        let pinId=null;
        if(fromTap){pinId=tap("sold",p,cid,jid);const u=S.meta.undo[S.meta.undo.length-1];if(u)u.newCust=isNew}
        if(opts.retryPin&&S.pins[opts.retryPin]){S.pins[opts.retryPin].done=true;const u=S.meta.undo[S.meta.undo.length-1];if(u)u.retryPin=opts.retryPin}
        if(pinId&&S.pins[pinId]&&address)S.pins[pinId].address=address;
        save();closeSheet();render();toast(fromTap?`Sold! ${money(p)} on ${fmtDay(d)}`:`Booked ${fmtDay(d)}`);
        if(fromTap){const s=S.sessions[today()];if(s)flash(document.querySelector(".tap.sold"))}
      };
    });
}
/* ================= MAYBE / lead ================= */
function leadSheet(opts){
  opts=opts||{};const fromTap=!!opts.fromTap;const t=today();
  openSheet(`<div class="ph"><h2>${fromTap?"Maybe, follow up":"New lead"}</h2><button type="button" data-close>Cancel</button></div>
    <input class="f" id="f-name" placeholder="Name" autocomplete="off" value="${esc(opts.name||"")}">
    <input class="f" id="f-address" placeholder="Address" autocomplete="off" value="${esc(opts.address||"")}">
    <div class="match" id="m-list"></div>
    <input class="f" id="f-phone" placeholder="Phone" inputmode="tel" autocomplete="off">
    <input class="f" id="f-quote" placeholder="Price you quoted (optional)" inputmode="decimal">
    <div class="lbl">Follow up</div>${chips("f-fu",[{v:addDays(t,1),l:"Tomorrow"},{v:addDays(t,2),l:"In 2 days"},{v:addDays(t,4),l:"In 4 days"},{v:addDays(t,7),l:"Next week"}],addDays(t,2))}
    <textarea class="f" id="f-notes" placeholder="What they said: ask husband, wants screens, bad experience before…"></textarea>
    <button class="save warn" type="button" id="f-save">Save lead</button>`,()=>{
      const getLinked=wireLookup();wire("f-fu");if(!opts.name)setTimeout(()=>$("#f-name").focus(),80);
      $("#f-save").onclick=()=>{
        const name=val("f-name"),address=val("f-address");if(!name&&!address){toast("Add a name or address");return}
        let cid=getLinked(),isNew=false;
        if(!cid){cid=uid("c");isNew=true;S.customers[cid]={id:cid,name,address,phone:"",notes:"",windows:"",price:"",status:"lead",plan:"one",followUp:"",createdAt:today()};logIt("created",cid,null,"Met at the door")}
        const c=S.customers[cid];Object.assign(c,{name,address,phone:val("f-phone")||c.phone,notes:val("f-notes")||c.notes,price:val("f-quote")||c.price,followUp:picked("f-fu")});
        if(c.status!=="customer")c.status="lead";
        logIt("quoted",cid,null,val("f-quote")?`Quoted ${money(num(val("f-quote")))}`:"Interested, follow up");
        if(fromTap){const pid=tap("maybe",0,cid);const u=S.meta.undo[S.meta.undo.length-1];if(u)u.newCust=isNew;if(pid&&S.pins[pid]&&address)S.pins[pid].address=address}
        if(opts.retryPin&&S.pins[opts.retryPin]){S.pins[opts.retryPin].done=true;const u=S.meta.undo[S.meta.undo.length-1];if(u)u.retryPin=opts.retryPin}
        save();closeSheet();render();toast(`Saved. Follow up ${fmtDay(c.followUp)}.`);
      };
    });
}
/* ================= DONE / PAID ================= */
function doneSheet(jid){
  const j=S.jobs[jid];if(!j)return;const c=S.customers[j.cid];
  openSheet(`<div class="ph"><h2>Job done: ${esc(first(c.name))}</h2><button type="button" data-close>Cancel</button></div>
    <div class="three"><div><div class="lbl">Price</div><input class="f" id="d-price" inputmode="decimal" value="${Math.round(j.price||0)}"></div>
      <div><div class="lbl">Helper pay</div><input class="f" id="d-help" inputmode="decimal" value="${j.helperPay!=null?j.helperPay:(S.settings.helperPay||0)}"></div>
      <div><div class="lbl">Supplies</div><input class="f" id="d-sup" inputmode="decimal" value="${j.supplies!=null?j.supplies:(S.settings.supplies||0)}"></div></div>
    <div class="lbl">Paid?</div>${chips("d-paid",[{v:"Zelle",l:"Zelle"},{v:"Cash",l:"Cash"},{v:"Card",l:"Card"},{v:"Check",l:"Check"},{v:"no",l:"Not yet"}],"Zelle")}
    ${c.plan==="quarterly"?`<div class="lbl">Next visit</div>${chips("d-next",[{v:"91",l:"Book 3 months out"},{v:"0",l:"Not now"}],"91")}`:`<div class="lbl">Quarterly plan?</div>${chips("d-next",[{v:"0",l:"No"},{v:"91",l:"Yes, book 3 months out"}],"0")}`}
    <button class="save" type="button" id="d-save">Mark done</button>`,()=>{
      wire("d-paid");wire("d-next");
      $("#d-save").onclick=()=>{
        const p=num(val("d-price")),paid=picked("d-paid"),next=Number(picked("d-next"));
        Object.assign(j,{price:p,helperPay:num(val("d-help")),supplies:num(val("d-sup")),status:"done",doneAt:Date.now(),paid:paid!=="no",paidVia:paid!=="no"?paid:""});
        if(j.date>today())j.date=today();
        logIt("done",c.id,j.id,`${svcName(j.service)} for ${money(p)}`);if(paid!=="no")logIt("paid",c.id,j.id,`Paid ${money(p)} by ${paid}`);
        if(next){c.plan="quarterly";const nj=uid("j");S.jobs[nj]={id:nj,cid:c.id,date:addDays(j.date,next),time:j.time||"",price:p,service:j.service,status:"scheduled",paid:false,notes:""};logIt("booked",c.id,nj,`Next visit ${fmtDay(S.jobs[nj].date)}`)}
        checkRecords(false);save();closeSheet();render();toast(paid!=="no"?`Done and paid: ${money(p)}`:`Done. ${money(p)} to collect.`);
      };
    });
}
function paidSheet(jid){
  const j=S.jobs[jid];const c=S.customers[j.cid];
  openSheet(`<div class="ph"><h2>Got paid: ${esc(first(c.name))}</h2><button type="button" data-close>Cancel</button></div>
    <div class="lbl">Amount</div><input class="f" id="p-amt" inputmode="decimal" value="${Math.round(j.price||0)}">
    <div class="lbl">How</div>${chips("p-via",[{v:"Zelle",l:"Zelle"},{v:"Cash",l:"Cash"},{v:"Card",l:"Card"},{v:"Check",l:"Check"}],"Zelle")}
    <button class="save" type="button" id="p-save">Mark paid</button>`,()=>{wire("p-via");
      $("#p-save").onclick=()=>{j.price=num(val("p-amt"))||j.price;j.paid=true;j.paidVia=picked("p-via");logIt("paid",c.id,j.id,`Paid ${money(j.price)} by ${j.paidVia}`);save();closeSheet();render();toast("Marked paid")}});
}
/* ================= JOB edit ================= */
function jobSheet(jid){
  const j=S.jobs[jid];if(!j)return;const c=S.customers[j.cid];
  openSheet(`<div class="ph"><h2>${esc(custName(c))}</h2><button type="button" data-close>Close</button></div>
    <div class="muted">${esc(c.address||"")}</div>
    <div class="acts">${callBtn(c)}${textBtn(c,"confirm",j,"Text","")}${dirBtn(c)}</div>
    <div class="lbl">Service</div>${chips("j-svc",S.settings.services.map(s=>({v:s.id,l:s.name})),j.service||"windows")}
    <div class="three"><div><div class="lbl">Price</div><input class="f" id="j-price" inputmode="decimal" value="${Math.round(j.price||0)}"></div>
      <div><div class="lbl">Helper pay</div><input class="f" id="j-help" inputmode="decimal" value="${j.helperPay??""}" placeholder="0"></div>
      <div><div class="lbl">Supplies</div><input class="f" id="j-sup" inputmode="decimal" value="${j.supplies??""}" placeholder="0"></div></div>
    <div class="lbl">Day</div><input class="f" id="j-date" type="date" value="${esc(j.date)}">
    <div class="lbl">Time</div><div id="j-slots">${chips("j-time",slotOptions(j.date,j.id),j.time||"")}</div>
    <input class="f" id="j-time-o" type="time" value="${esc(j.time&&!S.settings.slots.includes(j.time)?j.time:"")}" ${j.time&&!S.settings.slots.includes(j.time)?"":"hidden"}>
    <textarea class="f" id="j-notes" placeholder="Job notes">${esc(j.notes||"")}</textarea>
    <button class="save teal" type="button" id="j-save">Save changes</button>
    ${j.status==="scheduled"?`<button class="btn good full" type="button" id="j-done">Mark done</button>`:""}
    ${j.status==="done"&&!j.paid?`<button class="btn good full" type="button" id="j-paid">Got paid</button>`:""}
    <div id="j-del"><button class="btn bad full" type="button" id="j-cancel">${j.status==="scheduled"?"Cancel job":"Delete job"}</button></div>`,()=>{
      wire("j-svc");const rewire=()=>wire("j-time",v=>{$("#j-time-o").hidden=v!=="other"});rewire();
      $("#j-date").addEventListener("change",()=>{$("#j-slots").innerHTML=chips("j-time",slotOptions(val("j-date"),j.id),"");rewire()});
      $("#j-save").onclick=()=>{const old=j.date+" "+j.time;j.price=num(val("j-price"));j.service=picked("j-svc")||j.service;
        const h=val("j-help"),su=val("j-sup");j.helperPay=h===""?null:num(h);j.supplies=su===""?null:num(su);if(j.helperPay==null)delete j.helperPay;if(j.supplies==null)delete j.supplies;
        j.date=val("j-date")||j.date;let tm=picked("j-time");if(tm==="other")tm=val("j-time-o");j.time=tm||j.time;j.notes=val("j-notes");
        if(old!==j.date+" "+j.time)logIt("reschedule",c.id,j.id,`Moved to ${fmtDay(j.date)}${j.time?" "+fmtTime(j.time):""}`);save();closeSheet();render();toast("Saved")};
      const d=$("#j-done");if(d)d.onclick=()=>doneSheet(j.id);const pd=$("#j-paid");if(pd)pd.onclick=()=>paidSheet(j.id);
      $("#j-cancel").onclick=()=>{$("#j-del").innerHTML=`<div class="two"><button class="btn" type="button" id="jk">Keep it</button><button class="btn bad" type="button" id="jx">Yes, ${j.status==="scheduled"?"cancel":"delete"}</button></div>`;
        $("#jk").onclick=()=>jobSheet(j.id);$("#jx").onclick=()=>{if(j.status==="scheduled"){j.status="canceled";logIt("cancel",c.id,j.id,"Job canceled")}else{delete S.jobs[j.id]}save();closeSheet();render();toast("Done")}};
    });
}
/* ================= CUSTOMER ================= */
const LOGNAMES={created:"Added",quoted:"Quote / follow-up",booked:"Booked",text:"Texted",confirm:"Sent confirmation",call:"Called",done:"Job done",paid:"Paid",review:"Asked for review",payask:"Sent payment text",lost:"Marked not interested",reschedule:"Rescheduled",cancel:"Canceled",note:"Note"};
function custSheet(cid){
  const c=S.customers[cid];if(!c)return;
  const js=jobsOf(cid).sort((a,b)=>b.date.localeCompare(a.date));
  const done=js.filter(j=>j.status==="done");const earned=done.reduce((t,j)=>t+(j.price||0),0);
  const lg=S.log.filter(l=>l.cid===cid).sort((a,b)=>b.t-a.t).slice(0,40);
  const st=c.status==="lead"?"Lead":c.status==="lost"?"Not interested":c.plan==="quarterly"?"Quarterly customer":"Customer";
  openSheet(`<div class="ph"><h2>${esc(custName(c))}</h2><button type="button" data-close>Close</button></div>
    <div class="row"><span class="tag ${c.status==="lead"?"due":c.status==="lost"?"plain":"job"}">${st}</span><span class="muted small">${done.length} done · ${money(earned)} earned</span></div>
    <div class="acts">${callBtn(c)}${textBtn(c,c.status==="lead"?"follow":nextJob(cid)?"confirm":"quarterly",nextJob(cid),"Text")}${dirBtn(c)}</div>
    <button class="save" type="button" data-act="book" data-cid="${cid}">Book a job</button>
    ${c.status==="lead"?`<div class="two"><button class="btn" type="button" id="c-snooze">Follow up later</button><button class="btn bad" type="button" id="c-lost">Not interested</button></div>`:""}
    <h3>Jobs</h3>
    <div class="card" style="padding:4px 14px">${js.length?js.map(j=>`<button type="button" class="item" data-job="${j.id}"><span class="time">${esc(fmtDay(j.date).replace(/^\w{3}, /,""))}</span><span class="grow"><span class="nm">${esc(svcName(j.service))} · ${j.status==="scheduled"?"Scheduled"+(j.time?" "+fmtTime(j.time):""):j.status==="done"?(j.paid?"Paid":"Not paid"):"Canceled"}</span></span><span class="amt">${money(j.price)}</span></button>`).join(""):`<div class="empty">No jobs yet.</div>`}</div>
    <h3>Details</h3>
    <input class="f" id="c-name" placeholder="Name" value="${esc(c.name)}">
    <input class="f" id="c-address" placeholder="Address" value="${esc(c.address)}">
    <input class="f" id="c-phone" placeholder="Phone" inputmode="tel" value="${esc(c.phone)}">
    <div class="two"><input class="f" id="c-price" placeholder="Usual price" inputmode="decimal" value="${esc(c.price)}"><input class="f" id="c-windows" placeholder="# windows" inputmode="numeric" value="${esc(c.windows)}"></div>
    ${c.status==="lead"?`<div class="lbl">Follow up on</div><input class="f" id="c-fu" type="date" value="${esc(c.followUp)}">`:""}
    <div class="lbl">Plan</div>${chips("c-plan",[{v:"one",l:"One time"},{v:"quarterly",l:"Quarterly"}],c.plan||"one")}
    <textarea class="f" id="c-notes" placeholder="Notes: gate code, dog, what they care about…">${esc(c.notes)}</textarea>
    <button class="save teal" type="button" id="c-save">Save details</button>
    <h3>History</h3>
    <div class="card"><div class="tl">${lg.length?lg.map(l=>`<div><time>${esc(fmtTs(l.t))}</time><span>${esc(LOGNAMES[l.type]||l.type)}${l.note&&l.note!==LOGNAMES[l.type]?": "+esc(l.note):""}</span></div>`).join(""):`<div class="muted">Nothing yet.</div>`}</div></div>
    <div id="c-del"><button class="btn bad full" type="button" id="c-delete">Delete customer</button></div>`,()=>{
      wire("c-plan");
      $("#c-save").onclick=()=>{Object.assign(c,{name:val("c-name"),address:val("c-address"),phone:val("c-phone"),price:val("c-price"),windows:val("c-windows"),notes:val("c-notes"),plan:picked("c-plan")||c.plan});if($("#c-fu"))c.followUp=val("c-fu");save();render();toast("Saved")};
      const sn=$("#c-snooze");if(sn)sn.onclick=()=>{c.followUp=addDays(today(),3);save();closeSheet();render();toast(`Follow up ${fmtDay(c.followUp)}`)};
      const lo=$("#c-lost");if(lo)lo.onclick=()=>{c.status="lost";c.followUp="";logIt("lost",c.id);save();closeSheet();render();toast("Marked not interested",()=>{c.status="lead";save()})};
      $("#c-delete").onclick=()=>{$("#c-del").innerHTML=`<div class="two"><button class="btn" type="button" id="ck">Keep</button><button class="btn bad" type="button" id="cx">Delete for good</button></div>`;$("#ck").onclick=()=>custSheet(cid);
        $("#cx").onclick=()=>{jobsOf(cid).forEach(j=>delete S.jobs[j.id]);S.log=S.log.filter(l=>l.cid!==cid);for(const p of Object.values(S.pins))if(p.cid===cid)p.cid=null;delete S.customers[cid];save();closeSheet();render();toast("Deleted")}};
    });
}
/* ================= SESSION edit ================= */
function sessSheet(k){
  const s=S.sessions[k];if(!s)return;
  const iv=(s.intervals||[]).filter(i=>i&&i.s),running=!!openInt(s);
  const tOf=ts=>{const d=new Date(ts);return pad(d.getHours())+":"+pad(d.getMinutes())};
  const st0=iv.length?tOf(iv[0].s):"",en0=iv.length&&iv[iv.length-1].e?tOf(iv[iv.length-1].e):"";
  openSheet(`<div class="ph"><h2>${esc(fmtDay(k))} session</h2><button type="button" data-close>Close</button></div>
    <input class="f" id="s-area" placeholder="Street or area" value="${esc(s.area||"")}">
    <div class="two"><div><div class="lbl">Doors</div><input class="f" id="s-doors" inputmode="numeric" value="${s.doors}"></div><div><div class="lbl">Talked</div><input class="f" id="s-ans" inputmode="numeric" value="${s.answered}"></div></div>
    <div class="two"><div><div class="lbl">Sold</div><input class="f" id="s-yes" inputmode="numeric" value="${s.yes}"></div><div><div class="lbl">Booked $</div><input class="f" id="s-booked" inputmode="decimal" value="${Math.round(s.booked)}"></div></div>
    <div class="two"><div><div class="lbl">Started</div><input class="f" id="s-start" type="time" value="${st0}"></div><div><div class="lbl">Ended</div><input class="f" id="s-end" type="time" value="${en0}"></div></div>
    <div class="muted small" id="s-len">${timed(s)?"Time knocking: "+hm(mins(s)):"Not timed. Add a start and end time."}${running?" (still running)":""}</div>
    <button class="btn full" type="button" id="s-recap">See recap</button>
    <button class="save teal" type="button" id="s-save">Save</button>
    <div id="s-del"><button class="btn bad full" type="button" id="s-delete">Delete session</button></div>`,()=>{
      $("#s-recap").onclick=()=>recapSheet(k);
      const showLen=()=>{const a=val("s-start"),b=val("s-end");if(a&&b){const d=(atTime(k,b)-atTime(k,a))/60e3;$("#s-len").textContent=d>0?"Time knocking: "+hm(d):"The end time has to be after the start time."}};
      $("#s-start").addEventListener("input",showLen);$("#s-end").addEventListener("input",showLen);
      $("#s-save").onclick=()=>{
        const a=val("s-start"),b=val("s-end");
        if(a!==st0||b!==en0){
          if(!a){toast("Add the start time");return}
          const st=atTime(k,a);
          if(b){const en=atTime(k,b);if(en<=st){toast("The end time has to be after the start time");return}s.intervals=[{s:st,e:en}]}
          else if(running&&k===today()){s.intervals=[{s:st,e:null}]}
          else{toast("Add the end time");return}
          s.manualMin=null;
        }
        const n=x=>Math.max(0,Number(val(x))||0);Object.assign(s,{area:val("s-area"),doors:n("s-doors"),answered:n("s-ans"),yes:n("s-yes"),booked:n("s-booked")});checkRecords(true);save();closeSheet();render();toast("Saved")};
      $("#s-delete").onclick=()=>{$("#s-del").innerHTML=`<div class="two"><button class="btn" type="button" id="sk">Keep</button><button class="btn bad" type="button" id="sx">Delete</button></div>`;$("#sk").onclick=()=>sessSheet(k);$("#sx").onclick=()=>{delete S.sessions[k];checkRecords(true);save();closeSheet();render();toast("Deleted")}};
    });
}
/* ================= RECAP ================= */
function recapSheet(k){
  const s=S.sessions[k];if(!s)return;
  const m=mins(s),r=rates();
  const close=s.answered?s.yes/s.answered:0,ans=s.doors?s.answered/s.doors:0,perDoor=s.doors?s.booked/s.doors:0;
  const prev=Object.values(S.sessions).filter(x=>x.date!==k&&x.date>=addDays(k,-30)&&x.doors>0);
  const pd=prev.reduce((a,x)=>({d:a.d+x.doors,t:a.t+x.answered,y:a.y+x.yes,b:a.b+x.booked}),{d:0,t:0,y:0,b:0});
  const avgClose=pd.t?pd.y/pd.t:null,avgPD=pd.d?pd.b/pd.d:null;
  const cmp=(v,a,f)=>a==null?"":`<span class="cmp ${v>=a?"up":"down"}">${v>=a?"▲":"▼"} vs ${f(a)} avg</span>`;
  const startRec=S.meta.recordsAtStart||{},nowRec=computeRecords();
  const broke=Object.keys(nowRec).filter(x=>startRec[x]&&startRec[x].v>0&&nowRec[x].v>startRec[x].v+1e-9&&nowRec[x].ref===k);
  let tip;
  if(s.doors<15)tip="Short session. Next time, get to 15+ doors before you judge how it went. The first 5 are the hardest.";
  else if(ans<.35)tip="Not many people were home. Try 4:30–6:30 pm, or a retiree street around 3 pm.";
  else if(s.answered>=5&&close<.10)tip="Lots of conversations, few yeses. Swipe the script cards before next time, and when you hear \"let me think about it,\" ask what part they'd think over.";
  else if(s.answered>=4&&close>=.4)tip="Huge close rate. Test a price $25–50 higher on the next street.";
  else tip="Solid session. Next time, start right next to a house you've already cleaned and lead with that neighbor.";
  const planned=planSessions(weekStart(k)).filter(p=>p.day===k);const ps=planned[0]?sessionStatus(planned[0]):null;
  const sk=streaks();
  openSheet(`<div class="ph"><h2>Session recap</h2><button type="button" data-close>Done</button></div>
    <div class="recap-hero"><div class="muted small">${esc(fmtDayLong(k))}${s.area?" · "+esc(s.area):""}</div><div class="big">${money(s.booked)}</div><div class="muted">booked${timed(s)&&m>=1?" in "+hm(m):""}</div>${span(s)?`<div class="muted small">${esc(span(s))}</div>`:""}</div>
    ${broke.map(x=>`<div class="recbadge">🏆 New record: ${esc(REC_NAMES[x])} (${recFmt(x,nowRec[x].v)})</div>`).join("")}
    <div class="card"><div class="ks"><div><b class="big">${s.doors}</b><span>Doors</span></div><div><b class="big">${s.answered}</b><span>Talked</span></div><div><b class="big">${s.yes}</b><span>Sold</span></div><div><b class="big">${pct(s.yes,s.answered)}</b><span>Close</span></div></div></div>
    <div class="card">
      <div class="kv"><span>Answer rate</span><b>${pct(s.answered,s.doors)}</b></div>
      <div class="kv"><span>Close rate</span><b>${pct(s.yes,s.answered)} ${cmp(close,avgClose,v=>Math.round(v*100)+"%")}</b></div>
      <div class="kv"><span>Per door</span><b>${money(perDoor)} ${cmp(perDoor,avgPD,money)}</b></div>
      <div class="kv"><span>Per hour</span><b>${timed(s)&&m>=10?money(s.booked/(m/60)):"–"}</b></div>
      ${ps?`<div class="kv"><span>Planned session</span><b>${ps==="done"?"Done ✓":ps==="missed"?"Missed":`${s.doors}/${S.settings.minDoors} doors`}</b></div>`:""}
      <div class="kv"><span>Streak</span><b>${sk.sess} session${sk.sess===1?"":"s"} · ${sk.week} week${sk.week===1?"":"s"}</b></div>
    </div>
    <div class="tip"><b>Next time:</b> ${esc(tip)}</div>
    <button class="save navy" type="button" data-close>Nice. Close recap</button>
    <button class="btn full" type="button" data-editsess="${k}">Fix numbers or times</button>`);
  if(broke.length)celebrate();
}
/* ================= LOCATION explainer ================= */
function locationSheet(){
  openSheet(`<div class="ph"><h2>Pin your doors on a map</h2><button type="button" id="loc-skip">Skip</button></div>
    <p class="muted" style="margin:0;line-height:1.5">Turn on location so every door you tap lands on your Map. You'll see which houses you've hit, and get a list of no-answer houses to retry, sorted by how close they are. Location is only used while you're knocking, and it stays in your account.</p>
    <button class="save teal" type="button" id="loc-on">Turn on location</button>`,()=>{
      $("#loc-on").onclick=()=>{S.meta.locAsked=true;save();try{navigator.geolocation.getCurrentPosition(p=>{lastFix={lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy||0),t:Date.now()}},()=>{toast("Location is off. You can turn it on in iPhone Settings.")},{enableHighAccuracy:true,timeout:15000})}catch(e){}closeSheet();startKnock(true)};
      $("#loc-skip").onclick=()=>{S.meta.locAsked=true;S.settings.useLocation=false;save();closeSheet();startKnock(true)};
    });
}
/* ================= SCRIPT CARDS ================= */
function scriptsSheet(fromStart){
  const cards=S.settings.scripts;
  openSheet(`<div class="ph"><h2>Before you knock</h2><button type="button" data-close>${fromStart?"Let's go":"Close"}</button></div>
    <div class="muted small">Swipe through. ${cards.length} cards.</div>
    <div class="deck">${cards.map((c,i)=>`<div class="dcard"><h4>${esc(c.t)}</h4><p>${esc(fill(c.x,null,null))}</p><div class="n">${i+1} / ${cards.length}</div></div>`).join("")}</div>
    ${fromStart?`<button class="save" type="button" data-close>Start knocking</button>`:""}
    <div class="muted small" style="text-align:center">Edit these in Settings → Script cards.</div>`);
}
/* ================= RETRY NO-ANSWERS ================= */
function retryPins(){const from=addDays(today(),-30);return Object.values(S.pins).filter(p=>p.out==="none"&&!p.done&&p.date>=from)}
function retrySheet(){
  const fx=freshFix();const ps=retryPins();
  const groups={};for(const p of ps){const g=p.street||p.road||"Street not set";(groups[g]=groups[g]||[]).push(p)}
  for(const g of Object.values(groups))g.sort((a,b)=>fx&&a.lat!=null&&b.lat!=null?distM(fx,a)-distM(fx,b):b.t-a.t);
  const gs=Object.entries(groups).sort((a,b)=>{if(!fx)return b[1].length-a[1].length;const da=Math.min(...a[1].filter(p=>p.lat!=null).map(p=>distM(fx,p)),9e9),db=Math.min(...b[1].filter(p=>p.lat!=null).map(p=>distM(fx,p)),9e9);return da-db});
  openSheet(`<div class="ph"><h2>Retry no-answers</h2><button type="button" data-close>Close</button></div>
    <div class="muted small">${ps.length} house${ps.length===1?"":"s"} from the last 30 days.${fx?" Closest first.":" Turn on location to sort by distance."}</div>
    ${gs.length?gs.map(([g,list])=>`<h3>${esc(g)} · ${list.length}</h3><div class="card" style="padding:4px 14px">${list.map(p=>`<div class="task" style="padding:10px 0"><div class="t1"><b>${esc(p.address||"House near "+(p.street||p.road||"here"))}</b><span class="muted tiny">${fx&&p.lat!=null?fmtDist(distM(fx,p))+" · ":""}${esc(fmtDay(p.date))} ${esc(clock(p.t))}</span></div>
      <div class="acts"><button class="btn sm" type="button" data-retry="none" data-pin="${p.id}">No answer</button><button class="btn sm" type="button" data-retry="no" data-pin="${p.id}">Talked, no</button><button class="btn sm" type="button" data-retry="maybe" data-pin="${p.id}">Maybe</button><button class="btn sm good" type="button" data-retry="sold" data-pin="${p.id}">Sold</button><button class="btn sm" type="button" data-retry="addr" data-pin="${p.id}">Address</button><button class="btn sm bad" type="button" data-retry="drop" data-pin="${p.id}">Remove</button></div></div>`).join("")}</div>`).join(""):`<div class="empty">No houses to retry.<br>Every "No answer" tap is saved here for 30 days.</div>`}`);
  resolveAddresses(ps.filter(p=>!p.address&&!p.road&&p.lat!=null).slice(0,12));
  // Not knocking right now, so there's no recent GPS fix: get one, then sort by distance.
  if(!fx&&ps.length&&S.settings.useLocation&&navigator.geolocation){try{navigator.geolocation.getCurrentPosition(p=>{lastFix={lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy||0),t:Date.now()};
    if(!$("#sheet").hidden&&$("#panel h2")&&$("#panel h2").textContent==="Retry no-answers"){const sc=$("#panel").scrollTop;retrySheet();$("#panel").scrollTop=sc}},()=>{},{enableHighAccuracy:true,timeout:15000,maximumAge:60000})}catch(e){}}
}
function onRetry(act,pid){
  const p=S.pins[pid];if(!p)return;
  if(act==="drop"){p.done=true;save();retrySheet();toast("Removed from retry list");return}
  if(act==="addr"){openSheet(`<div class="ph"><h2>House address</h2><button type="button" data-close>Cancel</button></div><input class="f" id="ra" placeholder="e.g. 1234 Palm Dr" value="${esc(p.address||"")}"><button class="save teal" type="button" id="ra-save">Save</button>`,()=>{setTimeout(()=>$("#ra").focus(),60);$("#ra-save").onclick=()=>{p.address=val("ra");save();retrySheet()}});return}
  if(act==="sold"){closeSheet();bookSheet({fromTap:true,address:p.address||"",retryPin:pid});return}
  if(act==="maybe"){closeSheet();leadSheet({fromTap:true,address:p.address||"",retryPin:pid});return}
  const newPin=tap(act);p.done=true;const u=S.meta.undo[S.meta.undo.length-1];if(u)u.retryPin=pid;
  if(newPin&&S.pins[newPin]){S.pins[newPin].address=p.address||"";S.pins[newPin].street=p.street||S.pins[newPin].street;if(S.pins[newPin].lat==null&&p.lat!=null){S.pins[newPin].lat=p.lat;S.pins[newPin].lng=p.lng}}
  save();retrySheet();toast(act==="none"?"Still no answer, saved again":"Logged: no");
}
let geoQueue=[],geoBusy=false;
function resolveAddresses(list){
  if(!navigator.onLine)return;for(const p of list)if(!geoQueue.includes(p.id))geoQueue.push(p.id);if(geoBusy)return;geoBusy=true;
  const step=()=>{const id=geoQueue.shift();if(!id){geoBusy=false;return}const p=S.pins[id];if(!p||p.address||p.road||p.lat==null){step();return}
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${p.lat}&lon=${p.lng}`,{headers:{"Accept-Language":"en"}}).then(r=>r.ok?r.json():null).then(d=>{
      if(d&&d.address){const a=d.address;p.road=a.road||a.pedestrian||"";if(a.house_number&&p.road)p.address=a.house_number+" "+p.road;save();if(!$("#sheet").hidden&&$("#panel h2")&&$("#panel h2").textContent==="Retry no-answers")retrySheet()}
    }).catch(()=>{}).finally(()=>setTimeout(step,1200))};
  step();
}
/* ================= PLAN WEEK ================= */
function planSheet(wsArg){
  const t=today(),cur=weekStart(t),nxt=addDays(cur,7);
  let ws=wsArg||(toDate(t).getDay()===6?nxt:cur);
  const draw=()=>{
    const p=S.plans[ws]||{weekStart:ws,goal:S.settings.weeklyGoal,doorsGoal:0,sessions:[]};
    const days=[...Array(7)].map((_,i)=>addDays(ws,i)).filter(d=>d>=t);
    const firstDay=days.find(d=>d>t||new Date().getHours()<15)||days[days.length-1];
    const g=goalMath();
    const sugDoors=p.doorsGoal||Math.max(40,Math.ceil((Number(p.goal)||g.goal)/g.r.job/(g.r.answer*g.r.close)));
    openSheet(`<div class="ph"><h2>Plan your week</h2><button type="button" data-close>Close</button></div>
      ${chips("pl-week",[{v:cur,l:"This week"},{v:nxt,l:"Next week"}],ws)}
      <div class="two"><div><div class="lbl">Goal ${S.settings.goalType==="profit"?"(profit)":"(revenue)"}</div><input class="f" id="pl-goal" inputmode="numeric" value="${Number(p.goal)||S.settings.weeklyGoal}"></div>
        <div><div class="lbl">Doors goal</div><input class="f" id="pl-doors" inputmode="numeric" value="${sugDoors}"></div></div>
      <div class="muted small">At your numbers, ${money(Number(p.goal)||g.goal)} takes about ${Math.ceil((Number(p.goal)||g.goal)/g.r.job)} jobs ≈ ${Math.ceil(Math.ceil((Number(p.goal)||g.goal)/g.r.job)/(g.r.answer*g.r.close))} doors.</div>
      <h3>Knock sessions</h3>
      <div class="card" style="padding:4px 14px"><div class="plist">${planSessions(ws).length?planSessions(ws).map(ps=>`<div class="pitem"><span class="grow"><span class="when">${esc(dow(ps.day))} ${esc(toDate(ps.day).getDate())} · ${esc(fmtTime(ps.start))}</span> <span class="muted small">· ${ps.mins} min</span></span><span class="st ${sessionStatus(ps)}">${sessionStatus(ps)}</span><button class="btn sm bad" type="button" data-plrm="${ps.id}">✕</button></div>`).join(""):`<div class="empty" style="padding:14px">No sessions yet. Add 2–3 below.</div>`}</div></div>
      <div class="lbl">Add a session · day</div>${chips("pl-day",days.map(d=>({v:d,l:d===t?"Today":dow(d)+" "+toDate(d).getDate()})),firstDay)}
      <div class="lbl">Start</div>${chips("pl-start",[{v:"15:30",l:"3:30 pm"},{v:"16:30",l:"4:30 pm"},{v:"17:00",l:"5 pm"},{v:"10:00",l:"10 am"},{v:"13:00",l:"1 pm"},{v:"other",l:"Other"}],"15:30")}
      <input class="f" id="pl-start-o" type="time" hidden>
      <div class="lbl">Length</div>${chips("pl-len",[{v:"60",l:"1 hr"},{v:"90",l:"1.5 hr"},{v:"120",l:"2 hr"},{v:"180",l:"3 hr"}],"120")}
      <button class="btn full" type="button" id="pl-add">+ Add session</button>
      <button class="save" type="button" id="pl-save">Save plan</button>`,()=>{
        wire("pl-week",v=>{keep();ws=v;draw()});wire("pl-day");wire("pl-start",v=>{$("#pl-start-o").hidden=v!=="other"});wire("pl-len");
        function keep(){const q=S.plans[ws]||{weekStart:ws,sessions:[]};q.goal=num(val("pl-goal"))||S.settings.weeklyGoal;q.doorsGoal=num(val("pl-doors"));if(!Array.isArray(q.sessions))q.sessions=[];S.plans[ws]=q}
        $("#pl-add").onclick=()=>{keep();let st=picked("pl-start");if(st==="other")st=val("pl-start-o");if(!st){toast("Pick a start time");return}
          const day=picked("pl-day"),len=Number(picked("pl-len"))||120;
          if(atTime(day,st)+len*60e3<=Date.now()){toast("That time has already passed. Pick a later day or time.");return}
          S.plans[ws].sessions.push({id:uid("ps"),day,start:st,mins:len});save();draw()};
        document.querySelectorAll("[data-plrm]").forEach(b=>b.onclick=()=>{keep();S.plans[ws].sessions=S.plans[ws].sessions.filter(x=>x.id!==b.dataset.plrm);save();draw()});
        $("#pl-save").onclick=()=>{keep();S.plans[ws].updated=Date.now();save();closeSheet();render();const n=planSessions(ws).length;toast(n?`Plan saved: ${n} session${n===1?"":"s"}`:"Plan saved")};
      });
  };
  draw();
}

/* ================= SETTINGS ================= */
function settingsSheet(open){
  const s=S.settings,T=s.tpl,N=s.notif;
  const last=S.meta.lastBackup?ago(S.meta.lastBackup):"never";
  const sec=(id,title,body)=>`<details class="sec" id="sec-${id}" ${open===id?"open":""}><summary>${title}</summary><div class="body">${body}</div></details>`;
  const tog=(id,label,on)=>`<label class="toggle"><span>${label}</span><input type="checkbox" id="${id}" ${on?"checked":""}></label>`;
  const cloud=window.Cloud&&window.Cloud.panelHTML?window.Cloud.panelHTML():`<div class="muted small">Cloud sync isn't set up yet. The app works fully on this phone. Follow the setup guide to turn on sync and notifications.</div>`;
  openSheet(`<div class="ph"><h2>Settings</h2><button type="button" data-close>Close</button></div>
    ${sec("account","Account & sync",`<div id="cloud-panel">${cloud}</div>`)}
    ${sec("notif","Notifications",`
      <div id="notif-panel">${window.Cloud&&window.Cloud.notifHTML?window.Cloud.notifHTML():`<div class="muted small">Notifications need cloud sync. Set it up first (see the setup guide).</div>`}</div>
      ${tog("n-knock30","Knock session in 30 min",N.types.knock30)}${tog("n-knockStart","Knock session starting now",N.types.knockStart)}
      ${tog("n-lateStart","You haven't started yet (20 min late)",N.types.lateStart)}${tog("n-confirm","Confirm tomorrow's jobs",N.types.confirm)}
      ${tog("n-followups","Follow-ups due",N.types.followups)}${tog("n-thin","Calendar's thin next week",N.types.thin)}
      ${tog("n-plan","Plan your week (Sunday)",N.types.plan)}${tog("n-streak","Streak at risk",N.types.streak)}${tog("n-collect","Collect payment",N.types.collect)}
      <div class="three"><div><div class="lbl">Confirm at</div><input class="f" id="nt-confirm" type="time" value="${N.times.confirm}"></div><div><div class="lbl">Follow-ups</div><input class="f" id="nt-followups" type="time" value="${N.times.followups}"></div><div><div class="lbl">Plan week</div><input class="f" id="nt-plan" type="time" value="${N.times.plan}"></div></div>
      <div class="two"><div><div class="lbl">Quiet from</div><input class="f" id="nq-from" type="time" value="${N.quiet.from}"></div><div><div class="lbl">Quiet until</div><input class="f" id="nq-to" type="time" value="${N.quiet.to}"></div></div>
      ${tog("ns-on","No alerts during school (weekdays)",N.school.on)}
      <div class="two"><div><div class="lbl">School from</div><input class="f" id="ns-from" type="time" value="${N.school.from}"></div><div><div class="lbl">School until</div><input class="f" id="ns-to" type="time" value="${N.school.to}"></div></div>`)}
    ${sec("profile","Name & brand",`
      <div class="lbl">App name</div><input class="f" id="st-app" value="${esc(s.appName)}">
      <div class="lbl">Business name</div><input class="f" id="st-biz" value="${esc(s.business)}">
      <div class="lbl">Your first name (used in texts)</div><input class="f" id="st-me" value="${esc(s.me)}">
      <div class="lbl">Zelle phone or email</div><input class="f" id="st-zelle" value="${esc(s.zelle)}">
      <div class="lbl">Google review link</div><input class="f" id="st-review" value="${esc(s.review)}">
      <div class="two"><div><div class="lbl">Brand color</div><input class="f" id="st-brand" type="color" value="${s.brand||"#0b3a5b"}" style="height:48px;padding:4px"></div><div><div class="lbl">Accent color</div><input class="f" id="st-accent" type="color" value="${s.accent||"#139bb0"}" style="height:48px;padding:4px"></div></div>
      <button class="btn sm" type="button" id="st-colorreset">Reset colors</button>`)}
    ${sec("goals","Goals & rules",`
      <div class="two"><div><div class="lbl">Weekly goal $</div><input class="f" id="st-goal" inputmode="numeric" value="${s.weeklyGoal}"></div><div><div class="lbl">Goal counts</div>${chips("st-goaltype",[{v:"revenue",l:"Revenue"},{v:"profit",l:"Profit"}],s.goalType)}</div></div>
      <div class="three"><div><div class="lbl">Min doors / session</div><input class="f" id="st-mind" inputmode="numeric" value="${s.minDoors}"></div><div><div class="lbl">Thin calendar if &lt;</div><input class="f" id="st-thin" inputmode="numeric" value="${s.thinJobs}"></div><div><div class="lbl">Timer stops after (min)</div><input class="f" id="st-idle" inputmode="numeric" value="${s.idleMin}"></div></div>
      <div class="two"><div><div class="lbl">Default helper pay $</div><input class="f" id="st-help" inputmode="numeric" value="${s.helperPay}"></div><div><div class="lbl">Default supplies $</div><input class="f" id="st-sup" inputmode="numeric" value="${s.supplies}"></div></div>
      <div class="lbl">Job time slots</div><input class="f" id="st-slots" value="${esc(s.slots.map(fmtTime).join(", "))}">
      <div class="muted small">Example: 9am, 11:30am, 2pm, 3:30pm</div>`)}
    ${sec("services","Services & prices",`<div id="svc-list">${s.services.map((x,i)=>`<div class="svc"><input class="f" data-svcn="${i}" value="${esc(x.name)}"><input class="f" data-svcp="${i}" inputmode="numeric" value="${x.price}"><button class="btn sm bad" type="button" data-svcrm="${i}">✕</button></div>`).join("")}</div><button class="btn sm" type="button" id="svc-add">+ Add service</button>`)}
    ${sec("knock","Knocking",`${tog("st-scripts","Show script cards when I start",s.showScriptsOnStart)}${tog("st-saveNA","Save no-answer houses to retry",s.saveNoAnswers)}${tog("st-loc","Pin doors on the map (location)",s.useLocation)}`)}
    ${sec("scripts","Script cards",`<div id="scr-list">${s.scripts.map((x,i)=>`<div class="scr"><input class="f" data-scrt="${i}" value="${esc(x.t)}"><textarea class="f" data-scrx="${i}">${esc(x.x)}</textarea><button class="btn sm bad" type="button" data-scrrm="${i}">Remove card</button></div>`).join("")}</div>
      <div class="two"><button class="btn sm" type="button" id="scr-add">+ Add card</button><button class="btn sm" type="button" id="scr-reset">Reset to defaults</button></div>
      <div class="muted small">{me} and {business} fill in automatically.</div>`)}
    ${sec("texts","Text messages",`<div class="muted small">{first} = their first name, {me} = you, {business}, {day} {time} {price} = the job, {review} = your review link.</div>
      ${[["confirm","Confirm the day before"],["onway","On my way"],["pay","Payment request"],["review","Review request"],["follow","Lead follow-up"],["quarterly","Quarterly reminder"]].map(([k,l])=>`<div class="lbl">${l}</div><textarea class="f" id="tp-${k}">${esc(T[k])}</textarea>`).join("")}`)}
    ${sec("backup","Backup",`<div class="muted small">Last backup: ${esc(last)}. ${window.Cloud&&window.Cloud.signedIn&&window.Cloud.signedIn()?"Cloud sync is on, but a copy in Notes never hurts.":"Your data lives only on this phone. Once a week: copy it and paste it into Notes."}</div>
      <button class="save" type="button" id="bk-copy">Copy backup</button>
      <textarea class="f" id="bk-box" placeholder="To restore: paste a backup here"></textarea>
      <div id="bk-area"><button class="btn full" type="button" id="bk-restore">Restore from backup</button></div>
      ${(S.meta.snaps||[]).length?`<div class="lbl">Automatic weekly snapshots</div>${S.meta.snaps.slice().reverse().map(w=>`<button class="btn sm" type="button" data-snap="${w}">Restore week of ${esc(fmtDay(w))}</button>`).join("")}`:""}`)}
    <button class="save teal" type="button" id="st-save">Save settings</button>
    <div class="muted small" style="text-align:center">${esc(s.appName)} app v${VERSION}</div>`,()=>{
      wire("st-goaltype");
      if(window.Cloud&&window.Cloud.wirePanels)window.Cloud.wirePanels();
      $("#st-colorreset").onclick=()=>{s.brand="";s.accent="";applyBrand();save();settingsSheet("profile")};
      $("#svc-add").onclick=()=>{collect();s.services.push({id:uid("svc"),name:"New service",price:0});save();settingsSheet("services")};
      document.querySelectorAll("[data-svcrm]").forEach(b=>b.onclick=()=>{collect();if(s.services.length<=1){toast("Keep at least one service");return}s.services.splice(Number(b.dataset.svcrm),1);save();settingsSheet("services")});
      $("#scr-add").onclick=()=>{collect();s.scripts.push({t:"New card",x:""});save();settingsSheet("scripts")};
      $("#scr-reset").onclick=()=>{s.scripts=clone(SCRIPTS_DEFAULT);save();settingsSheet("scripts");toast("Script cards reset")};
      document.querySelectorAll("[data-scrrm]").forEach(b=>b.onclick=()=>{collect();s.scripts.splice(Number(b.dataset.scrrm),1);save();settingsSheet("scripts")});
      function collect(){
        s.appName=val("st-app")||"Blue Tide";s.business=val("st-biz");s.me=val("st-me");s.zelle=val("st-zelle");s.review=val("st-review");
        const br=val("st-brand"),ac=val("st-accent");if(br&&br.toLowerCase()!=="#0b3a5b")s.brand=br;if(ac&&ac.toLowerCase()!=="#139bb0")s.accent=ac;
        s.weeklyGoal=num(val("st-goal"))||1000;s.goalType=picked("st-goaltype")||"revenue";s.minDoors=Math.max(1,num(val("st-mind"))||15);s.thinJobs=Math.max(0,num(val("st-thin")));s.idleMin=Math.max(5,num(val("st-idle"))||30);
        s.helperPay=num(val("st-help"));s.supplies=num(val("st-sup"));
        const sl=val("st-slots").split(/[,;]+/).map(parseTime).filter(Boolean);if(sl.length)s.slots=[...new Set(sl)].sort();
        s.services=s.services.map((x,i)=>({...x,name:(document.querySelector(`[data-svcn="${i}"]`)||{}).value||x.name,price:num((document.querySelector(`[data-svcp="${i}"]`)||{}).value)}));
        s.scripts=s.scripts.map((x,i)=>({t:(document.querySelector(`[data-scrt="${i}"]`)||{}).value??x.t,x:(document.querySelector(`[data-scrx="${i}"]`)||{}).value??x.x}));
        s.showScriptsOnStart=$("#st-scripts").checked;s.saveNoAnswers=$("#st-saveNA").checked;s.useLocation=$("#st-loc").checked;if(!s.useLocation)stopGeo();
        for(const k of Object.keys(T)){const e=document.getElementById("tp-"+k);if(e&&e.value.trim())T[k]=e.value.trim()}
        for(const k of Object.keys(N.types)){const e=document.getElementById("n-"+k);if(e)N.types[k]=e.checked}
        for(const k of ["confirm","followups","plan"]){const v=val("nt-"+k);if(v)N.times[k]=v}
        N.quiet.from=val("nq-from")||N.quiet.from;N.quiet.to=val("nq-to")||N.quiet.to;N.school.on=$("#ns-on").checked;N.school.from=val("ns-from")||N.school.from;N.school.to=val("ns-to")||N.school.to;
        S.meta.stateUpdatedAt=Date.now();
      }
      $("#st-save").onclick=()=>{collect();applyBrand();save();closeSheet();render();toast("Settings saved")};
      $("#bk-copy").onclick=()=>{const t="BLUETIDE6 "+JSON.stringify(S);const ok=()=>{S.meta.lastBackup=Date.now();save();toast("Copied. Paste it into a note.")};
        const fb=()=>{$("#bk-box").value=t;$("#bk-box").select();toast("Select all and copy the text")};try{navigator.clipboard.writeText(t).then(ok,fb)}catch(e){fb()}};
      const restoreFrom=(data,label)=>{$("#bk-area").innerHTML=`<div class="two"><button class="btn" type="button" id="bk-no">Cancel</button><button class="btn bad" type="button" id="bk-yes">Replace all</button></div>`;
        $("#bk-no").onclick=()=>{$("#bk-area").innerHTML=`<button class="btn full" type="button" id="bk-restore">Restore from backup</button>`;$("#bk-restore").onclick=restore};
        $("#bk-yes").onclick=()=>{const syncKeep=S.meta.sync;S=data;normalize();S.meta.sync=syncKeep||{};checkRecords(true);save();closeSheet();applyBrand();render();toast(label||"Backup restored")}};
      const restore=()=>{const d=parseBackup(val("bk-box"));if(!d){toast("That isn't a valid backup");return}restoreFrom(d)};
      $("#bk-restore").onclick=restore;
      document.querySelectorAll("[data-snap]").forEach(b=>b.onclick=()=>{let d=null;try{d=JSON.parse(localStorage.getItem("bluetide-snap-"+b.dataset.snap)||"null")}catch(e){}if(!d){toast("Snapshot not found");return}$("#sec-backup").open=true;restoreFrom(d,"Snapshot restored");$("#bk-area").scrollIntoView({behavior:"smooth"})});
    });
}
function parseBackup(raw){
  raw=String(raw||"").trim();if(!raw)return null;const keep=S;
  try{
    if(raw.startsWith("BLUETIDE6")){const d=JSON.parse(raw.slice(9).trim());return d&&d.version===6?d:null}
    if(raw.startsWith("SALTOFF5")){const v5=JSON.parse(raw.slice(8).trim());if(!v5||v5.version!==5)return null;S=blank();fromV5(v5);normalize();const d=S;S=keep;return d}
    const o=JSON.parse(raw.replace(/^SALTOFF-BACKUP\s*/,""));if(!o||typeof o!=="object")return null;S=blank();migrateV1(o);normalize();const d=S;S=keep;return d;
  }catch(e){S=keep;return null}
}
function parseTime(x){x=String(x).trim().toLowerCase();const m=x.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);if(!m)return null;let h=+m[1],mi=+(m[2]||0);const ap=m[3];if(ap){if(ap[0]==="p"&&h<12)h+=12;if(ap[0]==="a"&&h===12)h=0}else if(h<7)h+=12;if(h>23||mi>59)return null;return pad(h)+":"+pad(mi)}
function applyBrand(){
  const s=S.settings,r=document.documentElement.style;
  if(s.brand)r.setProperty("--navy",s.brand);else r.removeProperty("--navy");
  if(s.accent){r.setProperty("--teal",s.accent);r.setProperty("--teal-fill",s.accent)}else{r.removeProperty("--teal");r.removeProperty("--teal-fill")}
  $("#hdr-name").textContent=(s.appName||"Blue Tide").toUpperCase();document.title=s.appName||"Blue Tide";
}

/* ================= RENDER: TODAY ================= */
function taskHtml(tag,title,sub,acts){const lab={late:"Overdue",job:"Today",due:"Due",money:"Money",plain:"Next"}[tag];return `<div class="task"><div class="t1"><b>${title}</b><span class="tag ${tag}">${lab}</span></div><div class="muted small">${sub}</div><div class="acts">${acts}</div></div>`}
function renderToday(){
  const s=S.settings,g=goalMath(),T=tasks(),t=today(),cur=weekStart(t),nxt=addDays(cur,7);
  const e=Math.min(100,g.earned/g.goal*100),b=Math.min(100,(g.earned+g.upcoming)/g.goal*100);
  const np=nextPlanned(),sk=streaks();
  const d=toDate(t),hr=new Date().getHours();
  const planWs=d.getDay()===6?nxt:cur;
  const showPlanPrompt=!planSessions(planWs).length&&!S.meta.planDismiss[planWs]&&d.getDay()!==5;
  let html=`${window.__updateReady?`<div class="update"><span>New version ready.</span><button class="btn pri sm" type="button" data-act="reload">Reload</button></div>`:""}`;
  if(showPlanPrompt)html+=`<div class="card"><div class="between"><div><h3>${planWs===nxt?"Next week":"This week"}</h3><b style="font-size:17px">Plan your knock sessions</b></div><span style="font-size:28px">🗓️</span></div><div class="muted small">Pick 2–3 times to knock. The app reminds you and tracks your streak.</div><div class="acts"><button class="btn pri" type="button" data-plan="${planWs}">Plan my week</button><button class="btn" type="button" data-plandismiss="${planWs}">Not now</button></div></div>`;
  // mission
  const ko=knocking();
  if(ko){const ss=S.sessions[t];html+=`<div class="card mission"><div class="between"><h3>Knocking now · ${esc(span(ss))}</h3><b class="clock" data-clock="run">${watch(mins(ss)*60e3)}</b></div><div class="mrow"><div><b class="big">${ss.doors}</b><span>Doors</span></div><div><b class="big">${ss.yes}</b><span>Sold</span></div><div><b class="big">${money(ss.booked)}</b><span>Booked</span></div></div><div class="acts"><button class="btn go" type="button" data-tab="knock">Back to knocking</button></div></div>`}
  else{
    const when=np?`${np.day===t?"Today":fmtDay(np.day)} at ${fmtTime(np.start)}`:"";
    html+=`<div class="card mission"><div class="between"><h3>Today's mission</h3>${np&&np.status==="now"?`<span class="st now">Now</span>`:""}</div>
      ${g.remaining>0?`<div style="font-size:18px;font-weight:700;line-height:1.35">${money(g.remaining)} to go this week</div>
      <div class="mrow"><div><b class="big">${g.jobs}</b><span>Job${g.jobs===1?"":"s"}</span></div><div><b class="big">${g.doors}</b><span>Door${g.doors===1?"":"s"}</span></div><div><b class="big">${g.hours<1?Math.round(g.hours*60)+"m":g.hours.toFixed(1)+"h"}</b><span>Knocking</span></div></div>`
      :`<div style="font-size:18px;font-weight:700">Weekly goal covered. Everything else is extra.</div>`}
      <div class="muted small">${np?`Next session: ${esc(when)}${np.mins?" · "+np.mins+" min":""}.`:"No session planned."} ${g.r.real?"Based on your last 30 days.":"Using starter numbers until you log more doors."}</div>
      <div class="acts">${np&&np.day===t?`<button class="btn go" type="button" data-act="start">Start knocking</button>`:`<button class="btn go" type="button" data-tab="knock">Go knock</button>`}<button class="btn" type="button" data-plan="${planWs}">${planSessions(cur).length?"Edit plan":"Plan week"}</button></div></div>`;
  }
  // jobs today
  const todayJobs=T.filter(x=>x.k==="todayjob");const rest=T.filter(x=>x.k!=="todayjob");
  if(todayJobs.length){html+=`<div class="card"><div class="between"><h3>Jobs today</h3><span class="muted small">${todayJobs.length} · ${money(todayJobs.reduce((a,x)=>a+(x.j.price||0),0))}</span></div>`;
    for(const x of todayJobs){const c=x.c,j=x.j,sent=lastLog(c.id,"text",j.id);html+=taskHtml("job",`${j.time?fmtTime(j.time)+" · ":""}${esc(custName(c))}`,`${esc(svcName(j.service))} · ${esc(c.address||"")} · ${money(j.price)}${c.notes?" · "+esc(c.notes):""}`,`${dirBtn(c)}${textBtn(c,"onway",j,sent?"On my way (sent)":"On my way","")}<button class="btn good" type="button" data-done="${j.id}">Done</button>`)}
    html+=`</div>`}
  // to do
  html+=`<div class="card"><div class="between"><h3>To do</h3><span class="muted small">${rest.length?rest.length+" thing"+(rest.length===1?"":"s"):"All clear"}</span></div>`;
  if(!rest.length)html+=`<div class="empty" style="padding:12px">Nothing waiting on you.</div>`;
  for(const x of rest){
    const c=x.c,j=x.j,nm=esc(custName(c));
    if(x.k==="late")html+=taskHtml("late","Did this job happen?",`${nm} · ${esc(fmtDay(j.date))}${j.time?" "+fmtTime(j.time):""} · ${money(j.price)}`,`<button class="btn good" type="button" data-done="${j.id}">Yes, done</button><button class="btn" type="button" data-job="${j.id}">Reschedule</button>`);
    else if(x.k==="confirm")html+=taskHtml("due","Confirm tomorrow's job",`${nm} · ${j.time?fmtTime(j.time):"no time set"} · ${money(j.price)}`,`${textBtn(c,"confirm",j,"Text confirmation")}${callBtn(c)}`);
    else if(x.k==="collect"){const asked=lastLog(c.id,"payask",j.id);html+=taskHtml("money",`Collect ${money(j.price)}`,`${nm} · cleaned ${esc(fmtDay(j.date))}${asked?" · asked "+ago(asked.t):""}`,`<button class="btn good" type="button" data-paid="${j.id}">Got paid</button>${textBtn(c,"pay",j,asked?"Text again":"Text payment info","")}`)}
    else if(x.k==="review")html+=taskHtml("plain","Ask for a review",`${nm} · paid ${esc(fmtDay(j.date))}`,`${textBtn(c,"review",j,"Text review link")}<button class="btn" type="button" data-noreview="${j.id}">Skip</button>`);
    else if(x.k==="follow"){const lt=S.log.filter(l=>l.cid===c.id&&(l.type==="text"||l.type==="call")).sort((a,b)=>b.t-a.t)[0];html+=taskHtml("due","Follow up",`${nm}${c.price?" · quoted "+money(num(c.price)):""}${lt?" · last contact "+ago(lt.t):" · not contacted yet"}${c.notes?" · "+esc(c.notes):""}`,`${textBtn(c,"follow",null,"Text")}${callBtn(c)}<button class="btn good" type="button" data-act="book" data-cid="${c.id}">Booked</button><button class="btn bad" type="button" data-lost="${c.id}">No</button>`)}
    else if(x.k==="quarterly")html+=taskHtml("money","Quarterly visit due",`${nm} · last cleaned ${esc(fmtDay(j.date))}`,`${textBtn(c,"quarterly",null,"Text to rebook")}<button class="btn good" type="button" data-act="book" data-cid="${c.id}">Book it</button>`);
  }
  html+=`</div>`;
  // week goal + streak + plan
  const ps=planSessions(cur);
  html+=`<div class="card goal">
    <div class="between"><h3>This week</h3><span class="muted small">Goal ${money(g.goal)}${s.goalType==="profit"?" profit":""}</span></div>
    <div class="between"><span class="big amt" style="color:var(--good)">${money(g.earned)}</span><span class="muted small" style="text-align:right">${s.goalType==="profit"?"profit":"earned"}<br>+ ${money(g.upcoming)} booked</span></div>
    <div class="bar"><i class="booked" style="width:${b}%"></i><i class="earned" style="width:${e}%"></i></div>
    <div class="streaks"><span class="streak ${sk.week>=2?"hot":""}">🔥 <b>${sk.week}</b> week streak</span><span class="streak ${sk.sess>=3?"hot":""}"><b>${sk.sess}</b> sessions in a row</span></div>
    ${ps.length?`<div class="plist">${ps.map(p=>{const st=sessionStatus(p);const sd=S.sessions[p.day];return `<div class="pitem"><span class="grow"><span class="when">${esc(dow(p.day))} ${esc(fmtTime(p.start))}</span> <span class="muted small">· ${sd&&sd.doors?sd.doors+" doors":p.mins+" min"}</span></span><span class="st ${st}">${st}</span></div>`}).join("")}</div>`:""}
  </div>`;
  // thin calendar
  const dw=d.getDay();
  if(dw>=3){const nws=nxt;const nwe=addDays(nws,6);const n=Object.values(S.jobs).filter(j=>j.status==="scheduled"&&j.date>=nws&&j.date<=nwe).length;
    if(n<(s.thinJobs||0))html+=`<div class="warnbox"><span><b>Next week's thin:</b> ${n} job${n===1?"":"s"} booked. Knock to fill it.</span><button class="btn sm" type="button" data-plan="${dw===6?nxt:cur}">Plan a session</button></div>`}
  // next 7 days
  const upcoming=Object.values(S.jobs).filter(j=>j.status==="scheduled"&&j.date>t&&j.date<=addDays(t,7)).sort((a,b)=>(a.date+(a.time||"99")).localeCompare(b.date+(b.time||"99")));
  html+=`<div class="card"><div class="between"><h3>Next 7 days</h3><span class="muted small">${upcoming.length} job${upcoming.length===1?"":"s"} · ${money(upcoming.reduce((a,j)=>a+(j.price||0),0))}</span></div>`;
  if(!upcoming.length)html+=`<div class="empty" style="padding:12px">No jobs booked yet. Every SOLD tap lands here.</div>`;
  let lastD="";for(const j of upcoming){const c=S.customers[j.cid];if(!c)continue;if(j.date!==lastD){html+=`<div class="dayhead">${esc(fmtDay(j.date))}</div>`;lastD=j.date}
    const conf=lastLog(c.id,"confirm",j.id);html+=`<button type="button" class="item" data-job="${j.id}"><span class="time">${j.time?fmtTime(j.time):"–"}</span><span class="grow"><span class="nm">${esc(custName(c))}</span><span class="sub">${esc(svcName(j.service))}${c.address?" · "+esc(c.address):""}${conf?" · confirmed":""}</span></span><span class="amt">${money(j.price)}</span></button>`}
  html+=`</div>`;
  const backupOld=Object.keys(S.customers).length&&(Date.now()-(S.meta.lastBackup||0)>7*864e5)&&!(window.Cloud&&window.Cloud.signedIn&&window.Cloud.signedIn());
  if(backupOld)html+=`<div class="update"><span>${S.meta.lastBackup?"Last backup was over a week ago.":"You haven't backed up yet."}</span><button class="btn sm" type="button" data-act="settings" data-open="backup">Back up</button></div>`;
  $("#v-today").innerHTML=html;
}
/* ================= RENDER: KNOCK ================= */
function renderKnock(){
  const s=sess(),on=!!openInt(s),m=mins(s),g=goalMath();
  const rp=retryPins().length;
  $("#v-knock").innerHTML=`
    ${g.remaining>0?`<div class="calc"><span>🎯</span><span class="grow">${money(g.remaining)} to go = <b>${g.jobs}</b> job${g.jobs===1?"":"s"} ≈ <b>${g.doors}</b> doors (~${g.hours<1?Math.round(g.hours*60)+" min":g.hours.toFixed(1)+" hr"})</span></div>`:`<div class="calc"><span>✅</span><span>Weekly goal covered. Every sale now is extra.</span></div>`}
    <div class="card timer"><div><div class="small muted"><span class="dot ${on?"on":""}"></span>${on?esc(span(s)):timed(s)&&s.manualMin==null?esc(span(s))+((s.intervals[s.intervals.length-1]||{}).auto?" · stopped itself (no taps)":""):"Not started"}${on&&freshFix()?" · GPS on":""}</div><div class="big clock" data-clock="${on?"run":""}">${watch(m*60e3)}</div></div>
      ${on?`<button class="btn" type="button" data-act="stop">Stop</button>`:`<button class="btn pri" type="button" data-act="start">Start knocking</button>`}</div>
    <input class="street" id="street" placeholder="Street or area (optional)" value="${esc(s.area||S.meta.street||"")}" autocomplete="off" enterkeyhint="done">
    <div class="card"><div class="ks">
      <div><b class="big">${s.doors}</b><span>Doors</span></div><div><b class="big">${s.answered}</b><span>Talked</span></div>
      <div><b class="big">${s.yes}</b><span>Sold</span></div><div><b class="big" style="color:var(--good)">${money(s.booked)}</b><span>Booked</span></div></div>
      <div class="between small muted"><span>Close ${pct(s.yes,s.answered)}</span><span>${money(s.doors?s.booked/s.doors:0)} per door</span><span>${m>=10?money(s.booked/(m/60))+"/hr":"–/hr"}</span></div></div>
    <div class="pad">
      <button class="tap none" type="button" data-tap="none">No answer<small>door +1</small></button>
      <button class="tap no" type="button" data-tap="no">Talked, no<small>said no</small></button>
      <button class="tap maybe" type="button" data-tap="maybe">Maybe, follow up<small>saves a lead</small></button>
      <button class="tap sold" type="button" data-tap="sold">SOLD<small>book the job</small></button>
    </div>
    <div class="links"><button class="btn" type="button" data-act="undo">Undo</button><button class="btn" type="button" data-act="scripts">Scripts</button><button class="btn" type="button" data-act="retry">Retry${rp?" ("+rp+")":""}</button></div>`;
  const st=$("#street");st.addEventListener("change",()=>{const x=sess();x.area=st.value.trim();S.meta.street=x.area;save()});st.addEventListener("keydown",e=>{if(e.key==="Enter")st.blur()});
}
/* ================= RENDER: CUSTOMERS ================= */
function custStatus(c){const nj=nextJob(c.id);if(c.status==="lead")return{tag:"due",txt:c.followUp?`Follow up ${fmtDay(c.followUp)}`:"Lead"};if(c.status==="lost")return{tag:"plain",txt:"Not interested"};if(nj)return{tag:"job",txt:`Booked ${fmtDay(nj.date)}`};return{tag:c.plan==="quarterly"?"money":"plain",txt:c.plan==="quarterly"?"Quarterly":"Customer"}}
function renderCustomers(){
  const all=Object.values(S.customers);
  const f={all:()=>true,leads:c=>c.status==="lead",booked:c=>!!nextJob(c.id),customers:c=>c.status==="customer",quarterly:c=>c.plan==="quarterly"&&c.status==="customer",lost:c=>c.status==="lost"};
  const counts=Object.fromEntries(Object.keys(f).map(k=>[k,all.filter(f[k]).length]));
  const q=custQuery.toLowerCase();
  const key=c=>c.status==="lead"?"0"+(c.followUp||"9"):nextJob(c.id)?"1"+nextJob(c.id).date:"2"+(c.createdAt||"");
  const list=all.filter(f[custFilter]).filter(c=>!q||[c.name,c.address,c.phone,c.notes].join(" ").toLowerCase().includes(q)).sort((a,b)=>key(a).localeCompare(key(b)));
  $("#v-customers").innerHTML=`<div class="between"><h2>Customers</h2><button class="btn pri" type="button" data-act="newlead">+ Lead</button></div>
    <input class="search" id="csearch" placeholder="Search name, street, phone, notes" value="${esc(custQuery)}" autocomplete="off">
    <div class="chips" id="cfilter">${[["all","All"],["leads","Leads"],["booked","Booked"],["customers","Customers"],["quarterly","Quarterly"],["lost","Not interested"]].map(([k,l])=>`<button type="button" class="chip" data-f="${k}" aria-pressed="${custFilter===k}">${l} ${counts[k]}</button>`).join("")}</div>
    <div style="display:flex;flex-direction:column;gap:10px">${list.length?list.map(c=>{const st=custStatus(c);const ld=lastDone(c.id);return `<button type="button" class="cust" data-cust="${c.id}"><span class="between"><span class="nm">${esc(custName(c))}</span><span class="tag ${st.tag}">${esc(st.txt)}</span></span><span class="sub">${[c.name?esc(c.address):"",c.phone?esc(fmtPhone(c.phone)):"",c.price?money(num(c.price)):"",ld?"last cleaned "+esc(fmtDay(ld.date)):""].filter(Boolean).join(" · ")}</span></button>`}).join(""):`<div class="empty">${all.length?"No one matches.":"No customers yet.<br>Tap <b>SOLD</b> or <b>Maybe</b> on the Knock tab and they show up here."}</div>`}</div>`;
  const cs=$("#csearch");cs.addEventListener("input",()=>{custQuery=cs.value;const pos=cs.selectionStart;renderCustomers();const n=$("#csearch");n.focus();try{n.setSelectionRange(pos,pos)}catch(e){}});
}
/* ================= RENDER: MONEY ================= */
function range(){
  const t=today();
  if(moneyRange==="week")return{from:weekStart(t),to:addDays(weekStart(t),6),label:"This week"};
  if(moneyRange==="month"){const d=toDate(t);return{from:dk(new Date(d.getFullYear(),d.getMonth(),1)),to:dk(new Date(d.getFullYear(),d.getMonth()+1,0)),label:"This month"}}
  return{from:"0000",to:"9999",label:"All time"};
}
function renderMoney(){
  const r=range(),js=Object.values(S.jobs);
  const done=js.filter(j=>j.status==="done"&&j.date>=r.from&&j.date<=r.to);
  const rev=done.reduce((a,j)=>a+(j.price||0),0),help=done.reduce((a,j)=>a+(Number(j.helperPay)||0),0),sup=done.reduce((a,j)=>a+(Number(j.supplies)||0),0),prof=rev-help-sup;
  const collected=done.filter(j=>j.paid).reduce((a,j)=>a+(j.price||0),0);
  const unpaid=js.filter(j=>j.status==="done"&&!j.paid).reduce((a,j)=>a+(j.price||0),0);
  const upcoming=js.filter(j=>j.status==="scheduled"&&j.date>=today()).reduce((a,j)=>a+(j.price||0),0);
  const ss=Object.values(S.sessions).filter(s=>s.date>=r.from&&s.date<=r.to&&(s.doors>0||timed(s)));
  const K=ss.reduce((a,s)=>({doors:a.doors+s.doors,talk:a.talk+s.answered,sold:a.sold+s.yes,booked:a.booked+s.booked,min:a.min+(timed(s)?mins(s):0),tb:a.tb+(timed(s)?s.booked:0)}),{doors:0,talk:0,sold:0,booked:0,min:0,tb:0});
  const quarterly=Object.values(S.customers).filter(c=>c.plan==="quarterly"&&c.status==="customer");
  const qYear=quarterly.reduce((a,c)=>a+4*(num(c.price)||rates().job),0);
  const hist=Object.values(S.sessions).filter(s=>s.doors>0||timed(s)).sort((a,b)=>b.date.localeCompare(a.date));
  const R=S.meta.records||{};
  const bySvc={};for(const j of done){bySvc[j.service]=(bySvc[j.service]||0)+(j.price||0)}
  $("#v-money").innerHTML=`<div class="chips">${[["week","This week"],["month","This month"],["all","All time"]].map(([k,l])=>`<button type="button" class="chip" data-range="${k}" aria-pressed="${moneyRange===k}">${l}</button>`).join("")}</div>
    <div class="stats">
      <div class="stat"><b class="big" style="color:var(--good)">${money(rev)}</b><span>Revenue (${done.length} job${done.length===1?"":"s"})</span></div>
      <div class="stat"><b class="big">${money(prof)}</b><span>Profit</span></div>
      <div class="stat"><b class="big">${money(collected)}</b><span>Collected</span></div>
      <div class="stat"><b class="big" style="color:${unpaid?"var(--warn)":"inherit"}">${money(unpaid)}</b><span>Still owed</span></div>
    </div>
    <div class="card"><h3>Where it went · ${esc(r.label)}</h3>
      <div class="kv"><span>Revenue</span><b>${money(rev)}</b></div><div class="kv"><span>Helper pay</span><b>-${money(help)}</b></div><div class="kv"><span>Supplies</span><b>-${money(sup)}</b></div><div class="kv"><span>Profit</span><b style="color:var(--good)">${money(prof)}</b></div>
      <div class="kv"><span>Set aside for taxes (about 20%)</span><b>${money(Math.max(0,prof)*0.2)}</b></div><div class="kv"><span>Booked ahead (all future jobs)</span><b>${money(upcoming)}</b></div>
      ${Object.entries(bySvc).map(([k,v])=>`<div class="kv"><span class="muted">${esc(svcName(k))}</span><b>${money(v)}</b></div>`).join("")}</div>
    <div class="card"><h3>Personal records</h3><div class="rec">${Object.keys(REC_NAMES).map(k=>`<div><b class="big">${R[k]?recFmt(k,R[k].v):"–"}</b><span>${REC_NAMES[k]}</span></div>`).join("")}</div></div>
    <div class="card"><h3>Knocking · ${esc(r.label)}</h3>
      <div class="kv"><span>Doors</span><b>${K.doors}</b></div><div class="kv"><span>Talked</span><b>${K.talk} (${pct(K.talk,K.doors)} answered)</b></div>
      <div class="kv"><span>Sold</span><b>${K.sold}</b></div><div class="kv"><span>Close rate (sold ÷ talked)</span><b>${pct(K.sold,K.talk)}</b></div>
      <div class="kv"><span>Booked at the door</span><b>${money(K.booked)}</b></div><div class="kv"><span>Per door</span><b>${money(K.doors?K.booked/K.doors:0)}</b></div>
      <div class="kv"><span>Time knocking</span><b>${K.min?hm(K.min):"not timed"}</b></div><div class="kv"><span>Per hour</span><b>${K.min>=10?money(K.tb/(K.min/60)):"–"}</b></div>
    </div>
    <div class="card"><h3>Quarterly customers</h3><div class="kv"><span>On the plan</span><b>${quarterly.length}</b></div><div class="kv"><span>Worth per year</span><b>${money(qYear)}</b></div></div>
    <div class="card" style="padding:4px 14px"><div style="padding:10px 0 4px"><h3>Sessions</h3></div>${hist.length?hist.map(s=>`<button type="button" class="item" data-sess="${s.date}"><span class="grow"><span class="nm">${esc(fmtDay(s.date))}${s.area?" · "+esc(s.area):""}</span><span class="sub">${s.doors} doors · ${s.answered} talked · ${s.yes} sold · ${pct(s.yes,s.answered)} · ${timed(s)?(s.manualMin==null&&span(s)?span(s)+" · ":"")+hm(mins(s)):"not timed"}</span></span><span class="amt" style="color:var(--good)">${money(s.booked)}</span></button>`).join(""):`<div class="empty">Your knocking sessions show up here.</div>`}</div>
    <div class="muted small" style="text-align:center">Tap a session for its recap, or to fix its numbers.</div>`;
}
/* ================= RENDER: MAP ================= */
let map=null,mapLayer=null,leafletLoading=null,meMarker=null;
const OUT={none:{l:"No answer",c:"#8a99a6"},no:{l:"Talked, no",c:"#c2413d"},maybe:{l:"Maybe",c:"#d08a00"},sold:{l:"Sold",c:"#1e8a4c"},cust:{l:"Customer",c:"#139bb0"}};
function loadLeaflet(){
  if(window.L)return Promise.resolve();if(leafletLoading)return leafletLoading;
  leafletLoading=new Promise((res,rej)=>{const l=document.createElement("link");l.rel="stylesheet";l.href="vendor/leaflet/leaflet.css";document.head.appendChild(l);
    const s=document.createElement("script");s.src="vendor/leaflet/leaflet.js";s.onload=res;s.onerror=()=>{leafletLoading=null;rej()};document.head.appendChild(s)});
  return leafletLoading;
}
function mapPins(){
  const t=today();const from=mapRange==="today"?t:mapRange==="7"?addDays(t,-6):mapRange==="30"?addDays(t,-29):"0000";
  return Object.values(S.pins).filter(p=>p.lat!=null&&p.date>=from).filter(p=>{
    const k=pinKind(p);return mapOut==="all"||k===mapOut||(mapOut==="sold"&&k==="cust")});
}
function pinKind(p){if(p.cid&&S.customers[p.cid]){const c=S.customers[p.cid];if(c.status==="customer"&&jobsOf(c.id).some(j=>j.status==="done"))return"cust";if(c.status==="customer")return"sold";if(c.status==="lead")return"maybe"}return p.out}
function renderMap(){
  $("#map-out").innerHTML=[["all","All"],["none","No answer"],["no","No"],["maybe","Maybe"],["sold","Sold"]].map(([k,l])=>`<button type="button" class="chip" data-mapout="${k}" aria-pressed="${mapOut===k}">${l}</button>`).join("");
  $("#map-range").innerHTML=[["today","Today"],["7","7 days"],["30","30 days"],["all","All time"]].map(([k,l])=>`<button type="button" class="chip" data-maprange="${k}" aria-pressed="${mapRange===k}">${l}</button>`).join("");
  const note=$("#map-note");const all=Object.values(S.pins).filter(p=>p.lat!=null).length;
  if(!navigator.onLine){note.hidden=false;note.textContent="The map needs signal to load streets. Your pins are still being saved."}
  else if(!all){note.hidden=false;note.textContent=S.settings.useLocation?"No pins yet. Start knocking with location on and every door you tap shows up here.":"Location is off. Turn on \"Pin doors on the map\" in Settings → Knocking."}
  else note.hidden=true;
  loadLeaflet().then(()=>{
    if(!map){map=L.map("map",{zoomControl:false,attributionControl:true}).setView([26.56,-81.87],13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);mapLayer=L.layerGroup().addTo(map)}
    setTimeout(()=>map.invalidateSize(),60);
    mapLayer.clearLayers();const ps=mapPins();const pts=[];
    for(const p of ps){const k=pinKind(p);const c=p.cid&&S.customers[p.cid];
      const m=L.circleMarker([p.lat,p.lng],{radius:k==="sold"||k==="cust"?10:8,color:"#fff",weight:2,fillColor:OUT[k].c,fillOpacity:.95});
      m.bindPopup(`<div class="pop"><b>${esc(c?custName(c):(p.address||OUT[k].l))}</b><div>${esc(OUT[k].l)} · ${esc(fmtDay(p.date))} ${esc(clock(p.t))}</div>${p.address&&c?`<div>${esc(p.address)}</div>`:""}
        <div class="acts">${c?`<button class="btn" type="button" data-cust="${c.id}">Open customer</button>`:""}${!c?["none","no"].filter(x=>x!==p.out).map(x=>`<button class="btn" type="button" data-pinout="${x}" data-pin="${p.id}">Mark ${OUT[x].l.toLowerCase()}</button>`).join(""):""}${p.out==="none"&&!p.done?`<button class="btn" type="button" data-pinsold="${p.id}">Sold here</button>`:""}<button class="btn" type="button" data-pindel="${p.id}">Delete pin</button></div></div>`);
      m.addTo(mapLayer);pts.push([p.lat,p.lng])}
    const fx=freshFix();
    if(meMarker){meMarker.remove();meMarker=null}
    if(fx){meMarker=L.circleMarker([fx.lat,fx.lng],{radius:7,color:"#fff",weight:3,fillColor:"#2a7fff",fillOpacity:1}).addTo(map)}
    if(!renderMap.fitted||renderMap.lastKey!==mapOut+mapRange){if(pts.length)map.fitBounds(pts,{padding:[60,60],maxZoom:18});else if(fx)map.setView([fx.lat,fx.lng],17);renderMap.fitted=true;renderMap.lastKey=mapOut+mapRange}
  }).catch(()=>{note.hidden=false;note.textContent="The map couldn't load. Check your signal and open this tab again."});
}
/* "Houses I missed": looks up house addresses from OpenStreetMap for the area on screen and
   outlines the ones with no door pin nearby. Only works where OSM has house numbers. */
let gapLayer=null;
async function showGaps(){
  if(!map||!window.L){toast("Open the map with signal first");return}
  if(!navigator.onLine){toast("This needs signal");return}
  if(map.getZoom()<16){toast("Zoom in on one street first");return}
  const b=map.getBounds();const bbox=[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()].map(x=>x.toFixed(6)).join(",");
  const q=`[out:json][timeout:20];(node["addr:housenumber"](${bbox});way["addr:housenumber"](${bbox}););out center 600;`;
  toast("Looking up houses…");
  try{
    const r=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"data="+encodeURIComponent(q)});
    if(!r.ok)throw new Error(r.status);
    const d=await r.json();
    const pins=Object.values(S.pins).filter(p=>p.lat!=null);
    const houses=(d.elements||[]).map(e=>{const t=e.tags||{};return{lat:e.lat!=null?e.lat:e.center&&e.center.lat,lng:e.lon!=null?e.lon:e.center&&e.center.lon,addr:((t["addr:housenumber"]||"")+" "+(t["addr:street"]||"")).trim()}}).filter(h=>h.lat!=null);
    const missed=houses.filter(h=>!pins.some(p=>distM(h,p)<20));
    if(gapLayer)gapLayer.clearLayers();else gapLayer=L.layerGroup().addTo(map);
    for(const h of missed)L.circleMarker([h.lat,h.lng],{radius:6,color:"#0b3a5b",weight:2,dashArray:"3 3",fillColor:"#ffffff",fillOpacity:.7}).bindPopup(`<div class="pop"><b>${esc(h.addr||"House")}</b><div>No door tap here yet</div></div>`).addTo(gapLayer);
    toast(houses.length?`${missed.length} of ${houses.length} houses on screen not knocked yet`:"The map has no house numbers here. Use the pins instead.");
  }catch(e){toast("Couldn't look up houses right now. Try again later.")}
}
function mapMe(){
  if(!navigator.geolocation){toast("Location isn't available");return}
  navigator.geolocation.getCurrentPosition(p=>{lastFix={lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy||0),t:Date.now()};if(map){map.setView([lastFix.lat,lastFix.lng],18);renderMap()}},()=>toast("Location is off. Turn it on in iPhone Settings → Privacy → Location."),{enableHighAccuracy:true,timeout:15000});
}

/* ================= render + nav ================= */
function render(){
  idleCheck();
  if(tab==="today")renderToday();else if(tab==="knock")renderKnock();else if(tab==="customers")renderCustomers();else if(tab==="money")renderMoney();else if(tab==="map")renderMap();
  updateBadge();
  const n=Object.keys(S.customers).length;const an=(S.settings.appName||"").trim(),bz=(S.settings.business||"").trim();
  const sub=an&&bz.toLowerCase().startsWith(an.toLowerCase())&&bz.length>an.length?bz.slice(an.length).trim():(bz||"Exterior Cleaning");
  $("#hdr-sub").textContent=sub+(n?` · ${n} customer${n===1?"":"s"}`:"");
  $("#live-dot").hidden=!knocking();
}
function show(t){tab=t;["today","knock","map","customers","money"].forEach(x=>$("#v-"+x).hidden=x!==t);document.querySelectorAll("nav button").forEach(b=>b.dataset.tab===t?b.setAttribute("aria-current","page"):b.removeAttribute("aria-current"));$("#main").scrollTop=0;$("#main").style.overflowY=t==="map"?"hidden":"auto";render()}
function route(){
  const h=(location.hash||"").replace("#","");if(!h)return;
  if(["today","knock","map","customers","money"].includes(h))show(h);
  else if(h==="plan"){show("today");planSheet()}
  else if(h==="start"){show("knock")}
  try{history.replaceState(null,"",location.pathname+location.search)}catch(e){}
}

/* ================= events ================= */
document.addEventListener("click",e=>{
  const a=e.target.closest("a[data-log]");if(a){if(a.classList.contains("off")){e.preventDefault();toast("Add a phone number first");return}onContact(a);return}
  const el=e.target.closest("[data-tab],[data-act],[data-tap],[data-done],[data-paid],[data-job],[data-cust],[data-lost],[data-noreview],[data-sess],[data-range],[data-f],[data-close],[data-plan],[data-plandismiss],[data-retry],[data-mapout],[data-maprange],[data-pinout],[data-pindel],[data-pinsold],[data-editsess]");
  if(!el)return;const d=el.dataset;
  if("close" in d){closeSheet();return}
  if(d.tab){closeSheet();show(d.tab);return}
  if(d.tap){flash(el);if(d.tap==="sold")bookSheet({fromTap:true});else if(d.tap==="maybe")leadSheet({fromTap:true});else{tap(d.tap);render();toast(d.tap==="none"?`Door ${sess().doors}${S.settings.saveNoAnswers?" · saved to retry":""}`:"Logged: no",null,true)}try{navigator.vibrate&&navigator.vibrate(12)}catch(x){}return}
  if(d.act==="start")return startKnock();
  if(d.act==="stop")return stopKnock();
  if(d.act==="undo")return undoTap();
  if(d.act==="scripts")return scriptsSheet(false);
  if(d.act==="retry")return retrySheet();
  if(d.act==="book"){closeSheet();return bookSheet({cid:d.cid})}
  if(d.act==="newlead")return leadSheet({});
  if(d.act==="settings")return settingsSheet(d.open);
  if(d.act==="reload"){location.reload();return}
  if(d.act==="map-me")return mapMe();
  if(d.act==="map-gaps")return showGaps();
  if(d.plan)return planSheet(d.plan);
  if(d.plandismiss){S.meta.planDismiss[d.plandismiss]=true;save();render();return}
  if(d.retry)return onRetry(d.retry,d.pin);
  if(d.done)return doneSheet(d.done);
  if(d.paid)return paidSheet(d.paid);
  if(d.job)return jobSheet(d.job);
  if(d.cust){if(map)map.closePopup();return custSheet(d.cust)}
  if(d.sess)return recapSheet(d.sess);
  if(d.editsess)return sessSheet(d.editsess);
  if(d.pinout){const p=S.pins[d.pin];if(p){p.out=d.pinout;save();renderMap();toast("Pin updated")}return}
  if(d.pindel){delete S.pins[d.pindel];save();if(map)map.closePopup();renderMap();toast("Pin deleted");return}
  if(d.pinsold){const p=S.pins[d.pinsold];if(map)map.closePopup();bookSheet({fromTap:true,address:p&&p.address||"",retryPin:d.pinsold});return}
  if(d.lost){const c=S.customers[d.lost];c.status="lost";c.followUp="";logIt("lost",c.id);save();render();toast("Marked not interested",()=>{c.status="lead";c.followUp=today();save()});return}
  if(d.noreview){S.jobs[d.noreview].noReview=true;save();render();return}
  if(d.range){moneyRange=d.range;renderMoney();return}
  if(d.f){custFilter=d.f;renderCustomers();return}
  if(d.mapout){mapOut=d.mapout;renderMap();return}
  if(d.maprange){mapRange=d.maprange;renderMap();return}
});
$("#sheet").addEventListener("click",e=>{if(e.target.id==="sheet")closeSheet()});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&$("#sheet").hidden)render()});
window.addEventListener("hashchange",route);
window.addEventListener("online",()=>{if(tab==="map")renderMap()});
setInterval(()=>{const stopped=idleCheck();if(stopped&&$("#sheet").hidden){render();return}if(tab==="knock"&&$("#sheet").hidden&&document.activeElement&&document.activeElement.id!=="street")renderKnock()},20000);
setInterval(()=>{if(document.hidden)return;const els=document.querySelectorAll('[data-clock="run"]');if(!els.length)return;const s=S.sessions[today()];if(!s||!openInt(s))return;const t=watch(mins(s)*60e3);els.forEach(e=>{if(e.textContent!==t)e.textContent=t})},1000);
setInterval(()=>{if(knocking()&&S.settings.useLocation)startGeo()},60000);

/* ================= reminders (used by cloud sync for push notifications) ================= */
function inQuiet(ts){
  const N=S.settings.notif,d=new Date(ts),mm=d.getHours()*60+d.getMinutes();
  const tm=t=>{const [h,m]=t.split(":").map(Number);return h*60+m};
  const qf=tm(N.quiet.from),qt=tm(N.quiet.to);
  if(qf>qt?(mm>=qf||mm<qt):(mm>=qf&&mm<qt))return true;
  if(N.school.on&&d.getDay()>=1&&d.getDay()<=5){const sf=tm(N.school.from),st=tm(N.school.to);if(mm>=sf&&mm<st)return true}
  return false;
}
function hashStr(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)}
/* Reminders are worked out here (the phone knows the schedule) and uploaded as one list.
   The cloud function sends whatever is due every 5 minutes, even when the app is closed.
   Items from the last 15 minutes are kept so a sync right before send time can't drop them;
   the function remembers what it already sent, so nothing goes out twice. */
function computeReminders(){
  const N=S.settings.notif,out=[],now=Date.now(),horizon=now+14*864e5,t=today();
  if(!N.enabled)return out;
  const add=(type,key,ts,title,body,url,check)=>{if(!N.types[type]||ts<=now-15*60e3||ts>horizon||inQuiet(ts))return;out.push({id:`${type}-${key}-${Math.round(ts/60e3)}-${hashStr(title+body)}`,type,sendAt:ts,title,body,url:url||"./",check:check||null})};
  // knock sessions
  const gm=goalMath();
  for(const p of allPlanned()){const st=atTime(p.day,p.start);if(st<now-3600e3)continue;
    const s=S.sessions[p.day];const started=s&&(s.intervals||[]).some(i=>i.s>=st-60*60e3);
    if(started||sessionStatus(p)==="done")continue;
    add("knock30",p.id,st-30*60e3,"Knock in 30 minutes",`Your ${fmtTime(p.start)} session is coming up. Grab water and charge your phone.`,"./#knock");
    add("knockStart",p.id,st,"Time to knock",`Your session starts now. ${gm.remaining>0?"About "+gm.doors+" doors gets you to this week's goal.":"Goal's covered, so every sale is extra."}`,"./#knock");
    add("lateStart",p.id,st+20*60e3,"You haven't started yet",`Your session started at ${fmtTime(p.start)}. First 5 doors, go.`,"./#knock",{kind:"lateStart",date:p.day,after:st-60*60e3});}
  // confirm tomorrow's jobs + follow-ups + plan + thin, day by day
  for(let i=0;i<14;i++){
    const day=addDays(t,i),nextDay=addDays(day,1);
    const jobsTomorrow=Object.values(S.jobs).filter(j=>j.status==="scheduled"&&j.date===nextDay&&S.customers[j.cid]&&!lastLog(j.cid,"confirm",j.id));
    if(jobsTomorrow.length)add("confirm",nextDay,atTime(day,N.times.confirm),`Confirm tomorrow's job${jobsTomorrow.length>1?"s":""}`,jobsTomorrow.map(j=>`${first(S.customers[j.cid].name)}${j.time?" "+fmtTime(j.time):""}`).join(", ")+". Tap to send the texts.","./#today");
    const fus=Object.values(S.customers).filter(c=>c.status==="lead"&&c.followUp&&(i===0?c.followUp<=day:c.followUp===day));
    if(fus.length)add("followups",day,atTime(day,N.times.followups),`${fus.length} follow-up${fus.length>1?"s":""} due`,fus.slice(0,3).map(c=>first(c.name)).join(", ")+(fus.length>3?" and more":"")+". A quick text keeps them warm.","./#today");
    const dw=toDate(day).getDay();
    if(dw===0){const nws=day;if(!planSessions(nws).length)add("plan",nws,atTime(day,N.times.plan),"Plan your week","Pick 2–3 knock sessions for this week. Takes 30 seconds.","./#plan")}
    if(dw===3){const nws=addDays(weekStart(day),7),nwe=addDays(nws,6);const n=Object.values(S.jobs).filter(j=>j.status==="scheduled"&&j.date>=nws&&j.date<=nwe).length;
      if(n<(S.settings.thinJobs||0))add("thin",nws,atTime(day,N.times.thin),"Next week's calendar is thin",`${n} job${n===1?"":"s"} booked so far. One session fills it.`,"./#knock")}
  }
  // streak at risk: night before the last planned session of each week
  const sk=streaks();
  if(sk.week>0||sk.sess>0){const byWeek={};for(const p of allPlanned())if(p.day>=t)byWeek[p.ws]=p;
    for(const p of Object.values(byWeek))add("streak",p.id,atTime(addDays(p.day,-1),N.times.streak),"Keep your streak alive",`Tomorrow's ${fmtTime(p.start)} session keeps your ${sk.week>0?sk.week+"-week":sk.sess+"-session"} streak going.`,"./#knock")}
  // collect payment: day after an unpaid job
  for(const j of Object.values(S.jobs))if(j.status==="done"&&!j.paid&&S.customers[j.cid])add("collect",j.id,atTime(addDays(j.date,1),N.times.collect),`Collect ${money(j.price)}`,`${first(S.customers[j.cid].name)} hasn't paid yet. Tap to send a payment text.`,"./#today");
  return out;
}

/* ================= sync bridge (used by cloud.js) ================= */
function stable(o){if(o===null||typeof o!=="object")return JSON.stringify(o);if(Array.isArray(o))return"["+o.map(stable).join(",")+"]";return"{"+Object.keys(o).filter(k=>o[k]!==undefined&&k!=="updatedAt").sort().map(k=>JSON.stringify(k)+":"+stable(o[k])).join(",")+"}"}
const COLLS=["customers","jobs","sessions","pins","plans"];
function entities(){
  const out=[];for(const c of COLLS)for(const [id,v] of Object.entries(S[c]))out.push({coll:c,id,obj:v});
  for(const l of S.log)if(l&&l.id)out.push({coll:"log",id:l.id,obj:l});
  out.push({coll:"state",id:"main",obj:{settings:S.settings}});
  return out;
}
function collectDirty(){
  const h=S.meta.sync.h=S.meta.sync.h||{};const now=Date.now();const out=[];const seen=new Set();
  for(const e of entities()){const k=e.coll+"/"+e.id;seen.add(k);const hs=hashStr(stable(e.obj));
    if(h[k]!==hs){if(e.coll==="state"){S.meta.stateUpdatedAt=Math.max(S.meta.stateUpdatedAt||0,now);out.push({coll:"state",id:"main",data:clone({settings:S.settings,updatedAt:S.meta.stateUpdatedAt}),hash:hs,key:k})}
      else{e.obj.updatedAt=now;out.push({coll:e.coll,id:e.id,data:clone(e.obj),hash:hs,key:k})}}}
  for(const k of Object.keys(h))if(!seen.has(k)){const [coll,id]=k.split("/");out.push({coll,id,data:{deleted:true,updatedAt:now},hash:null,key:k,del:true})}
  return out;
}
function markSynced(list){const h=S.meta.sync.h=S.meta.sync.h||{};for(const x of list){if(x.del)delete h[x.key];else h[x.key]=x.hash}try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
/* Conflict rule: a local change that hasn't been uploaded yet always wins (it gets pushed right after).
   Otherwise the newer updatedAt wins. On the very first sync for an account, the newer updatedAt wins
   for everything, and the cloud's settings win if the account already has some. Returns true if local data changed. */
function applyRemote(coll,id,data,first){
  const h=S.meta.sync.h=S.meta.sync.h||{};const k=coll+"/"+id;
  const dirty=obj=>h[k]!==hashStr(stable(obj));
  if(coll==="state"){
    if(!data||!data.settings)return false;
    const cur={settings:S.settings};
    if(!first&&dirty(cur))return false;
    if(!first&&(data.updatedAt||0)<=(S.meta.stateUpdatedAt||0)){h[k]=hashStr(stable(cur));return false}
    S.settings=clone(data.settings);normalize();S.meta.stateUpdatedAt=data.updatedAt||Date.now();h[k]=hashStr(stable({settings:S.settings}));applyBrand();return true;
  }
  let cur=null,idx=-1;
  if(coll==="log"){idx=S.log.findIndex(l=>l.id===id);cur=idx>=0?S.log[idx]:null}
  else if(COLLS.includes(coll))cur=S[coll][id]||null;
  else return false;
  if(!first&&(cur?dirty(cur):(k in h)))return false; // local edit or delete waiting to upload
  if(cur&&(cur.updatedAt||0)>(data.updatedAt||0))return false;
  if(data.deleted){
    delete h[k];if(!cur)return false;
    if(coll==="log")S.log.splice(idx,1);else delete S[coll][id];
    return true;
  }
  const v=clone(data);
  if(cur&&stable(cur)===stable(v)){cur.updatedAt=v.updatedAt;h[k]=hashStr(stable(cur));return false}
  if(coll==="log"){if(idx>=0)S.log[idx]=v;else{S.log.push(v);S.log.sort((a,b)=>a.t-b.t)}}
  else S[coll][id]=v;
  h[k]=hashStr(stable(v));return true;
}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
function setSyncPill(state,text){const p=$("#sync-pill");if(!p)return;if(!state){p.hidden=true;return}p.hidden=false;p.className="pill "+(state==="ok"?"":state==="off"?"off":"err");p.innerHTML=`<i></i>${esc(text)}`}

window.App={version:VERSION,get state(){return S},save,render,toast,persist,collectDirty,markSynced,applyRemote,computeReminders,setSyncPill,
  onChange:fn=>listeners.push(fn),openSettings:o=>settingsSheet(o),closeSheet,normalize,checkRecords:()=>checkRecords(true),esc};

/* ================= boot ================= */
load();applyBrand();checkRecords(true);
if(knocking())startGeo();
render();route();
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    const had=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").catch(()=>{});
    navigator.serviceWorker.addEventListener("controllerchange",()=>{if(had){window.__updateReady=true;if(tab==="today")renderToday()}});
    navigator.serviceWorker.addEventListener("message",ev=>{if(ev.data&&ev.data.type==="nav"&&ev.data.hash){location.hash=ev.data.hash}});
  });
  // Home-screen apps can stay open for days, so check for a new version whenever the app comes back.
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)navigator.serviceWorker.getRegistration().then(r=>r&&r.update()).catch(()=>{})});
}
})();

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TenantPage } from "@/components/layout/tenant-page";
import { api } from "@/lib/api";
import {
  fetchOperationsFloor,
  finishOperationsSession,
  startOperationsSession,
  type OperationsFloorView,
} from "@/lib/operations-offline-client";
import {
  createVenueOrder,
  fetchOrderingCatalog,
  type OrderingCatalog,
} from "@/lib/ordering-offline-client";

const TABS = ["Floor", "Visits", "Reservations", "Orders", "Activity"] as const;
type Tab = (typeof TABS)[number];
type Activity = { id:string; resourceId:string; fromState?:string|null; toState:string; reason?:string|null; createdAt:string };

export default function OperationsPage() {
  const [tab,setTab]=useState<Tab>("Floor");
  const [floor,setFloor]=useState<OperationsFloorView>({generatedAt:new Date().toISOString(),resources:[]});
  const [activity,setActivity]=useState<Activity[]>([]);
  const [catalog,setCatalog]=useState<OrderingCatalog|null>(null);
  const [selectedItemId,setSelectedItemId]=useState("");
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [groupSelection,setGroupSelection]=useState<string[]>([]);

  const refresh=useCallback(async()=>{
    try{
      const nextFloor=await fetchOperationsFloor();
      setFloor(nextFloor);
      if(typeof navigator==="undefined"||navigator.onLine){
        try{setActivity(await api<Activity[]>("/operations/activity"));}catch{/* floor remains usable */}
      }
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Could not load Operations.");}
  },[]);

  useEffect(()=>{
    void refresh();
    void fetchOrderingCatalog().then(next=>{setCatalog(next);setSelectedItemId(current=>current||next.items[0]?.id||"");}).catch(()=>undefined);
    const timer=window.setInterval(()=>void refresh(),5000);
    return()=>window.clearInterval(timer);
  },[refresh]);

  const available=useMemo(()=>floor.resources.filter(r=>r.state==="AVAILABLE"),[floor.resources]);
  const simpleItems=useMemo(()=>{
    if(!catalog)return [];
    const requiredGroupIds=new Set(catalog.groups.filter(group=>group.required||group.minSelect>0).map(group=>group.id));
    const blockedItemIds=new Set(catalog.links.filter(link=>requiredGroupIds.has(link.modifierGroupId)).map(link=>link.menuItemId));
    return catalog.items.filter(item=>!blockedItemIds.has(item.id));
  },[catalog]);
  useEffect(()=>{if(simpleItems.length&&!simpleItems.some(item=>item.id===selectedItemId))setSelectedItemId(simpleItems[0].id);},[simpleItems,selectedItemId]);

  const sectionAvailability=useMemo(()=>{const groups=new Map<string,{name:string;available:number;total:number}>();for(const r of floor.resources){const key=r.sectionName??"Unsectioned";const row=groups.get(key)??{name:key,available:0,total:0};row.total+=1;if(r.state==="AVAILABLE")row.available+=1;groups.set(key,row);}return [...groups.values()];},[floor.resources]);

  async function command(key:string,path:string,body?:unknown,method="POST"){
    if(typeof navigator!=="undefined"&&!navigator.onLine){setError("This action is online-only in Offline Lite. Start/end sessions and simple order additions remain available locally.");return;}
    setBusy(key);setError("");try{await api(path,{method,body:body===undefined?undefined:JSON.stringify(body)});await refresh();}catch(e){setError(e instanceof Error?e.message:"Operation failed.");}finally{setBusy(null);}
  }

  async function startSession(resourceId:string){setBusy(resourceId);setError("");try{await startOperationsSession({resourceId});await refresh();}catch(e){setError(e instanceof Error?e.message:"Session start failed.");}finally{setBusy(null);}}
  async function finishSession(resourceId:string,sessionId:string){setBusy(resourceId);setError("");try{await finishOperationsSession(sessionId);await refresh();}catch(e){setError(e instanceof Error?e.message:"Session finish failed.");}finally{setBusy(null);}}
  async function addSimpleOrder(resourceId:string,sessionId:string,guestCheckId?:string|null){
    if(!selectedItemId){setError("No offline-safe simple menu item is available. Items requiring modifiers must be entered while online.");return;}
    setBusy(`order:${resourceId}`);setError("");
    try{
      await createVenueOrder({serviceMode:"PLAY_SESSION",operationsSessionId:sessionId,resourceId,...(guestCheckId?{guestCheckId}:{}),lines:[{menuItemId:selectedItemId,quantity:1}]});
    }catch(e){setError(e instanceof Error?e.message:"Order creation failed.");}finally{setBusy(null);}
  }

  async function startGroup(){if(groupSelection.length<2)return;if(typeof navigator!=="undefined"&&!navigator.onLine){setError("Grouped session creation is online-only in Offline Lite.");return;}setBusy("group");setError("");try{const group=await api<{id:string}>("/operations/session-groups",{method:"POST",body:JSON.stringify({name:`Group ${new Date().toLocaleTimeString()}`})});for(const resourceId of groupSelection)await api("/operations/sessions/start",{method:"POST",body:JSON.stringify({resourceId,groupId:group.id})});setGroupSelection([]);await refresh();}catch(e){setError(e instanceof Error?e.message:"Group start failed. Any sessions already started remain attached to the same group.");}finally{setBusy(null);}}

  return <TenantPage title="Operations" description="Run the live floor, visits, reservations, orders and operational activity from one workspace."><div className="space-y-4"><div className="flex flex-wrap gap-2" role="tablist" aria-label="Operations workspace">{TABS.map(name=><button key={name} onClick={()=>setTab(name)} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${tab===name?"bg-emerald-400 text-zinc-950":"border border-zinc-700 bg-zinc-900 text-zinc-200"}`}>{name}</button>)}</div>{error?<div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>:null}{tab==="Floor"?<div className="flex flex-wrap items-center gap-2">{sectionAvailability.map(s=><span key={s.name} className="rounded-full border border-zinc-700 px-3 py-2 text-xs text-zinc-300">{s.name}: <strong>{s.available}/{s.total}</strong> available</span>)}{groupSelection.length>=2?<button disabled={busy!==null} onClick={()=>void startGroup()} className="min-h-10 rounded-lg bg-violet-400 px-4 text-sm font-semibold text-zinc-950">Start group ({groupSelection.length})</button>:null}</div>:null}{tab==="Orders"?<div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3"><label className="flex flex-wrap items-center gap-2 text-sm text-zinc-300"><span>Quick item</span><select value={selectedItemId} onChange={event=>setSelectedItemId(event.target.value)} className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900 px-3">{simpleItems.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="text-xs text-zinc-500">Items requiring mandatory modifiers remain online-only; replay pricing is server-authoritative.</span></label></div>:null}{(tab==="Floor"||tab==="Visits"||tab==="Orders")?<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{floor.resources.filter(r=>tab!=="Visits"||r.session).map(r=>{const other=available.find(x=>x.id!==r.id);const groupChecked=groupSelection.includes(r.id);return <article key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-zinc-100">{r.name}</h2><p className="text-xs text-zinc-500">{r.categoryName??r.type}{r.sectionName?` · ${r.sectionName}`:""}</p></div><span className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-300">{r.state}</span></div>{r.session?<div className="mt-3 rounded-lg bg-zinc-900 p-3 text-sm"><div className="flex justify-between"><span>{r.session.status}</span><strong>{(r.session.liveAccruedMinor/100).toFixed(2)} {r.session.currency}</strong></div><p className="mt-1 text-xs text-zinc-500">Started {new Date(r.session.startedAt).toLocaleTimeString()}</p>{r.session.guestCheckId?<p className="mt-1 text-xs text-zinc-400">Check {r.session.guestCheckId.slice(-6)}</p>:null}</div>:null}{r.nextReservation?<p className="mt-3 text-xs text-amber-200">Next reservation: {new Date(r.nextReservation.startsAt).toLocaleTimeString()}</p>:null}{r.maintenance?<p className="mt-3 text-xs text-orange-200">Maintenance: {r.maintenance.reason}</p>:null}{tab==="Floor"&&!r.session&&r.state==="AVAILABLE"?<label className="mt-3 flex min-h-10 items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={groupChecked} onChange={e=>setGroupSelection(ids=>e.target.checked?[...ids,r.id]:ids.filter(id=>id!==r.id))}/> Select for grouped session</label>:null}<div className="mt-4 grid grid-cols-2 gap-2">{!r.session&&r.state==="AVAILABLE"?<button disabled={busy!==null} onClick={()=>void startSession(r.id)} className="min-h-11 rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-zinc-950">Start</button>:null}{r.session?.status==="ACTIVE"?<button disabled={busy!==null} onClick={()=>void command(r.id,`/operations/sessions/${r.session!.id}/pause`,{reason:"OPERATOR"})} className="min-h-11 rounded-lg bg-amber-400 px-3 text-sm font-semibold text-zinc-950">Pause</button>:null}{r.session?.status==="PAUSED"?<button disabled={busy!==null} onClick={()=>void command(r.id,`/operations/sessions/${r.session!.id}/resume`)} className="min-h-11 rounded-lg bg-sky-400 px-3 text-sm font-semibold text-zinc-950">Resume</button>:null}{r.session&&other?<button disabled={busy!==null} onClick={()=>void command(r.id,`/operations/sessions/${r.session!.id}/move`,{resourceId:other.id})} className="min-h-11 rounded-lg border border-zinc-600 px-3 text-sm font-semibold text-zinc-100">Move → {other.name}</button>:null}{r.session?<button disabled={busy!==null} onClick={()=>void finishSession(r.id,r.session!.id)} className="min-h-11 rounded-lg border border-red-500/50 px-3 text-sm font-semibold text-red-200">Finish</button>:null}{tab==="Orders"&&r.session?<button disabled={busy!==null||!selectedItemId} onClick={()=>void addSimpleOrder(r.id,r.session!.id,r.session!.guestCheckId)} className="min-h-11 rounded-lg bg-fuchsia-400 px-3 text-sm font-semibold text-zinc-950">Add item</button>:null}{!r.session&&!r.maintenance&&r.state==="AVAILABLE"?<button disabled={busy!==null} onClick={()=>void command(r.id,"/operations/maintenance",{resourceId:r.id,reason:"Operator maintenance"})} className="min-h-11 rounded-lg border border-orange-500/50 px-3 text-sm text-orange-200">Maintenance</button>:null}{r.maintenance?<button disabled={busy!==null} onClick={()=>void command(r.id,`/operations/maintenance/${r.maintenance!.id}`,undefined,"DELETE")} className="min-h-11 rounded-lg border border-emerald-500/50 px-3 text-sm text-emerald-200">Return to service</button>:null}</div></article>;})}</div>:null}{tab==="Reservations"?<div className="space-y-2">{floor.resources.filter(r=>r.nextReservation).map(r=><div key={r.id} className="rounded-lg border border-zinc-800 p-3 text-sm"><strong>{r.name}</strong><span className="ml-3 text-zinc-400">{new Date(r.nextReservation!.startsAt).toLocaleString()} – {new Date(r.nextReservation!.endsAt).toLocaleTimeString()}</span></div>)}</div>:null}{tab==="Activity"?<div className="space-y-2">{activity.map(event=><div key={event.id} className="rounded-lg border border-zinc-800 p-3 text-sm text-zinc-300"><span className="font-medium">{event.fromState??"—"} → {event.toState}</span><span className="ml-2 text-zinc-500">{event.reason??""} · {new Date(event.createdAt).toLocaleString()}</span></div>)}</div>:null}</div></TenantPage>;
}

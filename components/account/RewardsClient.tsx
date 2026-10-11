"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCustomerAuth } from './CustomerAuthProvider';
import { rewardDescription, rewardTerms, type NewsletterReward } from '@/lib/newsletter-offer';
import { getUserErrorMessage } from '@/lib/api-errors';
import { LoadingState } from '@/components/LoadingState';
type Preferences={status:string|null;confirmedAt:string|null;reward:NewsletterReward|null};
export function RewardsClient(){
 const {apiFetch,user}=useCustomerAuth(); const [data,setData]=useState<Preferences|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const generation=useRef(0);
 const load=useCallback(async()=>{const current=++generation.current;setError('');try{const result=await apiFetch<Preferences>('/newsletter/me');if(current===generation.current)setData(result);}catch(e){if(current===generation.current)setError(getUserErrorMessage(e,'newsletter'));}},[apiFetch]);
 useEffect(()=>{setData(null);void load();return()=>{generation.current++;};},[load,user?.id]);
 async function preference(action:'subscribe'|'unsubscribe'){if(busy)return;setBusy(true);setError('');setNotice('');const current=generation.current;try{await apiFetch(`/newsletter/me/${action}`,{method:'POST',body:'{}'});if(current!==generation.current)return;setNotice(action==='subscribe'?'Request received. Check your inbox to confirm your subscription.':'You are unsubscribed. Any earned reward keeps its original terms.');await load();}catch(e){if(current===generation.current)setError(getUserErrorMessage(e,'newsletter'));}finally{setBusy(false);}}
 const reward=data?.reward;
 const rewardState=reward?(Number(reward.usageCount||0)>=(reward.usageLimit||reward.offer?.usageLimit||1)?'Used':Date.parse(reward.expiresAt)<=Date.now()?'Expired':reward.active===false?'Disabled':'Available'):null;
 async function copy(){if(!data?.reward)return;try{await navigator.clipboard.writeText(data.reward.code);setNotice('Code copied.');}catch{setNotice('Select the code and copy it manually.');}}
 return <div className="account-commerce"><h1>Rewards & newsletter</h1><p>Your private rewards and email preferences for {user?.email}.</p>{error?<p role="alert" className="balmoral-orders__error">{error} <button type="button" onClick={()=>void load()}>Try again</button></p>:null}{notice?<p role="status">{notice}</p>:null}{!data?(!error?<LoadingState message="Loading rewards…"/>:null):<>
  <section className="account-commerce__card"><h2>Newsletter preference</h2><p>{data.status==='SUBSCRIBED'?'Subscribed':data.status==='UNSUBSCRIBED'?'Unsubscribed':data.status==='PENDING'?'Pending email confirmation':'Not subscribed'}</p><p>Confirming your email activates your subscription. Repeat signup preserves any previous reward terms.</p>{data.status==='SUBSCRIBED'||data.status==='PENDING'?<button type="button" disabled={busy} onClick={()=>void preference('unsubscribe')}>Unsubscribe</button>:<button type="button" disabled={busy} onClick={()=>void preference('subscribe')}>Subscribe</button>}</section>
  <section className="account-commerce__card"><h2>Your welcome reward</h2>{data.reward?<><p className="account-commerce__reward-state">{rewardState}</p><strong className="newsletter-reward__code">{data.reward.code}</strong><p>{rewardDescription(data.reward)}</p><p>{rewardTerms(data.reward)}</p><p>Expires {new Date(data.reward.expiresAt).toLocaleDateString()}.</p><button type="button" disabled={rewardState!=='Available'} onClick={()=>void copy()}>Copy code</button><Link href="/shop">Explore the collection</Link></>:<p>No available welcome reward. Used or expired rewards are not renewed.</p>}</section>
 </>}</div>;
}

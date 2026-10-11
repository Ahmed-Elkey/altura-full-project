"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAdminAuth } from './AdminAuthProvider';
import { PromotionEligibility } from './PromotionEligibility';
import { CommerceApiError } from '@/lib/commerce-api';
import { getUserErrorMessage } from '@/lib/api-errors';
import type { OfferConfig, OfferPresentation } from '@/lib/newsletter-offer';
type Preview = {subject:string;html:string;text:string;headline:string;description:string;terms:string};
export function NewsletterOfferEditor() {
 const {apiFetch}=useAdminAuth(); const [offer,setOffer]=useState<OfferPresentation|null>(null); const [draft,setDraft]=useState<OfferConfig|null>(null); const [preview,setPreview]=useState<Preview|null>(null); const [error,setError]=useState(''); const [success,setSuccess]=useState(''); const [busy,setBusy]=useState(false); const [conflict,setConflict]=useState(false); const version=useRef(0);
 const load=useCallback(async()=>{const current=++version.current;setBusy(true);setError('');try{const result=await apiFetch<OfferPresentation>('/admin/newsletter/offer');if(current===version.current){setOffer(result);setDraft(result.config);setPreview(null);setConflict(false);}}catch(e){if(current===version.current)setError(getUserErrorMessage(e,'admin'));}finally{if(current===version.current)setBusy(false);}},[apiFetch]);
 useEffect(()=>{void load();return()=>{version.current++;};},[load]);
 const update=<K extends keyof OfferConfig>(key:K,value:OfferConfig[K])=>{setDraft(old=>old?{...old,[key]:value}:null);setPreview(null);setSuccess('');};
 async function perform(save:boolean){if(!draft||!offer||busy)return;setBusy(true);setError('');setSuccess('');const current=version.current;try{const result=await apiFetch<OfferPresentation&Preview>(`/admin/newsletter/offer${save?'':'/preview'}`,{method:save?'PATCH':'POST',body:JSON.stringify(save?{version:offer.version,config:draft}:{config:draft})});if(current!==version.current)return;if(save){setOffer(result);setDraft(result.config);setConflict(false);setPreview(null);setSuccess('Offer saved. Previously issued rewards keep their original terms.');}else setPreview(result);}catch(e){if(current!==version.current)return;const stale=e instanceof CommerceApiError&&e.status===409;setConflict(stale);setError(stale?'The offer was changed by another administrator. Your draft is preserved. Reload the latest offer before saving again.':getUserErrorMessage(e,'admin'));}finally{if(current===version.current)setBusy(false);}}
 function numeric(key:keyof OfferConfig,label:string,min:number,max?:number,optional=false,step='1'){if(!draft)return null;return <label><span>{label}</span><input type="number" min={min} max={max} step={step} required={!optional} value={draft[key]===null?'':String(draft[key])} onChange={e=>update(key,(e.target.value===''&&optional?null:Number(e.target.value)) as never)} /></label>;}
 return <section className="admin-panel newsletter-offer-editor" aria-label="Newsletter offer settings" aria-busy={busy}>
  <div className="newsletter-offer-editor__heading"><div><h2>Welcome offer</h2><p>Configure future rewards. Issued rewards retain their saved terms.</p></div>{offer?<span>Version {offer.version}</span>:null}</div>
  {error?<p role="alert" className="admin-error">{error} <button type="button" className="admin-row-action" disabled={busy} onClick={()=>void load()}>Reload latest offer</button></p>:null}
  {success?<p role="status" className="admin-success">{success}</p>:null}
  {!draft?<p>Loading offer settings…</p>:<form onSubmit={(e:FormEvent)=>{e.preventDefault();void perform(true);}}>
   <fieldset disabled={busy}><div className="newsletter-offer-editor__fields">
    <label className="admin-check-row"><input type="checkbox" checked={draft.enabled} onChange={e=>update('enabled',e.target.checked)} /><span>Offer enabled</span></label>
    <label><span>Offer type</span><select value={draft.type} onChange={e=>{const type=e.target.value as OfferConfig['type'];setDraft({...draft,type,value:type==='PERCENTAGE'?(draft.value>=1&&draft.value<=100?draft.value:10):type==='FIXED_AMOUNT'?(draft.value>0?draft.value:100):0,maximumDiscount:type==='PERCENTAGE'?draft.maximumDiscount:null,eligibleProductIds:type==='BUY_X_GET_Y'?draft.eligibleProductIds:[],eligibleCategoryIds:type==='BUY_X_GET_Y'?draft.eligibleCategoryIds:[],maxGiftUnits:type==='BUY_X_GET_Y'?draft.maxGiftUnits:null});setPreview(null);setSuccess('');}}><option value="PERCENTAGE">Percentage</option><option value="FIXED_AMOUNT">Fixed amount</option><option value="FREE_SHIPPING">Free shipping</option><option value="BUY_X_GET_Y">Buy X / get Y</option><option value="NONE">No incentive</option></select></label>
    {['PERCENTAGE','FIXED_AMOUNT'].includes(draft.type)?numeric('value',draft.type==='PERCENTAGE'?'Percentage':'Amount',draft.type==='PERCENTAGE'?1:0.01,draft.type==='PERCENTAGE'?100:undefined,false,'0.01'):null}
    {draft.type!=='NONE'?<><label><span>Currency</span><input required minLength={3} maxLength={3} value={draft.currency} onChange={e=>update('currency',e.target.value.toUpperCase())} /></label>{numeric('validityDays','Validity days',1,365)}{numeric('usageLimit','Uses per subscriber',1,100)}{numeric('minimumSubtotal','Minimum subtotal',0,undefined,true,'0.01')}</>:null}
    {draft.type==='PERCENTAGE'?numeric('maximumDiscount','Maximum discount',0.01,undefined,true,'0.01'):null}
    {draft.type==='BUY_X_GET_Y'?<>{numeric('buyQuantity','Paid units',1,100)}{numeric('giftQuantity','Free units',1,100)}{numeric('maxGiftUnits','Maximum free units',1,10000,true)}<PromotionEligibility products={draft.eligibleProductIds} categories={draft.eligibleCategoryIds} onChange={(key,value)=>update(key,value)}/></>:null}
    <label><span>Campaign title</span><input required maxLength={120} value={draft.title} onChange={e=>update('title',e.target.value)} /></label><label><span>Welcome text</span><textarea required maxLength={500} value={draft.welcomeText} onChange={e=>update('welcomeText',e.target.value)} /></label>
   </div></fieldset>
   <div className="admin-action-row"><button type="button" className="admin-secondary-button" disabled={busy} onClick={()=>void perform(false)}>Preview offer</button><button className="admin-primary-button" type="submit" disabled={busy||conflict}>{busy?'Please wait…':'Save offer'}</button></div>
  </form>}
  {preview?<div className="newsletter-offer-editor__preview"><h3>Signup and confirmation preview</h3><strong>{preview.headline}</strong><p>{preview.description}</p><p>{preview.terms}</p><h3>{preview.subject}</h3><iframe title="Welcome email preview" sandbox="" srcDoc={preview.html} /><details><summary>Plain text email</summary><pre>{preview.text}</pre></details></div>:null}
 </section>;
}

"use client";
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCustomerAuth } from './CustomerAuthProvider';
import { getUserErrorMessage } from '@/lib/api-errors';
import { formatMoney } from '@/lib/money';
import { LoadingState } from '@/components/LoadingState';
import { CommerceApiError } from '@/lib/commerce-api';
type ReturnRecord={id:string;status:string;reason:string;notes:string|null;refundAmount:number|null;createdAt:string;updatedAt:string;order:{orderNumber:string;currency:string};items:{id:string;quantity:number;productName:string;colorName:string|null;size:string;reason?:string|null;condition?:string|null}[]};
const date=(value:string)=>new Date(value).toLocaleDateString();
const status=(value:string)=>value.replaceAll('_',' ').toLowerCase().replace(/^./,x=>x.toUpperCase());
export function ReturnsClient({returnId}:{returnId?:string}){
 const {apiFetch,user}=useCustomerAuth();const [records,setRecords]=useState<ReturnRecord[]|null>(null);const [error,setError]=useState('');const generation=useRef(0);
 const load=useCallback(async()=>{const current=++generation.current;setError('');try{const result=await apiFetch<ReturnRecord[]|ReturnRecord>(returnId?`/returns/${encodeURIComponent(returnId)}`:'/returns');if(current===generation.current)setRecords(Array.isArray(result)?result:[result]);}catch(e){if(current===generation.current){setRecords(null);setError(e instanceof CommerceApiError&&e.status===404?'This return request is unavailable.':getUserErrorMessage(e,'orders'));}}},[apiFetch,returnId]);
 useEffect(()=>{setRecords(null);void load();return()=>{generation.current++;};},[load,user?.id]);
 return <div className="account-commerce"><h1>{returnId?'Return details':'Your returns'}</h1><p>Track your return requests and refund status.</p>{returnId?<Link href="/account/returns">Back to returns</Link>:<Link href="/account/orders">View orders to request a return</Link>}{error?<p role="alert" className="balmoral-orders__error">{error} <button type="button" onClick={()=>void load()}>Try again</button></p>:!records?<LoadingState message="Loading returns…"/>:!records.length?<p role="status">No return requests yet.</p>:records.map(record=><section className="account-commerce__card" key={record.id}>
 <div className="account-commerce__row"><Link href={`/account/orders/${encodeURIComponent(record.order.orderNumber)}`}>{record.order.orderNumber}</Link><strong>{status(record.status)}</strong></div><p>Requested {date(record.createdAt)} · Updated {date(record.updatedAt)}</p><p>Reason: {record.reason}</p>{record.refundAmount!==null?<p>Refund: {formatMoney(record.refundAmount,record.order.currency)}</p>:<p>Refund not yet determined.</p>}
 {returnId?<><ul className="account-commerce__items">{record.items.map(item=><li key={item.id}><strong>{item.productName}</strong><span>{item.colorName} · {item.size} · Quantity {item.quantity}</span>{item.reason?<span>{item.reason}</span>:null}{item.condition?<span>Condition: {item.condition}</span>:null}</li>)}</ul>{record.notes?<p>{record.notes}</p>:null}</>:<><p>{record.items.reduce((total,item)=>total+item.quantity,0)} items</p><Link href={`/account/returns/${encodeURIComponent(record.id)}`}>View return</Link></>}
 </section>)}</div>;
}

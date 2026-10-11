import { AccountShell } from '@/components/account/AccountShell';
import { ReturnsClient } from '@/components/account/ReturnsClient';
export default async function ReturnPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AccountShell><ReturnsClient returnId={id}/></AccountShell>;}

const MAP_BROWSER_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyBwx24l0UncHBcYwOkMEhHhaH5njd5crKw';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import BrandLoader from '@/components/ui/BrandLoader';
import { Order } from '@/types';
let mapsPromise: Promise<void> | undefined;
function loadMap(){
  if(window.google?.maps)return Promise.resolve();
  if(!mapsPromise)mapsPromise=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://maps.googleapis.com/maps/api/js?key='+MAP_BROWSER_KEY+'&language=ar&region=EG';
    script.async=true;script.onload=()=>resolve();script.onerror=()=>{mapsPromise=undefined;reject(new Error('map'));};document.head.appendChild(script);
  });
  return mapsPromise;
}
const point=(lat:unknown,lng:unknown)=>lat!==null && lng!==null && lat!==undefined && lng!==undefined && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat))<=90 && Math.abs(Number(lng))<=180 ? {lat:Number(lat),lng:Number(lng)} : null;
export default function OrderLocationMap({order}:{order:Order}){
  const element=useRef<HTMLDivElement>(null);
  const [failed,setFailed]=useState(false);
  const query=useQuery({queryKey:['order-location',order.id,order.shipping_address],queryFn:async()=>{
    const {data,error}=await supabase.from('online_orders').select('*').eq('id',order.id).single();if(error)throw error;
    const snapshot=(data as unknown as {shipping_snapshot?:{latitude?:number;longitude?:number}}).shipping_snapshot;
    const saved=point(snapshot?.latitude,snapshot?.longitude);if(saved)return {...saved,current:false};
    if(!order.customer_id || !order.shipping_address)return null;
    const customer=await supabase.from('customers').select('user_id').eq('id',order.customer_id).single();if(customer.error)throw customer.error;
    if(!customer.data.user_id)return null;
    const addresses=await supabase.from('customer_addresses').select('latitude,longitude').eq('user_id',customer.data.user_id).eq('address',order.shipping_address).limit(2);if(addresses.error)throw addresses.error;
    if(addresses.data.length!==1)return null;
    const current=point(addresses.data[0].latitude,addresses.data[0].longitude);return current ? {...current,current:true} : null;
  }});
  useEffect(()=>{
    let active=true;setFailed(false);let marker:any;
    if(!query.data)return;
    const timer=setTimeout(()=>{if(active)setFailed(true);},15000);
    loadMap().then(()=>{if(!active || !element.current)return;clearTimeout(timer);const center={lat:query.data!.lat,lng:query.data!.lng};const map=new window.google.maps.Map(element.current,{center,zoom:16,gestureHandling:'cooperative',mapTypeControl:false,streetViewControl:false});marker=new window.google.maps.Marker({position:center,map,title:'موقع توصيل العميل'});}).catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;clearTimeout(timer);marker?.setMap(null);};
  },[query.data]);
  return <section className="space-y-3 rounded-2xl border bg-white p-4" dir="rtl"><h3 className="font-semibold">موقع التوصيل على الخريطة</h3>
    {query.isPending ? <BrandLoader/> : query.error ? <p role="alert">تعذّر تحميل موقع العميل. راجع العنوان المكتوب.</p> : query.data ? <>
      {query.data.current && <p className="text-sm text-muted-foreground">الموقع من عنوان العميل المحفوظ حاليًا والمطابق لعنوان الطلب؛ لم تُحفظ إحداثيات وقت الطلب.</p>}
      <div ref={element} className="h-64 w-full rounded-xl" aria-label="خريطة موقع توصيل العميل"/>
      {failed && <p role="alert">تعذّر عرض الخريطة هنا. استخدم زر الاتجاهات لفتح الموقع.</p>}
      <a className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-primary-foreground" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${query.data.lat},${query.data.lng}`}>فتح الاتجاهات</a>
    </> : <p className="text-sm text-muted-foreground">مفيش موقع مؤكد محفوظ للعنوان ده. تواصل مع العميل لتأكيد مكان التوصيل.</p>}
  </section>;
}

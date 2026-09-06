import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranchStore } from '@/stores/branchStore';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
export default function OrderNotifications(){
  const {isAuthenticated}=useAuth();
  const {currentBranchId}=useBranchStore();
  const [enabled,setEnabled]=useState(()=>localStorage.getItem('pos-notifications')==='true');
  const [busy,setBusy]=useState(false);
  const supported=typeof Notification!=='undefined' && 'serviceWorker' in navigator;
  useEffect(()=>{
    if(!isAuthenticated || !enabled || !currentBranchId || !supported || Notification.permission!=='granted')return;
    let active=true;
    const channel=supabase.channel('pos-device-orders-'+currentBranchId).on('postgres_changes',{event:'INSERT',schema:'public',table:'online_orders',filter:`branch_id=eq.${currentBranchId}`},async payload=>{
      try {
        const registration=await navigator.serviceWorker.register('/order-notifications-sw.js');
        const ready=await navigator.serviceWorker.ready;
        if(!active || !registration.active)return;
        await ready.showNotification('طلب جديد في المعداوي',{body:'افتح الطلب لمراجعة التفاصيل.',icon:'/elmadawy-logo.png',tag:'order-'+payload.new.id,data:{orderId:payload.new.id},dir:'rtl'});
      }catch{toast.error('تعذّر عرض إشعار الجهاز. تابع قائمة الطلبات.');}
    }).subscribe();
    return()=>{active=false;void supabase.removeChannel(channel);};
  },[isAuthenticated,enabled,currentBranchId,supported]);
  if(!isAuthenticated)return null;
  const activate=async()=>{
    if(enabled){localStorage.setItem('pos-notifications','false');setEnabled(false);return;}
    if(!supported){toast.info('المتصفح لا يدعم إشعارات الجهاز هنا. جرّب فتح الموقع مباشرة في متصفح يدعمها.');return;}
    setBusy(true);
    try{
      const permission=await Notification.requestPermission();
      if(permission!=='granted'){toast.info('الإشعارات غير مسموحة. تقدر تفعّلها من إعدادات الموقع في المتصفح.');return;}
      await navigator.serviceWorker.register('/order-notifications-sw.js');
      await navigator.serviceWorker.ready;
      localStorage.setItem('pos-notifications','true');setEnabled(true);
      toast.success('تم تفعيل إشعارات الطلبات أثناء فتح التطبيق.');
    }catch{toast.error('تعذّر تفعيل الإشعارات. افتح الموقع في تبويب مستقل وحاول مجددًا.');}
    finally{setBusy(false);}
  };
  return <div dir="rtl" className="flex flex-wrap items-center justify-end gap-3 border-b bg-white px-4 py-2 text-sm"><span className="text-muted-foreground">إشعارات الفرع أثناء فتح التطبيق</span><Button size="sm" variant="outline" onClick={activate} disabled={busy}>{busy?'جاري التفعيل…':enabled?'إيقاف إشعارات الجهاز':'تفعيل إشعارات الطلبات'}</Button></div>;
}

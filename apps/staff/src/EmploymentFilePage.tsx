import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bike,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  Clock3,
  FileText,
  Gauge,
  Headphones,
  IdCard,
  KeyRound,
  Layers3,
  Loader2,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRoundCog,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { StaffBranch, StaffIdentity } from "./services/staffService";
import * as staff from "./services/staffService";

type View = "employment" | "account" | "performance";

const workModeLabels:Record<string,string>={
  onsite:"من مقر العمل",remote:"عن بُعد",hybrid:"هجين",field:"ميداني",
};
const contractLabels:Record<string,string>={
  full_time:"دوام كامل",part_time:"دوام جزئي",temporary:"مؤقت",contractor:"متعاقد",intern:"متدرب",
};
const statusLabels:Record<string,string>={
  active:"نشط",leave:"إجازة",suspended:"موقوف",terminated:"انتهت الخدمة",
};

function localDate(value:Date){
  const y=value.getFullYear();
  const m=String(value.getMonth()+1).padStart(2,"0");
  const d=String(value.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function rangeFor(days:number){
  const to=new Date();
  const from=new Date();
  from.setDate(to.getDate()-(days-1));
  return {from:localDate(from),to:localDate(to)};
}
function pct(value:number|null|undefined){
  return value==null?"—":`${Number(value).toLocaleString("ar-EG",{maximumFractionDigits:1})}%`;
}
function num(value:number|null|undefined){
  return Number(value||0).toLocaleString("ar-EG",{maximumFractionDigits:2});
}
function money(value:number|null|undefined){
  return `${Number(value||0).toLocaleString("ar-EG",{minimumFractionDigits:2,maximumFractionDigits:2})} ج.م`;
}
function duration(value:number|null|undefined){
  return value==null?"—":`${num(value)} د`;
}
function hours(minutes:number|null|undefined){
  return `${(Number(minutes||0)/60).toLocaleString("ar-EG",{maximumFractionDigits:1})} ساعة`;
}
function date(value:string|null|undefined){
  if(!value)return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("ar-EG");
}

function Metric({label,value,icon:Icon}:{label:string;value:string|number;icon?:LucideIcon}){
  return <div className="employment-metric">{Icon&&<Icon size={18}/>}<strong>{value}</strong><span>{label}</span></div>;
}
function DetailRows({rows}:{rows:Array<[string,string|number]>}){
  return <div className="employment-detail-rows">{rows.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}
function Notes({items}:{items?:string[]}){
  if(!items?.length)return null;
  return <div className="employment-notes"><ShieldCheck/><div>{items.map((note)=><p key={note}>{note}</p>)}</div></div>;
}

export default function EmploymentFilePage({identity,branch}:{identity:StaffIdentity;branch:StaffBranch}){
  const navigate=useNavigate();
  const [view,setView]=useState<View>("employment");
  const [days,setDays]=useState(30);
  const [profile,setProfile]=useState<staff.StaffEmploymentProfile|null>(null);
  const [selfService,setSelfService]=useState<staff.StaffSelfServiceSnapshot|null>(null);
  const [performance,setPerformance]=useState<staff.StaffHrPerformance|null>(null);
  const [cashier,setCashier]=useState<staff.StaffCashierPerformance|null>(null);
  const [inventory,setInventory]=useState<staff.StaffInventoryPerformance|null>(null);
  const [delivery,setDelivery]=useState<staff.StaffDeliveryPerformance|null>(null);
  const [online,setOnline]=useState<staff.StaffOnlinePerformance|null>(null);
  const [busy,setBusy]=useState(true);
  const [performanceBusy,setPerformanceBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [pin,setPin]=useState("");
  const [pinConfirm,setPinConfirm]=useState("");
  const [pinBusy,setPinBusy]=useState(false);
  const [pinMessage,setPinMessage]=useState<{type:"ok"|"error";text:string}|null>(null);

  const loadBase=useCallback(async()=>{
    setBusy(true);setError(null);
    try{
      const [nextProfile,nextSelf]=await Promise.all([
        staff.getMyEmploymentProfile(identity.user_id,branch.branch_id),
        staff.getStaffSelfService(branch.branch_id),
      ]);
      setProfile(nextProfile);
      setSelfService(nextSelf);
    }catch(caught){
      setError(caught instanceof Error?caught.message:"تعذر تحميل الملف الوظيفي");
    }finally{setBusy(false);}
  },[branch.branch_id,identity.user_id]);

  const loadPerformance=useCallback(async()=>{
    setPerformanceBusy(true);
    const range=rangeFor(days);
    const results=await Promise.allSettled([
      staff.getMyHrPerformance(identity.user_id,branch.branch_id,range.from,range.to),
      staff.getMyCashierPerformance(identity.user_id,branch.branch_id,range.from,range.to),
      staff.getMyInventoryPerformance(identity.user_id,branch.branch_id,range.from,range.to),
      staff.getMyDeliveryPerformance(identity.user_id,branch.branch_id,range.from,range.to),
      staff.getMyOnlinePerformance(identity.user_id,branch.branch_id,range.from,range.to),
    ]);
    const value=<T,>(index:number)=>results[index].status==="fulfilled"?(results[index] as PromiseFulfilledResult<T>).value:null;
    setPerformance(value<staff.StaffHrPerformance>(0));
    setCashier(value<staff.StaffCashierPerformance>(1));
    setInventory(value<staff.StaffInventoryPerformance>(2));
    setDelivery(value<staff.StaffDeliveryPerformance>(3));
    setOnline(value<staff.StaffOnlinePerformance>(4));
    setPerformanceBusy(false);
  },[branch.branch_id,days,identity.user_id]);

  useEffect(()=>{void loadBase();},[loadBase]);
  useEffect(()=>{if(view==="performance")void loadPerformance();},[view,loadPerformance]);

  const changeSuperAdminPin=async()=>{
    if(!identity.is_super_admin||pinBusy)return;
    if(!/^\d{4,6}$/.test(pin)){setPinMessage({type:"error",text:"PIN الجديد يجب أن يكون من 4 إلى 6 أرقام."});return;}
    if(pin!==pinConfirm){setPinMessage({type:"error",text:"تأكيد PIN غير مطابق."});return;}
    setPinBusy(true);setPinMessage(null);
    try{
      await staff.superAdminSetOwnStaffPin(identity.user_id,pin);
      setPin("");setPinConfirm("");
      setPinMessage({type:"ok",text:"تم تعيين PIN جديد وتحديث PIN نقطة البيع المرتبط بالحساب."});
    }catch(caught){
      setPinMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر تغيير PIN"});
    }finally{setPinBusy(false);}
  };

  const p=profile?.profile;
  const user=profile?.user;
  const primaryBranch=profile?.branches.find((item)=>item.branch_id===p?.primary_branch_id);
  const wallet=selfService?.wallet;
  const specializedCount=useMemo(()=>[
    cashier?.applicable,inventory?.applicable,delivery?.applicable,online?.applicable,
  ].filter(Boolean).length,[cashier,delivery,inventory,online]);

  if(busy&&!profile)return <div className="loading"><Loader2 className="spin"/><span>جاري تحميل الملف الوظيفي…</span></div>;

  return <div className="employment-file-page">
    <div className="employment-file-title">
      <button className="icon-btn" onClick={()=>navigate("/account")} aria-label="رجوع لخدماتي"><ArrowRight/></button>
      <div><h1>الملف الوظيفي</h1><p>نفس بيانات HR الخاصة بك — للعرض والمتابعة من Staff</p></div>
      <button className="icon-btn" onClick={()=>void loadBase()} aria-label="تحديث"><RefreshCw className={busy?"spin":""}/></button>
    </div>
    {error&&<div className="error-box">{error}</div>}

    <section className="employment-hero">
      <div className="employment-avatar">{(user?.name||identity.name).slice(0,1)}</div>
      <div className="employment-hero-copy">
        <div className="employment-name-row"><h2>{user?.name||identity.name}</h2><span className={p?.employment_status==="active"?"active":"inactive"}>{statusLabels[p?.employment_status||"active"]||p?.employment_status||"—"}</span></div>
        <p>{p?.employee_code||"بدون رقم وظيفي"} · {profile?.job_title?.name_ar||branch.role_name_ar}</p>
        <small>{profile?.department?.name_ar||"غير محدد القسم"} · {branch.branch_name}</small>
      </div>
      <IdCard/>
    </section>

    <div className="employment-overview-grid">
      <div><Building2/><strong>{profile?.department?.name_ar||"—"}</strong><span>القسم</span></div>
      <div><BriefcaseBusiness/><strong>{profile?.job_title?.name_ar||"—"}</strong><span>المسمى الوظيفي</span></div>
      <div><UserRoundCog/><strong>{profile?.manager?.name||"غير محدد"}</strong><span>المدير المباشر</span></div>
      <div><BadgeCheck/><strong>{workModeLabels[p?.work_mode||""]||p?.work_mode||"—"}</strong><span>نمط العمل</span></div>
    </div>

    <div className="employment-tabs">
      <button className={view==="employment"?"active":""} onClick={()=>setView("employment")}><BriefcaseBusiness/>البيانات الوظيفية</button>
      <button className={view==="account"?"active":""} onClick={()=>setView("account")}><Store/>الحساب والفروع</button>
      <button className={view==="performance"?"active":""} onClick={()=>setView("performance")}><Gauge/>الأداء والحضور</button>
    </div>

    {view==="employment"&&<div className="employment-stack">
      <section className="employment-section">
        <div className="employment-section-title"><BriefcaseBusiness/><div><h3>البيانات الوظيفية</h3><p>المسمى الوظيفي منفصل عن صلاحيات النظام.</p></div></div>
        <div className="employment-facts">
          <div><span>الرقم الوظيفي</span><strong>{p?.employee_code||"—"}</strong></div>
          <div><span>القسم</span><strong>{profile?.department?.name_ar||"—"}</strong></div>
          <div><span>الفريق</span><strong>{profile?.team?.name_ar||"—"}</strong></div>
          <div><span>المسمى الوظيفي</span><strong>{profile?.job_title?.name_ar||"—"}</strong>{profile?.job_title?.grade&&<small>Grade {profile.job_title.grade}</small>}</div>
          <div><span>المدير المباشر</span><strong>{profile?.manager?.name||"—"}</strong></div>
          <div><span>نمط العمل</span><strong>{workModeLabels[p?.work_mode||""]||p?.work_mode||"—"}</strong></div>
          <div><span>نوع التعاقد</span><strong>{contractLabels[p?.contract_type||""]||p?.contract_type||"—"}</strong></div>
          <div><span>الحالة الوظيفية</span><strong>{statusLabels[p?.employment_status||""]||p?.employment_status||"—"}</strong></div>
          <div><span>تاريخ التعيين</span><strong>{date(p?.hire_date)}</strong></div>
          <div><span>تاريخ انتهاء الخدمة</span><strong>{date(p?.termination_date)}</strong></div>
        </div>
        <div className="employment-hr-note"><FileText/><div><strong>ملاحظات HR</strong><p>{p?.notes?.trim()||"لا توجد ملاحظات مسجلة في الملف."}</p></div></div>
      </section>

      <section className="employment-section">
        <div className="employment-section-title"><WalletCards/><div><h3>الراتب وبطاقة الموظف</h3><p>Wallet + السلف والمزايا طبقات مالية مستقلة وقابلة للمراجعة.</p></div></div>
        <div className="employment-finance-grid">
          <Metric icon={WalletCards} label="رصيد المزايا" value={money(wallet?.benefit_balance)}/>
          <Metric icon={WalletCards} label="البدل الشهري" value={money(wallet?.benefit_monthly_allowance)}/>
          <Metric icon={Banknote} label="الحد الائتماني" value={money(wallet?.credit_limit)}/>
          <Metric icon={Banknote} label="المتاح من الائتمان" value={money(wallet?.credit_available)}/>
          <Metric icon={Banknote} label="المستحق للشركة" value={money(wallet?.receivable_balance)}/>
          <Metric icon={Banknote} label="سلف متبقية" value={money(selfService?.advance_summary?.outstanding_amount)}/>
          <Metric icon={Banknote} label="عدد السلف النشطة" value={num(selfService?.advance_summary?.active_count)}/>
          <Metric icon={CalendarCheck2} label="إجازة معتمدة هذا العام" value={num(selfService?.leave_summary?.approved_days_ytd)}/>
        </div>
        <div className="employment-finance-policy"><ShieldCheck/><span>{wallet?.payroll_deduction_enabled?"الحساب مؤهل للتسوية عبر الراتب بعد الاعتماد.":"خصم الراتب غير مفعّل لهذا الحساب."}</span></div>
        <div className="employment-card-code">
          <IdCard/>
          <div><span>رقم عضوية الموظف</span><strong dir="ltr">{selfService?.employee_card?.membership_number||"—"}</strong><small>الباركود: {selfService?.employee_card?.barcode||"—"}</small></div>
        </div>
      </section>
    </div>}

    {view==="account"&&<div className="employment-stack">
      <section className="employment-section">
        <div className="employment-section-title"><IdCard/><div><h3>الحساب</h3><p>بيانات الدخول الأساسية المرتبطة بحسابك.</p></div></div>
        <div className="employment-facts">
          <div><span>اسم المستخدم</span><strong dir="ltr">{user?.username||"—"}</strong></div>
          <div><span>Role النظام</span><strong>{user?.role||"—"}</strong></div>
          <div><span>الهاتف</span><strong dir="ltr">{user?.phone||"—"}</strong></div>
          <div><span>البريد</span><strong dir="ltr">{user?.email||"—"}</strong></div>
          <div><span>حالة الحساب</span><strong>{user?.active?"نشط":"غير نشط"}</strong></div>
          <div><span>إنشاء الحساب</span><strong>{user?.created_at?new Date(user.created_at).toLocaleDateString("ar-EG"):"—"}</strong></div>
        </div>
      </section>

      {identity.is_super_admin&&<section className="employment-section">
        <div className="employment-section-title"><KeyRound/><div><h3>أمان الحساب</h3><p>مدير النظام يقدر يضع PIN جديد لحسابه بدون معرفة الرمز القديم. العملية مسجلة في سجل التدقيق.</p></div></div>
        {pinMessage&&<div className={pinMessage.type==="ok"?"success-box":"error-box"}>{pinMessage.text}</div>}
        <div className="employment-pin-grid">
          <label>PIN الجديد<input type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={pin} onChange={(e)=>setPin(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="••••"/></label>
          <label>تأكيد PIN<input type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={pinConfirm} onChange={(e)=>setPinConfirm(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="••••"/></label>
        </div>
        <button className="primary full-action" disabled={pinBusy||!pin||!pinConfirm} onClick={()=>void changeSuperAdminPin()}>{pinBusy?<Loader2 className="spin"/>:<KeyRound/>}تعيين PIN جديد</button>
      </section>}

      <section className="employment-section">
        <div className="employment-section-title"><Store/><div><h3>الفروع المسموحة</h3><p>الفرع الوظيفي الأساسي لا يلغي صلاحيات الوصول للفروع الأخرى.</p></div></div>
        <div className="employment-branch-list">{(profile?.branches||[]).map((item)=><div key={item.branch_id}>
          <div><strong>{item.branch_name}</strong><span>{item.role}</span></div>
          <div className="employment-branch-badges">{item.is_primary&&<b>أساسي</b>}{!item.active&&<b className="muted">غير نشط</b>}</div>
        </div>)}
        {!profile?.branches.length&&<p className="employment-empty">لا توجد فروع مرتبطة.</p>}</div>
        <div className="employment-primary-branch"><span>الفرع الوظيفي الأساسي</span><strong>{primaryBranch?.branch_name||"غير محدد"}</strong></div>
      </section>
    </div>}

    {view==="performance"&&<div className="employment-stack">
      <section className="employment-performance-toolbar">
        <div><Gauge/><div><strong>الأداء والالتزام</strong><span>مؤشرات تشغيلية قابلة للتفسير، بدون Productivity Score غامض.</span></div></div>
        <select value={days} onChange={(e)=>setDays(Number(e.target.value))}><option value={7}>آخر 7 أيام</option><option value={30}>آخر 30 يوم</option><option value={90}>آخر 90 يوم</option></select>
      </section>

      {performanceBusy&&!performance?<div className="employment-section employment-loading"><Loader2 className="spin"/>جاري تجميع المؤشرات…</div>:performance&&<>
        <section className="employment-section">
          <div className="employment-metric-grid">
            <Metric icon={CalendarCheck2} label="نسبة الحضور" value={pct(performance.attendance.attendance_rate)}/>
            <Metric icon={AlertTriangle} label="غياب فعلي" value={performance.attendance.scheduled_days>0?`${num(performance.attendance.absence_days)} يوم`:"—"}/>
            <Metric icon={Clock3} label="ساعات العمل المسجلة" value={hours(performance.attendance.worked_minutes)}/>
            <Metric icon={Gauge} label="الالتزام بالحضور" value={pct(performance.attendance.punctuality_rate)}/>
            <Metric icon={PackageCheck} label="إنجاز المهام" value={pct(performance.tasks.completion_rate)}/>
            <Metric icon={Clock3} label="الالتزام بالـSLA" value={pct(performance.tasks.sla_rate)}/>
            <Metric icon={Layers3} label="دقة مهام الجرد" value={pct(performance.inventory.count_accuracy_rate)}/>
            <Metric icon={AlertTriangle} label="مهام متأخرة مفتوحة" value={num(performance.tasks.overdue_open)}/>
          </div>
          {performance.attendance.scheduled_days===0&&<div className="employment-warning"><AlertTriangle/><span>لا توجد وردية مسندة خلال الفترة، لذلك لا يعرض النظام غيابًا أو نسبة حضور افتراضية.</span></div>}
          <div className="employment-detail-grid">
            <div><h4>الحضور والجدول</h4><DetailRows rows={[
              ["أيام مجدولة",performance.attendance.scheduled_days],
              ["حضور مجدول",performance.attendance.attended_scheduled_days],
              ["إجازة معتمدة",performance.attendance.approved_leave_days],
              ["غياب",performance.attendance.scheduled_days>0?performance.attendance.absence_days:"—"],
              ["جلسات فعلية",performance.attendance.sessions],
              ["في الموعد",performance.attendance.on_time_sessions],
              ["تأخير",performance.attendance.late_sessions],
              ["دقائق التأخير",performance.attendance.late_minutes],
              ["خروج مبكر",performance.attendance.early_departure_sessions],
              ["دقائق الخروج المبكر",performance.attendance.early_departure_minutes],
            ]}/></div>
            <div><h4>المهام والـSLA</h4><DetailRows rows={[
              ["مسندة",performance.tasks.assigned],["مكتملة",performance.tasks.completed],
              ["داخل SLA",performance.tasks.sla_met],["متأخرة بعد الإكمال",performance.tasks.completed_late],
              ["متأخرة مفتوحة",performance.tasks.overdue_open],["نسبة الإكمال",pct(performance.tasks.completion_rate)],
              ["متوسط زمن الإكمال",duration(performance.tasks.avg_completion_minutes)],
            ]}/></div>
            <div><h4>الجرد</h4><DetailRows rows={[
              ["عمليات عد",performance.inventory.counts_completed],["مطابق",performance.inventory.matched],
              ["بفروق",performance.inventory.with_variance],["إعادة عد",performance.inventory.recounts_completed],
            ]}/></div>
          </div>
          <Notes items={performance.notes}/>
        </section>

        <section className="employment-specialist-summary">
          <strong>أقسام أداء متخصصة نشطة: {specializedCount}</strong>
          <span>تظهر فقط لو عندك نشاط فعلي في التخصص خلال الفترة.</span>
        </section>

        {cashier?.applicable&&<section className="employment-section specialist-card">
          <div className="employment-section-title"><ReceiptText/><div><h3>أداء الكاشير</h3><p>من Invoice V2 والورديات والتسويات الفعلية.</p></div></div>
          <div className="employment-metric-grid">
            <Metric label="عدد الفواتير" value={num(cashier.sales.invoice_count)}/><Metric label="إجمالي المبيعات" value={money(cashier.sales.sales_total)}/>
            <Metric label="متوسط الفاتورة" value={money(cashier.sales.average_ticket)}/><Metric label="الوحدات المباعة" value={num(cashier.sales.items_sold)}/>
            <Metric label="مرتجعات معتمدة" value={money(cashier.returns.approved_amount)}/><Metric label="نسبة قيمة المرتجع" value={pct(cashier.returns.return_amount_pct)}/>
            <Metric label="فرق النقدية المطلق" value={money(cashier.shifts.absolute_cash_variance)}/><Metric label="فرق التسويات المطلق" value={money(cashier.shifts.absolute_payment_variance)}/>
          </div>
          <div className="employment-detail-grid">
            <div><h4>المبيعات</h4><DetailRows rows={[
              ["متوسط وحدات/فاتورة",cashier.sales.items_per_invoice==null?"—":num(cashier.sales.items_per_invoice)],
              ["خصومات المنتجات",money(cashier.sales.discounts)],["كوبونات الولاء",money(cashier.sales.loyalty_voucher_amount)],
              ["رسوم دفع على التاجر",money(cashier.sales.merchant_payment_fees)],
            ]}/></div>
            <div><h4>المرتجعات</h4><DetailRows rows={[
              ["عدد المرتجعات المعتمدة",cashier.returns.approved_count],["قيمة المرتجعات",money(cashier.returns.approved_amount)],
              ["من إجمالي المبيعات",pct(cashier.returns.return_amount_pct)],
            ]}/></div>
            <div><h4>الورديات والتسويات</h4><DetailRows rows={[
              ["الورديات",cashier.shifts.count],["ورديات مغلقة",cashier.shifts.closed_count],
              ["بنود التسوية",cashier.shifts.reconciliation_lines],["بنود تسوية بها فرق",cashier.shifts.variance_lines],
              ["فرق رصيد افتتاحي",money(cashier.shifts.absolute_opening_variance)],["فرق التسويات المطلق",money(cashier.shifts.absolute_payment_variance)],
            ]}/></div>
          </div>
          <Notes items={cashier.notes}/>
        </section>}

        {inventory?.applicable&&<section className="employment-section specialist-card">
          <div className="employment-section-title"><Layers3/><div><h3>أداء الجرد والمخزون</h3><p>من العد الأعمى وPeer Recount الفعلي.</p></div></div>
          <div className="employment-metric-grid">
            <Metric label="العد المنفذ" value={`${num(inventory.counts.submitted)} / ${num(inventory.counts.assigned)}`}/>
            <Metric label="نسبة إنجاز الجرد" value={pct(inventory.counts.completion_rate)}/>
            <Metric label="فروق تم اكتشافها" value={num(inventory.counts.discrepancy)}/>
            <Metric label="القيمة المطلقة للفروق" value={money(inventory.counts.abs_variance_value)}/>
            <Metric label="متوسط زمن العد النشط" value={duration(inventory.counts.avg_active_minutes)}/>
            <Metric label="مهام جرد متأخرة" value={num(inventory.counts.overdue_open+inventory.recounts.overdue_open)}/>
            <Metric label="إعادة عد منفذة" value={`${num(inventory.recounts.submitted)} / ${num(inventory.recounts.assigned)}`}/>
            <Metric label="تأكيد Peer Recount" value={pct(inventory.peer_review.confirmation_rate)}/>
          </div>
          <div className="employment-detail-grid">
            <div><h4>العد الأول</h4><DetailRows rows={[
              ["مهام مسندة",inventory.counts.assigned],["تم إرسال العد",inventory.counts.submitted],["نسبة الإنجاز",pct(inventory.counts.completion_rate)],
              ["مطابق",inventory.counts.matched],["كشف فرق",inventory.counts.discrepancy],["نسبة التطابق",pct(inventory.counts.match_rate)],
              ["وحدات فرق مطلقة",num(inventory.counts.abs_variance_units)],["قيمة فرق مطلقة",money(inventory.counts.abs_variance_value)],
              ["متوسط زمن التنفيذ",duration(inventory.counts.avg_active_minutes)],["أنجز داخل الموعد",inventory.counts.completed_on_time],
              ["متأخر مفتوح",inventory.counts.overdue_open],
            ]}/></div>
            <div><h4>إعادة العد المستقلة</h4><DetailRows rows={[
              ["Recount مسند",inventory.recounts.assigned],["Recount منفذ",inventory.recounts.submitted],["نسبة الإنجاز",pct(inventory.recounts.completion_rate)],
              ["مطابق للنظام",inventory.recounts.matched_system],["أكد وجود الفرق",inventory.recounts.confirmed_variance],["تعارض",inventory.recounts.conflicting],
              ["وحدات فرق مطلقة",num(inventory.recounts.abs_variance_units)],["قيمة فرق مطلقة",money(inventory.recounts.abs_variance_value)],
              ["متوسط زمن التنفيذ",duration(inventory.recounts.avg_active_minutes)],["متأخر مفتوح",inventory.recounts.overdue_open],
            ]}/></div>
            <div><h4>Peer Review</h4><DetailRows rows={[
              ["تمت مراجعتها",inventory.peer_review.reviewed],["أكدت نفس الكمية",inventory.peer_review.confirmed],
              ["اختلفت",inventory.peer_review.disagreed],["نسبة التأكيد",pct(inventory.peer_review.confirmation_rate)],
            ]}/></div>
          </div>
          <Notes items={inventory.notes}/>
        </section>}

        {delivery?.applicable&&<section className="employment-section specialist-card">
          <div className="employment-section-title"><Bike/><div><h3>أداء التوصيل</h3><p>مبني على عهدة الطلب الفعلية وسجل الحالات.</p></div></div>
          <div className="employment-metric-grid">
            <Metric label="طلبات أُسندت" value={num(delivery.assignments.assigned_in_period)}/>
            <Metric label="طلبات حالية في العهدة" value={num(delivery.assignments.active_open_orders)}/>
            <Metric label="تم توصيلها" value={num(delivery.delivery.delivered_orders)}/>
            <Metric label="قيمة الطلبات الموصلة" value={money(delivery.delivery.delivered_value)}/>
            <Metric label="متوسط استلام الطلب" value={duration(delivery.delivery.avg_pickup_minutes)}/>
            <Metric label="متوسط زمن التوصيل" value={duration(delivery.delivery.avg_delivery_minutes)}/>
            <Metric label="إلغاءات أثناء العهدة" value={num(delivery.delivery.cancelled_orders)}/>
            <Metric label="موصلة بها مرتجع" value={num(delivery.delivery.delivered_orders_with_returns)}/>
          </div>
          <div className="employment-detail-grid">
            <div><h4>العهدة والتعيين</h4><DetailRows rows={[
              ["سجلات عهدة",delivery.assignments.records],["أُسندت خلال الفترة",delivery.assignments.assigned_in_period],
              ["أعيد إسنادها بعيدًا عنه",delivery.assignments.reassigned_away_in_period],["طلبات مفتوحة",delivery.assignments.active_open_orders],
            ]}/></div>
            <div><h4>رحلة التوصيل</h4><DetailRows rows={[
              ["خرجت للتوصيل",delivery.delivery.shipped_orders],["تم توصيلها",delivery.delivery.delivered_orders],
              ["عينات زمن الاستلام",delivery.delivery.pickup_duration_samples],["عينات زمن التوصيل",delivery.delivery.delivery_duration_samples],
            ]}/></div>
            <div><h4>سياق تشغيلي</h4><DetailRows rows={[
              ["إلغاءات أثناء العهدة",delivery.delivery.cancelled_orders],["طلبات بها مرتجع",delivery.delivery.delivered_orders_with_returns],
              ["قيمة الطلبات الموصلة",money(delivery.delivery.delivered_value)],
            ]}/></div>
          </div>
          <Notes items={delivery.notes}/>
        </section>}

        {online?.applicable&&<section className="employment-section specialist-card">
          <div className="employment-section-title"><Headphones/><div><h3>الطلبات الإلكترونية وخدمة العملاء</h3><p>من سجل حالات الطلب والمتابعات المسندة فعليًا.</p></div></div>
          <div className="employment-metric-grid">
            <Metric label="طلبات تعامل معها" value={num(online.orders.handled_orders)}/>
            <Metric label="تغييرات حالة" value={num(online.orders.status_transitions)}/>
            <Metric label="متوسط أول استجابة" value={duration(online.orders.avg_first_response_minutes)}/>
            <Metric label="متوسط تجهيز الطلب" value={duration(online.orders.avg_preparation_minutes)}/>
            <Metric label="SLA الطلبات" value={online.orders.sla.enabled?pct(online.orders.sla.overall_rate):"غير مفعّل"}/>
            <Metric label="إلغاءات نفذها" value={num(online.orders.cancelled)}/>
            <Metric label="متابعات مسندة" value={num(online.customer_service.assigned)}/>
            <Metric label="إغلاق المتابعات" value={pct(online.customer_service.completion_rate)}/>
          </div>
          <div className="employment-detail-grid">
            <div><h4>رحلة الطلب</h4><DetailRows rows={[
              ["طلبات تعامل معها",online.orders.handled_orders],["تغييرات حالة",online.orders.status_transitions],
              ["تأكيد",online.orders.confirmed],["بدأ التجهيز",online.orders.preparing],["جاهز",online.orders.ready],
              ["خرج للتوصيل",online.orders.shipped],["تم التوصيل",online.orders.delivered],["إلغاء",online.orders.cancelled],
              ["طلبات بها مرتجع",online.orders.handled_orders_with_returns],
            ]}/></div>
            <div><h4>الاستجابة وSLA</h4><DetailRows rows={[
              ["عينات أول استجابة",online.orders.first_response_samples],["متوسط أول استجابة",duration(online.orders.avg_first_response_minutes)],
              ["هدف أول استجابة",online.orders.sla.enabled?duration(online.orders.sla.first_response_target_minutes):"غير مفعّل"],
              ["الالتزام بأول استجابة",online.orders.sla.enabled?pct(online.orders.sla.first_response_rate):"—"],
              ["عينات التجهيز",online.orders.preparation_samples],["متوسط التجهيز",duration(online.orders.avg_preparation_minutes)],
              ["هدف التجهيز",online.orders.sla.enabled?duration(online.orders.sla.preparation_target_minutes):"غير مفعّل"],
              ["الالتزام بالتجهيز",online.orders.sla.enabled?pct(online.orders.sla.preparation_rate):"—"],
              ["SLA إجمالي",online.orders.sla.enabled?pct(online.orders.sla.overall_rate):"غير مفعّل"],
              ["عينات SLA مقيمة",online.orders.sla.evaluated_samples],
            ]}/></div>
            <div><h4>خدمة العملاء</h4><DetailRows rows={[
              ["أنشأ متابعات",online.customer_service.created_by_employee],["مسندة",online.customer_service.assigned],
              ["مسندة مغلقة",online.customer_service.assigned_closed],["نسبة الإغلاق",pct(online.customer_service.completion_rate)],
              ["أغلقها بنفسه",online.customer_service.assigned_closed_by_employee],["أغلقها موظف آخر",online.customer_service.assigned_closed_by_other],
              ["إجمالي ما أغلقه",online.customer_service.completed_by_employee],["متابعات بموعد",online.customer_service.scheduled_due],
              ["أغلقت متأخر",online.customer_service.completed_late_assigned],["متأخرة مفتوحة",online.customer_service.overdue_open],
              ["متوسط دورة المتابعة",duration(online.customer_service.avg_assigned_lifecycle_minutes)],
            ]}/>
            {Object.keys(online.customer_service.outcomes||{}).length>0&&<div className="employment-outcomes">{Object.entries(online.customer_service.outcomes).map(([key,value])=><span key={key}>{key}<b>{value}</b></span>)}</div>}</div>
          </div>
          <Notes items={online.notes}/>
        </section>}
      </>}

      {!performanceBusy&&!performance&&<section className="employment-section employment-empty">تعذر تحميل مؤشرات الأداء الآن. باقي الملف الوظيفي متاح بشكل طبيعي.</section>}
    </div>}
  </div>;
}

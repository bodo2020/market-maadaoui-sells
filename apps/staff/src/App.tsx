import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { Bell, CheckCircle2, ClipboardList, Clock3, Home, Loader2, LogOut, PackageCheck, Play, RefreshCw, UserRound, UsersRound } from "lucide-react";
import { supabase } from "./lib/supabase";
import * as staff from "./services/staffService";
import type { StaffBranch, StaffIdentity } from "./services/staffService";

type SessionState = { loading: boolean; identity: StaffIdentity | null; branch: StaffBranch | null };

function useStaffSession() {
  const [state, setState] = useState<SessionState>({ loading: true, identity: null, branch: null });
  const resolve = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setState({ loading: false, identity: null, branch: null }); return; }
    try {
      const [identity, branches] = await Promise.all([staff.getStaffIdentity(), staff.getStaffBranches()]);
      if (!identity?.active || !branches?.length) throw new Error("STAFF_ACCESS_REQUIRED");
      const branch = branches.find(row => row.is_primary) || branches[0];
      setState({ loading: false, identity, branch });
    } catch {
      await supabase.auth.signOut();
      setState({ loading: false, identity: null, branch: null });
    }
  }, []);
  useEffect(() => {
    void resolve();
    const { data } = supabase.auth.onAuthStateChange(() => void resolve());
    return () => data.subscription.unsubscribe();
  }, [resolve]);
  return { ...state, refreshSession: resolve };
}

const SessionContext = ({ children }: { children: (state: ReturnType<typeof useStaffSession>) => React.ReactNode }) => children(useStaffSession());

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const value = username.trim().toLowerCase();
    const email = value.includes("@") ? value : `${value}@example.com`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError("اسم المستخدم أو كلمة المرور غير صحيحة"); return; }
    navigate("/", { replace: true });
  };
  return <main className="login-page"><section className="login-card"><div className="brand-mark">م</div><h1>المعداوي Staff</h1><p>شغلك اليومي في مكان واحد</p><form onSubmit={submit}><label>اسم المستخدم<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required /></label><label>كلمة المرور<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required /></label>{error && <div className="error-box">{error}</div>}<button className="primary" disabled={busy}>{busy?<Loader2 className="spin" />:"تسجيل الدخول"}</button></form></section></main>;
}

function Shell({ identity, branch, children }: { identity: StaffIdentity; branch: StaffBranch; children: React.ReactNode }) {
  return <div className="app-shell"><header><div><small>{branch.branch_name}</small><strong>أهلًا، {identity.name}</strong></div><button className="icon-btn" aria-label="الإشعارات"><Bell /></button></header><main className="content">{children}</main><nav className="bottom-nav">{[["/",Home,"الرئيسية"],["/tasks",ClipboardList,"المهام"],["/operations",PackageCheck,"التشغيل"],["/attendance",Clock3,"الحضور"],["/account",UserRound,"حسابي"]].map(([to,Icon,label])=><NavLink key={to as string} to={to as string} end={to==="/"}>{<Icon size={20}/>}<span>{label as string}</span></NavLink>)}</nav></div>;
}

function HomePage({ identity, branch }: { identity: StaffIdentity; branch: StaffBranch }) {
  const [tasks,setTasks]=useState<staff.OperationsTask[]>([]); const [attendance,setAttendance]=useState<any>(null); const [busy,setBusy]=useState(true);
  const load=useCallback(async()=>{setBusy(true);try{const [t,a]=await Promise.all([staff.listTasks(branch.branch_id,"active"),staff.getAttendance(branch.branch_id)]);setTasks(t);setAttendance(a);}finally{setBusy(false);}},[branch.branch_id]);
  useEffect(()=>{void load();},[load]);
  const overdue=tasks.filter(t=>t.is_overdue).length; const current=tasks.find(t=>t.is_mine)||tasks[0];
  return <><section className="hero"><small>{branch.role_name_ar}</small><h1>يومي</h1><p>{attendance?.active_session?"أنت داخل الوردية الآن":"ابدأ يومك وتابع أول مهمة مطلوبة"}</p></section><div className="stats"><div><strong>{tasks.length}</strong><span>مهام نشطة</span></div><div><strong>{overdue}</strong><span>متأخرة</span></div><div><strong>{attendance?.active_session?"نشط":"—"}</strong><span>الحضور</span></div></div><section className="section"><div className="section-head"><h2>الأولوية الآن</h2><button className="icon-btn" onClick={()=>void load()}>{busy?<Loader2 className="spin"/>:<RefreshCw/>}</button></div>{current?<TaskCard task={current} onChanged={load}/>:<Empty text="مفيش مهام محتاجة منك إجراء حاليًا"/>}</section></>;
}

function TaskCard({ task, onChanged }: { task: staff.OperationsTask; onChanged: ()=>Promise<void> }) {
  const [busy,setBusy]=useState(false); const act=async(kind:"claim"|"start"|"complete")=>{setBusy(true);try{if(kind==="claim")await staff.claimTask(task.id);if(kind==="start")await staff.startTask(task.id);if(kind==="complete")await staff.completeTask(task.id);await onChanged();}finally{setBusy(false);}};
  return <article className={`task-card ${task.is_overdue?"danger":""}`}><div className="row"><span className={`pill ${task.priority}`}>{task.priority==="urgent"?"عاجل":task.priority==="high"?"عالي":"عادي"}</span>{task.is_overdue&&<span className="danger-text">متأخرة</span>}</div><h3>{task.title}</h3>{task.description&&<p>{task.description}</p>}<small>{task.source_kind}</small><div className="actions">{task.status==="open"&&task.can_claim&&<button className="primary" onClick={()=>void act("claim")} disabled={busy}>استلام المهمة</button>}{task.is_mine&&task.status==="claimed"&&<button className="primary" onClick={()=>void act("start")} disabled={busy}><Play/>بدء التنفيذ</button>}{task.is_mine&&task.status==="in_progress"&&<button className="primary" onClick={()=>void act("complete")} disabled={busy}><CheckCircle2/>تم التنفيذ</button>}</div></article>;
}

function TasksPage({ branch }: { branch: StaffBranch }) { const [scope,setScope]=useState("active");const [rows,setRows]=useState<staff.OperationsTask[]>([]);const [busy,setBusy]=useState(true);const load=useCallback(async()=>{setBusy(true);try{setRows(await staff.listTasks(branch.branch_id,scope));}finally{setBusy(false);}},[branch.branch_id,scope]);useEffect(()=>{void load();},[load]);return <><PageTitle title="المهام" subtitle="كل المطلوب منك في الفرع"/><div className="chips">{[["active","نشطة"],["mine","مهامي"],["overdue","متأخرة"],["completed","مكتملة"]].map(([id,label])=><button className={scope===id?"active":""} onClick={()=>setScope(id)} key={id}>{label}</button>)}</div>{busy?<Loading/>:<div className="stack">{rows.map(t=><TaskCard key={t.id} task={t} onChanged={load}/>)}{!rows.length&&<Empty text="مفيش مهام في القسم ده"/>}</div>}</> }

function OperationsPage({ branch }: { branch: StaffBranch }) { const canPrepare=branch.permissions.includes("online_orders.prepare")||branch.permissions.includes("online_orders.manage");const [data,setData]=useState<{summary:Record<string,number>;orders:staff.FulfillmentOrder[]}|null>(null);const [busy,setBusy]=useState(true);const [acting,setActing]=useState("");const load=useCallback(async()=>{if(!canPrepare){setBusy(false);return;}setBusy(true);try{setData(await staff.getFulfillmentWorkspace(branch.branch_id));}finally{setBusy(false);}},[branch.branch_id,canPrepare]);useEffect(()=>{void load();},[load]);const action=async(order:staff.FulfillmentOrder,kind:string)=>{setActing(order.order_id);try{if(kind==="claim")await staff.claimFulfillment(order.order_id);if(kind==="start")await staff.startPicking(order.order_id);if(kind==="pick")await staff.updatePicking(order.order_id,Math.min(order.items_total,order.items_picked+1),order.shortage_count,order.substitution_count);if(kind==="pack")await staff.startPacking(order.order_id,Math.max(1,order.bags_count));if(kind==="ready")await staff.markReady(order.order_id,Math.max(1,order.bags_count));await load();}finally{setActing("");}};if(!canPrepare)return <><PageTitle title="التشغيل" subtitle="المحتوى بيتغير حسب دورك"/><Empty text="مفيش وحدة تشغيل مفعّلة لدورك حاليًا"/></>;return <><PageTitle title="تجهيز الطلبات" subtitle="جمع، تعبئة وتجهيز طلبات الأونلاين"/>{busy&&!data?<Loading/>:<><div className="stats"><div><strong>{data?.summary.queued||0}</strong><span>في الطابور</span></div><div><strong>{data?.summary.picking||0}</strong><span>تجهيز</span></div><div><strong>{data?.summary.ready||0}</strong><span>جاهز</span></div></div><div className="stack">{(data?.orders||[]).map(o=>{const progress=o.items_total?Math.round(o.items_picked/o.items_total*100):0;return <article className="task-card" key={o.order_id}><div className="row"><strong>{o.display_id}</strong><span className="pill normal">{o.fulfillment_state}</span></div><h3>{o.customer_name}</h3><p>{o.items_picked}/{o.items_total} صنف · {Number(o.amount).toLocaleString("ar-EG")} ج.م</p><div className="progress"><i style={{width:`${progress}%`}}/></div>{o.picker_name&&<small>المجهز: {o.picker_name}</small>}<div className="actions">{o.fulfillment_state==="queued"&&<button className="primary" onClick={()=>void action(o,"claim")} disabled={acting===o.order_id}>استلام الطلب</button>}{o.picker_user_id&&o.fulfillment_state==="queued"&&<button onClick={()=>void action(o,"start")}>بدء التجهيز</button>}{o.fulfillment_state==="picking"&&<button className="primary" onClick={()=>void action(o,"pick")}>تأكيد صنف +1</button>}{o.fulfillment_state==="picking"&&o.items_picked>=o.items_total&&<button onClick={()=>void action(o,"pack")}>بدء التعبئة</button>}{o.fulfillment_state==="packing"&&<button className="primary" onClick={()=>void action(o,"ready")}>الطلب جاهز</button>}</div></article>})}</div></>}</> }

function AttendancePage({ branch }: { branch: StaffBranch }) { const [data,setData]=useState<any>(null);const [busy,setBusy]=useState(true);useEffect(()=>{void staff.getAttendance(branch.branch_id).then(setData).finally(()=>setBusy(false));},[branch.branch_id]);if(busy)return <Loading/>;const active=data?.active_session;return <><PageTitle title="الحضور" subtitle="وردية وحضور الموظف"/><section className="attendance-card"><Clock3/><h2>{active?"أنت داخل الوردية":"لا توجد وردية حضور مفتوحة"}</h2>{active&&<><p>دخول: {new Date(active.check_in_at).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"})}</p><span className="success">تم تسجيل الحضور</span></>}<small>تسجيل الدخول والخروج من الهاتف سيتم تفعيله بعد ربط الجهاز الموثوق في المرحلة التالية.</small></section></> }
function AccountPage({ identity, branch }: { identity:StaffIdentity;branch:StaffBranch }) { const navigate=useNavigate();return <><PageTitle title="حسابي" subtitle="هويتك وصلاحياتك في الفرع"/><section className="profile"><div className="avatar">{identity.name.slice(0,1)}</div><h2>{identity.name}</h2><p>{branch.role_name_ar} · {branch.branch_name}</p><div className="permission-list">{branch.permissions.slice(0,8).map(p=><span key={p}>{p}</span>)}</div><button className="logout" onClick={async()=>{await supabase.auth.signOut();navigate("/login",{replace:true});}}><LogOut/>تسجيل الخروج</button></section></> }

const PageTitle=({title,subtitle}:{title:string;subtitle:string})=><div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div></div>;
const Loading=()=> <div className="loading"><Loader2 className="spin"/><span>جاري التحميل…</span></div>;
const Empty=({text}:{text:string})=><div className="empty"><UsersRound/><p>{text}</p></div>;

function AuthenticatedApp({ state }: { state: ReturnType<typeof useStaffSession> }) {
  if (state.loading) return <Loading/>;
  if (!state.identity || !state.branch) return <Navigate to="/login" replace/>;
  const props={identity:state.identity,branch:state.branch};
  return <Shell {...props}><Routes><Route path="/" element={<HomePage {...props}/>}/><Route path="/tasks" element={<TasksPage branch={state.branch}/>}/><Route path="/operations" element={<OperationsPage branch={state.branch}/>}/><Route path="/attendance" element={<AttendancePage branch={state.branch}/>}/><Route path="/account" element={<AccountPage {...props}/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Shell>;
}

export default function App(){return <BrowserRouter><SessionContext>{state=><Routes><Route path="/login" element={state.identity?<Navigate to="/" replace/>:<Login/>}/><Route path="/*" element={<AuthenticatedApp state={state}/>}/></Routes>}</SessionContext></BrowserRouter>}

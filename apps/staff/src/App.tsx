import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Geolocation } from "@capacitor/geolocation";
import { Camera, CameraDirection, CameraResultType, CameraSource } from "@capacitor/camera";
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Home,
  Layers3,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  PackageCheck,
  Play,
  RefreshCw,
  Scale,
  ScanLine,
  ShieldCheck,
  Smartphone,
  UserRound,
  UsersRound,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import * as staff from "./services/staffService";
import type {
  BatchPickingShadow,
  FulfillmentOrder,
  NotificationCenter,
  NotificationItem,
  PickerAssignmentShadow,
  PickingItem,
  PickingSession,
  StaffBranch,
  StaffIdentity,
  StagingBag,
  StagingSession,
  StagingZone,
} from "./services/staffService";

type SessionState = {
  loading: boolean;
  identity: StaffIdentity | null;
  branch: StaffBranch | null;
};

const DEVICE_ID_KEY = "elmadawy_staff_device_id";
const DEVICE_TOKEN_KEY = "elmadawy_staff_device_token";
const DEVICE_KEY_KEY = "elmadawy_staff_device_key";

function useStaffSession() {
  const [state, setState] = useState<SessionState>({ loading: true, identity: null, branch: null });

  const resolve = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setState({ loading: false, identity: null, branch: null });
      return;
    }
    try {
      const [identity, branches] = await Promise.all([staff.getStaffIdentity(), staff.getStaffBranches()]);
      if (!identity?.active || !branches?.length) throw new Error("STAFF_ACCESS_REQUIRED");
      const branch = branches.find((row) => row.is_primary) || branches[0];
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

const SessionContext = ({ children }: { children: (state: ReturnType<typeof useStaffSession>) => ReactNode }) => children(useStaffSession());

function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const value = username.trim().toLowerCase();
    const email = value.includes("@") ? value : `${value}@example.com`;
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (authError) {
      setError("اسم المستخدم أو كلمة المرور غير صحيحة");
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">م</div>
        <h1>المعداوي Staff</h1>
        <p>شغلك اليومي في مكان واحد</p>
        <form onSubmit={submit}>
          <label>اسم المستخدم<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label>
          <label>كلمة المرور<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? <Loader2 className="spin" /> : "تسجيل الدخول"}</button>
        </form>
      </section>
    </main>
  );
}

function useNotificationBadge(identity: StaffIdentity, branch: StaffBranch) {
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    try {
      const next = await staff.getNotifications(branch.branch_id, "all");
      setUnread(Number(next.summary?.unread || 0));
    } catch {
      setUnread(0);
    }
  }, [branch.branch_id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel(`staff-notifications-${identity.user_id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notification_realtime_signals_v2",
        filter: `recipient_user_id=eq.${identity.user_id}`,
      }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [identity.user_id, load]);
  return unread;
}

function Shell({ identity, branch, children }: { identity: StaffIdentity; branch: StaffBranch; children: ReactNode }) {
  const unread = useNotificationBadge(identity, branch);
  return (
    <div className="app-shell">
      <header>
        <div><small>{branch.branch_name}</small><strong>أهلًا، {identity.name}</strong></div>
        <NavLink to="/notifications" className="icon-btn notification-button" aria-label="الإشعارات">
          <Bell />{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
        </NavLink>
      </header>
      <main className="content">{children}</main>
      <nav className="bottom-nav">
        {[
          ["/", Home, "الرئيسية"],
          ["/tasks", ClipboardList, "المهام"],
          ["/operations", PackageCheck, "التشغيل"],
          ["/attendance", Clock3, "الحضور"],
          ["/account", UserRound, "حسابي"],
        ].map(([to, Icon, label]) => (
          <NavLink key={to as string} to={to as string} end={to === "/"}>{<Icon size={20} />}<span>{label as string}</span></NavLink>
        ))}
      </nav>
    </div>
  );
}

function HomePage({ branch }: { identity: StaffIdentity; branch: StaffBranch }) {
  const [tasks, setTasks] = useState<staff.OperationsTask[]>([]);
  const [attendance, setAttendance] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [nextTasks, nextAttendance] = await Promise.all([
        staff.listTasks(branch.branch_id, "active"),
        staff.getAttendance(branch.branch_id),
      ]);
      setTasks(nextTasks);
      setAttendance(nextAttendance);
    } finally {
      setBusy(false);
    }
  }, [branch.branch_id]);
  useEffect(() => { void load(); }, [load]);
  const overdue = tasks.filter((task) => task.is_overdue).length;
  const current = tasks.find((task) => task.is_mine) || tasks[0];

  return (
    <>
      <section className="hero"><small>{branch.role_name_ar}</small><h1>يومي</h1><p>{attendance?.active_session ? "أنت داخل الوردية الآن" : "ابدأ يومك وتابع أول مهمة مطلوبة"}</p></section>
      <div className="stats"><div><strong>{tasks.length}</strong><span>مهام نشطة</span></div><div><strong>{overdue}</strong><span>متأخرة</span></div><div><strong>{attendance?.active_session ? "نشط" : "—"}</strong><span>الحضور</span></div></div>
      <section className="section"><div className="section-head"><h2>الأولوية الآن</h2><button className="icon-btn" onClick={() => void load()}>{busy ? <Loader2 className="spin" /> : <RefreshCw />}</button></div>{current ? <TaskCard task={current} onChanged={load} /> : <Empty text="مفيش مهام محتاجة منك إجراء حاليًا" />}</section>
    </>
  );
}

function TaskCard({ task, onChanged }: { task: staff.OperationsTask; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const act = async (kind: "claim" | "start" | "complete") => {
    setBusy(true);
    try {
      if (kind === "claim") await staff.claimTask(task.id);
      if (kind === "start") await staff.startTask(task.id);
      if (kind === "complete") await staff.completeTask(task.id);
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`task-card ${task.is_overdue ? "danger" : ""}`}>
      <div className="row"><span className={`pill ${task.priority}`}>{task.priority === "urgent" ? "عاجل" : task.priority === "high" ? "عالي" : "عادي"}</span>{task.is_overdue && <span className="danger-text">متأخرة</span>}</div>
      <h3>{task.title}</h3>{task.description && <p>{task.description}</p>}<small>{task.source_kind}</small>
      <div className="actions">
        {task.status === "open" && task.can_claim && <button className="primary" onClick={() => void act("claim")} disabled={busy}>استلام المهمة</button>}
        {task.is_mine && task.status === "claimed" && <button className="primary" onClick={() => void act("start")} disabled={busy}><Play />بدء التنفيذ</button>}
        {task.is_mine && task.status === "in_progress" && <button className="primary" onClick={() => void act("complete")} disabled={busy}><CheckCircle2 />تم التنفيذ</button>}
      </div>
    </article>
  );
}

function TasksPage({ branch }: { branch: StaffBranch }) {
  const [scope, setScope] = useState("active");
  const [rows, setRows] = useState<staff.OperationsTask[]>([]);
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    try { setRows(await staff.listTasks(branch.branch_id, scope)); }
    finally { setBusy(false); }
  }, [branch.branch_id, scope]);
  useEffect(() => { void load(); }, [load]);

  return <><PageTitle title="المهام" subtitle="كل المطلوب منك في الفرع" /><div className="chips">{[["active","نشطة"],["mine","مهامي"],["overdue","متأخرة"],["completed","مكتملة"]].map(([id,label]) => <button className={scope === id ? "active" : ""} onClick={() => setScope(id)} key={id}>{label}</button>)}</div>{busy ? <Loading /> : <div className="stack">{rows.map((task) => <TaskCard key={task.id} task={task} onChanged={load} />)}{!rows.length && <Empty text="مفيش مهام في القسم ده" />}</div>}</>;
}

function useOrderOperationsRealtime(branchId: string, refresh: () => void) {
  useEffect(() => {
    const channel = supabase.channel(`staff-order-ops-${branchId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "order_operations_realtime_signals_v1",
        filter: `branch_id=eq.${branchId}`,
      }, () => refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [branchId, refresh]);
}

function OperationsPage({ branch, identity }: { branch: StaffBranch; identity: StaffIdentity }) {
  const navigate = useNavigate();
  const canPrepare = branch.permissions.includes("online_orders.prepare") || branch.permissions.includes("online_orders.manage");
  const [data, setData] = useState<{ summary: Record<string, number>; orders: FulfillmentOrder[] } | null>(null);
  const [shadow, setShadow] = useState<PickerAssignmentShadow | null>(null);
  const [batchShadow, setBatchShadow] = useState<BatchPickingShadow | null>(null);
  const [busy, setBusy] = useState(true);
  const [acting, setActing] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (showBusy = true) => {
    if (!canPrepare) { setBusy(false); return; }
    if (showBusy) setBusy(true);
    try {
      const workspace = await staff.getFulfillmentWorkspace(branch.branch_id);
      setData(workspace);
      try {
        const [assignment, batching] = await Promise.all([
          staff.getPickerAssignmentShadow(branch.branch_id),
          staff.getBatchPickingShadow(branch.branch_id),
        ]);
        setShadow(assignment);
        setBatchShadow(batching);
      } catch {
        setShadow(null);
        setBatchShadow(null);
      }
      setError("");
    } catch {
      setError("تعذر تحديث تشغيل الطلبات");
    } finally {
      if (showBusy) setBusy(false);
    }
  }, [branch.branch_id, canPrepare]);

  useEffect(() => { void load(); }, [load]);
  useOrderOperationsRealtime(branch.branch_id, useCallback(() => { void load(false); }, [load]));

  const action = async (order: FulfillmentOrder, kind: "claim" | "start") => {
    setActing(order.order_id);
    setError("");
    try {
      if (kind === "claim") await staff.claimFulfillment(order.order_id);
      if (kind === "start") await staff.startPicking(order.order_id);
      await load(false);
      if (kind === "start") navigate(`/operations/${order.order_id}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(message.includes("ALREADY_CLAIMED") ? "الطلب استلمه موظف آخر" : "تعذر تنفيذ الإجراء. حدّث البيانات وحاول مرة أخرى.");
      await load(false);
    } finally {
      setActing("");
    }
  };

  const claimSuggested = async () => {
    const next = shadow?.next_for_me;
    if (!next) return;
    const order = data?.orders.find((entry) => entry.order_id === next.order_id);
    if (!order) return;
    await action(order, "claim");
  };

  if (!canPrepare) return <><PageTitle title="التشغيل" subtitle="المحتوى بيتغير حسب دورك" /><Empty text="مفيش وحدة تشغيل مفعّلة لدورك حاليًا" /></>;

  return (
    <>
      <PageTitle title="تجهيز الطلبات" subtitle="النظام يرتب الأولوية، وأنت تنفذ أفضل طلب تالٍ" />
      {error && <div className="error-box">{error}</div>}
      {busy && !data ? <Loading /> : <>
        {shadow?.next_for_me && <section className="smart-assignment-card">
          <div className="smart-assignment-head"><span className="smart-badge">Shadow</span><small>اقتراح فقط — لا يتم التعيين تلقائيًا</small></div>
          <div className="row"><div><small>المهمة التالية المقترحة لك</small><h2>{shadow.next_for_me.display_id} · {shadow.next_for_me.customer_name}</h2></div><PackageCheck /></div>
          <p>{shadow.next_for_me.items_total} سطر · {shadow.next_for_me.eta_risk === "late" ? "متأخر" : shadow.next_for_me.eta_risk === "at_risk" ? "معرض للتأخير" : "ضمن الوقت"}</p>
          <div className="smart-assignment-meta"><span>Score: {Number(shadow.next_for_me.score || 0).toFixed(1)}</span>{shadow.summary.match_rate_7d !== null && <span>تطابق 7 أيام: {shadow.summary.match_rate_7d}%</span>}</div>
          <button className="primary" disabled={acting === shadow.next_for_me.order_id} onClick={() => void claimSuggested()}>{acting === shadow.next_for_me.order_id ? <Loader2 className="spin" /> : <Play />}استلام الطلب المقترح</button>
        </section>}

        {batchShadow && <section className="batch-shadow-card">
          <div className="smart-assignment-head"><span className="smart-badge batch">Batch Shadow</span><small>تحليل جولات فقط — التنفيذ ما زال Order منفرد</small></div>
          <div className="row"><div><small>فرص التجميع الحالية</small><h2>{batchShadow.summary.recommended_batches} جولة · {batchShadow.summary.covered_orders} طلب مغطى</h2></div><Layers3 /></div>
          <div className="batch-shadow-stats"><span>مؤهل: {batchShadow.summary.eligible_orders}</span><span>Single: {batchShadow.summary.single_orders}</span><span>التغطية: {batchShadow.summary.coverage_rate == null ? "—" : `${batchShadow.summary.coverage_rate}%`}</span></div>
          {batchShadow.batches.filter((batch) => !batch.recommended_user_id || batch.recommended_user_id === identity.user_id).slice(0,1).map((batch) => <div className="batch-shadow-preview" key={batch.id}>
            <div className="row"><strong>{batch.batch_code}</strong><span>{batch.order_count} طلبات · {batch.total_lines} صنف</span></div>
            <p>{batch.reason === "shared_shelf_route" ? "مسار رفوف مشترك" : batch.reason === "shared_categories" ? "أقسام متقاربة" : "مواعيد تجهيز متقاربة"} · Score {Number(batch.score).toFixed(1)}</p>
            <div className="batch-order-chips">{batch.orders.map((order) => <span key={order.order_id}>{order.display_id}</span>)}</div>
          </div>)}
        </section>}

        <div className="stats"><div><strong>{data?.summary.queued || 0}</strong><span>في الطابور</span></div><div><strong>{data?.summary.picking || 0}</strong><span>تجهيز</span></div><div><strong>{data?.summary.ready || 0}</strong><span>جاهز</span></div></div>
        <div className="stack">{(data?.orders || []).map((order) => {
          const resolved = order.items_picked + order.shortage_count + order.substitution_count;
          const progress = order.items_total ? Math.round((resolved / order.items_total) * 100) : 0;
          const mine = order.picker_user_id === identity.user_id;
          const recommended = shadow?.orders.find((row) => row.order_id === order.order_id);
          return <article className={`task-card ${order.eta_risk === "late" ? "danger" : ""} ${recommended?.is_recommended_to_me ? "smart-recommended" : ""}`} key={order.order_id}>
            <div className="row"><strong>{order.display_id}</strong><span className={`pill ${order.eta_risk === "late" ? "urgent" : "normal"}`}>{fulfillmentLabel(order.fulfillment_state)}</span></div>
            {recommended?.is_recommended_to_me && <div className="smart-inline">مقترح لك بواسطة Smart Assignment</div>}
            <h3>{order.customer_name}</h3>
            <p>{resolved}/{order.items_total} سطر مكتمل · {Number(order.amount).toLocaleString("ar-EG")} ج.م</p>
            <div className="progress"><i style={{ width: `${progress}%` }} /></div>
            {order.picker_name && <small>المجهز: {order.picker_name}</small>}
            {order.shortage_count > 0 && <span className="shortage-note">نواقص: {order.shortage_count}</span>}
            <div className="actions">
              {order.fulfillment_state === "queued" && !order.picker_user_id && <button className="primary" onClick={() => void action(order,"claim")} disabled={acting === order.order_id}>استلام الطلب</button>}
              {mine && order.fulfillment_state === "queued" && <button className="primary" onClick={() => void action(order,"start")} disabled={acting === order.order_id}><ScanLine />بدء التجهيز</button>}
              {mine && ["picking","packing"].includes(order.fulfillment_state) && <button className="primary" onClick={() => navigate(`/operations/${order.order_id}`)}><Barcode />فتح جلسة التجهيز</button>}
            </div>
          </article>;
        })}{!data?.orders.length && <Empty text="مفيش طلبات محتاجة تجهيز حاليًا" />}</div>
      </>}
    </>
  );
}

function fulfillmentLabel(value: string) {
  return ({ awaiting_confirmation:"بانتظار التأكيد", queued:"في الطابور", picking:"جاري الجمع", packing:"التعبئة والتسكين", ready:"جاهز", handed_over:"تم التسليم للمندوب" } as Record<string,string>)[value] || value;
}

function pickingError(message: string) {
  const pairs: Array<[string,string]> = [
    ["BARCODE_NOT_IN_ORDER","الباركود ده مش موجود في الطلب"],
    ["ITEM_ALREADY_COMPLETE","الكمية المطلوبة من الصنف ده اكتملت بالفعل"],
    ["WEIGHT_REQUIRED","الصنف وزني — اكتب الوزن الفعلي قبل التأكيد"],
    ["QUANTITY_EXCEEDS_REQUIRED","الكمية أكبر من المتبقي في الطلب"],
    ["PICKING_NOT_ACTIVE","جلسة التجهيز غير نشطة"],
    ["FULFILLMENT_NOT_OWNER","الطلب مستلم بواسطة موظف آخر"],
    ["PENDING_SUBSTITUTIONS_EXIST","فيه بدائل لسه مستنية اعتماد قبل التعبئة"],
    ["PICKING_ITEMS_UNRESOLVED","لسه فيه أصناف لم يتم حسمها"],
    ["ORDER_NOT_IN_PACKING","الطلب مش في مرحلة التعبئة والتسكين"],
    ["STAGING_BAGS_REQUIRED","لازم تكوّن أكياس الطلب الأول"],
    ["STAGING_INCOMPLETE","لسه فيه أكياس لم يتم تسكينها"],
    ["STAGING_ZONE_MISMATCH","مكان التسكين لا يناسب نوع الكيس"],
    ["STAGING_LOCATION_NOT_FOUND","مكان التسكين غير موجود أو غير نشط"],
    ["STAGING_LOCATION_FULL","مكان التسكين ممتلئ — اختار مكان تاني"],
    ["STAGING_BAGS_LOCKED","بدأ تسكين الأكياس بالفعل؛ لا يمكن إعادة تكوينها"],
    ["INVALID_BAG_COUNT","عدد الأكياس غير صحيح"],
    ["BAGS_COUNT_MISMATCH","عدد الأكياس لا يطابق سجل التسكين"],
  ];
  return pairs.find(([code]) => message.includes(code))?.[1] || "تعذر تنفيذ الإجراء. حدّث الجلسة وحاول مرة أخرى.";
}

function remainingQuantity(item: PickingItem) {
  return Math.max(0, Number(item.required_quantity) - Number(item.picked_quantity) - Number(item.shortage_quantity) - Number(item.substitution_quantity));
}
function formatQuantity(value: number, weight: boolean) {
  return weight ? `${Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} كجم` : Number(value).toLocaleString("ar-EG");
}
function zoneLabel(zone: StagingZone) {
  return zone === "chilled" ? "مبرد" : zone === "frozen" ? "مجمد" : "عادي";
}

function PickingPage({ branch }: { branch: StaffBranch }) {
  const navigate = useNavigate();
  const { orderId = "" } = useParams();
  const scannerRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<PickingSession | null>(null);
  const [order, setOrder] = useState<FulfillmentOrder | null>(null);
  const [staging, setStaging] = useState<StagingSession | null>(null);
  const [barcode, setBarcode] = useState("");
  const [weight, setWeight] = useState("");
  const [ambientBags, setAmbientBags] = useState("1");
  const [chilledBags, setChilledBags] = useState("0");
  const [frozenBags, setFrozenBags] = useState("0");
  const [locationChoice, setLocationChoice] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<{type:"ok"|"error";text:string}|null>(null);

  const load = useCallback(async (showBusy=true) => {
    if (!orderId) return;
    if (showBusy) setBusy(true);
    try {
      const [nextSession, workspace] = await Promise.all([
        staff.getPickingSession(orderId),
        staff.getFulfillmentWorkspace(branch.branch_id),
      ]);
      setSession(nextSession);
      setOrder(workspace.orders.find((entry)=>entry.order_id===orderId)||null);
      if (["packing","ready"].includes(nextSession.fulfillment_state)) {
        try { setStaging(await staff.getStagingSession(orderId)); }
        catch { setStaging(null); }
      } else {
        setStaging(null);
      }
      setMessage(null);
      if (nextSession.fulfillment_state === "picking") window.setTimeout(()=>scannerRef.current?.focus(),50);
    } catch(caught) {
      setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});
    } finally {
      if(showBusy)setBusy(false);
    }
  },[branch.branch_id,orderId]);

  useEffect(()=>{void load();},[load]);
  useOrderOperationsRealtime(branch.branch_id,useCallback(()=>{void load(false);},[load]));

  const matchedItem = useMemo(()=>{
    const code=barcode.trim();
    if(!code)return null;
    return session?.items.find((item)=>item.barcode===code&&remainingQuantity(item)>0)||null;
  },[barcode,session?.items]);

  const scan = async(event:FormEvent)=>{
    event.preventDefault();
    const code=barcode.trim();
    if(!code||acting)return;
    const target=session?.items.find((item)=>item.barcode===code&&remainingQuantity(item)>0);
    const quantity=target?.is_weight_based?Number(weight):null;
    if(target?.is_weight_based&&(!quantity||quantity<=0)){
      setMessage({type:"error",text:"الصنف وزني — اكتب الوزن الفعلي أولًا"});
      return;
    }
    setActing(true);
    try{
      const result=await staff.scanPickingBarcode(orderId,code,quantity);
      setMessage({type:"ok",text:`تم تسجيل ${result.line.product_name}`});
      setBarcode("");setWeight("");await load(false);
    }catch(caught){setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});}
    finally{setActing(false);window.setTimeout(()=>scannerRef.current?.focus(),50);}
  };

  const confirmManual=async(item:PickingItem)=>{
    const remaining=remainingQuantity(item);
    let quantity:number|null=null;
    if(item.is_weight_based){
      const input=window.prompt(`اكتب الوزن الفعلي لـ ${item.product_name} بالكيلو`,String(remaining));
      if(!input)return;
      quantity=Number(input);
      if(!quantity||quantity<=0)return;
    }
    setActing(true);
    try{await staff.confirmPickingItem(item.id,quantity);setMessage({type:"ok",text:`تم تأكيد ${item.product_name}`});await load(false);}
    catch(caught){setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});}
    finally{setActing(false);}
  };

  const shortage=async(item:PickingItem)=>{
    const remaining=remainingQuantity(item);
    if(remaining<=0)return;
    if(!window.confirm(`تسجيل المتبقي من ${item.product_name} كناقص؟`))return;
    setActing(true);
    try{await staff.markPickingShortage(item.id,remaining,"غير متوفر أثناء التجهيز");setMessage({type:"ok",text:`تم تسجيل النقص في ${item.product_name}`});await load(false);}
    catch(caught){setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});}
    finally{setActing(false);}
  };

  const startPacking=async()=>{
    setActing(true);
    try{await staff.startPacking(orderId,0);await load(false);}
    catch(caught){setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});}
    finally{setActing(false);}
  };

  const prepareBags=async()=>{
    const counts = [
      ["ambient",Math.max(0,Number(ambientBags)||0)],
      ["chilled",Math.max(0,Number(chilledBags)||0)],
      ["frozen",Math.max(0,Number(frozenBags)||0)],
    ] as Array<[StagingZone,number]>;
    const zones=counts.flatMap(([zone,count])=>Array.from({length:count},()=>zone));
    if(!zones.length){setMessage({type:"error",text:"حدد كيس واحد على الأقل"});return;}
    setActing(true);
    try{setStaging(await staff.prepareStagingBags(orderId,zones));setMessage({type:"ok",text:`تم تكوين ${zones.length} كيس. دلوقتي سكّن كل كيس في مكانه.`});}
    catch(caught){setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});}
    finally{setActing(false);}
  };

  const stageOne=async(bag:StagingBag)=>{
    const options=staging?.locations.filter((location)=>location.zone===bag.zone&&location.available_bags>0)||[];
    const locationCode=locationChoice[bag.id]||options[0]?.code||"";
    if(!locationCode){setMessage({type:"error",text:`مفيش مكان ${zoneLabel(bag.zone)} متاح حاليًا`});return;}
    setActing(true);
    try{setStaging(await staff.stageBag(orderId,bag.bag_code,locationCode));setMessage({type:"ok",text:`تم تسكين الكيس ${bag.bag_no} في ${locationCode}`});}
    catch(caught){setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});}
    finally{setActing(false);}
  };

  const unstageOne=async(bag:StagingBag)=>{
    setActing(true);
    try{setStaging(await staff.unstageBag(orderId,bag.bag_code));setMessage({type:"ok",text:`تم إلغاء تسكين الكيس ${bag.bag_no}`});}
    catch(caught){setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});}
    finally{setActing(false);}
  };

  const finalize=async()=>{
    setActing(true);
    try{await staff.finalizeStaging(orderId);navigate("/operations",{replace:true});}
    catch(caught){setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});}
    finally{setActing(false);}
  };

  if(busy&&!session)return <Loading/>;
  if(!session)return <><PageTitle title="جلسة التجهيز" subtitle="تعذر تحميل الطلب"/><Empty text="الطلب غير متاح لك أو لم يعد ضمن مهامك"/></>;

  const resolved=session.resolved_count;
  const progress=session.items_total?Math.round((resolved/session.items_total)*100):0;
  const allResolved=session.items_total>0&&resolved>=session.items_total;

  return <>
    <div className="picking-header"><button className="icon-btn" onClick={()=>navigate("/operations")}><ArrowRight/></button><div><small>{order?.display_id||"طلب تجهيز"}</small><h1>{order?.customer_name||"جلسة Picking"}</h1></div><span className="pill normal">{fulfillmentLabel(session.fulfillment_state)}</span></div>
    <section className="picking-progress-card"><div className="row"><strong>{resolved}/{session.items_total} سطر مكتمل</strong><strong>{progress}%</strong></div><div className="progress"><i style={{width:`${progress}%`}}/></div><div className="picking-summary"><span>مكتمل {session.items_picked}</span><span>نواقص {session.shortage_count}</span><span>بدائل {session.substitution_count}</span></div></section>
    {message&&<div className={message.type==="ok"?"success-box":"error-box"}>{message.text}</div>}

    {session.fulfillment_state==="picking"&&<form className="scanner-card" onSubmit={scan}><div className="scanner-title"><ScanLine/><div><strong>امسح باركود المنتج</strong><small>الماسح يكتب هنا مباشرة ثم Enter</small></div></div><div className="scanner-input-wrap"><Barcode/><input ref={scannerRef} value={barcode} onChange={(e)=>setBarcode(e.target.value)} placeholder="Barcode" inputMode="numeric" autoComplete="off"/></div>{matchedItem?.is_weight_based&&<label className="weight-field"><Scale/><span>الوزن الفعلي بالكيلو</span><input type="number" inputMode="decimal" min="0.001" step="0.001" value={weight} onChange={(e)=>setWeight(e.target.value)} placeholder={String(remainingQuantity(matchedItem))}/></label>}<button className="primary scanner-submit" disabled={!barcode.trim()||acting}>{acting?<Loader2 className="spin"/>:<ScanLine/>}تسجيل الصنف</button></form>}

    <div className="picking-items">{session.items.map((item)=>{
      const remaining=remainingQuantity(item);
      const resolvedLine=["picked","shortage","substituted"].includes(item.status);
      return <article className={`picking-item ${resolvedLine?"resolved":""}`} key={item.id}>{item.image_url?<img src={item.image_url} alt=""/>:<div className="item-placeholder"><PackageCheck/></div>}<div className="item-body"><div className="row"><strong>{item.product_name}</strong>{resolvedLine&&<CheckCircle2 className="resolved-icon"/>}</div><div className="item-badges">{item.is_weight_based&&<span><Scale/>وزني</span>}{item.is_bulk&&<span>جملة</span>}{!item.barcode&&<span className="warning">بدون باركود</span>}</div><p>المطلوب: <b>{formatQuantity(item.required_quantity,item.is_weight_based)}</b>{item.picked_quantity>0&&<> · تم: <b>{formatQuantity(item.picked_quantity,item.is_weight_based)}</b></>}{remaining>0&&<> · متبقي: <b>{formatQuantity(remaining,item.is_weight_based)}</b></>}</p>{item.barcode&&<small>{item.barcode}</small>}{!resolvedLine&&<div className="item-actions">{!item.barcode&&<button className="primary" disabled={acting} onClick={()=>void confirmManual(item)}>تأكيد يدوي</button>}{item.is_weight_based&&item.barcode&&<button disabled={acting} onClick={()=>{setBarcode(item.barcode||"");window.setTimeout(()=>scannerRef.current?.focus(),20);}}>إدخال الوزن</button>}<button className="danger-action" disabled={acting} onClick={()=>void shortage(item)}>غير متوفر</button></div>}</div></article>;
    })}</div>

    {session.fulfillment_state==="picking"&&allResolved&&<button className="primary full-action" disabled={acting} onClick={()=>void startPacking()}><PackageCheck/>بدء التعبئة</button>}

    {session.fulfillment_state==="packing"&&<section className="packing-card staging-card">
      <div className="row"><div><small>المرحلة الأخيرة داخل الفرع</small><h2>التعبئة والتسكين</h2></div><MapPin /></div>
      <p>كل كيس لازم يتسجل حسب حرارته ويتحط فعليًا في مكان Staging قبل ما الطلب يبقى جاهز للمندوب.</p>

      {(!staging||staging.summary.total_bags===0)?<>
        <div className="bag-plan-grid">
          <label><span>عادي</span><input type="number" min="0" max="20" inputMode="numeric" value={ambientBags} onChange={(e)=>setAmbientBags(e.target.value)}/></label>
          <label><span>مبرد</span><input type="number" min="0" max="20" inputMode="numeric" value={chilledBags} onChange={(e)=>setChilledBags(e.target.value)}/></label>
          <label><span>مجمد</span><input type="number" min="0" max="20" inputMode="numeric" value={frozenBags} onChange={(e)=>setFrozenBags(e.target.value)}/></label>
        </div>
        <button className="primary full-action" disabled={acting} onClick={()=>void prepareBags()}>{acting?<Loader2 className="spin"/>:<PackageCheck/>}إنشاء أكياس الطلب</button>
      </>:<>
        <div className="staging-summary"><div><strong>{staging.summary.staged_bags}/{staging.summary.total_bags}</strong><span>تم تسكينها</span></div><div><strong>{staging.summary.created_bags}</strong><span>في انتظار مكان</span></div></div>
        <div className="staging-bags">{staging.bags.map((bag)=>{
          const options=staging.locations.filter((location)=>location.zone===bag.zone && (location.available_bags>0||location.id===bag.location_id));
          const chosen=locationChoice[bag.id]||bag.location_code||options[0]?.code||"";
          return <article className={`staging-bag ${bag.status}`} key={bag.id}>
            <div className="row"><div><strong>كيس {bag.bag_no}</strong><small dir="ltr">{bag.bag_code}</small></div><span className={`zone-tag ${bag.zone}`}>{zoneLabel(bag.zone)}</span></div>
            {bag.status==="staged"?<><div className="staged-location"><MapPin/> {bag.location_label||bag.location_code}</div><button className="secondary" disabled={acting} onClick={()=>void unstageOne(bag)}>تغيير مكان التسكين</button></>:<div className="stage-controls"><select value={chosen} onChange={(e)=>setLocationChoice((current)=>({...current,[bag.id]:e.target.value}))}>{options.map((location)=><option key={location.id} value={location.code}>{location.label} · متاح {location.available_bags}</option>)}</select><button className="primary" disabled={acting||!chosen} onClick={()=>void stageOne({...bag})}>{acting?<Loader2 className="spin"/>:<MapPin/>}تسكين الكيس</button></div>}
          </article>;
        })}</div>
        <button className="primary full-action staging-finalize" disabled={acting||!staging.summary.ready_to_finalize} onClick={()=>void finalize()}>{acting?<Loader2 className="spin"/>:<CheckCircle2/>}{staging.summary.ready_to_finalize?"كل الأكياس في مكانها — الطلب جاهز للمندوب":`لسه ${staging.summary.created_bags} كيس محتاج تسكين`}</button>
      </>}
    </section>}
  </>;
}

function readStoredDevice() {
  const id = localStorage.getItem(DEVICE_ID_KEY);
  const token = localStorage.getItem(DEVICE_TOKEN_KEY);
  return id && token ? { id, token } : null;
}
function getDeviceKey() {
  let key = localStorage.getItem(DEVICE_KEY_KEY);
  if (!key) {
    key = `staff-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_KEY_KEY, key);
  }
  return key;
}
function attendanceError(code: string) {
  const map: Record<string,string> = {
    TRUSTED_DEVICE_REQUIRED:"الجهاز غير معتمد للحضور. اربطه من الإدارة أولًا.",
    DEVICE_PENDING_APPROVAL:"الجهاز في انتظار موافقة الإدارة.",
    DEVICE_REJECTED:"تم رفض الجهاز من الإدارة.",
    LOCATION_REQUIRED:"الموقع مطلوب لتسجيل الحضور.",
    LOCATION_ACCURACY_LOW:"دقة الموقع غير كافية. افتح GPS وحاول مرة أخرى.",
    OUTSIDE_GEOFENCE:"أنت خارج نطاق الفرع المسموح.",
    ACTIVE_SESSION_EXISTS:"عندك وردية مفتوحة بالفعل.",
    BRANCH_LOCATION_NOT_CONFIGURED:"موقع الفرع غير مضبوط في الإدارة.",
    EMPLOYEE_PROFILE_INACTIVE:"ملف الموظف غير نشط.",
    ATTENDANCE_REQUEST_TIMEOUT:"الاتصال استغرق وقتًا أطول من اللازم. تحقق من الإنترنت وحاول مرة أخرى.",
    PHOTO_UPLOAD_TIMEOUT:"رفع الصورة استغرق وقتًا أطول من اللازم. تحقق من الإنترنت وحاول مرة أخرى.",
    PHOTO_CLEANUP_TIMEOUT:"تعذر تنظيف صورة محاولة سابقة الآن، وسيعيد التطبيق المحاولة تلقائيًا.",
  };
  return map[code] || code || "تعذر تنفيذ الإجراء";
}
async function currentPosition() {
  const permission = await Geolocation.checkPermissions();
  if (permission.location !== "granted" && permission.coarseLocation !== "granted") await Geolocation.requestPermissions();
  const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy };
}

async function captureAttendanceSelfie() {
  const photo = await Camera.getPhoto({
    source: CameraSource.Camera,
    direction: CameraDirection.Front,
    resultType: CameraResultType.Uri,
    quality: 85,
    width: 1080,
    height: 1440,
    allowEditing: false,
    saveToGallery: false,
    promptLabelHeader: "صورة تحقق الحضور",
    promptLabelPhoto: "التقاط صورة",
    promptLabelCancel: "إلغاء",
  });
  if (!photo.webPath) throw new Error("PHOTO_CAPTURE_FAILED");

  const original = await fetch(photo.webPath).then((response) => response.blob());
  const bitmap = await createImageBitmap(original);
  const maxSide = 1080;
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("PHOTO_PROCESSING_FAILED");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PHOTO_PROCESSING_FAILED")), "image/jpeg", 0.82);
  });
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { blob, sha256 };
}

type OutsideAttendanceAttempt = {
  location: { latitude: number; longitude: number; accuracy: number };
  distanceM: number;
  radiusM: number;
};

function AttendancePage({ branch }: { branch: StaffBranch }) {
  const [data,setData] = useState<staff.AttendancePayload|null>(null);
  const [busy,setBusy]=useState(true);
  const [acting,setActing]=useState(false);
  const [deviceState,setDeviceState]=useState<"none"|"pending"|"trusted"|"rejected">("none");
  const [pairToken,setPairToken]=useState("");
  const [pairCode,setPairCode]=useState("");
  const [message,setMessage]=useState<{type:"ok"|"error";text:string}|null>(null);
  const [outside,setOutside]=useState<OutsideAttendanceAttempt|null>(null);
  const [exceptionReason,setExceptionReason]=useState("");
  const [selfie,setSelfie]=useState<{blob:Blob;sha256:string;preview:string}|null>(null);

  const clearOutside = useCallback(() => {
    setOutside(null);
    setExceptionReason("");
    setSelfie((current) => {
      if (current?.preview) URL.revokeObjectURL(current.preview);
      return null;
    });
  }, []);

  useEffect(() => () => {
    if (selfie?.preview) URL.revokeObjectURL(selfie.preview);
  }, [selfie?.preview]);

  const load = useCallback(async()=>{
    setBusy(true);
    try{
      setData(await staff.getAttendance(branch.branch_id));
      const device=readStoredDevice();
      if(!device){setDeviceState("none");}
      else{
        const state=await staff.validateStaffDevice(device.id,device.token);
        setDeviceState(state.trusted?"trusted":state.code==="DEVICE_PENDING_APPROVAL"?"pending":state.code==="DEVICE_REJECTED"?"rejected":"none");
      }
    }catch(caught){setMessage({type:"error",text:attendanceError(caught instanceof Error?caught.message:"")});}
    finally{setBusy(false);}
  },[branch.branch_id]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    void staff.cleanupAttendanceVerificationOrphans(branch.branch_id).catch(()=>undefined);
  },[branch.branch_id]);

  const pair=async()=>{
    if(!pairToken.trim()||pairCode.trim().length!==6)return;
    setActing(true);setMessage(null);
    try{
      const result=await staff.redeemStaffDevicePairing(pairToken.trim(),pairCode.trim(),getDeviceKey(),"هاتف الموظف");
      if(result.ok){
        localStorage.setItem(DEVICE_ID_KEY,result.device_id);
        localStorage.setItem(DEVICE_TOKEN_KEY,result.device_token);
        setDeviceState(result.approval_status==="approved"?"trusted":"pending");
        setMessage({type:"ok",text:result.approval_status==="approved"?"تم اعتماد الجهاز":"تم إرسال الجهاز للموافقة من الإدارة"});
      }
    }catch{setMessage({type:"error",text:"بيانات ربط الجهاز غير صحيحة أو انتهت صلاحيتها"});}
    finally{setActing(false);}
  };

  const attendanceAction=async(kind:"in"|"out")=>{
    const device=readStoredDevice();
    if(!device){setMessage({type:"error",text:"اربط الجهاز أولًا"});return;}
    setActing(true);setMessage(null);
    try{
      const location=await currentPosition();
      const result=kind==="in"
        ?await staff.attendanceCheckIn(branch.branch_id,device.id,device.token,location.latitude,location.longitude,location.accuracy)
        :await staff.attendanceCheckOut(String(data?.active_session?.id),device.id,device.token,location.latitude,location.longitude,location.accuracy);
      const ok=result.ok===true;
      if(kind==="in" && !ok && String(result.code)==="OUTSIDE_GEOFENCE" && result.exception_allowed===true){
        setOutside({
          location,
          distanceM:Number(result.distance_m||0),
          radiusM:Number(result.radius_m||data?.policy?.geofence_radius_m||0),
        });
        return;
      }
      if(!ok)throw new Error(String(result.code||"REQUEST_FAILED"));
      setMessage({type:"ok",text:kind==="in"?"تم تسجيل الحضور بنجاح":"تم تسجيل الانصراف بنجاح"});
      await load();
    }catch(caught){setMessage({type:"error",text:attendanceError(caught instanceof Error?caught.message:"")});}
    finally{setActing(false);}
  };

  const takeSelfie=async()=>{
    setActing(true);setMessage(null);
    try{
      const captured=await captureAttendanceSelfie();
      setSelfie((current)=>{
        if(current?.preview)URL.revokeObjectURL(current.preview);
        return {...captured,preview:URL.createObjectURL(captured.blob)};
      });
    }catch(caught){
      const code=caught instanceof Error?caught.message:"";
      setMessage({type:"error",text:code.includes("permission")?"اسمح للتطبيق باستخدام الكاميرا لالتقاط صورة التحقق.":"تعذر التقاط الصورة. حاول مرة أخرى في إضاءة واضحة."});
    }finally{setActing(false);}
  };

  const submitOutside=async()=>{
    if(!outside||exceptionReason.trim().length<5){
      setMessage({type:"error",text:"اكتب سببًا واضحًا لا يقل عن 5 أحرف."});return;
    }
    if(!selfie){
      setMessage({type:"error",text:"التقط صورة مباشرة قبل إرسال الطلب."});return;
    }
    const device=readStoredDevice();
    if(!device){setMessage({type:"error",text:"اربط الجهاز أولًا"});return;}
    setActing(true);setMessage(null);
    let uploadedPath:string|null=null;
    try{
      uploadedPath=await staff.uploadAttendanceVerificationSelfie(branch.branch_id,selfie.blob,selfie.sha256);
      const result=await staff.attendanceCheckIn(
        branch.branch_id,device.id,device.token,
        outside.location.latitude,outside.location.longitude,outside.location.accuracy,
        {
          exceptionReason:exceptionReason.trim(),
          verificationPhotoPath:uploadedPath,
          verificationPhotoSha256:selfie.sha256,
        },
      );
      if(String(result.code)!=="EXCEPTION_REQUESTED"){
        await staff.removeUnsubmittedAttendanceSelfie(uploadedPath).catch(()=>undefined);
        throw new Error(String(result.code||"REQUEST_FAILED"));
      }
      clearOutside();
      setMessage({type:"ok",text:"تم إرسال الطلب إلى تطبيق HR. ستُحذف صورة التحقق نهائيًا فور اتخاذ القرار."});
      await load();
    }catch(caught){
      if(uploadedPath)await staff.removeUnsubmittedAttendanceSelfie(uploadedPath).catch(()=>undefined);
      setMessage({type:"error",text:attendanceError(caught instanceof Error?caught.message:"")});
    }finally{setActing(false);}
  };

  if(busy&&!data)return <Loading/>;
  const active=data?.active_session;
  const hasPending=Boolean(data?.pending_exception);
  return <><PageTitle title="الحضور" subtitle="تسجيل آمن بالجهاز والموقع"/>
    {message&&<div className={message.type==="ok"?"success-box":"error-box"}>{message.text}</div>}
    {hasPending&&<div className="attendance-pending"><AlertTriangle/><div><strong>طلب الحضور خارج النطاق قيد المراجعة</strong><p>سيصلك إشعار بعد قرار المسؤول، وستُحذف صورة التحقق نهائيًا بعد القرار.</p></div></div>}
    <section className="attendance-card attendance-live"><div className="attendance-status-icon"><Clock3/></div><h2>{active?"أنت داخل الوردية":"جاهز لتسجيل الحضور"}</h2>{active?<><p>دخول: {new Date(active.check_in_at).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"})}</p>{Number(active.late_minutes||0)>0&&<span className="warning-pill">تأخير {active.late_minutes} دقيقة</span>}</>:<p>النظام سيتأكد من الجهاز وموقعك بالنسبة للفرع.</p>}<div className={`device-state ${deviceState}`}><Smartphone/><span>{deviceState==="trusted"?"الجهاز معتمد":deviceState==="pending"?"في انتظار اعتماد الجهاز":deviceState==="rejected"?"الجهاز مرفوض":"الجهاز غير مربوط"}</span></div>{deviceState==="trusted"&&(active?<button className="logout attendance-action" disabled={acting} onClick={()=>void attendanceAction("out")}><LogOut/>تسجيل الانصراف</button>:<button className="primary attendance-action" disabled={acting||hasPending} onClick={()=>void attendanceAction("in")}><LogIn/>{hasPending?"طلب قيد المراجعة":"تسجيل الحضور"}</button>)}</section>
    {deviceState==="none"&&<section className="pairing-card"><div className="row"><div><strong>ربط هذا الهاتف</strong><p>استخدم بيانات الربط التي يصدرها مسؤول الفرع.</p></div><Smartphone/></div><label>رمز الربط<input value={pairCode} onChange={(e)=>setPairCode(e.target.value.replace(/\D/g,"").slice(0,6))} inputMode="numeric" placeholder="6 أرقام"/></label><label>مفتاح الربط<input value={pairToken} onChange={(e)=>setPairToken(e.target.value)} dir="ltr" placeholder="Pairing token"/></label><button className="primary" disabled={acting||pairCode.length!==6||pairToken.length<32} onClick={()=>void pair()}>{acting?<Loader2 className="spin"/>:<Smartphone/>}ربط الجهاز</button></section>}
    <section className="attendance-history"><h2>آخر الحضور</h2>{(data?.recent_sessions||[]).slice(0,5).map((row:any)=><div className="history-row" key={String(row.id)}><div><strong>{new Date(String(row.check_in_at)).toLocaleDateString("ar-EG")}</strong><small>{new Date(String(row.check_in_at)).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"})}{row.check_out_at?` ← ${new Date(String(row.check_out_at)).toLocaleTimeString("ar-EG",{hour:"2-digit",minute:"2-digit"})}`:""}</small></div><span>{row.status==="active"?"مفتوحة":row.worked_minutes?`${row.worked_minutes} د`:"—"}</span></div>)}{!(data?.recent_sessions||[]).length&&<p className="muted">لا يوجد سجل حضور سابق.</p>}</section>

    {outside&&<div className="attendance-exception-overlay" role="dialog" aria-modal="true">
      <section className="attendance-exception-sheet">
        <div className="exception-sheet-head"><div><small>استثناء حضور</small><h2>أنت خارج نطاق الفرع</h2></div><MapPin/></div>
        <div className="exception-distance"><strong>{Math.round(outside.distanceM).toLocaleString("ar-EG")} متر</strong><span>المسافة عن الفرع · النطاق {Math.round(outside.radiusM).toLocaleString("ar-EG")} متر</span></div>
        <label>سبب تسجيل الحضور من خارج النطاق
          <textarea rows={3} value={exceptionReason} onChange={(e)=>setExceptionReason(e.target.value)} placeholder="مثال: تكليف خارجي من مدير الفرع"/>
        </label>
        <div className="selfie-capture">
          {selfie?<img src={selfie.preview} alt="معاينة صورة التحقق"/>:<div className="selfie-placeholder"><Smartphone/><span>الصورة تُلتقط الآن بالكاميرا فقط</span></div>}
          <button className="secondary" disabled={acting} onClick={()=>void takeSelfie()}>{selfie?"إعادة التقاط الصورة":"فتح الكاميرا الأمامية"}</button>
        </div>
        <p className="privacy-note"><ShieldCheck/>تُستخدم الصورة للمراجعة فقط، وتُحذف نهائيًا من التخزين بمجرد موافقة المسؤول أو رفضه.</p>
        <div className="exception-actions">
          <button className="secondary" disabled={acting} onClick={clearOutside}>إلغاء</button>
          <button className="primary" disabled={acting||!selfie||exceptionReason.trim().length<5} onClick={()=>void submitOutside()}>{acting?<Loader2 className="spin"/>:<Check/>}إرسال للموافقة</button>
        </div>
      </section>
    </div>}
  </>;
}

function severityLabel(value: string) {
  return value === "critical" ? "حرج" : value === "high" ? "مهم" : value === "normal" ? "عادي" : "معلومة";
}

function NotificationsPage({ branch, identity }: { branch: StaffBranch; identity: StaffIdentity }) {
  const navigate=useNavigate();
  const [filter,setFilter]=useState("all");
  const [data,setData]=useState<NotificationCenter|null>(null);
  const [busy,setBusy]=useState(true);
  const load=useCallback(async(show=true)=>{if(show)setBusy(true);try{setData(await staff.getNotifications(branch.branch_id,filter));}finally{if(show)setBusy(false);}},[branch.branch_id,filter]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{const channel=supabase.channel(`staff-center-${identity.user_id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"notification_realtime_signals_v2",filter:`recipient_user_id=eq.${identity.user_id}`},()=>void load(false)).subscribe();return()=>{void supabase.removeChannel(channel);};},[identity.user_id,load]);
  const open=async(item:NotificationItem)=>{if(!item.read_at)await staff.markNotificationRead(item.id);if(item.action_url&&item.action_url.startsWith("/")){const allowed=["/tasks","/operations","/attendance","/account","/notifications"];if(allowed.some((p)=>item.action_url?.startsWith(p)))navigate(item.action_url);}await load(false);};
  return <><div className="section-head notification-title"><PageTitle title="الإشعارات" subtitle="تنبيهات ومهام تحتاج انتباهك"/><button className="mark-read" onClick={async()=>{await staff.markAllNotificationsRead(branch.branch_id);await load(false);}}><Check/>قراءة الكل</button></div><div className="notification-summary"><div><strong>{data?.summary.unread||0}</strong><span>غير مقروء</span></div><div><strong>{data?.summary.action_required||0}</strong><span>يحتاج إجراء</span></div><div><strong>{data?.summary.critical||0}</strong><span>حرج</span></div></div><div className="chips">{[["all","الكل"],["unread","غير مقروء"],["critical","حرج"],["action","إجراء"]].map(([id,label])=><button key={id} className={filter===id?"active":""} onClick={()=>setFilter(id)}>{label}</button>)}</div>{busy?<Loading/>:<div className="notification-list">{(data?.items||[]).map((item)=><button key={item.id} className={`notification-card ${!item.read_at?"unread":""} ${item.severity}`} onClick={()=>void open(item)}><div className="notification-icon">{item.requires_action?<BellRing/>:<Bell/>}</div><div><div className="row"><strong>{item.title}</strong><span className="severity">{severityLabel(item.severity)}</span></div>{item.body&&<p>{item.body}</p>}<small>{new Date(item.created_at).toLocaleString("ar-EG")}</small></div></button>)}{!data?.items.length&&<Empty text="مفيش إشعارات في القسم ده"/>}</div>}</>;
}

function AccountPage({ identity, branch }: { identity: StaffIdentity; branch: StaffBranch }) {
  const navigate=useNavigate();
  return <><PageTitle title="حسابي" subtitle="هويتك وصلاحياتك في الفرع"/><section className="profile"><div className="avatar">{identity.name.slice(0,1)}</div><h2>{identity.name}</h2><p>{branch.role_name_ar} · {branch.branch_name}</p><div className="permission-list">{branch.permissions.slice(0,8).map((permission)=><span key={permission}>{permission}</span>)}</div><button className="logout" onClick={async()=>{await supabase.auth.signOut();navigate("/login",{replace:true});}}><LogOut/>تسجيل الخروج</button></section></>;
}

const PageTitle=({title,subtitle}:{title:string;subtitle:string})=><div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div></div>;
const Loading=()=> <div className="loading"><Loader2 className="spin"/><span>جاري التحميل…</span></div>;
const Empty=({text}:{text:string})=><div className="empty"><UsersRound/><p>{text}</p></div>;

function AuthenticatedApp({state}:{state:ReturnType<typeof useStaffSession>}) {
  if(state.loading)return <Loading/>;
  if(!state.identity||!state.branch)return <Navigate to="/login" replace/>;
  const props={identity:state.identity,branch:state.branch};
  return <Shell {...props}><Routes><Route path="/" element={<HomePage {...props}/>}/><Route path="/tasks" element={<TasksPage branch={state.branch}/>}/><Route path="/operations" element={<OperationsPage branch={state.branch} identity={state.identity}/>}/><Route path="/operations/:orderId" element={<PickingPage branch={state.branch}/>}/><Route path="/attendance" element={<AttendancePage branch={state.branch}/>}/><Route path="/notifications" element={<NotificationsPage branch={state.branch} identity={state.identity}/>}/><Route path="/account" element={<AccountPage {...props}/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Shell>;
}

export default function App(){
  return <BrowserRouter><SessionContext>{(state)=><Routes><Route path="/login" element={state.identity?<Navigate to="/" replace/>:<Login/>}/><Route path="/*" element={<AuthenticatedApp state={state}/>}/></Routes>}</SessionContext></BrowserRouter>;
}

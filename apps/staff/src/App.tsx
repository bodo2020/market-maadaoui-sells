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
import { Capacitor } from "@capacitor/core";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Barcode,
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  CalendarDays,
  ClipboardList,
  Clock3,
  FileText,
  Home,
  IdCard,
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
  Send,
  ShieldCheck,
  Smartphone,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { googlePasswordManager } from "./googlePasswordManager";
import { getPersistentStaffDeviceIdentity } from "./deviceIdentity";
import {
  disableStaffPush,
  enableStaffPush,
  getStaffPushPermissionState,
  isStaffPushSupported,
  setupStaffPush,
} from "./staffPush";
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
  StaffSelfServiceSnapshot,
  StaffSelfServiceRequest,
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
      try {
        await restoreKnownStaffDevice(branch.branch_id);
      } catch {
        // Device recovery must never block a valid staff login.
      }
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
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [error, setError] = useState("");

  const fillSavedPassword = useCallback(async () => {
    if (Capacitor.getPlatform() !== "android") return;
    setCredentialBusy(true);
    try {
      const saved = await googlePasswordManager.getPassword();
      if (saved?.username) setUsername(saved.username);
      if (saved?.password) setPassword(saved.password);
    } catch {
      // No saved credential or the user dismissed the account picker.
    } finally {
      setCredentialBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fillSavedPassword(); }, 250);
    return () => window.clearTimeout(timer);
  }, [fillSavedPassword]);

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
    if (Capacitor.getPlatform() === "android") {
      try {
        await googlePasswordManager.savePassword({ username: value, password });
      } catch (saveError) {
        console.warn("Google Password Manager save was skipped", saveError);
      }
    }
    navigate("/", { replace: true });
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">م</div>
        <h1>المعداوي Staff</h1>
        <p>شغلك اليومي في مكان واحد</p>
        <form onSubmit={submit} autoComplete="on">
          <label htmlFor="staff-username">اسم المستخدم<input id="staff-username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required /></label>
          <label htmlFor="staff-password">كلمة المرور<input id="staff-password" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {Capacitor.getPlatform()==="android"&&<button type="button" className="saved-credential-button" disabled={credentialBusy||busy} onClick={()=>void fillSavedPassword()}>{credentialBusy?<Loader2 className="spin"/>:<ShieldCheck/>}استخدام كلمة مرور محفوظة</button>}
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
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("staff-push-received", refresh);
    return () => window.removeEventListener("staff-push-received", refresh);
  }, [load]);
  return unread;
}

function useOnlineStatus() {
  const [online,setOnline]=useState(()=>typeof navigator==="undefined"?true:navigator.onLine);
  useEffect(()=>{
    const onOnline=()=>setOnline(true);
    const onOffline=()=>setOnline(false);
    window.addEventListener("online",onOnline);
    window.addEventListener("offline",onOffline);
    return ()=>{window.removeEventListener("online",onOnline);window.removeEventListener("offline",onOffline);};
  },[]);
  return online;
}

function useStaffPushBridge(identity: StaffIdentity, branch: StaffBranch) {
  const navigate = useNavigate();
  useEffect(() => {
    let dispose: (() => void | Promise<void>) | null = null;
    let cancelled = false;
    void setupStaffPush({
      onOpen: (path) => navigate(path),
      onReceived: () => window.dispatchEvent(new Event("staff-push-received")),
    }).then((cleanup) => {
      if (cancelled) void cleanup();
      else dispose = cleanup;
    });
    return () => {
      cancelled = true;
      if (dispose) void dispose();
    };
  }, [branch.branch_id, identity.user_id, navigate]);
}

function Shell({ identity, branch, children }: { identity: StaffIdentity; branch: StaffBranch; children: ReactNode }) {
  useStaffPushBridge(identity, branch);
  const unread = useNotificationBadge(identity, branch);
  const online = useOnlineStatus();
  const canOperate = branch.permissions.includes("online_orders.prepare") || branch.permissions.includes("online_orders.manage");
  const canInventory = branch.permissions.some((permission) => permission.startsWith("inventory."));
  const navItems = [
    { to: "/", Icon: Home, label: "الرئيسية" },
    { to: "/tasks", Icon: ClipboardList, label: "المهام" },
    ...(canOperate ? [{ to: "/operations", Icon: PackageCheck, label: "الطلبات" }] : []),
    ...(canInventory ? [{ to: "/inventory", Icon: Layers3, label: "المخزون" }] : []),
    { to: "/attendance", Icon: Clock3, label: "الحضور" },
    { to: "/account", Icon: IdCard, label: "خدماتي" },
  ];

  return (
    <div className="app-shell">
      <header>
        <div><small>{branch.branch_name} · {branch.role_name_ar}</small><strong>أهلًا، {identity.name}</strong></div>
        <NavLink to="/notifications" className="icon-btn notification-button" aria-label="الإشعارات">
          <Bell />{unread > 0 && <b>{unread > 99 ? "99+" : unread}</b>}
        </NavLink>
      </header>
      {!online&&<div className="offline-banner"><AlertTriangle/><div><strong>أنت بدون اتصال</strong><span>هتشوف آخر بيانات محفوظة. التنفيذ والتأكيد هيرجع لما الإنترنت يرجع.</span></div></div>}
      <main className="content">{children}</main>
      <nav className="bottom-nav" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
        {navItems.map(({ to, Icon, label }) => (
          <NavLink key={to} to={to} end={to === "/"}><Icon size={20} /><span>{label}</span></NavLink>
        ))}
      </nav>
    </div>
  );
}

function HomePage({ branch, identity }: { identity: StaffIdentity; branch: StaffBranch }) {
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
  const mine = tasks.filter((task) => task.is_mine).length;
  const current = tasks.find((task) => task.is_mine) || tasks[0];
  const canPrepare = branch.permissions.includes("online_orders.prepare") || branch.permissions.includes("online_orders.manage");
  const canInventory = branch.permissions.some((permission) => permission.startsWith("inventory."));
  const canApprove = branch.permissions.some((permission) =>
    permission.includes("approve")
    || permission.includes("review")
    || permission === "hr.approvals.view"
    || permission === "finance.manage"
    || permission === "pos.manage_shifts"
    || permission === "inventory.manage"
    || permission === "online_orders.manage"
  );
  const canManager = identity.is_super_admin || branch.permissions.includes("hr.view") || branch.permissions.includes("branch.manage_staff");
  const canHandoffs = branch.permissions.includes("finance.manage") || branch.permissions.includes("finance.view") || branch.permissions.includes("pos.manage_shifts");

  return (
    <>
      <section className="hero">
        <small>{branch.role_name_ar} · {branch.branch_name}</small>
        <h1>يومك يا {identity.name.split(" ")[0]}</h1>
        <p>{attendance?.active_session ? "وردية نشطة — ركّز على أولويتك الحالية" : "ابدأ ورديتك وبعدها هتظهر لك الأولويات المطلوبة حسب دورك"}</p>
      </section>

      <div className="stats">
        <div><strong>{mine}</strong><span>مهامي</span></div>
        <div><strong>{overdue}</strong><span>متأخرة</span></div>
        <div><strong>{attendance?.active_session ? "نشط" : "—"}</strong><span>الوردية</span></div>
      </div>

      <section className="section staff-home-shortcuts">
        <div className="section-head"><h2>اختصارات شغلك</h2></div>
        <div className="actions staff-home-actions">
          <NavLink className="secondary" to="/tasks"><ClipboardList />المهام</NavLink>
          {canPrepare && <NavLink className="secondary" to="/operations"><PackageCheck />تجهيز الطلبات</NavLink>}
          {canInventory && <NavLink className="secondary" to="/inventory"><Layers3 />المخزون والجرد</NavLink>}
          {canApprove && <NavLink className="secondary" to="/approvals"><ShieldCheck />الموافقات</NavLink>}
          {canManager && <NavLink className="secondary" to="/manager"><UsersRound />فريقي اليوم</NavLink>}
          {canHandoffs && <NavLink className="secondary" to="/handoffs"><Banknote />تسليمات الوردية</NavLink>}
          <NavLink className="secondary" to="/attendance"><Clock3 />الحضور والوردية</NavLink>
          <NavLink className="secondary" to="/account"><IdCard />خدمات الموظف</NavLink>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>الأولوية الآن</h2><button className="icon-btn" onClick={() => void load()}>{busy ? <Loader2 className="spin" /> : <RefreshCw />}</button></div>
        {current ? <TaskCard task={current} onChanged={load} /> : <Empty text="مفيش مهام محتاجة منك إجراء حاليًا" />}
      </section>
    </>
  );
}

function TaskCard({ task, onChanged }: { task: staff.OperationsTask; onChanged: () => Promise<void> }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const inventoryWorkflow = staff.isInventoryTask(task) || staff.isInventoryTransferTask(task);
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
        {inventoryWorkflow
          ? <button className="primary" onClick={() => navigate(`/inventory?task=${task.id}`)}><Layers3 />فتح مهمة المخزون</button>
          : <>
            {task.status === "open" && task.can_claim && <button className="primary" onClick={() => void act("claim")} disabled={busy}>استلام المهمة</button>}
            {task.is_mine && task.status === "claimed" && <button className="primary" onClick={() => void act("start")} disabled={busy}><Play />بدء التنفيذ</button>}
            {task.is_mine && task.status === "in_progress" && <button className="primary" onClick={() => void act("complete")} disabled={busy}><CheckCircle2 />تم التنفيذ</button>}
          </>}
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

function useOrderOperationsRealtime(branchId: string, refresh: () => void, orderId?: string) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let timer: number | null = null;
    const scheduleRefresh = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        refreshRef.current();
      }, 300);
    };

    const signalFilter = orderId ? `order_id=eq.${orderId}` : `branch_id=eq.${branchId}`;
    const channelKey = orderId ? `${branchId}-${orderId}` : branchId;
    const channel = supabase.channel(`staff-order-ops-${channelKey}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "order_operations_realtime_signals_v1",
        filter: signalFilter,
      }, scheduleRefresh)
      .subscribe();

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [branchId, orderId]);
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
  return ({ awaiting_confirmation:"بانتظار التأكيد", queued:"في الطابور", picking:"جاري التجهيز", packing:"جاري التجهيز", ready:"جاهز", handed_over:"تم التسليم للمندوب" } as Record<string,string>)[value] || value;
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
    ["FULFILLMENT_ITEMS_INCOMPLETE","لسه فيه أصناف لم يتم حسمها"],
    ["ORDER_NOT_IN_PREPARING","حالة الطلب اتغيرت. حدّث الجلسة وحاول مرة أخرى."],
    ["FULFILLMENT_PERMISSION_DENIED","حسابك لا يملك صلاحية إنهاء تجهيز الطلب"],
  ];
  return pairs.find(([code]) => message.includes(code))?.[1] || "تعذر تنفيذ الإجراء. حدّث الجلسة وحاول مرة أخرى.";
}

function remainingQuantity(item: PickingItem) {
  return Math.max(0, Number(item.required_quantity) - Number(item.picked_quantity) - Number(item.shortage_quantity) - Number(item.substitution_quantity));
}
function formatQuantity(value: number, weight: boolean) {
  return weight ? `${Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} كجم` : Number(value).toLocaleString("ar-EG");
}
function allItemsResolved(session: PickingSession | null) {
  if (!session) return false;
  return session.items_total > 0 && session.resolved_count >= session.items_total;
}

function mergePickingLine(session: PickingSession, line: PickingItem) {
  const items = session.items.map((item) => item.id === line.id ? { ...item, ...line } : item);
  const itemsPicked = items.filter((item) => item.status === "picked").length;
  const shortageCount = items.filter((item) => item.status === "shortage").length;
  const substitutionCount = items.filter((item) => item.status === "substituted").length;
  const resolvedCount = items.filter((item) => remainingQuantity(item) <= 0.0005).length;
  return {
    ...session,
    items,
    items_picked: itemsPicked,
    shortage_count: shortageCount,
    substitution_count: substitutionCount,
    resolved_count: resolvedCount,
  };
}
function PickingPage({ branch }: { branch: StaffBranch }) {
  const navigate = useNavigate();
  const { orderId = "" } = useParams();
  const scannerRef = useRef<HTMLInputElement>(null);
  const scanLockRef = useRef(false);
  const [session, setSession] = useState<PickingSession | null>(null);
  const [order, setOrder] = useState<FulfillmentOrder | null>(null);
  const [barcode, setBarcode] = useState("");
  const [weight, setWeight] = useState("");
  const [busy, setBusy] = useState(true);
  const [scanBusy, setScanBusy] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);
  const [itemBusy, setItemBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{type:"ok"|"error";text:string}|null>(null);

  const refreshSession = useCallback(async (showError = false) => {
    if (!orderId) return null;
    try {
      const nextSession = await staff.getPickingSession(orderId);
      setSession(nextSession);
      return nextSession;
    } catch (caught) {
      if (showError) {
        setMessage({type:"error",text:pickingError(caught instanceof Error ? caught.message : "")});
      }
      return null;
    }
  }, [orderId]);

  const load = useCallback(async () => {
    if (!orderId) return;
    setBusy(true);
    try {
      const [nextSession, workspace] = await Promise.all([
        staff.getPickingSession(orderId),
        staff.getFulfillmentWorkspace(branch.branch_id),
      ]);
      setSession(nextSession);
      setOrder(workspace.orders.find((entry)=>entry.order_id===orderId)||null);
      if (nextSession.fulfillment_state === "picking" && !Capacitor.isNativePlatform()) {
        window.setTimeout(()=>scannerRef.current?.focus(),50);
      }
    } catch(caught) {
      setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});
    } finally {
      setBusy(false);
    }
  },[branch.branch_id,orderId]);

  useEffect(()=>{void load();},[load]);

  useOrderOperationsRealtime(
    branch.branch_id,
    useCallback(()=>{void refreshSession(false);},[refreshSession]),
    orderId,
  );

  const matchedItem = useMemo(()=>{
    const code=barcode.trim();
    if(!code)return null;
    return session?.items.find((item)=>item.barcode===code&&remainingQuantity(item)>0)||null;
  },[barcode,session?.items]);

  const scan = async(event:FormEvent)=>{
    event.preventDefault();
    const code=barcode.trim();
    if(!code||scanBusy||finishBusy||itemBusy||scanLockRef.current)return;
    const target=session?.items.find((item)=>item.barcode===code&&remainingQuantity(item)>0);
    const quantity=target?.is_weight_based?Number(weight):null;
    if(target?.is_weight_based&&(!quantity||quantity<=0)){
      setMessage({type:"error",text:"الصنف وزني — اكتب الوزن الفعلي أولًا"});
      return;
    }

    scanLockRef.current=true;
    setScanBusy(true);
    setMessage(null);
    try{
      const result=await staff.scanPickingBarcode(orderId,code,quantity);
      const beforeRemaining = target ? remainingQuantity(target) : 0;
      const addedQuantity = target?.is_weight_based ? Number(quantity || 0) : 1;
      const completesLine = Boolean(target && beforeRemaining <= addedQuantity + 0.0005);
      const completesOrder = Boolean(session && completesLine && session.resolved_count + 1 >= session.items_total);

      if(session) setSession(mergePickingLine(session,result.line));
      setBarcode("");
      setWeight("");
      setMessage({
        type:"ok",
        text:completesOrder
          ? `تم تسجيل ${result.line.product_name} — اكتمل تجهيز كل الأصناف`
          : `تم تسجيل ${result.line.product_name}`,
      });

      // The RPC already returns the updated line. Reconcile the full session in the
      // background instead of blocking the scanner on an expensive workspace reload.
      void refreshSession(false);
    }catch(caught){
      const errorMessage=caught instanceof Error?caught.message:"";
      if(errorMessage.includes("ITEM_ALREADY_COMPLETE")){
        setBarcode("");
        setWeight("");
        setMessage({type:"ok",text:"الصنف مكتمل بالفعل — تم تحديث الجلسة"});
        void refreshSession(false);
      }else{
        setMessage({type:"error",text:pickingError(errorMessage)});
      }
    } finally {
      scanLockRef.current=false;
      setScanBusy(false);
      if(Capacitor.isNativePlatform()) scannerRef.current?.blur();
      else window.setTimeout(()=>scannerRef.current?.focus(),50);
    }
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
    setItemBusy(item.id);
    setMessage(null);
    try{
      await staff.confirmPickingItem(item.id,quantity);
      setMessage({type:"ok",text:`تم تأكيد ${item.product_name}`});
      await refreshSession(false);
    } catch(caught) {
      setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});
    } finally {
      setItemBusy(null);
    }
  };

  const shortage=async(item:PickingItem)=>{
    const remaining=remainingQuantity(item);
    if(remaining<=0)return;
    if(!window.confirm(`تسجيل المتبقي من ${item.product_name} كناقص؟`))return;
    setItemBusy(item.id);
    setMessage(null);
    try{
      await staff.markPickingShortage(item.id,remaining,"غير متوفر أثناء التجهيز");
      setMessage({type:"ok",text:`تم تسجيل النقص في ${item.product_name}`});
      await refreshSession(false);
    } catch(caught) {
      setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});
    } finally {
      setItemBusy(null);
    }
  };

  const finishOrder=async()=>{
    if(!allItemsResolved(session)||scanBusy||itemBusy||finishBusy)return;
    setFinishBusy(true);
    setMessage(null);
    try{
      await staff.markReady(orderId,0);
      setMessage({type:"ok",text:"تم إنهاء التجهيز والطلب جاهز للاستلام"});
      navigate("/operations",{replace:true});
    }catch(caught){
      setMessage({type:"error",text:pickingError(caught instanceof Error?caught.message:"")});
      void refreshSession(false);
    }finally{
      setFinishBusy(false);
    }
  };

  if(busy&&!session)return <Loading/>;
  if(!session)return <><PageTitle title="جلسة التجهيز" subtitle="تعذر تحميل الطلب"/><Empty text="الطلب غير متاح لك أو لم يعد ضمن مهامك"/></>;

  const resolved=session.resolved_count;
  const progress=session.items_total?Math.round((resolved/session.items_total)*100):0;
  const allResolved=session.items_total>0&&resolved>=session.items_total;
  const anyItemBusy=Boolean(itemBusy);

  return <>
    <div className="picking-header"><button className="icon-btn" onClick={()=>navigate("/operations")}><ArrowRight/></button><div><small>{order?.display_id||"طلب تجهيز"}</small><h1>{order?.customer_name||"جلسة Picking"}</h1></div><span className="pill normal">{fulfillmentLabel(session.fulfillment_state)}</span></div>
    <section className="picking-progress-card"><div className="row"><strong>{resolved}/{session.items_total} سطر مكتمل</strong><strong>{progress}%</strong></div><div className="progress"><i style={{width:`${progress}%`}}/></div><div className="picking-summary"><span>مكتمل {session.items_picked}</span><span>نواقص {session.shortage_count}</span><span>بدائل {session.substitution_count}</span></div></section>
    {message&&<div className={message.type==="ok"?"success-box":"error-box"}>{message.text}</div>}

    {session.fulfillment_state==="picking"&&<form className="scanner-card" onSubmit={scan}><div className="scanner-title"><ScanLine/><div><strong>امسح باركود المنتج</strong><small>الماسح يكتب هنا مباشرة ثم Enter</small></div></div><div className="scanner-input-wrap"><Barcode/><input ref={scannerRef} value={barcode} onChange={(e)=>setBarcode(e.target.value)} placeholder="Barcode" inputMode="numeric" autoComplete="off"/></div>{matchedItem?.is_weight_based&&<label className="weight-field"><Scale/><span>الوزن الفعلي بالكيلو</span><input data-weight-input type="number" inputMode="decimal" min="0.001" step="0.001" value={weight} onChange={(e)=>setWeight(e.target.value)} placeholder={String(remainingQuantity(matchedItem))}/></label>}<button className="primary scanner-submit" disabled={!barcode.trim()||scanBusy||finishBusy||anyItemBusy}>{scanBusy?<Loader2 className="spin"/>:<ScanLine/>}تسجيل الصنف</button></form>}

    <div className="picking-items">{session.items.map((item)=>{
      const remaining=remainingQuantity(item);
      const resolvedLine=["picked","shortage","substituted"].includes(item.status);
      const thisItemBusy=itemBusy===item.id;
      return <article className={`picking-item ${resolvedLine?"resolved":""}`} key={item.id}>{item.image_url?<img src={item.image_url} alt=""/>:<div className="item-placeholder"><PackageCheck/></div>}<div className="item-body"><div className="row"><strong>{item.product_name}</strong>{resolvedLine&&<CheckCircle2 className="resolved-icon"/>}</div><div className="item-badges">{item.is_weight_based&&<span><Scale/>وزني</span>}{item.is_bulk&&<span>جملة</span>}{!item.barcode&&<span className="warning">بدون باركود</span>}</div><p>المطلوب: <b>{formatQuantity(item.required_quantity,item.is_weight_based)}</b>{item.picked_quantity>0&&<> · تم: <b>{formatQuantity(item.picked_quantity,item.is_weight_based)}</b></>}{remaining>0&&<> · متبقي: <b>{formatQuantity(remaining,item.is_weight_based)}</b></>}</p>{item.barcode&&<small>{item.barcode}</small>}{!resolvedLine&&<div className="item-actions">{!item.barcode&&<button className="primary" disabled={thisItemBusy||scanBusy||finishBusy} onClick={()=>void confirmManual(item)}>{thisItemBusy?<Loader2 className="spin"/>:"تأكيد يدوي"}</button>}{item.is_weight_based&&item.barcode&&<button disabled={thisItemBusy||scanBusy||finishBusy} onClick={()=>{setBarcode(item.barcode||"");window.setTimeout(()=>document.querySelector<HTMLInputElement>("[data-weight-input]")?.focus(),30);}}>إدخال الوزن</button>}<button className="danger-action" disabled={thisItemBusy||scanBusy||finishBusy} onClick={()=>void shortage(item)}>{thisItemBusy?<Loader2 className="spin"/>:"غير متوفر"}</button></div>}</div></article>;
    })}</div>

    {["picking","packing"].includes(session.fulfillment_state)&&allResolved&&<button className="primary full-action" disabled={finishBusy||scanBusy||anyItemBusy} onClick={()=>void finishOrder()}>{finishBusy?<Loader2 className="spin"/>:<CheckCircle2/>}إنهاء التجهيز — الطلب جاهز</button>}
  </>;
}
function readStoredDevice() {
  const id = localStorage.getItem(DEVICE_ID_KEY);
  const token = localStorage.getItem(DEVICE_TOKEN_KEY);
  return id && token ? { id, token } : null;
}
function storeTrustedDevice(id: string, token: string) {
  localStorage.setItem(DEVICE_ID_KEY,id);
  localStorage.setItem(DEVICE_TOKEN_KEY,token);
}

async function getDeviceIdentity() {
  const identity=await getPersistentStaffDeviceIdentity();
  localStorage.setItem(DEVICE_KEY_KEY,identity.deviceKey);
  return identity;
}

type DeviceTrustState="none"|"pending"|"trusted"|"rejected";

async function restoreKnownStaffDevice(branchId:string):Promise<DeviceTrustState>{
  const identity=await getDeviceIdentity();
  const stored=readStoredDevice();

  if(stored){
    const state=await staff.validateStaffDevice(stored.id,stored.token);
    if(state.trusted){
      try{
        const bound=await staff.bindStaffDeviceFingerprint(
          stored.id,stored.token,identity.deviceKey,identity.metadata,
        );
        if(!bound.requires_recovery)return "trusted";

        const recovered=await staff.recoverStaffDevice(
          branchId,identity.deviceKey,identity.deviceName,identity.platform,identity.metadata,
        );
        if(recovered.trusted&&recovered.device_id&&recovered.device_token){
          storeTrustedDevice(recovered.device_id,recovered.device_token);
          return "trusted";
        }
        return recovered.code==="DEVICE_PENDING_APPROVAL"
          ?"pending"
          :recovered.code==="DEVICE_REJECTED"
            ?"rejected"
            :"none";
      }catch{
        // If migration to the persistent fingerprint fails, the validated
        // current device token remains authoritative.
        return "trusted";
      }
    }

    const recovered=await staff.recoverStaffDevice(
      branchId,identity.deviceKey,identity.deviceName,identity.platform,identity.metadata,
    );
    if(recovered.trusted&&recovered.device_id&&recovered.device_token){
      storeTrustedDevice(recovered.device_id,recovered.device_token);
      return "trusted";
    }
    if(recovered.code==="DEVICE_PENDING_APPROVAL"||state.code==="DEVICE_PENDING_APPROVAL")return "pending";
    if(recovered.code==="DEVICE_REJECTED"||state.code==="DEVICE_REJECTED")return "rejected";
    return "none";
  }

  const recovered=await staff.recoverStaffDevice(
    branchId,identity.deviceKey,identity.deviceName,identity.platform,identity.metadata,
  );
  if(recovered.trusted&&recovered.device_id&&recovered.device_token){
    storeTrustedDevice(recovered.device_id,recovered.device_token);
    return "trusted";
  }
  if(recovered.code==="DEVICE_PENDING_APPROVAL")return "pending";
  if(recovered.code==="DEVICE_REJECTED")return "rejected";
  return "none";
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
      const [attendance,nextDeviceState] = await Promise.all([
        staff.getAttendance(branch.branch_id),
        restoreKnownStaffDevice(branch.branch_id),
      ]);
      setData(attendance);
      setDeviceState(nextDeviceState);
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
      const identity=await getDeviceIdentity();
      const result=await staff.redeemStaffDevicePairing(
        pairToken.trim(),pairCode.trim(),identity.deviceKey,identity.deviceName,identity.platform,
      );
      if(result.ok){
        storeTrustedDevice(result.device_id,result.device_token);
        setDeviceState(result.approval_status==="approved"?"trusted":"pending");
        setMessage({type:"ok",text:result.approval_status==="approved"?"تم اعتماد الجهاز وربطه ببصمته الثابتة":"تم إرسال الجهاز للموافقة من الإدارة"});
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
  const open=async(item:NotificationItem)=>{if(!item.read_at)await staff.markNotificationRead(item.id);if(item.action_url&&item.action_url.startsWith("/")){if(item.action_url.startsWith("/inventory-transfers")||item.action_url.startsWith("/tasks?type=inventory"))navigate("/inventory");else{const allowed=["/tasks","/operations","/inventory","/attendance","/account","/notifications"];if(allowed.some((p)=>item.action_url?.startsWith(p)))navigate(item.action_url);}}await load(false);};
  return <><div className="section-head notification-title"><PageTitle title="الإشعارات" subtitle="تنبيهات ومهام تحتاج انتباهك"/><button className="mark-read" onClick={async()=>{await staff.markAllNotificationsRead(branch.branch_id);await load(false);}}><Check/>قراءة الكل</button></div><div className="notification-summary"><div><strong>{data?.summary.unread||0}</strong><span>غير مقروء</span></div><div><strong>{data?.summary.action_required||0}</strong><span>يحتاج إجراء</span></div><div><strong>{data?.summary.critical||0}</strong><span>حرج</span></div></div><div className="chips">{[["all","الكل"],["unread","غير مقروء"],["critical","حرج"],["action","إجراء"]].map(([id,label])=><button key={id} className={filter===id?"active":""} onClick={()=>setFilter(id)}>{label}</button>)}</div>{busy?<Loading/>:<div className="notification-list">{(data?.items||[]).map((item)=><button key={item.id} className={`notification-card ${!item.read_at?"unread":""} ${item.severity}`} onClick={()=>void open(item)}><div className="notification-icon">{item.requires_action?<BellRing/>:<Bell/>}</div><div><div className="row"><strong>{item.title}</strong><span className="severity">{severityLabel(item.severity)}</span></div>{item.body&&<p>{item.body}</p>}<small>{new Date(item.created_at).toLocaleString("ar-EG")}</small></div></button>)}{!data?.items.length&&<Empty text="مفيش إشعارات في القسم ده"/>}</div>}</>;
}


const eanLeftOdd:Record<string,string>={"0":"0001101","1":"0011001","2":"0010011","3":"0111101","4":"0100011","5":"0110001","6":"0101111","7":"0111011","8":"0110111","9":"0001011"};
const eanLeftEven:Record<string,string>={"0":"0100111","1":"0110011","2":"0011011","3":"0100001","4":"0011101","5":"0111001","6":"0000101","7":"0010001","8":"0001001","9":"0010111"};
const eanRight:Record<string,string>={"0":"1110010","1":"1100110","2":"1101100","3":"1000010","4":"1011100","5":"1001110","6":"1010000","7":"1000100","8":"1001000","9":"1110100"};
const eanParity:Record<string,string>={"0":"OOOOOO","1":"OOEOEE","2":"OOEEOE","3":"OOEEEO","4":"OEOOEE","5":"OEEOOE","6":"OEEEOO","7":"OEOEOE","8":"OEOEEO","9":"OEEOEO"};

function EmployeeBarcode({value}:{value:string}) {
  if(!/^\d{13}$/.test(value))return <div className="employee-barcode-fallback">{value||"باركود غير متاح"}</div>;
  const parity=eanParity[value[0]];
  let bits="101";
  for(let i=1;i<=6;i++)bits+=(parity[i-1]==="O"?eanLeftOdd:eanLeftEven)[value[i]];
  bits+="01010";
  for(let i=7;i<=12;i++)bits+=eanRight[value[i]];
  bits+="101";
  return <div className="employee-barcode" aria-label={`باركود الموظف ${value}`}>
    <svg viewBox={`0 0 ${bits.length} 58`} role="img">{[...bits].map((bit,index)=>bit==="1"?<rect key={index} x={index} y="0" width="1" height="50"/>:null)}</svg>
    <strong dir="ltr">{value}</strong>
  </div>;
}

function requestTypeLabel(value:string){
  return value==="leave"?"إجازة":value==="salary_advance"?"سلفة":value==="attendance_correction"?"تصحيح حضور":value;
}
function requestStatusLabel(value:string){
  return value==="pending"?"قيد المراجعة":value==="approved"?"موافق عليه":value==="rejected"?"مرفوض":value==="cancelled"?"ملغي":value==="fulfilled"?"تم التنفيذ":value;
}


function inventoryTaskLabel(task: staff.OperationsTask) {
  if (task.source_kind === "inventory_count") return "جرد";
  if (task.source_kind === "inventory_recount") return "إعادة عد";
  if (task.source_kind === "inventory_adjustment") return "اعتماد فرق";
  if (task.source_kind === "inventory_transfer_dispatch") return "شحن تحويل";
  if (task.source_kind === "inventory_transfer_receive") return "استلام تحويل";
  if (task.source_kind === "inventory_transfer_variance") return "مراجعة فرق تحويل";
  return "مخزون";
}

function InventoryPage({ branch }: { branch: StaffBranch }) {
  const canInventory = branch.permissions.some((permission) => permission.startsWith("inventory."));
  const canCount = branch.permissions.includes("inventory.count") || branch.permissions.includes("inventory.recount");
  const canTransfer = branch.permissions.includes("inventory.transfer") || branch.permissions.includes("inventory.manage");
  const canExpiry = branch.permissions.includes("inventory.manage") || branch.permissions.includes("products.manage") || branch.permissions.includes("purchases.manage");
  const canDisposeExpiry = branch.permissions.includes("inventory.manage");
  const canSupplierReturns = branch.permissions.includes("inventory.manage") || branch.permissions.includes("purchases.manage") || branch.permissions.includes("finance.manage");
  const canSettleSupplierReturns = branch.permissions.includes("purchases.manage") || branch.permissions.includes("finance.manage");
  const [tab,setTab]=useState<"tasks"|"transfers"|"risks"|"expiry"|"supplier_returns">("tasks");
  const [riskStatus,setRiskStatus]=useState<staff.InventoryRiskStatus>("low_stock");
  const [expiryDays,setExpiryDays]=useState(30);
  const [tasks,setTasks]=useState<staff.OperationsTask[]>([]);
  const [transfers,setTransfers]=useState<staff.InventoryTransferWorkspace|null>(null);
  const [risks,setRisks]=useState<staff.InventoryRiskWorkspace|null>(null);
  const [expiry,setExpiry]=useState<staff.ExpiryWorkspace|null>(null);
  const [supplierReturns,setSupplierReturns]=useState<staff.SupplierReturnWorkspace|null>(null);
  const [selectedExpiry,setSelectedExpiry]=useState<staff.ExpiryBatchItem|null>(null);
  const [expiryAction,setExpiryAction]=useState<"dispose"|"supplier_return">("dispose");
  const [expiryRequestId,setExpiryRequestId]=useState("");
  const [expiryActionQuantity,setExpiryActionQuantity]=useState("");
  const [expiryActionNote,setExpiryActionNote]=useState("");
  const [selectedSupplierReturn,setSelectedSupplierReturn]=useState<staff.SupplierReturnWorkspace["items"][number]|null>(null);
  const [supplierCreditAmount,setSupplierCreditAmount]=useState("");
  const [supplierCreditNote,setSupplierCreditNote]=useState("");
  const [supplierSettlementNote,setSupplierSettlementNote]=useState("");
  const [busy,setBusy]=useState(true);
  const [acting,setActing]=useState("");
  const [message,setMessage]=useState<{type:"ok"|"error";text:string}|null>(null);
  const [selectedTask,setSelectedTask]=useState<staff.OperationsTask|null>(null);
  const [detail,setDetail]=useState<staff.InventoryAuditTaskDetail|null>(null);
  const [barcode,setBarcode]=useState("");
  const [actualCount,setActualCount]=useState("");
  const [note,setNote]=useState("");
  const [adjustmentReason,setAdjustmentReason]=useState<staff.InventoryAdjustmentReason>("unknown");
  const [rejectionReason,setRejectionReason]=useState<staff.InventoryAdjustmentRejectionReason>("insufficient_evidence");
  const [selectedTransfer,setSelectedTransfer]=useState<staff.InventoryTransfer|null>(null);
  const [receipt,setReceipt]=useState<Record<string,string>>({});
  const [transferNote,setTransferNote]=useState("");

  const load=useCallback(async(showBusy=true)=>{
    if(!canInventory){setBusy(false);return;}
    if(showBusy)setBusy(true);
    try{
      if(canCount){try{await staff.ensureDailyInventoryAudit(branch.branch_id);}catch{/* scheduler/server policy remains authoritative */}}
      const [taskRows,transferData,riskData,expiryData,supplierReturnData]=await Promise.all([
        staff.listTasks(branch.branch_id,"active"),
        canTransfer?staff.getInventoryTransferWorkspace(branch.branch_id).catch(()=>null):Promise.resolve(null),
        staff.getInventoryRiskWorkspace(branch.branch_id,riskStatus).catch(()=>null),
        canExpiry?staff.getExpiryWorkspace(branch.branch_id,expiryDays).catch(()=>null):Promise.resolve(null),
        canSupplierReturns?staff.getSupplierReturnsWorkspace(branch.branch_id,"pending_credit").catch(()=>null):Promise.resolve(null),
      ]);
      setTasks(taskRows.filter((task)=>staff.isInventoryTask(task)||staff.isInventoryTransferTask(task)));
      setTransfers(transferData);
      setRisks(riskData);
      setExpiry(expiryData);
      setSupplierReturns(supplierReturnData);
      setMessage(null);
    }catch(caught){
      setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر تحميل عمليات المخزون"});
    }finally{if(showBusy)setBusy(false);}
  },[branch.branch_id,canCount,canExpiry,canInventory,canSupplierReturns,canTransfer,expiryDays,riskStatus]);

  useEffect(()=>{void load();},[load]);

  const openTask=useCallback(async(task:staff.OperationsTask)=>{
    if(staff.isInventoryTransferTask(task)){setTab("transfers");return;}
    setActing(task.id);setMessage(null);
    try{
      if(task.status==="open"&&task.can_claim)await staff.claimTask(task.id);
      if(task.status==="open"||task.status==="claimed"){try{await staff.startTask(task.id);}catch{/* may already be started */}}
      const next=await staff.getInventoryAuditTask(task.id);
      setSelectedTask(task);setDetail(next);setBarcode("");setActualCount("");setNote("");
      await load(false);
    }catch(caught){
      setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر فتح مهمة الجرد"});
    }finally{setActing("");}
  },[load]);

  useEffect(()=>{
    const taskId=new URLSearchParams(window.location.search).get("task");
    if(!taskId||!tasks.length||selectedTask)return;
    const match=tasks.find((task)=>task.id===taskId);
    if(match)void openTask(match);
  },[tasks,selectedTask,openTask]);

  const closeTask=()=>{setSelectedTask(null);setDetail(null);setBarcode("");setActualCount("");setNote("");};

  const submitCount=async()=>{
    if(!selectedTask||!detail||acting)return;
    if(detail.barcode&&barcode.trim()!==detail.barcode.trim()){setMessage({type:"error",text:"امسح باركود المنتج الصحيح قبل تسجيل الكمية"});return;}
    const qty=Number(actualCount);
    if(!Number.isFinite(qty)||qty<0){setMessage({type:"error",text:"اكتب الكمية الفعلية التي وجدتها"});return;}
    setActing(selectedTask.id);setMessage(null);
    try{
      const result=selectedTask.source_kind==="inventory_recount"
        ?await staff.submitInventoryRecount(selectedTask.id,qty,note)
        :await staff.submitInventoryCount(selectedTask.id,qty,note);
      closeTask();
      setMessage({type:"ok",text:result.result==="matched"||result.result==="matched_system"?"تم تسجيل العد والرصيد مطابق":"تم تسجيل الفرق وتحويله تلقائيًا لمسار المراجعة"});
      await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر تسجيل الجرد"});}
    finally{setActing("");}
  };

  const decideAdjustment=async(decision:"approve"|"reject")=>{
    if(!selectedTask||!detail||acting)return;
    if(note.trim().length<3){setMessage({type:"error",text:"اكتب ملاحظة توضح قرار المراجعة"});return;}
    setActing(selectedTask.id);setMessage(null);
    try{
      if(decision==="approve")await staff.approveInventoryAdjustment(selectedTask.id,adjustmentReason,note);
      else await staff.rejectInventoryAdjustment(selectedTask.id,rejectionReason,note);
      closeTask();setMessage({type:"ok",text:decision==="approve"?"تم اعتماد فرق المخزون وتوثيق التسوية":"تم رفض التسوية وإرجاعها لإعادة الجرد"});
      await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر حفظ قرار المراجعة"});}
    finally{setActing("");}
  };

  const openTransfer=(transfer:staff.InventoryTransfer)=>{
    setSelectedTransfer(transfer);setTransferNote("");
    setReceipt(Object.fromEntries(transfer.items.map((item)=>[item.product_id,String(item.quantity)])));
  };

  const dispatchTransfer=async()=>{
    if(!selectedTransfer||acting)return;
    setActing(selectedTransfer.id);setMessage(null);
    try{
      await staff.dispatchInventoryTransfer(selectedTransfer.id,transferNote);
      setSelectedTransfer(null);setMessage({type:"ok",text:"تم تأكيد شحن التحويل وإنشاء مهمة الاستلام للفرع المستلم"});
      await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر شحن التحويل"});}
    finally{setActing("");}
  };

  const receiveTransfer=async()=>{
    if(!selectedTransfer||acting)return;
    const items=selectedTransfer.items.map((item)=>({product_id:item.product_id,quantity:Number(receipt[item.product_id]??item.quantity)}));
    if(items.some((item)=>!Number.isFinite(item.quantity)||item.quantity<0)){setMessage({type:"error",text:"راجع الكميات المستلمة"});return;}
    setActing(selectedTransfer.id);setMessage(null);
    try{
      await staff.receiveInventoryTransfer(selectedTransfer.id,items,transferNote);
      setSelectedTransfer(null);setMessage({type:"ok",text:"تم استلام التحويل وتحديث المخزون. أي فرق تم تحويله لمسار المراجعة"});
      await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر استلام التحويل"});}
    finally{setActing("");}
  };

  const createRiskCheck=async(product:staff.InventoryRiskProduct)=>{
    if(acting)return;
    setActing(product.product_id);setMessage(null);
    try{
      await staff.createSpotInventoryAudit(branch.branch_id,[product.product_id]);
      setTab("tasks");
      setMessage({type:"ok",text:`تم إنشاء جرد سريع لـ ${product.product_name} وإسناده لموظف جرد مؤهل`});
      await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر إنشاء الجرد السريع"});}
    finally{setActing("");}
  };

  const createExpiryCheck=async(item:staff.ExpiryBatchItem)=>{
    if(acting)return;
    setActing(item.batch_id);setMessage(null);
    try{
      await staff.createSpotInventoryAudit(branch.branch_id,[item.product_id]);
      setTab("tasks");
      setMessage({type:"ok",text:`تم إنشاء جرد تحقق لـ ${item.product_name} قبل أي إجراء على الدفعة ${item.batch_number}`});
      await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر إنشاء جرد التحقق"});}
    finally{setActing("");}
  };

  const openExpiryAction=(item:staff.ExpiryBatchItem,action:"dispose"|"supplier_return")=>{
    setSelectedExpiry(item);
    setExpiryAction(action);
    setExpiryRequestId(crypto.randomUUID());
    setExpiryActionQuantity(String(item.quantity));
    setExpiryActionNote(action==="dispose"?"إهلاك دفعة منتهية/غير صالحة بعد التحقق الفعلي":"إرجاع دفعة للمورد بعد التحقق الفعلي");
  };

  const closeExpiryAction=()=>{
    setSelectedExpiry(null);
    setExpiryRequestId("");
    setExpiryActionQuantity("");
    setExpiryActionNote("");
  };

  const submitExpiryAction=async()=>{
    if(!selectedExpiry||acting)return;
    const qty=Number(expiryActionQuantity);
    if(!Number.isFinite(qty)||qty<=0||qty>selectedExpiry.quantity){setMessage({type:"error",text:"راجع كمية الإجراء؛ يجب أن تكون أكبر من صفر ولا تتجاوز كمية الدفعة"});return;}
    if(expiryActionNote.trim().length<3){setMessage({type:"error",text:"اكتب سببًا واضحًا للإجراء"});return;}
    setActing(selectedExpiry.batch_id);setMessage(null);
    try{
      const result=await staff.processExpiryBatchAction(expiryRequestId,branch.branch_id,selectedExpiry.batch_id,qty,expiryAction,expiryActionNote);
      closeExpiryAction();
      setMessage({
        type:"ok",
        text:expiryAction==="dispose"
          ?`تم إهلاك ${qty} وتسجيل أثر تكلفة ${Number(result.value_amount||0).toLocaleString("ar-EG",{maximumFractionDigits:2})} ج.م بدون حركة نقدية`
          :`تم إخراج ${qty} من المخزون وإنشاء إرجاع للمورد بقيمة متوقعة ${Number(result.value_amount||0).toLocaleString("ar-EG",{maximumFractionDigits:2})} ج.م`,
      });
      await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر تنفيذ إجراء الصلاحية"});}
    finally{setActing("");}
  };

  const openSupplierSettlement=(item:staff.SupplierReturnWorkspace["items"][number])=>{
    setSelectedSupplierReturn(item);
    setSupplierCreditAmount(String(item.expected_credit_amount||0));
    setSupplierCreditNote("");
    setSupplierSettlementNote("");
  };

  const closeSupplierSettlement=()=>{
    setSelectedSupplierReturn(null);
    setSupplierCreditAmount("");
    setSupplierCreditNote("");
    setSupplierSettlementNote("");
  };

  const submitSupplierSettlement=async()=>{
    if(!selectedSupplierReturn||acting)return;
    const amount=Number(supplierCreditAmount);
    if(!Number.isFinite(amount)||amount<0){setMessage({type:"error",text:"اكتب قيمة Credit صحيحة"});return;}
    if(supplierCreditNote.trim().length<2){setMessage({type:"error",text:"اكتب رقم Credit Note أو مرجع اعتماد المورد"});return;}
    setActing(selectedSupplierReturn.id);setMessage(null);
    try{
      await staff.settleSupplierReturn(selectedSupplierReturn.id,amount,supplierCreditNote,supplierSettlementNote);
      closeSupplierSettlement();
      setMessage({type:"ok",text:"تم تسجيل اعتماد المورد وإغلاق الإرجاع كـ Credited"});
      await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر تسوية إرجاع المورد"});}
    finally{setActing("");}
  };

  const expiryDaysLeft=(value:string)=>{
    const today=new Date();today.setHours(12,0,0,0);
    const target=new Date(`${value}T12:00:00`);
    return Math.ceil((target.getTime()-today.getTime())/86400000);
  };

  if(!canInventory)return <><PageTitle title="المخزون" subtitle="الوحدة غير مفعلة لهذا الدور"/><Empty text="دورك الحالي لا يملك صلاحيات تشغيل المخزون"/></>;

  const auditTasks=tasks.filter((task)=>staff.isInventoryTask(task));
  const transferTasks=tasks.filter((task)=>staff.isInventoryTransferTask(task));
  const mine=auditTasks.filter((task)=>task.is_mine).length;
  const overdue=auditTasks.filter((task)=>task.is_overdue).length;

  return <>
    <PageTitle title="المخزون" subtitle="الجرد والتحويلات من نفس مهام التشغيل"/>
    {message&&<div className={message.type==="ok"?"success-box":"error-box"}>{message.text}</div>}
    <div className="stats"><div><strong>{mine}</strong><span>مهام جرد لي</span></div><div><strong>{overdue}</strong><span>متأخرة</span></div><div><strong>{risks?.summary.low_stock_rows||0}</strong><span>مخزون منخفض</span></div></div>
    <div className="chips"><button className={tab==="tasks"?"active":""} onClick={()=>setTab("tasks")}>الجرد</button>{canTransfer&&<button className={tab==="transfers"?"active":""} onClick={()=>setTab("transfers")}>التحويلات</button>}<button className={tab==="risks"?"active":""} onClick={()=>setTab("risks")}>مخاطر المخزون</button>{canExpiry&&<button className={tab==="expiry"?"active":""} onClick={()=>setTab("expiry")}>الصلاحية</button>}{canSupplierReturns&&<button className={tab==="supplier_returns"?"active":""} onClick={()=>setTab("supplier_returns")}>إرجاعات الموردين</button>}<button onClick={()=>void load()}><RefreshCw className={busy?"spin":""}/>تحديث</button></div>

    {busy?<Loading/>:tab==="tasks"?<div className="stack inventory-task-list">
      {auditTasks.map((task)=><article className={`task-card ${task.is_overdue?"danger":""}`} key={task.id}>
        <div className="row"><span className="pill normal">{inventoryTaskLabel(task)}</span>{task.is_overdue&&<span className="danger-text">متأخرة</span>}</div>
        <h3>{task.title}</h3><p>{task.description||"افتح المهمة واتبع تعليمات الجرد"}</p>
        <div className="actions"><button className="primary" disabled={acting===task.id} onClick={()=>void openTask(task)}>{acting===task.id?<Loader2 className="spin"/>:<Scale/>}فتح الجرد</button></div>
      </article>)}
      {!auditTasks.length&&<Empty text="مفيش مهام جرد نشطة حاليًا"/>}
    </div>:tab==="transfers"?<div className="stack">
      {(transfers?.transfers||[]).map((transfer)=><article className={`task-card ${transfer.has_variance?"danger":""}`} key={transfer.id}>
        <div className="row"><strong>{transfer.transfer_number}</strong><span className="pill normal">{transfer.status==="requested"?"بانتظار الشحن":transfer.status==="dispatched"?"في الطريق":transfer.status==="received_with_variance"?"مستلم بفرق":"مستلم"}</span></div>
        <h3>{transfer.direction==="incoming"?`من ${transfer.from_branch_name}`:`إلى ${transfer.to_branch_name}`}</h3>
        <p>{transfer.items_count} منتج{transfer.expected_arrival_date?` · متوقع ${new Date(transfer.expected_arrival_date).toLocaleDateString("ar-EG")}`:""}</p>
        {(transfer.can_dispatch||transfer.can_receive)&&<div className="actions"><button className="primary" onClick={()=>openTransfer(transfer)}>{transfer.can_dispatch?"تأكيد الشحن":"استلام التحويل"}</button></div>}
      </article>)}
      {!transfers?.transfers.length&&<Empty text="مفيش تحويلات مخزون تحتاج تنفيذ حاليًا"/>}
    </div>:tab==="risks"?<div className="inventory-risk-workspace">
      <div className="chips risk-filter">{([["low_stock","منخفض"],["out_of_stock","نافد"],["coverage_risk","تغطية منخفضة"]] as Array<[staff.InventoryRiskStatus,string]>).map(([id,label])=><button key={id} className={riskStatus===id?"active":""} onClick={()=>setRiskStatus(id)}>{label}</button>)}</div>
      <div className="inventory-risk-summary"><span>منخفض <b>{risks?.summary.low_stock_rows||0}</b></span><span>نافد <b>{risks?.summary.out_of_stock_rows||0}</b></span><span>تغطية منخفضة <b>{risks?.summary.coverage_risk_rows||0}</b></span><span>جرد معلق <b>{risks?.summary.pending_audit_tasks||0}</b></span></div>
      <div className="stack">{(risks?.products||[]).map((product)=><article className="risk-product-card" key={product.product_id}>
        <div className="risk-product-main">{product.image_url?<img src={product.image_url} alt=""/>:<div className="risk-product-placeholder"><PackageCheck/></div>}<div><div className="row"><strong>{product.product_name}</strong><span className={`risk-state ${product.stock_status}`}>{product.stock_status==="out_of_stock"?"نافد":product.stock_status==="coverage_risk"?"تغطية منخفضة":"منخفض"}</span></div><small>{product.shelf_location?`رف ${product.shelf_location}`:"رف غير محدد"} · {product.barcode||"بدون باركود"}</small></div></div>
        <div className="risk-stock-values"><span>فعلي <b>{product.quantity}</b></span><span>محجوز <b>{product.reserved_quantity}</b></span><span>متاح <b>{product.available_quantity}</b></span><span>الحد الأدنى <b>{product.min_stock_level}</b></span></div>
        {risks?.permissions.can_manage_sessions&&<button className="secondary full-action" disabled={acting===product.product_id} onClick={()=>void createRiskCheck(product)}>{acting===product.product_id?<Loader2 className="spin"/>:<Scale/>}إنشاء جرد سريع قبل التصرف</button>}
      </article>)}{!risks?.products.length&&<Empty text="مفيش منتجات في الحالة دي حاليًا"/>}</div>
    </div>:tab==="expiry"?<div className="expiry-workspace">
      <div className="expiry-toolbar"><div><CalendarDays/><div><strong>دفعات الصلاحية</strong><span>من product_batches للفرع فقط</span></div></div><label>الفترة<select value={expiryDays} onChange={(e)=>setExpiryDays(Number(e.target.value))}><option value={7}>7 أيام</option><option value={14}>14 يوم</option><option value={30}>30 يوم</option><option value={60}>60 يوم</option><option value={90}>90 يوم</option></select></label></div>
      <div className="expiry-summary"><div><strong>{expiry?.summary.expired||0}</strong><span>منتهي</span></div><div><strong>{expiry?.summary.today||0}</strong><span>ينتهي اليوم</span></div><div><strong>{expiry?.summary.within_3_days||0}</strong><span>خلال 3 أيام</span></div><div><strong>{Number(expiry?.summary.purchase_value_at_risk||0).toLocaleString("ar-EG",{maximumFractionDigits:2})}</strong><span>قيمة شراء معرضة</span></div></div>
      <div className="stack expiry-list">{(expiry?.items||[]).map((item)=>{const days=expiryDaysLeft(item.expiry_date);return <article className={`expiry-card ${days<0?"expired":days<=3?"critical":days<=7?"warning":""}`} key={item.batch_id}>
        <div className="expiry-product">{item.image_url?<img src={item.image_url} alt=""/>:<div className="risk-product-placeholder"><CalendarDays/></div>}<div><div className="row"><strong>{item.product_name}</strong><span className="expiry-status">{days<0?`منتهي من ${Math.abs(days)} يوم`:days===0?"ينتهي اليوم":`متبقي ${days} يوم`}</span></div><small>دفعة {item.batch_number} · {item.shelf_location?`رف ${item.shelf_location}`:"رف غير محدد"}</small></div></div>
        <div className="expiry-values"><span>الكمية <b>{item.quantity}</b></span><span>تاريخ الصلاحية <b>{new Date(`${item.expiry_date}T12:00:00`).toLocaleDateString("ar-EG")}</b></span><span>سعر الشراء <b>{Number(item.purchase_price).toLocaleString("ar-EG")} ج.م</b></span></div>
        {item.legacy_remaining_batch&&<div className="expiry-legacy-warning"><AlertTriangle/><span>هذه دفعة متبقية أنشأها النظام القديم؛ اعمل جرد تحقق قبل أي إجراء.</span></div>}
        <div className="expiry-safety-note"><ShieldCheck/><span>{item.supplier_name?`المورد: ${item.supplier_name}. `:""}أي خصم جديد يحترم حجوزات الطلبات الأونلاين ويُسجل في Inventory Ledger.</span></div>
        <div className="expiry-actions">
          <button className="secondary" disabled={acting===item.batch_id} onClick={()=>void createExpiryCheck(item)}>{acting===item.batch_id?<Loader2 className="spin"/>:<Scale/>}جرد تحقق</button>
          {canDisposeExpiry&&<button className="danger-action" disabled={acting===item.batch_id} onClick={()=>openExpiryAction(item,"dispose")}><XCircle/>إهلاك</button>}
          {canSupplierReturns&&item.can_supplier_return&&<button className="primary" disabled={acting===item.batch_id} onClick={()=>openExpiryAction(item,"supplier_return")}><Send/>إرجاع للمورد</button>}
        </div>
      </article>})}{!expiry?.items.length&&<Empty text="مفيش دفعات منتهية أو قريبة من الانتهاء في الفترة دي"/>}</div>
    </div>:<div className="supplier-returns-workspace">
      <div className="supplier-return-summary"><div><FileText/><div><strong>إرجاعات بانتظار اعتماد المورد</strong><span>المخزون خرج بالفعل؛ التسوية هنا لتسجيل الـCredit Note فقط.</span></div></div><b>{supplierReturns?.items.length||0}</b></div>
      <div className="stack supplier-return-list">{(supplierReturns?.items||[]).map((item)=><article className="supplier-return-card" key={item.id}>
        <div className="row"><div><small>{item.supplier_name}</small><h3>إرجاع مورد</h3></div><span className="pill high">Pending Credit</span></div>
        <div className="supplier-return-values"><span>المتوقع <b>{Number(item.expected_credit_amount).toLocaleString("ar-EG",{minimumFractionDigits:2,maximumFractionDigits:2})} ج.م</b></span><span>التاريخ <b>{new Date(item.created_at).toLocaleDateString("ar-EG")}</b></span></div>
        <div className="supplier-return-items">{item.items.map((line)=><div key={line.id}><span>{line.product_name} · دفعة {line.batch_number}</span><b>{line.quantity} × {Number(line.purchase_price).toLocaleString("ar-EG")} ج.م</b></div>)}</div>
        {canSettleSupplierReturns&&<button className="primary full-action" disabled={acting===item.id} onClick={()=>openSupplierSettlement(item)}><Check/>تسجيل Credit Note</button>}
      </article>)}{!supplierReturns?.items.length&&<Empty text="مفيش إرجاعات مورد معلقة حاليًا"/>}</div>
    </div>}

    {selectedTask&&detail&&<div className="inventory-modal-backdrop" onClick={closeTask}><section className="inventory-modal" onClick={(event)=>event.stopPropagation()}>
      <div className="section-head"><div><small>{inventoryTaskLabel(selectedTask)}</small><h2>{detail.product_name}</h2></div><button className="icon-btn" onClick={closeTask}><XCircle/></button></div>
      {detail.image_url&&<img className="inventory-product-image" src={detail.image_url} alt=""/>}
      <div className="inventory-facts"><span>الرف <b>{detail.shelf_location||"—"}</b></span><span>الوحدة <b>{detail.unit_of_measure||"قطعة"}</b></span></div>
      {detail.source_kind==="inventory_adjustment"?<>
        <div className="inventory-review-grid"><div><span>العد الأول</span><strong>{detail.first_count??"—"}</strong></div><div><span>إعادة العد</span><strong>{detail.recount??"—"}</strong></div><div><span>الفرق المقترح</span><strong>{detail.current_adjustment_delta??"—"}</strong></div></div>
        <label className="inventory-field">سبب التسوية<select value={adjustmentReason} onChange={(e)=>setAdjustmentReason(e.target.value as staff.InventoryAdjustmentReason)}><option value="unknown">غير معروف</option><option value="damage">تالف</option><option value="breakage">كسر</option><option value="theft">فقد / سرقة</option><option value="receiving_error">خطأ استلام</option><option value="selling_error">خطأ بيع</option><option value="previous_error">خطأ رصيد سابق</option></select></label>
        <label className="inventory-field">ملاحظة<textarea rows={3} value={note} onChange={(e)=>setNote(e.target.value)}/></label>
        <div className="actions"><button className="secondary" disabled={Boolean(acting)} onClick={()=>void decideAdjustment("reject")}>رفض وإعادة جرد</button><button className="primary" disabled={Boolean(acting)} onClick={()=>void decideAdjustment("approve")}>{acting?<Loader2 className="spin"/>:<Check/>}اعتماد التسوية</button></div>
      </>:<>
        <div className="blind-count-note"><ShieldCheck/><div><strong>Blind Count</strong><span>رصيد النظام مخفي. عدّ الموجود فعليًا فقط.</span></div></div>
        {detail.barcode&&<label className="inventory-field">باركود المنتج<input value={barcode} onChange={(e)=>setBarcode(e.target.value)} inputMode="numeric" placeholder="امسح الباركود"/></label>}
        <label className="inventory-field">الكمية الفعلية<input value={actualCount} onChange={(e)=>setActualCount(e.target.value)} inputMode="decimal" type="number" min="0" step="0.001" placeholder="0"/></label>
        <label className="inventory-field">ملاحظة اختيارية<textarea rows={2} value={note} onChange={(e)=>setNote(e.target.value)}/></label>
        <button className="primary full-action" disabled={Boolean(acting)} onClick={()=>void submitCount()}>{acting?<Loader2 className="spin"/>:<CheckCircle2/>}تسجيل نتيجة الجرد</button>
      </>}
    </section></div>}

    {selectedTransfer&&<div className="inventory-modal-backdrop" onClick={()=>setSelectedTransfer(null)}><section className="inventory-modal" onClick={(event)=>event.stopPropagation()}>
      <div className="section-head"><div><small>{selectedTransfer.transfer_number}</small><h2>{selectedTransfer.can_dispatch?"شحن التحويل":"استلام التحويل"}</h2></div><button className="icon-btn" onClick={()=>setSelectedTransfer(null)}><XCircle/></button></div>
      <div className="transfer-items">{selectedTransfer.items.map((item)=><div className="transfer-item" key={item.id}><div><strong>{item.product_name}</strong><small>{item.barcode||"بدون باركود"} · المشحون {item.quantity}</small></div>{selectedTransfer.can_receive&&<input type="number" min="0" step="0.001" value={receipt[item.product_id]??""} onChange={(e)=>setReceipt((current)=>({...current,[item.product_id]:e.target.value}))}/>}</div>)}</div>
      <label className="inventory-field">ملاحظة<textarea rows={2} value={transferNote} onChange={(e)=>setTransferNote(e.target.value)} placeholder="اختياري"/></label>
      <button className="primary full-action" disabled={Boolean(acting)} onClick={()=>void (selectedTransfer.can_dispatch?dispatchTransfer():receiveTransfer())}>{acting?<Loader2 className="spin"/>:<PackageCheck/>}{selectedTransfer.can_dispatch?"تأكيد خروج الشحنة":"تأكيد الاستلام"}</button>
    </section></div>}

    {selectedExpiry&&<div className="inventory-modal-backdrop" onClick={closeExpiryAction}><section className="inventory-modal expiry-action-modal" onClick={(event)=>event.stopPropagation()}>
      <div className="section-head"><div><small>دفعة {selectedExpiry.batch_number}</small><h2>{expiryAction==="dispose"?"إهلاك دفعة":"إرجاع للمورد"}</h2></div><button className="icon-btn" onClick={closeExpiryAction}><XCircle/></button></div>
      <div className="approval-person"><CalendarDays/><div><strong>{selectedExpiry.product_name}</strong><span>{selectedExpiry.supplier_name?"المورد: "+selectedExpiry.supplier_name:"لا يوجد مورد مرتبط"}</span></div></div>
      <div className="inventory-review-grid"><div><span>المتاح بالدفعة</span><strong>{selectedExpiry.quantity}</strong></div><div><span>تكلفة الوحدة</span><strong>{Number(selectedExpiry.purchase_price).toLocaleString("ar-EG")} ج.م</strong></div><div><span>{expiryAction==="dispose"?"خسارة متوقعة":"Credit متوقع"}</span><strong>{(Number(expiryActionQuantity||0)*Number(selectedExpiry.purchase_price||0)).toLocaleString("ar-EG",{maximumFractionDigits:2})}</strong></div></div>
      <label className="inventory-field">الكمية<input type="number" min="0.001" max={selectedExpiry.quantity} step="0.001" inputMode="decimal" value={expiryActionQuantity} onChange={(e)=>setExpiryActionQuantity(e.target.value)}/></label>
      <label className="inventory-field">سبب الإجراء<textarea rows={3} value={expiryActionNote} onChange={(e)=>setExpiryActionNote(e.target.value)}/></label>
      <div className="handoff-warning"><ShieldCheck/><span>{expiryAction==="dispose"?"التأكيد يخصم المخزون المتاح فقط، يسجل الحركة في Inventory Ledger، ويضيف مصروفًا محاسبيًا غير نقدي بالقيمة الفعلية.":"التأكيد يخرج الكمية من المخزون المتاح وينشئ إرجاع مورد Pending Credit؛ لا يتم تعديل رصيد المورد قبل وصول Credit Note."}</span></div>
      <button className={expiryAction==="dispose"?"danger-action full-action":"primary full-action"} disabled={Boolean(acting)} onClick={()=>void submitExpiryAction()}>{acting?<Loader2 className="spin"/>:expiryAction==="dispose"?<XCircle/>:<Send/>}{expiryAction==="dispose"?"تأكيد الإهلاك":"تأكيد الإرجاع للمورد"}</button>
    </section></div>}

    {selectedSupplierReturn&&<div className="inventory-modal-backdrop" onClick={closeSupplierSettlement}><section className="inventory-modal" onClick={(event)=>event.stopPropagation()}>
      <div className="section-head"><div><small>{selectedSupplierReturn.supplier_name}</small><h2>تسوية إرجاع المورد</h2></div><button className="icon-btn" onClick={closeSupplierSettlement}><XCircle/></button></div>
      <div className="inventory-review-grid"><div><span>Credit المتوقع</span><strong>{Number(selectedSupplierReturn.expected_credit_amount).toFixed(2)}</strong></div><div><span>Credit المعتمد</span><strong>{Number(supplierCreditAmount||0).toFixed(2)}</strong></div><div><span>الفرق</span><strong>{(Number(supplierCreditAmount||0)-Number(selectedSupplierReturn.expected_credit_amount||0)).toFixed(2)}</strong></div></div>
      <label className="inventory-field">قيمة Credit الفعلية<input type="number" min="0" step="0.01" inputMode="decimal" value={supplierCreditAmount} onChange={(e)=>setSupplierCreditAmount(e.target.value)}/></label>
      <label className="inventory-field">رقم Credit Note / المرجع<input value={supplierCreditNote} onChange={(e)=>setSupplierCreditNote(e.target.value)} placeholder="مثال: CN-2026-001"/></label>
      <label className="inventory-field">ملاحظة اختيارية<textarea rows={3} value={supplierSettlementNote} onChange={(e)=>setSupplierSettlementNote(e.target.value)}/></label>
      <div className="handoff-warning"><FileText/><span>هذه الخطوة تثبت اعتماد المورد للمبلغ فقط. لا تنشئ حركة نقدية تلقائيًا ولا تغيّر رصيد المورد بدون مستند محاسبي لاحق.</span></div>
      <button className="primary full-action" disabled={Boolean(acting)} onClick={()=>void submitSupplierSettlement()}>{acting?<Loader2 className="spin"/>:<Check/>}تسجيل Credit Note وإغلاق الإرجاع</button>
    </section></div>}
  </>;
}


function approvalSourceLabel(value:string){
  if(value==="inventory_adjustment")return "فرق مخزون";
  if(value==="attendance_exception")return "استثناء حضور";
  if(value==="hr_request")return "طلب موظف";
  if(value==="shift_reconciliation")return "فرق وردية";
  if(value==="cash_handoff")return "فرق عهدة";
  if(value==="inventory_transfer_variance")return "فرق تحويل";
  if(value==="order_substitution")return "بديل طلب";
  if(value==="order_substitution_financial_adjustment")return "تسوية فرق بديل";
  if(value==="order_shortage_financial_adjustment")return "رد نقص طلب";
  return "موافقة تشغيلية";
}

function ApprovalsPage({branch}:{branch:StaffBranch}){
  const [scope,setScope]=useState<staff.ApprovalScope>("pending");
  const [data,setData]=useState<staff.ApprovalCenter|null>(null);
  const [busy,setBusy]=useState(true);
  const [acting,setActing]=useState("");
  const [message,setMessage]=useState<{type:"ok"|"error";text:string}|null>(null);
  const [selected,setSelected]=useState<staff.ApprovalItem|null>(null);
  const [inventoryDetail,setInventoryDetail]=useState<staff.InventoryAuditTaskDetail|null>(null);
  const [hrDetail,setHrDetail]=useState<staff.HrRequestReviewDetail|null>(null);
  const [attendanceDetail,setAttendanceDetail]=useState<staff.AttendanceExceptionReview|null>(null);
  const [substitutionDetail,setSubstitutionDetail]=useState<staff.OrderSubstitutionApprovalDetail|null>(null);
  const [financialDetail,setFinancialDetail]=useState<staff.OrderFinancialAdjustmentDetail|null>(null);
  const [providerReference,setProviderReference]=useState("");
  const [note,setNote]=useState("");
  const [adjustmentReason,setAdjustmentReason]=useState<staff.InventoryAdjustmentReason>("unknown");
  const [rejectionReason,setRejectionReason]=useState<staff.InventoryAdjustmentRejectionReason>("insufficient_evidence");

  const load=useCallback(async(show=true)=>{
    if(show)setBusy(true);
    try{setData(await staff.getApprovalCenter(branch.branch_id,scope));setMessage(null);}
    catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر تحميل الموافقات"});}
    finally{if(show)setBusy(false);}
  },[branch.branch_id,scope]);
  useEffect(()=>{void load();},[load]);

  const clear=()=>{setSelected(null);setInventoryDetail(null);setHrDetail(null);setAttendanceDetail(null);setSubstitutionDetail(null);setFinancialDetail(null);setProviderReference("");setNote("");};

  const open=async(item:staff.ApprovalItem)=>{
    setActing(item.id);setMessage(null);
    try{
      if(item.status==="open"&&item.can_claim)await staff.claimTask(item.id);
      try{await staff.startTask(item.id);}catch{/* specialized workflow may already own the transition */}
      setSelected(item);setNote("");
      if(item.source_kind==="inventory_adjustment")setInventoryDetail(await staff.getInventoryAuditTask(item.id));
      else if(item.source_kind==="hr_request")setHrDetail(await staff.getHrRequestForReview(item.id));
      else if(item.source_kind==="attendance_exception")setAttendanceDetail(await staff.getAttendanceExceptionForReview(item.source_id));
      else if(item.source_kind==="order_substitution")setSubstitutionDetail(await staff.getOrderSubstitutionApproval(branch.branch_id,item.source_id));
      else if(item.source_kind==="order_substitution_financial_adjustment")setFinancialDetail(await staff.getOrderSubstitutionFinancialAdjustment(item.source_id));
      else if(item.source_kind==="order_shortage_financial_adjustment")setFinancialDetail(await staff.getOrderShortageFinancialAdjustment(item.source_id));
      await load(false);
    }catch(caught){clear();setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر فتح الموافقة"});}
    finally{setActing("");}
  };

  const decideInventory=async(decision:"approve"|"reject")=>{
    if(!selected||acting)return;
    if(note.trim().length<3){setMessage({type:"error",text:"اكتب ملاحظة واضحة للقرار"});return;}
    setActing(selected.id);
    try{
      if(decision==="approve")await staff.approveInventoryAdjustment(selected.id,adjustmentReason,note);
      else await staff.rejectInventoryAdjustment(selected.id,rejectionReason,note);
      clear();setMessage({type:"ok",text:decision==="approve"?"تم اعتماد فرق المخزون":"تم رفض التسوية وإرجاعها لإعادة العد"});await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر حفظ القرار"});}
    finally{setActing("");}
  };

  const decideHr=async(decision:"approved"|"rejected")=>{
    if(!selected||!hrDetail||acting)return;
    if(note.trim().length<3){setMessage({type:"error",text:"اكتب ملاحظة واضحة للقرار"});return;}
    setActing(selected.id);
    try{
      await staff.decideHrRequest(selected.id,decision,note,decision==="approved"?hrDetail.request.payload:null);
      clear();setMessage({type:"ok",text:decision==="approved"?"تم اعتماد طلب الموظف":"تم رفض طلب الموظف"});await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر حفظ القرار"});}
    finally{setActing("");}
  };

  const decideAttendance=async(decision:"approved"|"rejected")=>{
    if(!selected||!attendanceDetail||acting)return;
    if(note.trim().length<3){setMessage({type:"error",text:"اكتب ملاحظة واضحة للقرار"});return;}
    setActing(selected.id);
    try{
      await staff.decideAttendanceException(attendanceDetail.id,decision,note);
      clear();setMessage({type:"ok",text:decision==="approved"?"تم اعتماد استثناء الحضور":"تم رفض استثناء الحضور"});await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر حفظ القرار"});}
    finally{setActing("");}
  };

  const decideSubstitution=async(decision:"approve"|"reject")=>{
    if(!selected||!substitutionDetail||acting)return;
    if(note.trim().length<3){setMessage({type:"error",text:"اكتب ملاحظة واضحة للقرار"});return;}
    setActing(selected.id);setMessage(null);
    try{
      const result=await staff.decideOrderSubstitution(substitutionDetail.id,decision,note);
      clear();
      const delta=Number(result.price_delta_total||0);
      setMessage({type:"ok",text:decision==="approve"?(Math.abs(delta)>=0.01?"تم اعتماد البديل وإنشاء التسوية المالية المطلوبة":"تم اعتماد البديل بدون فرق مالي"):"تم رفض البديل وإرجاع الطلب لمسار التجهيز"});
      await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر حفظ قرار البديل"});}
    finally{setActing("");}
  };

  const settleFinancial=async()=>{
    if(!selected||!financialDetail||acting)return;
    if(providerReference.trim().length<2){setMessage({type:"error",text:"اكتب مرجع عملية التحصيل أو الرد"});return;}
    if(note.trim().length<3){setMessage({type:"error",text:"اكتب ملاحظة واضحة للتسوية"});return;}
    setActing(selected.id);setMessage(null);
    try{
      if(selected.source_kind==="order_substitution_financial_adjustment")await staff.settleOrderSubstitutionFinancialAdjustment(financialDetail.id,providerReference,note);
      else await staff.settleOrderShortageFinancialAdjustment(financialDetail.id,providerReference,note);
      clear();setMessage({type:"ok",text:financialDetail.direction==="charge"?"تم تسجيل تحصيل فرق الطلب":"تم تسجيل رد المبلغ وتسوية الطلب"});await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر تسوية فرق الطلب"});}
    finally{setActing("");}
  };

  const completeGeneral=async()=>{
    if(!selected||acting)return;
    if(note.trim().length<3){setMessage({type:"error",text:"اكتب نتيجة المراجعة"});return;}
    setActing(selected.id);
    try{await staff.completeTask(selected.id,note);clear();setMessage({type:"ok",text:"تم تسجيل نتيجة المراجعة"});await load(false);}
    catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر إغلاق الموافقة"});}
    finally{setActing("");}
  };

  return <>
    <PageTitle title="الموافقات" subtitle="Inbox واحد للمشرف والمدير حسب صلاحياته"/>
    {message&&<div className={message.type==="ok"?"success-box":"error-box"}>{message.text}</div>}
    <div className="approval-summary"><div><strong>{data?.summary.pending||0}</strong><span>معلقة</span></div><div><strong>{data?.summary.mine||0}</strong><span>عندي</span></div><div><strong>{data?.summary.overdue||0}</strong><span>متأخرة</span></div><div><strong>{data?.summary.critical||0}</strong><span>حرجة</span></div></div>
    <div className="chips">{([["pending","معلقة"],["mine","عندي"],["overdue","متأخرة"],["completed","مكتملة"]] as Array<[staff.ApprovalScope,string]>).map(([id,label])=><button key={id} className={scope===id?"active":""} onClick={()=>setScope(id)}>{label}</button>)}<button onClick={()=>void load()}><RefreshCw className={busy?"spin":""}/>تحديث</button></div>
    {busy?<Loading/>:<div className="stack approval-list">{(data?.items||[]).map((item)=><article className={`task-card ${item.is_overdue?"danger":""}`} key={item.id}><div className="row"><span className="pill normal">{approvalSourceLabel(item.source_kind)}</span>{item.priority==="urgent"&&<span className="danger-text">حرجة</span>}</div><h3>{item.title}</h3>{item.description&&<p>{item.description}</p>}<small>{new Date(item.created_at).toLocaleString("ar-EG")}{item.claimed_by_name?` · ${item.claimed_by_name}`:""}</small>{["open","claimed","in_progress","failed"].includes(item.status)&&<div className="actions"><button className="primary" disabled={acting===item.id} onClick={()=>void open(item)}>{acting===item.id?<Loader2 className="spin"/>:<ShieldCheck/>}{item.is_mine?"فتح القرار":"استلام ومراجعة"}</button></div>}</article>)}{!data?.items.length&&<Empty text="مفيش موافقات في القسم ده"/>}</div>}

    {selected&&<div className="inventory-modal-backdrop" onClick={clear}><section className="inventory-modal approval-modal" onClick={(event)=>event.stopPropagation()}>
      <div className="section-head"><div><small>{approvalSourceLabel(selected.source_kind)}</small><h2>{selected.title}</h2></div><button className="icon-btn" onClick={clear}><XCircle/></button></div>
      {selected.description&&<p className="approval-description">{selected.description}</p>}
      {selected.source_kind==="inventory_adjustment"&&inventoryDetail?<>
        <div className="inventory-review-grid"><div><span>رصيد النظام</span><strong>{inventoryDetail.current_system_quantity??"—"}</strong></div><div><span>إعادة العد</span><strong>{inventoryDetail.recount??"—"}</strong></div><div><span>فرق التسوية</span><strong>{inventoryDetail.current_adjustment_delta??"—"}</strong></div></div>
        <label className="inventory-field">سبب التسوية<select value={adjustmentReason} onChange={(e)=>setAdjustmentReason(e.target.value as staff.InventoryAdjustmentReason)}><option value="unknown">غير معروف</option><option value="damage">تالف</option><option value="breakage">كسر</option><option value="theft">فقد / سرقة</option><option value="receiving_error">خطأ استلام</option><option value="selling_error">خطأ بيع</option><option value="previous_error">خطأ رصيد سابق</option></select></label>
        <label className="inventory-field">ملاحظة<textarea rows={3} value={note} onChange={(e)=>setNote(e.target.value)}/></label>
        <div className="actions"><button className="secondary" disabled={Boolean(acting)} onClick={()=>void decideInventory("reject")}>رفض وإعادة عد</button><button className="primary" disabled={Boolean(acting)} onClick={()=>void decideInventory("approve")}>اعتماد</button></div>
      </>:selected.source_kind==="hr_request"&&hrDetail?<>
        <div className="approval-person"><UserRound/><div><strong>{hrDetail.employee.name}</strong><span>{hrDetail.request.request_type==="leave"?"طلب إجازة":hrDetail.request.request_type==="salary_advance"?"طلب سلفة":"تصحيح حضور"}</span></div></div>
        <div className="approval-request-body"><strong>السبب</strong><p>{hrDetail.request.reason}</p><pre>{JSON.stringify(hrDetail.request.payload,null,2)}</pre></div>
        <label className="inventory-field">ملاحظة القرار<textarea rows={3} value={note} onChange={(e)=>setNote(e.target.value)}/></label>
        <div className="actions"><button className="secondary" disabled={Boolean(acting)} onClick={()=>void decideHr("rejected")}>رفض</button><button className="primary" disabled={Boolean(acting)} onClick={()=>void decideHr("approved")}>اعتماد</button></div>
      </>:selected.source_kind==="attendance_exception"&&attendanceDetail?<>
        <div className="approval-person"><MapPin/><div><strong>{attendanceDetail.employee_name}</strong><span>{attendanceDetail.distance_m==null?"المسافة غير متاحة":`يبعد ${Math.round(attendanceDetail.distance_m)} متر عن الفرع`}</span></div></div>
        {attendanceDetail.verification_photo_signed_url&&<img className="attendance-review-photo" src={attendanceDetail.verification_photo_signed_url} alt="صورة تحقق الحضور"/>}
        <div className="approval-request-body"><strong>السبب</strong><p>{attendanceDetail.reason}</p></div>
        <label className="inventory-field">ملاحظة القرار<textarea rows={3} value={note} onChange={(e)=>setNote(e.target.value)}/></label>
        <div className="actions"><button className="secondary" disabled={Boolean(acting)} onClick={()=>void decideAttendance("rejected")}>رفض</button><button className="primary" disabled={Boolean(acting)} onClick={()=>void decideAttendance("approved")}>اعتماد</button></div>
      </>:selected.source_kind==="order_substitution"&&substitutionDetail?<>
        <div className="substitution-review-card">
          <div className="substitution-product"><span>الأصلي</span><strong>{substitutionDetail.original_product_name}</strong><small>{Number(substitutionDetail.original_unit_price).toLocaleString("ar-EG")} ج.م</small></div>
          <ArrowRight/>
          <div className="substitution-product replacement">{substitutionDetail.replacement_image_url&&<img src={substitutionDetail.replacement_image_url} alt=""/>}<span>البديل المقترح</span><strong>{substitutionDetail.replacement_product_name}</strong><small>{Number(substitutionDetail.replacement_unit_price).toLocaleString("ar-EG")} ج.م × {substitutionDetail.quantity}</small></div>
        </div>
        <div className="approval-finance-impact"><span>فرق إجمالي الطلب</span><strong className={Number(substitutionDetail.price_delta_total)>0?"charge":Number(substitutionDetail.price_delta_total)<0?"refund":""}>{Number(substitutionDetail.price_delta_total).toLocaleString("ar-EG",{minimumFractionDigits:2})} ج.م</strong></div>
        <label className="inventory-field">ملاحظة القرار<textarea rows={3} value={note} onChange={(e)=>setNote(e.target.value)} placeholder="سبب الاعتماد أو الرفض"/></label>
        <div className="actions"><button className="secondary" disabled={Boolean(acting)} onClick={()=>void decideSubstitution("reject")}>رفض البديل</button><button className="primary" disabled={Boolean(acting)} onClick={()=>void decideSubstitution("approve")}>اعتماد البديل</button></div>
      </>:["order_substitution_financial_adjustment","order_shortage_financial_adjustment"].includes(selected.source_kind)&&financialDetail?<>
        <div className="approval-request-body">
          <strong>{selected.source_kind==="order_shortage_financial_adjustment"?financialDetail.product_name:`${financialDetail.original_product_name||""} → ${financialDetail.replacement_product_name||""}`}</strong>
          <p>{financialDetail.direction==="charge"?"مطلوب تحصيل فرق من العميل":"مطلوب رد مبلغ للعميل"} · وسيلة الدفع {financialDetail.payment_method||"غير محددة"}</p>
        </div>
        <div className="inventory-review-grid"><div><span>قبل</span><strong>{Number(financialDetail.order_total_before).toFixed(2)}</strong></div><div><span>{financialDetail.direction==="charge"?"تحصيل":"رد"}</span><strong>{Number(financialDetail.amount).toFixed(2)}</strong></div><div><span>بعد</span><strong>{Number(financialDetail.target_order_total).toFixed(2)}</strong></div></div>
        <label className="inventory-field">مرجع مزود الدفع<input value={providerReference} onChange={(e)=>setProviderReference(e.target.value)} placeholder="رقم العملية / المرجع"/></label>
        <label className="inventory-field">ملاحظة التسوية<textarea rows={3} value={note} onChange={(e)=>setNote(e.target.value)} placeholder="اكتب ما تم فعليًا"/></label>
        <div className="handoff-warning"><ShieldCheck/><span>التأكيد يسجل التسوية في Payment Ledger ويعدل حالة الطلب حسب منطق الباك إند، وليس مجرد إغلاق Task.</span></div>
        <button className="primary full-action" disabled={Boolean(acting)} onClick={()=>void settleFinancial()}>{acting?<Loader2 className="spin"/>:<Check/>}{financialDetail.direction==="charge"?"تأكيد التحصيل":"تأكيد رد المبلغ"}</button>
      </>:<>
        <div className="approval-request-body"><p>راجع التفاصيل ثم سجل نتيجة القرار.</p></div>
        <label className="inventory-field">نتيجة المراجعة<textarea rows={3} value={note} onChange={(e)=>setNote(e.target.value)}/></label>
        <button className="primary full-action" disabled={Boolean(acting)} onClick={()=>void completeGeneral()}>إغلاق الموافقة</button>
      </>}
    </section></div>}
  </>;
}


function localIsoDate(daysAgo=0){
  const date=new Date();
  date.setDate(date.getDate()-daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function ManagerWorkspace({branch}:{branch:StaffBranch}){
  const [from,setFrom]=useState(()=>localIsoDate(6));
  const [to,setTo]=useState(()=>localIsoDate(0));
  const [data,setData]=useState<staff.ManagerOperationsPerformance|null>(null);
  const [approvals,setApprovals]=useState<staff.ApprovalCenter|null>(null);
  const [tasks,setTasks]=useState<staff.OperationsTask[]>([]);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setBusy(true);setError("");
    try{
      const [performance,approvalData,taskRows]=await Promise.all([
        staff.getManagerOperationsPerformance(branch.branch_id,from,to),
        staff.getApprovalCenter(branch.branch_id,"pending").catch(()=>null),
        staff.listTasks(branch.branch_id,"active"),
      ]);
      setData(performance);setApprovals(approvalData);setTasks(taskRows);
    }catch(caught){
      setData(null);setError(caught instanceof Error?caught.message:"تعذر تحميل تشغيل الفريق");
    }finally{setBusy(false);}
  },[branch.branch_id,from,to]);

  useEffect(()=>{void load();},[load]);

  const overdue=tasks.filter((task)=>task.is_overdue).length;
  const urgent=tasks.filter((task)=>task.priority==="urgent"||task.priority==="high").length;
  const attention=(data?.employees||[]).filter((employee)=>employee.needs_attention);
  const inventory=data?.summary.inventory;
  const online=data?.summary.online;
  const cashier=data?.summary.cashier;

  return <>
    <PageTitle title="فريقي اليوم" subtitle="ملخص تشغيل الفرع والتدخلات اللي محتاجة مدير"/>
    <section className="manager-filter-card">
      <div><strong>{branch.branch_name}</strong><span>الفترة القصوى سنة واحدة</span></div>
      <div className="manager-date-range">
        <label>من<input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></label>
        <label>إلى<input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></label>
        <button className="icon-btn" onClick={()=>void load()} aria-label="تحديث"><RefreshCw className={busy?"spin":""}/></button>
      </div>
    </section>
    {error&&<div className="error-box">{error}</div>}
    {busy&&!data?<Loading/>:data&&<>
      <div className="manager-kpis">
        <NavLink to="/approvals"><ShieldCheck/><strong>{approvals?.summary.pending||0}</strong><span>موافقات معلقة</span></NavLink>
        <NavLink to="/tasks"><AlertTriangle/><strong>{overdue}</strong><span>مهام متأخرة</span></NavLink>
        <div><UsersRound/><strong>{data.summary.employees}</strong><span>موظفو الفريق</span></div>
        <div><BellRing/><strong>{urgent}</strong><span>أولوية عالية</span></div>
      </div>

      <section className="manager-section">
        <div className="section-head"><div><h2>صحة التشغيل</h2><p>أرقام فعلية من أنشطة الفريق خلال الفترة</p></div></div>
        <div className="manager-operations-grid">
          <article><PackageCheck/><div><span>الأونلاين</span><strong>{online?.handled_orders||0} طلب</strong><small>{online?.cancellations||0} إلغاء</small></div></article>
          <article><Scale/><div><span>الجرد</span><strong>{inventory?.counts_submitted||0}/{inventory?.counts_assigned||0}</strong><small>{inventory?.differences_found||0} فرق مكتشف</small></div></article>
          <article><Banknote/><div><span>الكاشير</span><strong>{cashier?.invoices||0} فاتورة</strong><small>فرق نقدية {Number(cashier?.cash_variance||0).toLocaleString("ar-EG")} ج.م</small></div></article>
          <article><ClipboardList/><div><span>خدمة العملاء</span><strong>{data.summary.customer_service.closed||0}/{data.summary.customer_service.assigned||0}</strong><small>{data.summary.customer_service.overdue_open||0} متابعة متأخرة</small></div></article>
        </div>
      </section>

      <section className="manager-section">
        <div className="section-head"><div><h2>يحتاج تدخل</h2><p>{data.summary.employees_needing_attention} موظف عليهم مؤشرات تحتاج متابعة</p></div></div>
        <div className="manager-team-list">
          {attention.map((employee)=><article key={employee.user_id} className="manager-employee-card">
            <div className="manager-employee-head"><div className="avatar">{employee.name.slice(0,1)}</div><div><strong>{employee.name}</strong><span>{employee.job_title_name||employee.role}{employee.department_name?` · ${employee.department_name}`:""}</span></div><AlertTriangle/></div>
            <div className="manager-employee-metrics">
              <span>مهام متابعة متأخرة <b>{employee.followups_overdue_open}</b></span>
              <span>فروق جرد <b>{employee.inventory_differences_found}</b></span>
              <span>تعارض إعادة عد <b>{employee.inventory_recounts_conflicting}</b></span>
              <span>فرق كاش <b>{Number(employee.cash_variance||0).toLocaleString("ar-EG")}</b></span>
            </div>
          </article>)}
          {!attention.length&&<div className="manager-all-clear"><CheckCircle2/><strong>مفيش مؤشرات حرجة على الفريق في الفترة دي</strong></div>}
        </div>
      </section>

      <section className="manager-section">
        <div className="section-head"><div><h2>كل الفريق</h2><p>ملخص سريع بدون تقييم أو Score غامض</p></div></div>
        <div className="manager-team-list">
          {data.employees.map((employee)=><article key={employee.user_id} className="manager-employee-card compact">
            <div className="manager-employee-head"><div className="avatar">{employee.name.slice(0,1)}</div><div><strong>{employee.name}</strong><span>{employee.job_title_name||employee.role}</span></div>{employee.needs_attention?<AlertTriangle/>:<CheckCircle2/>}</div>
            <div className="manager-employee-metrics">
              <span>جرد <b>{employee.inventory_counts_submitted}/{employee.inventory_counts_assigned}</b></span>
              <span>أونلاين <b>{employee.online_handled_orders}</b></span>
              <span>توصيل <b>{employee.delivery_delivered}</b></span>
              <span>متابعات <b>{employee.followups_closed}/{employee.followups_assigned}</b></span>
            </div>
          </article>)}
        </div>
      </section>
    </>}
  </>;
}


function CashHandoffPage({branch}:{branch:StaffBranch}){
  const [data,setData]=useState<staff.CashHandoffWorkspace|null>(null);
  const [busy,setBusy]=useState(true);
  const [acting,setActing]=useState("");
  const [selected,setSelected]=useState<staff.CashHandoff|null>(null);
  const [received,setReceived]=useState("");
  const [reason,setReason]=useState("");
  const [message,setMessage]=useState<{type:"ok"|"error";text:string}|null>(null);

  const load=useCallback(async(show=true)=>{
    if(show)setBusy(true);
    try{setData(await staff.getCashHandoffWorkspace(branch.branch_id));setMessage(null);}
    catch(caught){setData(null);setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر تحميل تسليمات الوردية"});}
    finally{if(show)setBusy(false);}
  },[branch.branch_id]);

  useEffect(()=>{void load();},[load]);

  const open=(handoff:staff.CashHandoff)=>{
    setSelected(handoff);
    setReceived(Number(handoff.expected_amount||0).toFixed(2));
    setReason("");
  };

  const submit=async()=>{
    if(!selected||acting)return;
    const amount=Number(received);
    if(!Number.isFinite(amount)||amount<0){setMessage({type:"error",text:"اكتب المبلغ المستلم فعليًا"});return;}
    const variance=Math.round((amount-Number(selected.expected_amount||0))*100)/100;
    if(Math.abs(variance)>=0.01&&reason.trim().length<3){setMessage({type:"error",text:"فيه فرق في العهدة؛ اكتب سبب واضح"});return;}
    setActing(selected.handoff_id);setMessage(null);
    try{
      await staff.receiveCashHandoff(selected.handoff_id,amount,reason);
      setSelected(null);setMessage({type:"ok",text:"تم استلام العهدة وتوريدها للخزنة وتسجيل الحركة المالية"});await load(false);
    }catch(caught){setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر استلام العهدة"});}
    finally{setActing("");}
  };

  const variance=selected?Math.round((Number(received||0)-Number(selected.expected_amount||0))*100)/100:0;
  return <>
    <PageTitle title="تسليمات الوردية" subtitle="استلام عهدة الكاشير بعد إغلاق POS وتوريدها للخزنة"/>
    {message&&<div className={message.type==="ok"?"success-box":"error-box"}>{message.text}</div>}
    {busy?<Loading/>:data&&<>
      <div className="handoff-safe-card"><div><small>خزنة الفرع</small><strong>{data.safe?.name||"الخزنة"}</strong></div><div><small>الرصيد الحالي</small><strong>{Number(data.safe?.balance||0).toLocaleString("ar-EG",{minimumFractionDigits:2,maximumFractionDigits:2})} ج.م</strong></div><button className="icon-btn" onClick={()=>void load()}><RefreshCw/></button></div>
      <section className="manager-section"><div className="section-head"><div><h2>بانتظار الاستلام</h2><p>{data.pending.length} وردية مغلقة لم يتم توريد عهدتها بعد</p></div></div>
        <div className="handoff-list">{data.pending.map((handoff)=><article className="handoff-card" key={handoff.handoff_id}><div className="row"><div><small>{handoff.device_name}</small><h3>{handoff.cashier_name}</h3></div><span className="pill high">معلق</span></div><div className="handoff-amount"><span>المطلوب استلامه</span><strong>{Number(handoff.expected_amount).toLocaleString("ar-EG",{minimumFractionDigits:2,maximumFractionDigits:2})} ج.م</strong></div><small>أُغلقت {new Date(handoff.closed_at).toLocaleString("ar-EG")}</small>{data.permissions.can_manage&&<button className="primary full-action" onClick={()=>open(handoff)}><Banknote/>استلام العهدة</button>}</article>)}{!data.pending.length&&<div className="manager-all-clear"><CheckCircle2/><strong>كل تسليمات الورديات متوردة للخزنة</strong></div>}</div>
      </section>
      <section className="manager-section"><div className="section-head"><div><h2>آخر التسليمات</h2><p>سجل مختصر للاستلامات المؤكدة</p></div></div><div className="handoff-history">{data.recent.slice(0,10).map((item)=><div key={item.handoff_id}><div><strong>{item.cashier_name}</strong><span>{new Date(item.received_at).toLocaleString("ar-EG")} · {item.received_by_name||"المسؤول"}</span></div><div><strong>{Number(item.received_amount).toLocaleString("ar-EG",{minimumFractionDigits:2})} ج.م</strong>{Math.abs(Number(item.variance_amount||0))>=0.01&&<span className="danger-text">فرق {Number(item.variance_amount).toLocaleString("ar-EG",{minimumFractionDigits:2})}</span>}</div></div>)}{!data.recent.length&&<Empty text="لسه مفيش تسليمات مكتملة"/>}</div></section>
    </>}

    {selected&&<div className="inventory-modal-backdrop" onClick={()=>setSelected(null)}><section className="inventory-modal" onClick={(event)=>event.stopPropagation()}>
      <div className="section-head"><div><small>{selected.device_name}</small><h2>استلام عهدة {selected.cashier_name}</h2></div><button className="icon-btn" onClick={()=>setSelected(null)}><XCircle/></button></div>
      <div className="inventory-review-grid"><div><span>المتوقع</span><strong>{Number(selected.expected_amount).toFixed(2)}</strong></div><div><span>المستلم</span><strong>{Number(received||0).toFixed(2)}</strong></div><div><span>الفرق</span><strong>{variance.toFixed(2)}</strong></div></div>
      <label className="inventory-field">المبلغ المعدود فعليًا<input type="number" inputMode="decimal" min="0" step="0.01" value={received} onChange={(e)=>setReceived(e.target.value)}/></label>
      {Math.abs(variance)>=0.01&&<label className="inventory-field">سبب الفرق<textarea rows={3} value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="اكتب سبب الزيادة أو العجز"/></label>}
      <div className="handoff-warning"><ShieldCheck/><span>التأكيد ينشئ حركة مالية من درج الكاشير إلى خزنة الفرع، ولا يمكن اعتباره مجرد إغلاق شكلي.</span></div>
      <button className="primary full-action" disabled={Boolean(acting)} onClick={()=>void submit()}>{acting?<Loader2 className="spin"/>:<Check/>}تأكيد الاستلام والتوريد</button>
    </section></div>}
  </>;
}

function AccountPage({ identity, branch }: { identity: StaffIdentity; branch: StaffBranch }) {
  const navigate=useNavigate();
  const [data,setData]=useState<StaffSelfServiceSnapshot|null>(null);
  const [busy,setBusy]=useState(true);
  const [acting,setActing]=useState(false);
  const [view,setView]=useState<"home"|"advance"|"leave"|"attendance"|"requests">("home");
  const [message,setMessage]=useState<{type:"ok"|"error";text:string}|null>(null);
  const [pushStatus,setPushStatus]=useState<staff.PushDeviceStatus|null>(null);
  const [pushPermission,setPushPermission]=useState<string>("unsupported");
  const [pushBusy,setPushBusy]=useState(false);

  const [advanceAmount,setAdvanceAmount]=useState("");
  const [advanceMonths,setAdvanceMonths]=useState("1");
  const [advanceReason,setAdvanceReason]=useState("");
  const [leaveFrom,setLeaveFrom]=useState("");
  const [leaveTo,setLeaveTo]=useState("");
  const [leaveType,setLeaveType]=useState("annual");
  const [leaveReason,setLeaveReason]=useState("");
  const [attendanceDate,setAttendanceDate]=useState("");
  const [attendanceType,setAttendanceType]=useState("time_correction");
  const [requestedIn,setRequestedIn]=useState("");
  const [requestedOut,setRequestedOut]=useState("");
  const [attendanceReason,setAttendanceReason]=useState("");

  const load=useCallback(async()=>{
    setBusy(true);
    try{
      setData(await staff.getStaffSelfService(branch.branch_id));
    }catch(caught){
      setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر تحميل خدمات الموظف"});
    }finally{setBusy(false);}
  },[branch.branch_id]);

  useEffect(()=>{void load();},[load]);

  const loadPush=useCallback(async()=>{
    if(!isStaffPushSupported()){
      setPushPermission("unsupported");
      setPushStatus(null);
      return;
    }
    const [permission,status]=await Promise.all([
      getStaffPushPermissionState(),
      staff.getMyPushDeviceStatus().catch(()=>null),
    ]);
    setPushPermission(permission);
    setPushStatus(status);
  },[]);

  useEffect(()=>{void loadPush();},[loadPush]);

  const enablePush=async()=>{
    setPushBusy(true);setMessage(null);
    try{
      const status=await enableStaffPush();
      setPushStatus(status);
      setPushPermission(await getStaffPushPermissionState());
      setMessage({type:"ok",text:"تم تسجيل الجهاز لاستقبال إشعارات العمل"});
    }catch(caught){
      setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر تفعيل إشعارات العمل"});
    }finally{setPushBusy(false);}
  };

  const disablePush=async()=>{
    setPushBusy(true);setMessage(null);
    try{
      await disableStaffPush();
      setPushStatus(await staff.getMyPushDeviceStatus().catch(()=>({registered:false,device_count:0,platforms:[],providers:[]})));
      setPushPermission(await getStaffPushPermissionState());
      setMessage({type:"ok",text:"تم إيقاف Push على هذا الجهاز"});
    }catch(caught){
      setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر إيقاف إشعارات الجهاز"});
    }finally{setPushBusy(false);}
  };


  const submitRequest=async(kind:"salary_advance"|"leave"|"attendance_correction")=>{
    setActing(true);setMessage(null);
    try{
      if(kind==="salary_advance"){
        if(Number(advanceAmount)<=0||advanceReason.trim().length<5)throw new Error("اكتب مبلغًا وسببًا واضحًا للسلفة");
        await staff.submitMyHrRequest(branch.branch_id,kind,{
          amount:Number(advanceAmount),
          repayment_months:Number(advanceMonths),
        },advanceReason.trim());
        setAdvanceAmount("");setAdvanceMonths("1");setAdvanceReason("");
      }else if(kind==="leave"){
        if(!leaveFrom||!leaveTo||leaveReason.trim().length<5)throw new Error("حدد فترة الإجازة واكتب السبب");
        await staff.submitMyHrRequest(branch.branch_id,kind,{
          start_date:leaveFrom,end_date:leaveTo,leave_type:leaveType,partial_day:"none",
        },leaveReason.trim());
        setLeaveFrom("");setLeaveTo("");setLeaveReason("");
      }else{
        if(!attendanceDate||(!requestedIn&&!requestedOut)||attendanceReason.trim().length<5)throw new Error("أكمل بيانات تصحيح الحضور");
        await staff.submitMyHrRequest(branch.branch_id,kind,{
          attendance_date:attendanceDate,
          correction_type:attendanceType,
          requested_check_in:requestedIn||null,
          requested_check_out:requestedOut||null,
        },attendanceReason.trim());
        setAttendanceDate("");setRequestedIn("");setRequestedOut("");setAttendanceReason("");
      }
      setMessage({type:"ok",text:"تم إرسال الطلب للمراجعة"});
      setView("requests");
      await load();
    }catch(caught){
      const raw=caught instanceof Error?caught.message:"تعذر إرسال الطلب";
      setMessage({type:"error",text:raw.includes("HR_PENDING_REQUEST_EXISTS")?"عندك طلب من نفس النوع ما زال قيد المراجعة":raw});
    }finally{setActing(false);}
  };

  const cancelRequest=async(item:StaffSelfServiceRequest)=>{
    if(item.status!=="pending"||!window.confirm("إلغاء الطلب؟"))return;
    setActing(true);setMessage(null);
    try{
      await staff.cancelMyHrRequest(item.id);
      setMessage({type:"ok",text:"تم إلغاء الطلب"});
      await load();
    }catch(caught){
      setMessage({type:"error",text:caught instanceof Error?caught.message:"تعذر إلغاء الطلب"});
    }finally{setActing(false);}
  };

  if(busy&&!data)return <Loading/>;
  const profile=data?.profile;
  const recentRequests=data?.requests||[];
  const pushRegistered=Boolean(pushStatus?.registered);
  const pushStateLabel=pushPermission==="unsupported"
    ?"متاح في تطبيق Android فقط"
    :pushRegistered
      ?"هذا الجهاز مسجل للإشعارات"
      :pushPermission==="denied"
        ?"الإذن مرفوض من إعدادات الهاتف"
        :pushPermission==="granted"
          ?"الإذن موجود والجهاز يحتاج إعادة تسجيل"
          :"الإشعارات غير مفعلة بعد";

  return <>
    <PageTitle title="خدماتي" subtitle="هويتك وطلباتك وخدمات الموارد البشرية"/>
    {message&&<div className={message.type==="ok"?"success-box":"error-box"}>{message.text}</div>}

    <section className="employee-identity-card">
      <div className="employee-card-head">
        <div className="avatar">{(profile?.name||identity.name).slice(0,1)}</div>
        <div><small>{profile?.employee_code||"موظف"}</small><h2>{profile?.name||identity.name}</h2><p>{profile?.job_title?.name_ar||branch.role_name_ar} · {branch.branch_name}</p></div>
        <IdCard/>
      </div>
      {data?.employee_card?.barcode&&<EmployeeBarcode value={data.employee_card.barcode}/>}
      <div className="employee-card-meta">
        <span>رقم العضوية <b dir="ltr">{data?.employee_card?.membership_number||"—"}</b></span>
        {profile?.department?.name_ar&&<span>القسم <b>{profile.department.name_ar}</b></span>}
        {profile?.manager?.name&&<span>المدير <b>{profile.manager.name}</b></span>}
      </div>
    </section>

    <div className="self-service-stats">
      <div><Banknote/><strong>{Number(data?.advance_summary?.outstanding_amount||0).toLocaleString("ar-EG")} ج.م</strong><span>سلف متبقية</span></div>
      <div><CalendarDays/><strong>{Number(data?.leave_summary?.approved_days_ytd||0)}</strong><span>أيام إجازة معتمدة هذا العام</span></div>
      <div><FileText/><strong>{recentRequests.filter((r)=>r.status==="pending").length}</strong><span>طلبات قيد المراجعة</span></div>
    </div>

    <div className="self-service-menu">
      <button className={view==="home"?"active":""} onClick={()=>setView("home")}><IdCard/>بياناتي</button>
      <button className={view==="advance"?"active":""} onClick={()=>setView("advance")}><Banknote/>طلب سلفة</button>
      <button className={view==="leave"?"active":""} onClick={()=>setView("leave")}><CalendarDays/>طلب إجازة</button>
      <button className={view==="attendance"?"active":""} onClick={()=>setView("attendance")}><Clock3/>تصحيح حضور</button>
      <button className={view==="requests"?"active":""} onClick={()=>setView("requests")}><FileText/>طلباتي</button>
    </div>

    {view==="home"&&<section className="self-service-panel">
      <h3>بيانات العمل</h3>
      <div className="profile-facts">
        <div><span>الحالة</span><strong>{profile?.employment_status==="active"?"نشط":profile?.employment_status||"—"}</strong></div>
        <div><span>نظام العمل</span><strong>{profile?.work_mode||"—"}</strong></div>
        <div><span>نوع العقد</span><strong>{profile?.contract_type||"—"}</strong></div>
        <div><span>تاريخ التعيين</span><strong>{profile?.hire_date?new Date(profile.hire_date).toLocaleDateString("ar-EG"):"—"}</strong></div>
      </div>
      <div className="staff-push-card">
        <div className="staff-push-head"><BellRing/><div><strong>إشعارات العمل</strong><span>{pushStateLabel}</span></div><b className={pushRegistered?"ready":pushPermission==="denied"?"blocked":"pending"}>{pushRegistered?"مفعلة":pushPermission==="denied"?"مرفوضة":"غير مفعلة"}</b></div>
        {pushPermission!=="unsupported"&&<div className="staff-push-meta"><span>الأجهزة المسجلة <b>{pushStatus?.device_count||0}</b></span><span>المزود <b>{pushStatus?.providers?.join(", ")||"—"}</b></span></div>}
        {pushPermission==="unsupported"?<p>تسجيل Push Native يتم من نسخة Android فقط.</p>:pushRegistered
          ?<button className="secondary full-action" disabled={pushBusy} onClick={()=>void disablePush()}>{pushBusy?<Loader2 className="spin"/>:<Bell/>}إيقاف Push على هذا الجهاز</button>
          :<button className="primary full-action" disabled={pushBusy} onClick={()=>void enablePush()}>{pushBusy?<Loader2 className="spin"/>:<BellRing/>}تفعيل إشعارات العمل</button>}
      </div>
      {(data?.advances?.length??0)>0&&<><h3>السلف الحالية</h3><div className="request-list">{(data?.advances??[]).slice(0,3).map((item)=><div className="request-row" key={item.id}><div><strong>{Number(item.principal_amount).toLocaleString("ar-EG")} ج.م</strong><small>متبقي {Number(item.outstanding_amount).toLocaleString("ar-EG")} ج.م · {item.repayment_months} شهر</small></div><span>{requestStatusLabel(item.status)}</span></div>)}</div></>}
    </section>}

    {view==="advance"&&<section className="self-service-panel request-form">
      <div className="service-panel-title"><Banknote/><div><h3>طلب سلفة راتب</h3><p>الطلب يذهب للمراجعة ثم الصرف حسب سياسة الموارد البشرية.</p></div></div>
      <label>المبلغ<input type="number" min="1" inputMode="decimal" value={advanceAmount} onChange={(e)=>setAdvanceAmount(e.target.value)} placeholder="مثال: 1000"/></label>
      <label>عدد أشهر السداد<select value={advanceMonths} onChange={(e)=>setAdvanceMonths(e.target.value)}>{[1,2,3,4,5,6,9,12].map((n)=><option key={n} value={n}>{n} شهر</option>)}</select></label>
      <label>سبب السلفة<textarea rows={3} value={advanceReason} onChange={(e)=>setAdvanceReason(e.target.value)} placeholder="اكتب سبب الطلب"/></label>
      <button className="primary" disabled={acting} onClick={()=>void submitRequest("salary_advance")}>{acting?<Loader2 className="spin"/>:<Send/>}إرسال طلب السلفة</button>
    </section>}

    {view==="leave"&&<section className="self-service-panel request-form">
      <div className="service-panel-title"><CalendarDays/><div><h3>طلب إجازة</h3><p>حدد الفترة والنوع وسيصل الطلب للمسؤول.</p></div></div>
      <div className="form-grid"><label>من<input type="date" value={leaveFrom} onChange={(e)=>setLeaveFrom(e.target.value)}/></label><label>إلى<input type="date" value={leaveTo} onChange={(e)=>setLeaveTo(e.target.value)}/></label></div>
      <label>نوع الإجازة<select value={leaveType} onChange={(e)=>setLeaveType(e.target.value)}><option value="annual">سنوية</option><option value="casual">عارضة</option><option value="sick">مرضية</option><option value="unpaid">بدون أجر</option><option value="other">أخرى</option></select></label>
      <label>السبب<textarea rows={3} value={leaveReason} onChange={(e)=>setLeaveReason(e.target.value)} placeholder="سبب الإجازة"/></label>
      <button className="primary" disabled={acting} onClick={()=>void submitRequest("leave")}>{acting?<Loader2 className="spin"/>:<Send/>}إرسال طلب الإجازة</button>
    </section>}

    {view==="attendance"&&<section className="self-service-panel request-form">
      <div className="service-panel-title"><Clock3/><div><h3>تصحيح الحضور</h3><p>لنسيان تسجيل الدخول/الخروج أو تصحيح وقت مسجل.</p></div></div>
      <label>التاريخ<input type="date" value={attendanceDate} onChange={(e)=>setAttendanceDate(e.target.value)}/></label>
      <label>نوع التصحيح<select value={attendanceType} onChange={(e)=>setAttendanceType(e.target.value)}><option value="time_correction">تصحيح وقت</option><option value="missed_check_in">نسيان الحضور</option><option value="missed_check_out">نسيان الانصراف</option><option value="other">أخرى</option></select></label>
      <div className="form-grid"><label>وقت الحضور المطلوب<input type="time" value={requestedIn} onChange={(e)=>setRequestedIn(e.target.value)}/></label><label>وقت الانصراف المطلوب<input type="time" value={requestedOut} onChange={(e)=>setRequestedOut(e.target.value)}/></label></div>
      <label>السبب<textarea rows={3} value={attendanceReason} onChange={(e)=>setAttendanceReason(e.target.value)} placeholder="اشرح سبب التصحيح"/></label>
      <button className="primary" disabled={acting} onClick={()=>void submitRequest("attendance_correction")}>{acting?<Loader2 className="spin"/>:<Send/>}إرسال طلب التصحيح</button>
    </section>}

    {view==="requests"&&<section className="self-service-panel">
      <div className="section-head"><h3>طلباتي</h3><button className="icon-btn" onClick={()=>void load()}><RefreshCw/></button></div>
      <div className="request-list">{recentRequests.map((item)=><article className="request-row request-history" key={item.id}><div><div className="row"><strong>{requestTypeLabel(item.request_type)}</strong><span className={`request-status ${item.status}`}>{requestStatusLabel(item.status)}</span></div><p>{item.reason}</p><small>{new Date(item.requested_at).toLocaleString("ar-EG")}</small>{item.decision_note&&<em>{item.decision_note}</em>}</div>{item.status==="pending"&&<button className="cancel-request" disabled={acting} onClick={()=>void cancelRequest(item)}><XCircle/>إلغاء</button>}</article>)}{!recentRequests.length&&<Empty text="لسه مفيش طلبات"/>}</div>
    </section>}

    <button className="logout self-service-logout" onClick={async()=>{try{await disableStaffPush();}catch{/* logout must not be blocked by push cleanup */}await supabase.auth.signOut();navigate("/login",{replace:true});}}><LogOut/>تسجيل الخروج</button>
  </>;
}

const PageTitle=({title,subtitle}:{title:string;subtitle:string})=><div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div></div>;
const Loading=()=> <div className="loading"><Loader2 className="spin"/><span>جاري التحميل…</span></div>;
const Empty=({text}:{text:string})=><div className="empty"><UsersRound/><p>{text}</p></div>;

function AuthenticatedApp({state}:{state:ReturnType<typeof useStaffSession>}) {
  if(state.loading)return <Loading/>;
  if(!state.identity||!state.branch)return <Navigate to="/login" replace/>;
  const props={identity:state.identity,branch:state.branch};
  return <Shell {...props}><Routes><Route path="/" element={<HomePage {...props}/>}/><Route path="/tasks" element={<TasksPage branch={state.branch}/>}/><Route path="/operations" element={<OperationsPage branch={state.branch} identity={state.identity}/>}/><Route path="/operations/:orderId" element={<PickingPage branch={state.branch}/>}/><Route path="/inventory" element={<InventoryPage branch={state.branch}/>}/><Route path="/approvals" element={<ApprovalsPage branch={state.branch}/>}/><Route path="/manager" element={<ManagerWorkspace branch={state.branch}/>}/><Route path="/handoffs" element={<CashHandoffPage branch={state.branch}/>}/><Route path="/attendance" element={<AttendancePage branch={state.branch}/>}/><Route path="/notifications" element={<NotificationsPage branch={state.branch} identity={state.identity}/>}/><Route path="/account" element={<AccountPage {...props}/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Shell>;
}

export default function App(){
  return <BrowserRouter><SessionContext>{(state)=><Routes><Route path="/login" element={state.identity?<Navigate to="/" replace/>:<Login/>}/><Route path="/*" element={<AuthenticatedApp state={state}/>}/></Routes>}</SessionContext></BrowserRouter>;
}

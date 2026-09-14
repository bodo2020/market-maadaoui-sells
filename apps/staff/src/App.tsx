import {
  FormEvent,
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
import {
  AlertTriangle,
  ArrowRight,
  Barcode,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Home,
  Loader2,
  LogOut,
  PackageCheck,
  Play,
  RefreshCw,
  Scale,
  ScanLine,
  UserRound,
  UsersRound,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import * as staff from "./services/staffService";
import type {
  FulfillmentOrder,
  PickingItem,
  PickingSession,
  StaffBranch,
  StaffIdentity,
} from "./services/staffService";

type SessionState = {
  loading: boolean;
  identity: StaffIdentity | null;
  branch: StaffBranch | null;
};

function useStaffSession() {
  const [state, setState] = useState<SessionState>({ loading: true, identity: null, branch: null });

  const resolve = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setState({ loading: false, identity: null, branch: null });
      return;
    }

    try {
      const [identity, branches] = await Promise.all([
        staff.getStaffIdentity(),
        staff.getStaffBranches(),
      ]);
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

const SessionContext = ({
  children,
}: {
  children: (state: ReturnType<typeof useStaffSession>) => React.ReactNode;
}) => children(useStaffSession());

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
          <label>
            اسم المستخدم
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label>
            كلمة المرور
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary" disabled={busy}>
            {busy ? <Loader2 className="spin" /> : "تسجيل الدخول"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Shell({
  identity,
  branch,
  children,
}: {
  identity: StaffIdentity;
  branch: StaffBranch;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <header>
        <div>
          <small>{branch.branch_name}</small>
          <strong>أهلًا، {identity.name}</strong>
        </div>
        <button className="icon-btn" aria-label="الإشعارات"><Bell /></button>
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
          <NavLink key={to as string} to={to as string} end={to === "/"}>
            {<Icon size={20} />}
            <span>{label as string}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function HomePage({ identity, branch }: { identity: StaffIdentity; branch: StaffBranch }) {
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
      <section className="hero">
        <small>{branch.role_name_ar}</small>
        <h1>يومي</h1>
        <p>{attendance?.active_session ? "أنت داخل الوردية الآن" : "ابدأ يومك وتابع أول مهمة مطلوبة"}</p>
      </section>
      <div className="stats">
        <div><strong>{tasks.length}</strong><span>مهام نشطة</span></div>
        <div><strong>{overdue}</strong><span>متأخرة</span></div>
        <div><strong>{attendance?.active_session ? "نشط" : "—"}</strong><span>الحضور</span></div>
      </div>
      <section className="section">
        <div className="section-head">
          <h2>الأولوية الآن</h2>
          <button className="icon-btn" onClick={() => void load()}>
            {busy ? <Loader2 className="spin" /> : <RefreshCw />}
          </button>
        </div>
        {current ? <TaskCard task={current} onChanged={load} /> : <Empty text="مفيش مهام محتاجة منك إجراء حاليًا" />}
      </section>
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
      <div className="row">
        <span className={`pill ${task.priority}`}>
          {task.priority === "urgent" ? "عاجل" : task.priority === "high" ? "عالي" : "عادي"}
        </span>
        {task.is_overdue && <span className="danger-text">متأخرة</span>}
      </div>
      <h3>{task.title}</h3>
      {task.description && <p>{task.description}</p>}
      <small>{task.source_kind}</small>
      <div className="actions">
        {task.status === "open" && task.can_claim && (
          <button className="primary" onClick={() => void act("claim")} disabled={busy}>استلام المهمة</button>
        )}
        {task.is_mine && task.status === "claimed" && (
          <button className="primary" onClick={() => void act("start")} disabled={busy}><Play />بدء التنفيذ</button>
        )}
        {task.is_mine && task.status === "in_progress" && (
          <button className="primary" onClick={() => void act("complete")} disabled={busy}><CheckCircle2 />تم التنفيذ</button>
        )}
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

  return (
    <>
      <PageTitle title="المهام" subtitle="كل المطلوب منك في الفرع" />
      <div className="chips">
        {[["active", "نشطة"], ["mine", "مهامي"], ["overdue", "متأخرة"], ["completed", "مكتملة"]].map(([id, label]) => (
          <button className={scope === id ? "active" : ""} onClick={() => setScope(id)} key={id}>{label}</button>
        ))}
      </div>
      {busy ? <Loading /> : (
        <div className="stack">
          {rows.map((task) => <TaskCard key={task.id} task={task} onChanged={load} />)}
          {!rows.length && <Empty text="مفيش مهام في القسم ده" />}
        </div>
      )}
    </>
  );
}

function useOrderOperationsRealtime(branchId: string, refresh: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`staff-order-ops-${branchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_operations_realtime_signals_v1",
          filter: `branch_id=eq.${branchId}`,
        },
        () => refresh(),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [branchId, refresh]);
}

function OperationsPage({ branch, identity }: { branch: StaffBranch; identity: StaffIdentity }) {
  const navigate = useNavigate();
  const canPrepare = branch.permissions.includes("online_orders.prepare") || branch.permissions.includes("online_orders.manage");
  const [data, setData] = useState<{ summary: Record<string, number>; orders: FulfillmentOrder[] } | null>(null);
  const [busy, setBusy] = useState(true);
  const [acting, setActing] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (showBusy = true) => {
    if (!canPrepare) { setBusy(false); return; }
    if (showBusy) setBusy(true);
    try {
      setData(await staff.getFulfillmentWorkspace(branch.branch_id));
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

  if (!canPrepare) {
    return <><PageTitle title="التشغيل" subtitle="المحتوى بيتغير حسب دورك" /><Empty text="مفيش وحدة تشغيل مفعّلة لدورك حاليًا" /></>;
  }

  return (
    <>
      <PageTitle title="تجهيز الطلبات" subtitle="جمع بالباركود، نواقص، تعبئة وتجهيز" />
      {error && <div className="error-box">{error}</div>}
      {busy && !data ? <Loading /> : (
        <>
          <div className="stats">
            <div><strong>{data?.summary.queued || 0}</strong><span>في الطابور</span></div>
            <div><strong>{data?.summary.picking || 0}</strong><span>تجهيز</span></div>
            <div><strong>{data?.summary.ready || 0}</strong><span>جاهز</span></div>
          </div>
          <div className="stack">
            {(data?.orders || []).map((order) => {
              const resolved = order.items_picked + order.shortage_count + order.substitution_count;
              const progress = order.items_total ? Math.round((resolved / order.items_total) * 100) : 0;
              const mine = order.picker_user_id === identity.user_id;
              return (
                <article className={`task-card ${order.eta_risk === "late" ? "danger" : ""}`} key={order.order_id}>
                  <div className="row">
                    <strong>{order.display_id}</strong>
                    <span className={`pill ${order.eta_risk === "late" ? "urgent" : "normal"}`}>{fulfillmentLabel(order.fulfillment_state)}</span>
                  </div>
                  <h3>{order.customer_name}</h3>
                  <p>{resolved}/{order.items_total} سطر مكتمل · {Number(order.amount).toLocaleString("ar-EG")} ج.م</p>
                  <div className="progress"><i style={{ width: `${progress}%` }} /></div>
                  {order.picker_name && <small>المجهز: {order.picker_name}</small>}
                  {order.shortage_count > 0 && <span className="shortage-note">نواقص: {order.shortage_count}</span>}
                  <div className="actions">
                    {order.fulfillment_state === "queued" && !order.picker_user_id && (
                      <button className="primary" onClick={() => void action(order, "claim")} disabled={acting === order.order_id}>استلام الطلب</button>
                    )}
                    {mine && order.fulfillment_state === "queued" && (
                      <button className="primary" onClick={() => void action(order, "start")} disabled={acting === order.order_id}><ScanLine />بدء التجهيز</button>
                    )}
                    {mine && ["picking", "packing"].includes(order.fulfillment_state) && (
                      <button className="primary" onClick={() => navigate(`/operations/${order.order_id}`)}><Barcode />فتح جلسة التجهيز</button>
                    )}
                  </div>
                </article>
              );
            })}
            {!data?.orders.length && <Empty text="مفيش طلبات محتاجة تجهيز حاليًا" />}
          </div>
        </>
      )}
    </>
  );
}

function fulfillmentLabel(value: string) {
  const labels: Record<string, string> = {
    awaiting_confirmation: "بانتظار التأكيد",
    queued: "في الطابور",
    picking: "جاري الجمع",
    packing: "التعبئة",
    ready: "جاهز",
    handed_over: "تم التسليم للمندوب",
  };
  return labels[value] || value;
}

function pickingError(message: string) {
  if (message.includes("BARCODE_NOT_IN_ORDER")) return "الباركود ده مش موجود في الطلب";
  if (message.includes("ITEM_ALREADY_COMPLETE")) return "الكمية المطلوبة من الصنف ده اكتملت بالفعل";
  if (message.includes("WEIGHT_REQUIRED")) return "الصنف وزني — اكتب الوزن الفعلي قبل التأكيد";
  if (message.includes("QUANTITY_EXCEEDS_REQUIRED")) return "الكمية أكبر من المتبقي في الطلب";
  if (message.includes("PICKING_NOT_ACTIVE")) return "جلسة التجهيز غير نشطة";
  if (message.includes("FULFILLMENT_NOT_OWNER")) return "الطلب مستلم بواسطة موظف آخر";
  return "تعذر تسجيل الصنف. حدّث الجلسة وحاول مرة أخرى.";
}

function remainingQuantity(item: PickingItem) {
  return Math.max(0, Number(item.required_quantity) - Number(item.picked_quantity) - Number(item.shortage_quantity) - Number(item.substitution_quantity));
}

function formatQuantity(value: number, weight: boolean) {
  return weight ? `${Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 3 })} كجم` : Number(value).toLocaleString("ar-EG");
}

function PickingPage({ branch }: { branch: StaffBranch }) {
  const navigate = useNavigate();
  const { orderId = "" } = useParams();
  const scannerRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<PickingSession | null>(null);
  const [order, setOrder] = useState<FulfillmentOrder | null>(null);
  const [barcode, setBarcode] = useState("");
  const [weight, setWeight] = useState("");
  const [bags, setBags] = useState("1");
  const [busy, setBusy] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async (showBusy = true) => {
    if (!orderId) return;
    if (showBusy) setBusy(true);
    try {
      const [nextSession, workspace] = await Promise.all([
        staff.getPickingSession(orderId),
        staff.getFulfillmentWorkspace(branch.branch_id),
      ]);
      setSession(nextSession);
      setOrder(workspace.orders.find((entry) => entry.order_id === orderId) || null);
      setMessage(null);
      if (nextSession.fulfillment_state === "picking") {
        window.setTimeout(() => scannerRef.current?.focus(), 50);
      }
    } catch (caught) {
      const text = pickingError(caught instanceof Error ? caught.message : "");
      setMessage({ type: "error", text });
    } finally {
      if (showBusy) setBusy(false);
    }
  }, [branch.branch_id, orderId]);

  useEffect(() => { void load(); }, [load]);
  useOrderOperationsRealtime(branch.branch_id, useCallback(() => { void load(false); }, [load]));

  const matchedItem = useMemo(() => {
    const code = barcode.trim();
    if (!code) return null;
    return session?.items.find((item) => item.barcode === code && remainingQuantity(item) > 0) || null;
  }, [barcode, session?.items]);

  const scan = async (event: FormEvent) => {
    event.preventDefault();
    const code = barcode.trim();
    if (!code || acting) return;
    const target = session?.items.find((item) => item.barcode === code && remainingQuantity(item) > 0);
    const quantity = target?.is_weight_based ? Number(weight) : null;
    if (target?.is_weight_based && (!quantity || quantity <= 0)) {
      setMessage({ type: "error", text: "الصنف وزني — اكتب الوزن الفعلي أولًا" });
      return;
    }

    setActing(true);
    try {
      const result = await staff.scanPickingBarcode(orderId, code, quantity);
      setMessage({ type: "ok", text: `تم تسجيل ${result.line.product_name}` });
      setBarcode("");
      setWeight("");
      await load(false);
    } catch (caught) {
      setMessage({ type: "error", text: pickingError(caught instanceof Error ? caught.message : "") });
    } finally {
      setActing(false);
      window.setTimeout(() => scannerRef.current?.focus(), 50);
    }
  };

  const confirmManual = async (item: PickingItem) => {
    const remaining = remainingQuantity(item);
    let quantity: number | null = null;
    if (item.is_weight_based) {
      const input = window.prompt(`اكتب الوزن الفعلي لـ ${item.product_name} بالكيلو`, String(remaining));
      if (!input) return;
      quantity = Number(input);
      if (!quantity || quantity <= 0) return;
    }
    setActing(true);
    try {
      await staff.confirmPickingItem(item.id, quantity);
      setMessage({ type: "ok", text: `تم تأكيد ${item.product_name}` });
      await load(false);
    } catch (caught) {
      setMessage({ type: "error", text: pickingError(caught instanceof Error ? caught.message : "") });
    } finally {
      setActing(false);
    }
  };

  const shortage = async (item: PickingItem) => {
    const remaining = remainingQuantity(item);
    if (remaining <= 0) return;
    if (!window.confirm(`تسجيل المتبقي من ${item.product_name} كناقص؟`)) return;
    setActing(true);
    try {
      await staff.markPickingShortage(item.id, remaining, "غير متوفر أثناء التجهيز");
      setMessage({ type: "ok", text: `تم تسجيل النقص في ${item.product_name}` });
      await load(false);
    } catch (caught) {
      setMessage({ type: "error", text: pickingError(caught instanceof Error ? caught.message : "") });
    } finally {
      setActing(false);
    }
  };

  const startPacking = async () => {
    setActing(true);
    try {
      await staff.startPacking(orderId, 0);
      await load(false);
    } finally {
      setActing(false);
    }
  };

  const ready = async () => {
    const count = Math.max(1, Number(bags) || 1);
    setActing(true);
    try {
      await staff.markReady(orderId, count);
      navigate("/operations", { replace: true });
    } catch (caught) {
      setMessage({ type: "error", text: pickingError(caught instanceof Error ? caught.message : "") });
    } finally {
      setActing(false);
    }
  };

  if (busy && !session) return <Loading />;
  if (!session) return <><PageTitle title="جلسة التجهيز" subtitle="تعذر تحميل الطلب" /><Empty text="الطلب غير متاح لك أو لم يعد ضمن مهامك" /></>;

  const resolved = session.resolved_count;
  const progress = session.items_total ? Math.round((resolved / session.items_total) * 100) : 0;
  const allResolved = session.items_total > 0 && resolved >= session.items_total;

  return (
    <>
      <div className="picking-header">
        <button className="icon-btn" onClick={() => navigate("/operations")}><ArrowRight /></button>
        <div>
          <small>{order?.display_id || "طلب تجهيز"}</small>
          <h1>{order?.customer_name || "جلسة Picking"}</h1>
        </div>
        <span className="pill normal">{fulfillmentLabel(session.fulfillment_state)}</span>
      </div>

      <section className="picking-progress-card">
        <div className="row"><strong>{resolved}/{session.items_total} سطر مكتمل</strong><strong>{progress}%</strong></div>
        <div className="progress"><i style={{ width: `${progress}%` }} /></div>
        <div className="picking-summary">
          <span>مكتمل {session.items_picked}</span>
          <span>نواقص {session.shortage_count}</span>
          <span>بدائل {session.substitution_count}</span>
        </div>
      </section>

      {message && <div className={message.type === "ok" ? "success-box" : "error-box"}>{message.text}</div>}

      {session.fulfillment_state === "picking" && (
        <form className="scanner-card" onSubmit={scan}>
          <div className="scanner-title"><ScanLine /><div><strong>امسح باركود المنتج</strong><small>الماسح يكتب هنا مباشرة ثم Enter</small></div></div>
          <div className="scanner-input-wrap">
            <Barcode />
            <input
              ref={scannerRef}
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              placeholder="Barcode"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          {matchedItem?.is_weight_based && (
            <label className="weight-field">
              <Scale />
              <span>الوزن الفعلي بالكيلو</span>
              <input type="number" inputMode="decimal" min="0.001" step="0.001" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder={String(remainingQuantity(matchedItem))} />
            </label>
          )}
          <button className="primary scanner-submit" disabled={!barcode.trim() || acting}>
            {acting ? <Loader2 className="spin" /> : <ScanLine />}
            تسجيل الصنف
          </button>
        </form>
      )}

      <div className="picking-items">
        {session.items.map((item) => {
          const remaining = remainingQuantity(item);
          const resolvedLine = ["picked", "shortage", "substituted"].includes(item.status);
          return (
            <article className={`picking-item ${resolvedLine ? "resolved" : ""}`} key={item.id}>
              {item.image_url ? <img src={item.image_url} alt="" /> : <div className="item-placeholder"><PackageCheck /></div>}
              <div className="item-body">
                <div className="row">
                  <strong>{item.product_name}</strong>
                  {resolvedLine && <CheckCircle2 className="resolved-icon" />}
                </div>
                <div className="item-badges">
                  {item.is_weight_based && <span><Scale />وزني</span>}
                  {item.is_bulk && <span>جملة</span>}
                  {!item.barcode && <span className="warning">بدون باركود</span>}
                </div>
                <p>
                  المطلوب: <b>{formatQuantity(item.required_quantity, item.is_weight_based)}</b>
                  {item.picked_quantity > 0 && <> · تم: <b>{formatQuantity(item.picked_quantity, item.is_weight_based)}</b></>}
                  {remaining > 0 && <> · متبقي: <b>{formatQuantity(remaining, item.is_weight_based)}</b></>}
                </p>
                {item.barcode && <small>{item.barcode}</small>}
                {!resolvedLine && (
                  <div className="item-actions">
                    {!item.barcode && <button className="primary" disabled={acting} onClick={() => void confirmManual(item)}>تأكيد يدوي</button>}
                    {item.is_weight_based && item.barcode && <button disabled={acting} onClick={() => { setBarcode(item.barcode || ""); window.setTimeout(() => scannerRef.current?.focus(), 20); }}>إدخال الوزن</button>}
                    <button className="danger-action" disabled={acting} onClick={() => void shortage(item)}>غير متوفر</button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {session.fulfillment_state === "picking" && allResolved && (
        <button className="primary full-action" disabled={acting} onClick={() => void startPacking()}><PackageCheck />بدء التعبئة</button>
      )}

      {session.fulfillment_state === "packing" && (
        <section className="packing-card">
          <h2>التعبئة</h2>
          <p>راجع الأكياس قبل إعلان الطلب جاهز للمندوب.</p>
          <label>عدد الأكياس<input type="number" min="1" inputMode="numeric" value={bags} onChange={(event) => setBags(event.target.value)} /></label>
          <button className="primary full-action" disabled={acting || Number(bags) < 1} onClick={() => void ready()}><CheckCircle2 />الطلب جاهز للاستلام</button>
        </section>
      )}
    </>
  );
}

function AttendancePage({ branch }: { branch: StaffBranch }) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    void staff.getAttendance(branch.branch_id).then(setData).finally(() => setBusy(false));
  }, [branch.branch_id]);
  if (busy) return <Loading />;
  const active = data?.active_session;
  return (
    <>
      <PageTitle title="الحضور" subtitle="وردية وحضور الموظف" />
      <section className="attendance-card">
        <Clock3 />
        <h2>{active ? "أنت داخل الوردية" : "لا توجد وردية حضور مفتوحة"}</h2>
        {active && (
          <>
            <p>دخول: {new Date(active.check_in_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}</p>
            <span className="success">تم تسجيل الحضور</span>
          </>
        )}
        <small>تسجيل الدخول والخروج من الهاتف سيتم تفعيله بعد ربط الجهاز الموثوق في المرحلة التالية.</small>
      </section>
    </>
  );
}

function AccountPage({ identity, branch }: { identity: StaffIdentity; branch: StaffBranch }) {
  const navigate = useNavigate();
  return (
    <>
      <PageTitle title="حسابي" subtitle="هويتك وصلاحياتك في الفرع" />
      <section className="profile">
        <div className="avatar">{identity.name.slice(0, 1)}</div>
        <h2>{identity.name}</h2>
        <p>{branch.role_name_ar} · {branch.branch_name}</p>
        <div className="permission-list">{branch.permissions.slice(0, 8).map((permission) => <span key={permission}>{permission}</span>)}</div>
        <button className="logout" onClick={async () => { await supabase.auth.signOut(); navigate("/login", { replace: true }); }}><LogOut />تسجيل الخروج</button>
      </section>
    </>
  );
}

const PageTitle = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div></div>
);
const Loading = () => <div className="loading"><Loader2 className="spin" /><span>جاري التحميل…</span></div>;
const Empty = ({ text }: { text: string }) => <div className="empty"><UsersRound /><p>{text}</p></div>;

function AuthenticatedApp({ state }: { state: ReturnType<typeof useStaffSession> }) {
  if (state.loading) return <Loading />;
  if (!state.identity || !state.branch) return <Navigate to="/login" replace />;
  const props = { identity: state.identity, branch: state.branch };
  return (
    <Shell {...props}>
      <Routes>
        <Route path="/" element={<HomePage {...props} />} />
        <Route path="/tasks" element={<TasksPage branch={state.branch} />} />
        <Route path="/operations" element={<OperationsPage branch={state.branch} identity={state.identity} />} />
        <Route path="/operations/:orderId" element={<PickingPage branch={state.branch} />} />
        <Route path="/attendance" element={<AttendancePage branch={state.branch} />} />
        <Route path="/account" element={<AccountPage {...props} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionContext>
        {(state) => (
          <Routes>
            <Route path="/login" element={state.identity ? <Navigate to="/" replace /> : <Login />} />
            <Route path="/*" element={<AuthenticatedApp state={state} />} />
          </Routes>
        )}
      </SessionContext>
    </BrowserRouter>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bell,
  BellDot,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  Inbox,
  LogOut,
  PackageX,
  Store,
  Truck,
  User,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { useBranchStore } from "@/stores/branchStore";
import { useNavigate } from "react-router-dom";
import {
  fetchNotificationCenterV2,
  markAllNotificationsReadV2,
  markNotificationReadV2,
  type NotificationCenterItemV2,
} from "@/services/supabase/notificationCenterV2Service";

function itemIcon(item: NotificationCenterItemV2) {
  if (item.category === "inventory") return PackageX;
  if (item.category === "inventory_transfers") return Truck;
  if (item.category === "finance") return WalletCards;
  if (item.severity === "critical") return AlertTriangle;
  return CircleAlert;
}

function itemTone(item: NotificationCenterItemV2) {
  if (item.severity === "critical") return {
    icon: "bg-red-100 text-red-700",
    unread: "bg-red-50/80",
    dot: "bg-red-500",
    label: "عاجل",
  };
  if (item.severity === "high") return {
    icon: "bg-amber-100 text-amber-700",
    unread: "bg-amber-50/80",
    dot: "bg-amber-500",
    label: "مهم",
  };
  return {
    icon: "bg-emerald-50 text-[#005931]",
    unread: "bg-emerald-50/50",
    dot: "bg-[#005931]",
    label: "تنبيه",
  };
}

function relativeTime(value?: string | null) {
  if (!value) return "الآن";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "الآن";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `${minutes.toLocaleString("ar-EG")} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours.toLocaleString("ar-EG")} س`;
  return `${Math.floor(hours / 24).toLocaleString("ar-EG")} يوم`;
}

export default function Navbar() {
  const { user, logout, branchOptions, switchBranch } = useAuth();
  const { currentBranchId, currentBranchName } = useBranchStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [switchingBranchId, setSwitchingBranchId] = useState<string | null>(null);

  const currentBranchContext = branchOptions.find(branch => branch.branch_id === currentBranchId);
  const canSeeNotifications = Boolean(user?.id && currentBranchId);

  const notificationQuery = useQuery({
    queryKey: ["notification-center-v2", currentBranchId, "preview"],
    enabled: canSeeNotifications,
    queryFn: () => fetchNotificationCenterV2(currentBranchId, "all", null, 12),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 20_000,
  });

  const items = (notificationQuery.data?.items || []).filter(item => item.status === "active").slice(0, 8);
  const unreadCount = notificationQuery.data?.summary.unread || 0;
  const criticalCount = notificationQuery.data?.summary.critical || 0;
  const actionCount = notificationQuery.data?.summary.action_required || 0;

  const refreshNotifications = () => {
    queryClient.invalidateQueries({ queryKey: ["notification-center-v2"] });
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleNotificationClick = async (item: NotificationCenterItemV2) => {
    if (!item.read_at) {
      try {
        await markNotificationReadV2(item.id);
      } catch {
        // Opening the relevant screen is more important than blocking on read-state sync.
      }
    }
    refreshNotifications();
    setNotificationsOpen(false);
    navigate(item.action_url || "/notifications");
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsReadV2(currentBranchId);
      refreshNotifications();
    } catch {
      // Keep the dropdown usable if the read-state request fails transiently.
    }
  };

  const handleBranchChange = async (branchId: string) => {
    if (branchId === currentBranchId || switchingBranchId) return;
    try {
      setSwitchingBranchId(branchId);
      await switchBranch(branchId);
      setBranchDropdownOpen(false);
      window.location.reload();
    } finally {
      setSwitchingBranchId(null);
    }
  };

  const openNotificationCenter = () => {
    setNotificationsOpen(false);
    navigate("/notifications");
  };

  const roleLabel = currentBranchContext?.role_name_ar || (user?.role === "super_admin" ? "مدير النظام" : "موظف");

  return (
    <header className="sticky top-0 z-30 flex min-h-[60px] items-center justify-between border-b bg-white px-6 py-3">
      <div className="flex items-center">
        <h2 className="text-lg font-medium">لوحة التحكم</h2>
      </div>

      <div className="flex items-center gap-4">
        {branchOptions.length > 1 ? (
          <DropdownMenu open={branchDropdownOpen} onOpenChange={setBranchDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 px-3 py-1.5">
                <Store className="h-4 w-4" />
                <span className="font-medium">{currentBranchName || "اختر الفرع"}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>فروعك المتاحة</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {branchOptions.map(branch => (
                <DropdownMenuItem
                  key={branch.branch_id}
                  disabled={Boolean(switchingBranchId)}
                  onClick={() => void handleBranchChange(branch.branch_id)}
                  className={currentBranchId === branch.branch_id ? "bg-accent" : ""}
                >
                  <Store className="ml-2 h-4 w-4" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{branch.branch_name}</div>
                    <div className="text-[11px] text-muted-foreground">{branch.branch_code} · {branch.role_name_ar}</div>
                  </div>
                  {switchingBranchId === branch.branch_id ? (
                    <span className="mr-auto inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : currentBranchId === branch.branch_id ? (
                    <Check className="mr-auto h-4 w-4" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : currentBranchName ? (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
            <Store className="h-4 w-4" />
            <span className="font-medium">{currentBranchName}</span>
          </div>
        ) : null}

        {canSeeNotifications && (
          <DropdownMenu open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label="مركز الإشعارات">
                {unreadCount > 0 ? (
                  <>
                    <BellDot size={21} className={criticalCount > 0 ? "text-red-600" : "text-[#005931]"} />
                    <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  </>
                ) : (
                  <Bell size={21} />
                )}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-[390px] max-w-[calc(100vw-24px)] overflow-hidden p-0" dir="rtl">
              <div className="bg-[#005931] p-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-black"><Inbox className="h-4 w-4" /> مركز الإشعارات</div>
                    <div className="mt-1 text-[11px] text-emerald-100">{currentBranchName || "الفرع الحالي"}</div>
                  </div>
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 bg-white/10 text-xs text-white hover:bg-white/20 hover:text-white"
                      onClick={() => void handleMarkAllAsRead()}
                    >
                      <Check className="ml-1 h-3.5 w-3.5" /> قراءة الكل
                    </Button>
                  )}
                </div>
                <div className="mt-3 flex gap-2 text-[10px]">
                  <span className="rounded-full bg-white/10 px-2.5 py-1">{unreadCount.toLocaleString("ar-EG")} غير مقروء</span>
                  {criticalCount > 0 && <span className="rounded-full bg-red-500/30 px-2.5 py-1">{criticalCount.toLocaleString("ar-EG")} عاجل</span>}
                  {actionCount > 0 && <span className="rounded-full bg-amber-400/20 px-2.5 py-1">{actionCount.toLocaleString("ar-EG")} يحتاج إجراء</span>}
                </div>
              </div>

              <ScrollArea className="h-[380px] bg-white">
                {notificationQuery.isLoading ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">جاري مزامنة الإشعارات...</div>
                ) : notificationQuery.isError ? (
                  <div className="p-7 text-center">
                    <AlertTriangle className="mx-auto h-6 w-6 text-amber-600" />
                    <p className="mt-2 text-sm font-bold">تعذر تحديث الإشعارات</p>
                    <button className="mt-1 text-xs text-[#005931] underline" onClick={() => void notificationQuery.refetch()}>إعادة المحاولة</button>
                  </div>
                ) : items.length === 0 ? (
                  <div className="p-9 text-center">
                    <Check className="mx-auto h-7 w-7 text-emerald-600" />
                    <p className="mt-2 text-sm font-bold">كل شيء هادئ حاليًا</p>
                    <p className="mt-1 text-xs text-muted-foreground">لا توجد تنبيهات نشطة لهذا الفرع.</p>
                  </div>
                ) : (
                  <div className="py-1">
                    {items.map(item => {
                      const Icon = itemIcon(item);
                      const tone = itemTone(item);
                      const unread = !item.read_at;
                      return (
                        <DropdownMenuItem
                          key={item.id}
                          className={`cursor-pointer rounded-none border-b border-slate-100 p-3.5 focus:bg-slate-50 ${unread ? tone.unread : ""}`}
                          onClick={() => void handleNotificationClick(item)}
                        >
                          <div className="flex w-full gap-3">
                            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <p className="line-clamp-1 text-sm font-black leading-5">{item.title}</p>
                                  {unread && <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />}
                                </div>
                                <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(item.updated_at || item.created_at)}</span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.body}</p>
                              <div className="mt-1.5 flex items-center gap-2 text-[10px] font-semibold text-muted-foreground">
                                <span>{tone.label}</span>
                                {item.requires_action && <span className="text-amber-700">· يحتاج إجراء</span>}
                              </div>
                            </div>
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              <div className="border-t bg-slate-50 p-2">
                <Button variant="ghost" className="w-full justify-between rounded-xl text-[#005931]" onClick={openNotificationCenter}>
                  <span className="font-bold">فتح مركز الإشعارات بالكامل</span>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {user?.name ? user.name.charAt(0) : "أ"}
                </AvatarFallback>
              </Avatar>
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name || "المستخدم"}</p>
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>حسابي</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="ml-2 h-4 w-4" />
              <span>الملف الشخصي</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>الإعدادات</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleLogout()}>
              <LogOut className="ml-2 h-4 w-4" />
              <span>تسجيل الخروج</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

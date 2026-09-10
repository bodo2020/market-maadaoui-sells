import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, UserRole } from "@/types";
import {
  authenticateStaffUser,
  restoreStaffSession,
  selectStaffBranch,
  signOutStaff,
  StaffBranchContext,
} from "@/services/supabase/staffAuthService";
import { createPosQuickSession, LocalPosDevice } from "@/services/supabase/posDeviceService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  branchOptions: StaffBranchContext[];
  branchSelectionRequired: boolean;
  login: (username: string, password: string) => Promise<void>;
  quickLogin: (device: LocalPosDevice, userId: string, pin: string) => Promise<void>;
  selectBranch: (branchId: string) => Promise<void>;
  switchBranch: (branchId: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isAdmin: false,
  branchOptions: [],
  branchSelectionRequired: false,
  login: async () => {},
  quickLogin: async () => {},
  selectBranch: async () => {},
  switchBranch: async () => {},
  logout: async () => {},
});

const POS_TABS_KEY = "pos_tabs";
const POS_ACTIVE_TAB_KEY = "pos_active_tab";
const POS_WORKSPACE_PREFIX = "pos-workspace:v1";

function currentBranchIdFromStorage() {
  const branchId = localStorage.getItem("currentBranchId");
  return branchId && branchId !== "null" ? branchId : null;
}

function posWorkspaceKey(userId: string, branchId: string) {
  return `${POS_WORKSPACE_PREFIX}:${userId}:${branchId}`;
}

function clearLivePosWorkspace() {
  localStorage.removeItem(POS_TABS_KEY);
  localStorage.removeItem(POS_ACTIVE_TAB_KEY);
}

function clearStaffAppLockSession() {
  const keys = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index)).filter(Boolean) as string[];
  keys.filter(key => key.startsWith("staff-app-pin-unlocked:") || key.startsWith("staff-app-pin-locked:")).forEach(key => sessionStorage.removeItem(key));
}

function stashPosWorkspace(userId: string | null | undefined, branchId: string | null | undefined) {
  if (!userId || !branchId) {
    clearLivePosWorkspace();
    return;
  }
  try {
    const tabs = localStorage.getItem(POS_TABS_KEY);
    const activeTab = localStorage.getItem(POS_ACTIVE_TAB_KEY);
    if (tabs) {
      localStorage.setItem(posWorkspaceKey(userId, branchId), JSON.stringify({ tabs, activeTab }));
    }
  } finally {
    clearLivePosWorkspace();
  }
}

function restorePosWorkspace(userId: string | null | undefined, branchId: string | null | undefined) {
  if (!userId || !branchId) {
    clearLivePosWorkspace();
    return;
  }
  try {
    // On a browser refresh the live workspace is the newest copy. Preserve it
    // before reading any older suspended snapshot for the same staff/branch.
    const liveTabs = localStorage.getItem(POS_TABS_KEY);
    const liveActiveTab = localStorage.getItem(POS_ACTIVE_TAB_KEY);
    if (liveTabs) {
      localStorage.setItem(
        posWorkspaceKey(userId, branchId),
        JSON.stringify({ tabs: liveTabs, activeTab: liveActiveTab }),
      );
      return;
    }

    const raw = localStorage.getItem(posWorkspaceKey(userId, branchId));
    clearLivePosWorkspace();
    if (!raw) return;
    const saved = JSON.parse(raw) as { tabs?: string; activeTab?: string | null };
    if (saved.tabs) localStorage.setItem(POS_TABS_KEY, saved.tabs);
    if (saved.activeTab) localStorage.setItem(POS_ACTIVE_TAB_KEY, saved.activeTab);
  } catch {
    clearLivePosWorkspace();
    // Corrupt suspended-cart cache must never block authentication.
  }
}

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [branchOptions, setBranchOptions] = useState<StaffBranchContext[]>([]);
  const [branchSelectionRequired, setBranchSelectionRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

  const applyLoginState = (state: Awaited<ReturnType<typeof authenticateStaffUser>> | null) => {
    if (!state) {
      setUser(null);
      setBranchOptions([]);
      setBranchSelectionRequired(false);
      localStorage.removeItem("user");
      clearLivePosWorkspace();
      clearStaffAppLockSession();
      return;
    }

    setBranchOptions(state.branches);
    setBranchSelectionRequired(state.requiresBranchSelection);
    setUser(state.user);

    if (state.user) {
      localStorage.setItem("user", JSON.stringify(state.user));
      restorePosWorkspace(state.user.id, currentBranchIdFromStorage());
    } else {
      localStorage.removeItem("user");
      clearLivePosWorkspace();
    }
  };

  useEffect(() => {
    let active = true;

    const restore = async () => {
      try {
        const restoredState = await restoreStaffSession();
        if (!active) return;
        applyLoginState(restoredState);
      } catch (error) {
        console.error("Error restoring staff session:", error);
        if (active) applyLoginState(null);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    restore();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && active) {
        clearLivePosWorkspace();
        applyLoginState(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      clearLivePosWorkspace();
      const state = await authenticateStaffUser(username, password);
      applyLoginState(state);

      if (state.user) {
        toast({
          title: "تم تسجيل الدخول بنجاح",
          description: `مرحبًا ${state.user.name}`,
        });
      }
    } catch (error: any) {
      console.error("Login error:", error);
      applyLoginState(null);
      toast({
        title: "خطأ في تسجيل الدخول",
        description: error.message || "اسم المستخدم أو كلمة المرور غير صحيحة",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const quickLogin = async (device: LocalPosDevice, userId: string, pin: string) => {
    try {
      setIsLoading(true);
      clearLivePosWorkspace();
      await createPosQuickSession(device, userId, pin);
      const state = await selectStaffBranch(device.branch_id);
      applyLoginState(state);
      if (!state.user) throw new Error("تعذر تفعيل جلسة الموظف");
      toast({ title: `أهلًا ${state.user.name}`, description: device.device_name });
    } catch (error: any) {
      await supabase.auth.signOut();
      applyLoginState(null);
      toast({
        title: "تعذر الدخول السريع",
        description: error.message || "راجع PIN وحاول مرة تانية",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const activateBranch = async (branchId: string, announce = true) => {
    const previousBranchId = currentBranchIdFromStorage();
    try {
      setIsLoading(true);
      if (user?.id && previousBranchId && previousBranchId !== branchId) {
        stashPosWorkspace(user.id, previousBranchId);
      }
      const state = await selectStaffBranch(branchId);
      applyLoginState(state);
      if (state.user && announce) {
        const branch = state.branches.find(item => item.branch_id === branchId);
        toast({
          title: branchSelectionRequired ? "تم اختيار الفرع" : "تم تغيير الفرع",
          description: branch?.branch_name || "تم تحديث فرع العمل",
        });
      }
    } catch (error: any) {
      if (user?.id && previousBranchId) restorePosWorkspace(user.id, previousBranchId);
      toast({
        title: "تعذر اختيار الفرع",
        description: error.message || "راجع صلاحيات الفرع وحاول مرة تانية",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const selectBranch = async (branchId: string) => activateBranch(branchId, true);
  const switchBranch = async (branchId: string) => activateBranch(branchId, true);

  const logout = async () => {
    const branchId = currentBranchIdFromStorage();
    if (user?.id && branchId) stashPosWorkspace(user.id, branchId);
    try {
      await signOutStaff();
    } finally {
      applyLoginState(null);
      toast({ title: "تم تسجيل الخروج بنجاح" });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isAdmin,
        branchOptions,
        branchSelectionRequired,
        login,
        quickLogin,
        selectBranch,
        switchBranch,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

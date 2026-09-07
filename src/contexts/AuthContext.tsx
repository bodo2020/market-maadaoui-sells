import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, UserRole } from "@/types";
import {
  authenticateStaffUser,
  restoreStaffSession,
  selectStaffBranch,
  signOutStaff,
  StaffBranchContext,
} from "@/services/supabase/staffAuthService";
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
  selectBranch: async () => {},
  switchBranch: async () => {},
  logout: async () => {},
});

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
      return;
    }

    setBranchOptions(state.branches);
    setBranchSelectionRequired(state.requiresBranchSelection);
    setUser(state.user);

    if (state.user) {
      localStorage.setItem("user", JSON.stringify(state.user));
    } else {
      localStorage.removeItem("user");
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

  const activateBranch = async (branchId: string, announce = true) => {
    try {
      setIsLoading(true);
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
        selectBranch,
        switchBranch,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

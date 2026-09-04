import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, UserRole } from "@/types";
import {
  authenticateStaffUser,
  restoreStaffSession,
  signOutStaff,
} from "@/services/supabase/staffAuthService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;
  login: (username: string, password: string, branchCode: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isAdmin: false,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const isAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

  useEffect(() => {
    let active = true;

    const restore = async () => {
      try {
        const restoredUser = await restoreStaffSession();
        if (!active) return;

        setUser(restoredUser);
        if (restoredUser) {
          // Kept only for legacy UI/services that read display/role data from localStorage.
          // Authentication itself is never based on this value anymore.
          localStorage.setItem("user", JSON.stringify(restoredUser));
        } else {
          localStorage.removeItem("user");
        }
      } catch (error) {
        console.error("Error restoring staff session:", error);
        if (active) {
          setUser(null);
          localStorage.removeItem("user");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    restore();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && active) {
        setUser(null);
        localStorage.removeItem("user");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (username: string, password: string, branchCode: string) => {
    try {
      setIsLoading(true);
      const authenticatedUser = await authenticateStaffUser(username, password, branchCode);

      setUser(authenticatedUser);
      localStorage.setItem("user", JSON.stringify(authenticatedUser));

      toast({
        title: "تم تسجيل الدخول بنجاح",
        description: `مرحبًا ${authenticatedUser.name}`,
      });
    } catch (error: any) {
      console.error("Login error:", error);
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

  const logout = async () => {
    try {
      await signOutStaff();
    } finally {
      setUser(null);
      localStorage.removeItem("user");
      toast({
        title: "تم تسجيل الخروج بنجاح",
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isAdmin,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

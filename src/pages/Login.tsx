
import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { LogIn, UserPlus } from "lucide-react";
import { UserRole } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createUser } from "@/services/supabase/userService";

export default function Login() {
  // Login state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Register state
  const [registerName, setRegisterName] = useState("");
  const [registerPhone, setRegisterPhone] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerRole, setRegisterRole] = useState<UserRole>(UserRole.CASHIER);
  const [isRegistering, setIsRegistering] = useState(false);
  
  const { login, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال اسم المستخدم وكلمة المرور",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsLoading(true);
      await login(username, password);
      navigate("/");
    } catch (error) {
      // Error is handled in the auth context
      console.error("Login failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!registerName || !registerPhone || !registerPassword) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال جميع البيانات المطلوبة",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsRegistering(true);
      await createUser({
        name: registerName,
        phone: registerPhone,
        password: registerPassword,
        role: registerRole,
        username: registerPhone, // Using phone as username as specified in the userService
      });
      
      toast({
        title: "تم التسجيل بنجاح",
        description: "يمكنك الآن تسجيل الدخول باستخدام رقم الهاتف وكلمة المرور",
      });
      
      // Reset form
      setRegisterName("");
      setRegisterPhone("");
      setRegisterPassword("");
      setRegisterRole(UserRole.CASHIER);
    } catch (error) {
      console.error("Registration failed:", error);
      toast({
        title: "فشل في التسجيل",
        description: typeof error === 'object' && error !== null && 'message' in error 
          ? String(error.message) 
          : "حدث خطأ أثناء محاولة إنشاء حساب جديد",
        variant: "destructive"
      });
    } finally {
      setIsRegistering(false);
    }
  };

  // If user is already authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">نظام إدارة المتجر</CardTitle>
            <CardDescription className="text-center">
              أدخل بيانات الدخول للوصول إلى لوحة التحكم
            </CardDescription>
          </CardHeader>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid grid-cols-2 mx-6">
              <TabsTrigger value="login">تسجيل الدخول</TabsTrigger>
              <TabsTrigger value="register">إنشاء حساب</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <CardContent className="space-y-4 pt-4">
                <form onSubmit={handleLogin}>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">اسم المستخدم</Label>
                      <Input
                        id="username"
                        placeholder="اسم المستخدم"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">كلمة المرور</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="كلمة المرور"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <span className="flex items-center">
                          <span className="animate-spin mr-2">◌</span>
                          جاري التحميل...
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <LogIn className="mr-2 h-4 w-4" />
                          تسجيل الدخول
                        </span>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
              <CardFooter className="flex justify-center">
                <p className="text-sm text-muted-foreground">
                  * استخدم اسم المستخدم: admin وكلمة المرور: admin للدخول
                </p>
              </CardFooter>
            </TabsContent>
            
            <TabsContent value="register">
              <CardContent className="space-y-4 pt-4">
                <form onSubmit={handleRegister}>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-name">الاسم</Label>
                      <Input
                        id="register-name"
                        placeholder="الاسم"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-phone">رقم الهاتف</Label>
                      <Input
                        id="register-phone"
                        placeholder="رقم الهاتف"
                        value={registerPhone}
                        onChange={(e) => setRegisterPhone(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">كلمة المرور</Label>
                      <Input
                        id="register-password"
                        type="password"
                        placeholder="كلمة المرور"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-role">الدور</Label>
                      <select 
                        id="register-role"
                        className="w-full h-10 px-3 rounded-md border border-input bg-background"
                        value={registerRole}
                        onChange={(e) => setRegisterRole(e.target.value as UserRole)}
                      >
                        <option value={UserRole.ADMIN}>مدير</option>
                        <option value={UserRole.CASHIER}>كاشير</option>
                        <option value={UserRole.EMPLOYEE}>موظف</option>
                        <option value={UserRole.DELIVERY}>توصيل</option>
                      </select>
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isRegistering}
                    >
                      {isRegistering ? (
                        <span className="flex items-center">
                          <span className="animate-spin mr-2">◌</span>
                          جاري التسجيل...
                        </span>
                      ) : (
                        <span className="flex items-center">
                          <UserPlus className="mr-2 h-4 w-4" />
                          إنشاء حساب
                        </span>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

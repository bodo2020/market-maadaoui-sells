import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function TrustedDeviceLauncher({ employeeId }: { employeeId: string }) {
  const navigate = useNavigate();
  return <Button variant="outline" onClick={() => navigate(`/employees/${employeeId}/devices`)}><ShieldCheck className="ml-2 h-4 w-4" />الأجهزة الموثوقة</Button>;
}

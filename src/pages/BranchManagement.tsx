import { useState } from "react";
import { Plus, Building, MapPin, Phone, Mail, Settings, Users, Package, DollarSign } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { fetchBranches, getBranchStatistics } from "@/services/supabase/branchService";
import { Branch } from "@/types";
import { BranchFormDialog } from "@/components/branches/BranchFormDialog";
import { useBranch } from "@/contexts/BranchContext";
import { useAuth } from "@/contexts/AuthContext";

export default function BranchManagement() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const { currentBranch, canManageMultipleBranches } = useBranch();
  const { user } = useAuth();

  const { data: branches = [], refetch: refetchBranches } = useQuery({
    queryKey: ['branches'],
    queryFn: fetchBranches,
    enabled: canManageMultipleBranches
  });

  const handleAddBranch = () => {
    setSelectedBranch(null);
    setIsFormOpen(true);
  };

  const handleEditBranch = (branch: Branch) => {
    setSelectedBranch(branch);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setSelectedBranch(null);
    refetchBranches();
  };

  // If user can't manage multiple branches, show only their branch info
  if (!canManageMultipleBranches) {
    return (
      <MainLayout>
        <div className="container mx-auto p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">معلومات الفرع</h1>
              <p className="text-muted-foreground">عرض معلومات الفرع الخاص بك</p>
            </div>
          </div>

          {currentBranch && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  {currentBranch.name}
                </CardTitle>
                <CardDescription>
                  {currentBranch.active ? 
                    <Badge variant="default">نشط</Badge> : 
                    <Badge variant="secondary">غير نشط</Badge>
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentBranch.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{currentBranch.address}</span>
                  </div>
                )}
                {currentBranch.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{currentBranch.phone}</span>
                  </div>
                )}
                {currentBranch.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{currentBranch.email}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">إدارة الفروع</h1>
            <p className="text-muted-foreground">إدارة جميع فروع المتجر</p>
          </div>
          <Button onClick={handleAddBranch} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            إضافة فرع جديد
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map((branch) => (
            <BranchCard 
              key={branch.id} 
              branch={branch} 
              onEdit={handleEditBranch}
            />
          ))}
        </div>

        <BranchFormDialog
          isOpen={isFormOpen}
          onClose={handleFormClose}
          branch={selectedBranch}
        />
      </div>
    </MainLayout>
  );
}

interface BranchCardProps {
  branch: Branch;
  onEdit: (branch: Branch) => void;
}

function BranchCard({ branch, onEdit }: BranchCardProps) {
  const { data: stats } = useQuery({
    queryKey: ['branch-stats', branch.id],
    queryFn: () => getBranchStatistics(branch.id),
  });

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            {branch.name}
          </div>
          <Badge variant={branch.active ? "default" : "secondary"}>
            {branch.active ? "نشط" : "غير نشط"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {branch.address && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{branch.address}</span>
          </div>
        )}
        {branch.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{branch.phone}</span>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 gap-2 pt-2 border-t">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                المبيعات
              </div>
              <div className="font-semibold">{stats.totalSales.toLocaleString()} ج.م</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                <Package className="h-3 w-3" />
                المنتجات
              </div>
              <div className="font-semibold">{stats.productsCount}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                <Users className="h-3 w-3" />
                الموظفين
              </div>
              <div className="font-semibold">{stats.employeesCount}</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
                <Building className="h-3 w-3" />
                المعاملات
              </div>
              <div className="font-semibold">{stats.salesCount}</div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onEdit(branch)}
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            إدارة
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
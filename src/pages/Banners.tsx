import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  PlusCircle, 
  PenSquare, 
  Trash2, 
  Loader2, 
  Eye, 
  EyeOff,
  MoveUp,
  MoveDown
} from "lucide-react";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";

interface Banner {
  id: string;
  title: string;
  image_url: string;
  link: string | null;
  active: boolean;
  position: number;
  products?: string[];
  category_id?: string | null;
  company_id?: string | null;
}

export default function Banners() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedBanner, setSelectedBanner] = useState<Banner | null>(null);
  const [updating, setUpdating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchBanners();
  }, []);

  const fetchBanners = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .order('position');

      if (error) throw error;
      setBanners(data || []);
    } catch (error) {
      console.error('Error fetching banners:', error);
      toast.error("حدث خطأ أثناء تحميل البانرات");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (banner: Banner) => {
    try {
      setUpdating(true);
      const { error } = await supabase
        .from('banners')
        .update({ active: !banner.active })
        .eq('id', banner.id);

      if (error) throw error;
      
      setBanners(banners.map(b => 
        b.id === banner.id ? { ...b, active: !b.active } : b
      ));
      
      toast.success(`تم ${banner.active ? 'إلغاء تفعيل' : 'تفعيل'} البانر بنجاح`);
    } catch (error) {
      console.error('Error updating banner:', error);
      toast.error("حدث خطأ أثناء تحديث البانر");
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedBanner) return;
    
    try {
      setUpdating(true);
      const { error } = await supabase
        .from('banners')
        .delete()
        .eq('id', selectedBanner.id);

      if (error) throw error;
      
      // If banner has an image, delete it from storage
      if (selectedBanner.image_url) {
        // Extract filename from URL
        const urlParts = selectedBanner.image_url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        
        if (fileName) {
          await supabase.storage
            .from('banners')
            .remove([fileName]);
        }
      }
      
      setBanners(banners.filter(b => b.id !== selectedBanner.id));
      toast.success("تم حذف البانر بنجاح");
    } catch (error) {
      console.error('Error deleting banner:', error);
      toast.error("حدث خطأ أثناء حذف البانر");
    } finally {
      setUpdating(false);
      setIsDeleteDialogOpen(false);
      setSelectedBanner(null);
    }
  };

  const handleMovePosition = async (banner: Banner, direction: 'up' | 'down') => {
    // Sort banners by position
    const sortedBanners = [...banners].sort((a, b) => a.position - b.position);
    
    // Find current index
    const currentIndex = sortedBanners.findIndex(b => b.id === banner.id);
    
    // Check if move is possible
    if (
      (direction === 'up' && currentIndex === 0) || 
      (direction === 'down' && currentIndex === sortedBanners.length - 1)
    ) {
      return; // Can't move further
    }
    
    // Find target banner to swap with
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const targetBanner = sortedBanners[targetIndex];
    
    try {
      setUpdating(true);
      
      // Update positions in database
      await Promise.all([
        supabase
          .from('banners')
          .update({ position: targetBanner.position })
          .eq('id', banner.id),
        supabase
          .from('banners')
          .update({ position: banner.position })
          .eq('id', targetBanner.id)
      ]);
      
      // Update local state
      const newBanners = banners.map(b => {
        if (b.id === banner.id) {
          return { ...b, position: targetBanner.position };
        }
        if (b.id === targetBanner.id) {
          return { ...b, position: banner.position };
        }
        return b;
      });
      
      setBanners(newBanners);
      toast.success("تم تغيير ترتيب البانر بنجاح");
    } catch (error) {
      console.error('Error updating banner position:', error);
      toast.error("حدث خطأ أثناء تحديث ترتيب البانر");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">البانرات الإعلانية</h1>
          <Button onClick={() => navigate('/banners/add')}>
            <PlusCircle className="ml-2 h-4 w-4" />
            إضافة بانر جديد
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>قائمة البانرات</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead>العنوان</TableHead>
                    <TableHead>الصورة</TableHead>
                    <TableHead>الرابط</TableHead>
                    <TableHead>المنتجات</TableHead>
                    <TableHead>الارتباط</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الترتيب</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {banners.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center">
                        لا توجد بانرات مسجلة
                      </TableCell>
                    </TableRow>
                  ) : (
                    banners
                      .sort((a, b) => a.position - b.position)
                      .map((banner, index) => (
                        <TableRow key={banner.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>{banner.title}</TableCell>
                          <TableCell>
                            <img 
                              src={banner.image_url} 
                              alt={banner.title} 
                              className="w-20 h-12 object-cover rounded"
                            />
                          </TableCell>
                          <TableCell>
                            {banner.link ? (
                              <a 
                                href={banner.link} 
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline text-sm"
                              >
                                {banner.link}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {banner.products && banner.products.length > 0 ? (
                              <Badge>{banner.products.length} منتج</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {banner.category_id ? (
                              <Badge variant="outline">قسم</Badge>
                            ) : banner.company_id ? (
                              <Badge variant="outline">شركة</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={banner.active ? "default" : "outline"}>
                              {banner.active ? "مفعل" : "غير مفعل"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center gap-2">
                              <span>{banner.position}</span>
                              <div className="flex flex-col">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-5 w-5"
                                  disabled={index === 0 || updating}
                                  onClick={() => handleMovePosition(banner, 'up')}
                                >
                                  <MoveUp className="h-3 w-3" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-5 w-5"
                                  disabled={index === banners.length - 1 || updating}
                                  onClick={() => handleMovePosition(banner, 'down')}
                                >
                                  <MoveDown className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2 space-x-reverse">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => navigate(`/banners/edit?id=${banner.id}`)}
                              >
                                <PenSquare className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleToggleActive(banner)}
                                disabled={updating}
                              >
                                {banner.active ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  setSelectedBanner(banner);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف البانر؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {updating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}

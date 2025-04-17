
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

interface Banner {
  id: string;
  title: string;
  image_url: string;
  link: string | null;
  active: boolean;
  position: number;
}

export default function Banners() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">البانرات الإعلانية</h1>
          <Button onClick={() => {}}>إضافة بانر جديد</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>قائمة البانرات</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>جاري التحميل...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>العنوان</TableHead>
                    <TableHead>الصورة</TableHead>
                    <TableHead>الرابط</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الترتيب</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {banners.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">
                        لا توجد بانرات مسجلة
                      </TableCell>
                    </TableRow>
                  ) : (
                    banners.map((banner) => (
                      <TableRow key={banner.id}>
                        <TableCell>{banner.title}</TableCell>
                        <TableCell>
                          <img 
                            src={banner.image_url} 
                            alt={banner.title} 
                            className="w-20 h-12 object-cover rounded"
                          />
                        </TableCell>
                        <TableCell>{banner.link || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={banner.active ? "default" : "outline"}>
                            {banner.active ? "مفعل" : "غير مفعل"}
                          </Badge>
                        </TableCell>
                        <TableCell>{banner.position}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">تعديل</Button>
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
    </MainLayout>
  );
}

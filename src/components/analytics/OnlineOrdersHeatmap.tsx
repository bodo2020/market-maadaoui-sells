import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchOnlineOrdersHeatmapData } from "@/services/supabase/analyticsService";
import { Clock, Calendar, TrendingUp, ShoppingCart } from "lucide-react";

export function OnlineOrdersHeatmap() {
  const { data: heatmapData = [], isLoading, error } = useQuery({
    queryKey: ["online-orders-heatmap"],
    queryFn: fetchOnlineOrdersHeatmapData,
    refetchOnWindowFocus: false,
  });

  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // تجميع البيانات في مصفوفة للخريطة الحرارية
  const heatmapMatrix = days.map((day, dayIndex) => 
    hours.map(hour => {
      const dataPoint = heatmapData.find(item => 
        item.dayOfWeek === dayIndex && item.hour === hour
      );
      return {
        day: dayIndex,
        hour,
        orderCount: dataPoint?.orderCount || 0,
        dayName: day
      };
    })
  ).flat();

  // العثور على أقصى عدد طلبات لتحديد شدة اللون
  const maxOrders = Math.max(...heatmapData.map(item => item.orderCount), 1);
  const totalOrders = heatmapData.reduce((sum, item) => sum + item.orderCount, 0);

  // تحديد لون الخلية بناءً على عدد الطلبات (أخضر للطلبات الأونلاين)
  const getCellColor = (orderCount: number) => {
    if (orderCount === 0) return 'bg-gray-100';
    const intensity = orderCount / maxOrders;
    if (intensity < 0.2) return 'bg-green-100';
    if (intensity < 0.4) return 'bg-green-200';
    if (intensity < 0.6) return 'bg-green-400';
    if (intensity < 0.8) return 'bg-green-600';
    return 'bg-green-800';
  };

  const getCellTextColor = (orderCount: number) => {
    const intensity = orderCount / maxOrders;
    return intensity > 0.6 ? 'text-white' : 'text-gray-700';
  };

  // حساب إجمالي الطلبات لكل يوم
  const dailyTotals = days.map((day, dayIndex) => {
    const dayTotal = heatmapData
      .filter(item => item.dayOfWeek === dayIndex)
      .reduce((sum, item) => sum + item.orderCount, 0);
    return { day, total: dayTotal };
  });

  // حساب إجمالي الطلبات لكل ساعة
  const hourlyTotals = hours.map(hour => {
    const hourTotal = heatmapData
      .filter(item => item.hour === hour)
      .reduce((sum, item) => sum + item.orderCount, 0);
    return { hour, total: hourTotal };
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-96 bg-gray-200 rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            <p>حدث خطأ في تحميل البيانات</p>
            <p className="text-sm text-gray-500">{error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {heatmapData.length === 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-yellow-600">
              <ShoppingCart className="h-12 w-12 mx-auto mb-4" />
              <p className="text-lg font-medium">لا توجد طلبات أونلاين حالياً</p>
              <p className="text-sm text-gray-500">سيتم عرض ساعات العمل عند توفر طلبات أونلاين</p>
            </div>
          </CardContent>
        </Card>
      )}

      {heatmapData.length > 0 && (
        <>
          {/* إحصائيات سريعة */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <ShoppingCart className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">{totalOrders}</p>
                    <p className="text-sm text-muted-foreground">إجمالي الطلبات الأونلاين</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Calendar className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {dailyTotals.reduce((max, day) => Math.max(max, day.total), 0)}
                    </p>
                    <p className="text-sm text-muted-foreground">أكثر الأيام نشاطاً</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Clock className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-2xl font-bold">{maxOrders}</p>
                    <p className="text-sm text-muted-foreground">أكثر الأوقات نشاطاً</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* الخريطة الحرارية */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                ساعات العمل - الطلبات الأونلاين
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                توزيع الطلبات الأونلاين حسب اليوم والساعة - الألوان الداكنة تشير إلى نشاط أكثر
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  {/* رؤوس الساعات */}
                  <div className="flex mb-2">
                    <div className="w-20"></div>
                    {hours.map(hour => (
                      <div key={hour} className="w-8 text-center text-xs font-medium">
                        {hour}
                      </div>
                    ))}
                  </div>

                  {/* صفوف الأيام */}
                  {days.map((day, dayIndex) => (
                    <div key={day} className="flex items-center mb-1">
                      <div className="w-20 text-sm font-medium text-right pl-2">
                        {day}
                      </div>
                      {hours.map(hour => {
                        const cellData = heatmapMatrix.find(
                          item => item.day === dayIndex && item.hour === hour
                        );
                        return (
                          <div
                            key={`${dayIndex}-${hour}`}
                            className={`
                              w-8 h-8 border border-gray-200 flex items-center justify-center text-xs font-medium
                              ${getCellColor(cellData?.orderCount || 0)}
                              ${getCellTextColor(cellData?.orderCount || 0)}
                              hover:scale-110 transition-transform cursor-pointer
                            `}
                            title={`${day} - ${hour}:00 - ${cellData?.orderCount || 0} طلب`}
                          >
                            {cellData?.orderCount || 0}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* مقياس الألوان */}
                  <div className="mt-4 flex items-center gap-2">
                    <span className="text-sm font-medium">قليل</span>
                    <div className="flex gap-1">
                      <div className="w-4 h-4 bg-gray-100 border"></div>
                      <div className="w-4 h-4 bg-green-100 border"></div>
                      <div className="w-4 h-4 bg-green-200 border"></div>
                      <div className="w-4 h-4 bg-green-400 border"></div>
                      <div className="w-4 h-4 bg-green-600 border"></div>
                      <div className="w-4 h-4 bg-green-800 border"></div>
                    </div>
                    <span className="text-sm font-medium">كثير</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* إحصائيات يومية */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>إجمالي الطلبات حسب اليوم</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dailyTotals
                    .sort((a, b) => b.total - a.total)
                    .map((dayData, index) => (
                      <div key={dayData.day} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">#{index + 1}</span>
                          <span className="font-medium">{dayData.day}</span>
                        </div>
                        <span className="font-bold text-green-600">{dayData.total} طلب</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>أكثر الساعات نشاطاً</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {hourlyTotals
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 10)
                    .map((hourData, index) => (
                      <div key={hourData.hour} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">#{index + 1}</span>
                          <span className="font-medium">{hourData.hour}:00</span>
                        </div>
                        <span className="font-bold text-green-600">{hourData.total} طلب</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
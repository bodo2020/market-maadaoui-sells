import { supabase } from "@/integrations/supabase/client";

// جلب تحليلات مبيعات المنتجات مع الربح الحقيقي
export async function fetchProductSalesAnalytics() {
  try {
    // جلب المبيعات من المتجر مع بيانات الربح
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("items, profit");

    if (salesError) throw salesError;

    // جلب الطلبات الإلكترونية
    const { data: ordersData, error: ordersError } = await supabase
      .from("online_orders")
      .select("items");

    if (ordersError) throw ordersError;

    // جلب بيانات المنتجات
    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select("id, name, price, purchase_price");

    if (productsError) throw productsError;

    // إنشاء خريطة للمنتجات
    const productsMap = new Map();
    productsData?.forEach(product => {
      productsMap.set(product.id, product);
    });

    // تجميع بيانات المبيعات
    const productSalesMap = new Map();

    // معالجة مبيعات المتجر
    salesData?.forEach(sale => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          const productId = item.product?.id || item.productId;
          const quantity = item.quantity || item.weight || 0;
          const total = item.total || 0;
          const product = productsMap.get(productId);

          if (productId && product) {
            if (!productSalesMap.has(productId)) {
              productSalesMap.set(productId, {
                id: productId,
                name: product.name,
                totalQuantity: 0,
                totalRevenue: 0,
                totalProfit: 0
              });
            }

            const productSales = productSalesMap.get(productId);
            productSales.totalQuantity += Number(quantity);
            productSales.totalRevenue += Number(total);
            
            // حساب الربح الحقيقي لكل منتج
            const itemProfit = (item.price - product.purchase_price) * quantity;
            productSales.totalProfit += itemProfit;
          }
        });
      }
    });

    // معالجة الطلبات الإلكترونية
    ordersData?.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const productId = item.product?.id || item.productId;
          const quantity = item.quantity || item.weight || 0;
          const total = item.total || 0;
          const product = productsMap.get(productId);

          if (productId && product) {
            if (!productSalesMap.has(productId)) {
              productSalesMap.set(productId, {
                id: productId,
                name: product.name,
                totalQuantity: 0,
                totalRevenue: 0,
                totalProfit: 0
              });
            }

            const productSales = productSalesMap.get(productId);
            productSales.totalQuantity += Number(quantity);
            productSales.totalRevenue += Number(total);
            
            // حساب الربح الحقيقي لكل منتج
            const itemProfit = (item.price - product.purchase_price) * quantity;
            productSales.totalProfit += itemProfit;
          }
        });
      }
    });

    // تحويل النتائج إلى مصفوفة وترتيبها
    const result = Array.from(productSalesMap.values())
      .sort((a, b) => b.totalQuantity - a.totalQuantity);

    return result;
  } catch (error) {
    console.error("Error fetching product sales analytics:", error);
    throw error;
  }
}

// جلب تحليلات مبيعات الفئات
export async function fetchCategorySalesAnalytics() {
  try {
    // جلب المبيعات والطلبات
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("items");

    if (salesError) throw salesError;

    const { data: ordersData, error: ordersError } = await supabase
      .from("online_orders")
      .select("items");

    if (ordersError) throw ordersError;

    // جلب المنتجات مع فئاتها
    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select(`
        id, 
        name, 
        main_category_id,
        subcategory_id
      `);

    if (productsError) throw productsError;

    // جلب الفئات الرئيسية
    const { data: categoriesData, error: categoriesError } = await supabase
      .from("main_categories")
      .select("id, name");

    if (categoriesError) throw categoriesError;

    // إنشاء خريطة للفئات
    const categoriesMap = new Map();
    categoriesData?.forEach(category => {
      categoriesMap.set(category.id, category.name);
    });

    // إنشاء خريطة للمنتجات
    const productsMap = new Map();
    productsData?.forEach(product => {
      productsMap.set(product.id, {
        ...product,
        categoryName: categoriesMap.get(product.main_category_id) || 'غير مصنف'
      });
    });

    // تجميع بيانات المبيعات حسب الفئة
    const categorySalesMap = new Map();

    // دالة لمعالجة العناصر
    const processItems = (items: any[]) => {
      items.forEach((item: any) => {
        const productId = item.product?.id || item.productId;
        const quantity = item.quantity || item.weight || 0;
        const total = item.total || 0;

        if (productId && productsMap.has(productId)) {
          const product = productsMap.get(productId);
          const categoryName = product.categoryName;

          if (!categorySalesMap.has(categoryName)) {
            categorySalesMap.set(categoryName, {
              name: categoryName,
              totalQuantity: 0,
              totalRevenue: 0
            });
          }

          const categorySales = categorySalesMap.get(categoryName);
          categorySales.totalQuantity += Number(quantity);
          categorySales.totalRevenue += Number(total);
        }
      });
    };

    // معالجة مبيعات المتجر
    salesData?.forEach(sale => {
      if (sale.items && Array.isArray(sale.items)) {
        processItems(sale.items);
      }
    });

    // معالجة الطلبات الإلكترونية
    ordersData?.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        processItems(order.items);
      }
    });

    // تحويل النتائج إلى مصفوفة وترتيبها
    const result = Array.from(categorySalesMap.values())
      .sort((a, b) => b.totalQuantity - a.totalQuantity);

    return result;
  } catch (error) {
    console.error("Error fetching category sales analytics:", error);
    throw error;
  }
}

// جلب بيانات ساعات العمل للطلبات الأونلاين
export async function fetchOnlineOrdersHeatmapData() {
  try {
    // جلب الطلبات الإلكترونية فقط
    const { data: ordersData, error: ordersError } = await supabase
      .from("online_orders")
      .select("created_at")
      .not("created_at", "is", null);

    if (ordersError) {
      console.error("Error fetching online orders data:", ordersError);
      throw ordersError;
    }

    console.log("Online orders data count:", ordersData?.length || 0);

    // تجميع البيانات حسب اليوم والساعة
    const heatmapMap = new Map<string, number>();

    ordersData?.forEach(order => {
      if (order.created_at) {
        try {
          const date = new Date(order.created_at);
          if (isNaN(date.getTime())) {
            console.warn("Invalid date:", order.created_at);
            return;
          }
          
          const dayOfWeek = date.getDay();
          const hour = date.getHours();
          const key = `${dayOfWeek}-${hour}`;

          heatmapMap.set(key, (heatmapMap.get(key) || 0) + 1);
        } catch (error) {
          console.warn("Error parsing date:", order.created_at, error);
        }
      }
    });

    // تحويل البيانات إلى مصفوفة
    const result = Array.from(heatmapMap.entries()).map(([key, orderCount]) => {
      const [dayOfWeek, hour] = key.split('-').map(Number);
      return {
        dayOfWeek,
        hour,
        orderCount
      };
    });

    return result;
  } catch (error) {
    console.error("Error fetching online orders heatmap data:", error);
    throw error;
  }
}

// جلب بيانات ساعات العمل لمبيعات الكاشير
export async function fetchPOSSalesHeatmapData() {
  try {
    // جلب المبيعات من الكاشير فقط
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("date")
      .not("date", "is", null);

    if (salesError) {
      console.error("Error fetching POS sales data:", salesError);
      throw salesError;
    }

    console.log("POS sales data count:", salesData?.length || 0);

    // تجميع البيانات حسب اليوم والساعة
    const heatmapMap = new Map<string, number>();

    salesData?.forEach(sale => {
      if (sale.date) {
        try {
          const date = new Date(sale.date);
          if (isNaN(date.getTime())) {
            console.warn("Invalid date:", sale.date);
            return;
          }
          
          const dayOfWeek = date.getDay();
          const hour = date.getHours();
          const key = `${dayOfWeek}-${hour}`;

          heatmapMap.set(key, (heatmapMap.get(key) || 0) + 1);
        } catch (error) {
          console.warn("Error parsing date:", sale.date, error);
        }
      }
    });

    // تحويل البيانات إلى مصفوفة
    const result = Array.from(heatmapMap.entries()).map(([key, orderCount]) => {
      const [dayOfWeek, hour] = key.split('-').map(Number);
      return {
        dayOfWeek,
        hour,
        orderCount
      };
    });

    return result;
  } catch (error) {
    console.error("Error fetching POS sales heatmap data:", error);
    throw error;
  }
}

// Product sales analytics
export const getProductSalesAnalytics = async (productId: string) => {
  try {
    // Mock data - in real implementation, you would query actual sales data
    // This would require joining sales data with product information
    
    const mockAnalytics = {
      totalSales: Math.floor(Math.random() * 10000) + 1000,
      totalProfit: Math.floor(Math.random() * 5000) + 500,
      totalQuantitySold: Math.floor(Math.random() * 500) + 50,
      dailySales: [
        { date: '2024-01-01', sales: 150, profit: 75, quantity: 10 },
        { date: '2024-01-02', sales: 200, profit: 100, quantity: 15 },
        { date: '2024-01-03', sales: 180, profit: 90, quantity: 12 },
        { date: '2024-01-04', sales: 250, profit: 125, quantity: 18 },
        { date: '2024-01-05', sales: 220, profit: 110, quantity: 16 },
      ],
      topCustomers: [
        { customerName: 'أحمد محمد', totalPurchases: 15, totalSpent: 2500 },
        { customerName: 'فاطمة علي', totalPurchases: 12, totalSpent: 2100 },
        { customerName: 'محمد السيد', totalPurchases: 10, totalSpent: 1800 },
      ]
    };

    return mockAnalytics;
  } catch (error) {
    console.error('Error fetching product sales analytics:', error);
    throw error;
  }
};
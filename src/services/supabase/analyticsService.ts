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

// جلب بيانات الخريطة الحرارية للطلبات
export async function fetchOrderHeatmapData() {
  try {
    // جلب المبيعات من المتجر مع استخدام حقل date
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("date")
      .not("date", "is", null);

    if (salesError) {
      console.error("Error fetching sales data:", salesError);
      throw salesError;
    }

    // جلب الطلبات الإلكترونية
    const { data: ordersData, error: ordersError } = await supabase
      .from("online_orders")
      .select("created_at")
      .not("created_at", "is", null);

    if (ordersError) {
      console.error("Error fetching orders data:", ordersError);
      throw ordersError;
    }

    console.log("Sales data count:", salesData?.length || 0);
    console.log("Orders data count:", ordersData?.length || 0);

    // تجميع جميع التواريخ
    const allDates: string[] = [];
    
    // إضافة تواريخ المبيعات (استخدام حقل date)
    salesData?.forEach(sale => {
      if (sale.date) {
        allDates.push(sale.date);
      }
    });

    // إضافة تواريخ الطلبات الإلكترونية
    ordersData?.forEach(order => {
      if (order.created_at) {
        allDates.push(order.created_at);
      }
    });

    console.log("Total dates found:", allDates.length);

    // تجميع البيانات حسب اليوم والساعة
    const heatmapMap = new Map<string, number>();

    allDates.forEach(dateString => {
      try {
        const date = new Date(dateString);
        // التأكد من صحة التاريخ
        if (isNaN(date.getTime())) {
          console.warn("Invalid date:", dateString);
          return;
        }
        
        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const hour = date.getHours();
        const key = `${dayOfWeek}-${hour}`;

        heatmapMap.set(key, (heatmapMap.get(key) || 0) + 1);
      } catch (error) {
        console.warn("Error parsing date:", dateString, error);
      }
    });

    console.log("Heatmap data points:", heatmapMap.size);

    // تحويل البيانات إلى مصفوفة
    const result = Array.from(heatmapMap.entries()).map(([key, orderCount]) => {
      const [dayOfWeek, hour] = key.split('-').map(Number);
      return {
        dayOfWeek,
        hour,
        orderCount
      };
    });

    console.log("Final heatmap result:", result.length, "data points");
    
    return result;
  } catch (error) {
    console.error("Error fetching order heatmap data:", error);
    throw error;
  }
}
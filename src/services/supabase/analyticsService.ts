import { supabase } from "@/integrations/supabase/client";

// جلب تحليلات مبيعات المنتجات مع الربح الحقيقي
export async function fetchProductSalesAnalytics() {
  try {
    // Get current branch ID
    const currentBranchId = localStorage.getItem("currentBranchId");
    
    // جلب المبيعات من المتجر مع بيانات الربح
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("items, profit, branch_id")
      .eq("branch_id", currentBranchId);

    if (salesError) throw salesError;

    // جلب الطلبات الإلكترونية
    const { data: ordersData, error: ordersError } = await supabase
      .from("online_orders")
      .select("items, branch_id")
      .eq("branch_id", currentBranchId);

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
    // Get current branch ID
    const currentBranchId = localStorage.getItem("currentBranchId");
    
    // جلب المبيعات والطلبات
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("items, branch_id")
      .eq("branch_id", currentBranchId);

    if (salesError) throw salesError;

    const { data: ordersData, error: ordersError } = await supabase
      .from("online_orders")
      .select("items, branch_id")
      .eq("branch_id", currentBranchId);

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
    // Get current branch ID
    const currentBranchId = localStorage.getItem("currentBranchId");
    
    // جلب الطلبات الإلكترونية فقط
    const { data: ordersData, error: ordersError } = await supabase
      .from("online_orders")
      .select("created_at, branch_id")
      .eq("branch_id", currentBranchId)
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
    // Get current branch ID
    const currentBranchId = localStorage.getItem("currentBranchId");
    
    // جلب المبيعات من الكاشير فقط
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("date, branch_id")
      .eq("branch_id", currentBranchId)
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
    // Get current branch ID
    const currentBranchId = localStorage.getItem("currentBranchId");
    
    // جلب مبيعات المتجر التي تحتوي على هذا المنتج
    const { data: salesData, error: salesError } = await supabase
      .from("sales")
      .select("items, profit, total, date, branch_id")
      .eq("branch_id", currentBranchId)
      .not('items', 'is', null);

    if (salesError) throw salesError;

    // جلب الطلبات الإلكترونية التي تحتوي على هذا المنتج
    const { data: ordersData, error: ordersError } = await supabase
      .from("online_orders")
      .select("items, total, created_at, customer_id, branch_id")
      .eq("branch_id", currentBranchId)
      .not('items', 'is', null);

    if (ordersError) throw ordersError;

    // جلب بيانات العملاء
    const { data: customersData, error: customersError } = await supabase
      .from("customers")
      .select("id, name");

    if (customersError) throw customersError;

    // إنشاء خريطة للعملاء
    const customersMap = new Map();
    customersData?.forEach(customer => {
      customersMap.set(customer.id, customer.name);
    });

    let totalSales = 0;
    let totalProfit = 0;
    let totalQuantitySold = 0;
    const dailySalesMap = new Map();
    const customerPurchasesMap = new Map();

    // معالجة مبيعات المتجر
    salesData?.forEach(sale => {
      if (sale.items && Array.isArray(sale.items)) {
        sale.items.forEach((item: any) => {
          const itemProductId = item.product?.id || item.productId;
          
          if (itemProductId === productId) {
            const quantity = Number(item.quantity ?? item.weight ?? 0);
            const unitSell = Number(item.price ?? item.product?.price ?? 0);
            const unitCost = Number(item.product?.purchase_price ?? 0);
            const itemTotal = Number(item.total ?? unitSell * quantity);
            const itemProfit = (unitSell - unitCost) * quantity;
            
            totalSales += itemTotal;
            totalProfit += itemProfit;
            totalQuantitySold += quantity;

            // إضافة البيانات اليومية
            const dateKey = sale.date ? new Date(sale.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            if (!dailySalesMap.has(dateKey)) {
              dailySalesMap.set(dateKey, { date: dateKey, sales: 0, profit: 0, quantity: 0 });
            }
            const dayData = dailySalesMap.get(dateKey);
            dayData.sales += itemTotal;
            dayData.profit += itemProfit;
            dayData.quantity += quantity;

            // إضافة بيانات العملاء - تم تعطيلها لأن جدول sales لا يحتوي على customer_id
            // if (sale.customer_id) {
            //   const customerName = customersMap.get(sale.customer_id) || 'عميل غير معروف';
            //   if (!customerPurchasesMap.has(sale.customer_id)) {
            //     customerPurchasesMap.set(sale.customer_id, {
            //       customerName,
            //       totalPurchases: 0,
            //       totalSpent: 0
            //     });
            //   }
            //   const customerData = customerPurchasesMap.get(sale.customer_id);
            //   customerData.totalPurchases += 1;
            //   customerData.totalSpent += itemTotal;
            // }
          }
        });
      }
    });

    // معالجة الطلبات الإلكترونية
    ordersData?.forEach(order => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const itemProductId = item.product?.id || item.productId;
          
          if (itemProductId === productId) {
            const quantity = Number(item.quantity ?? item.weight ?? 0);
            const unitSell = Number(item.price ?? item.product?.price ?? 0);
            const unitCost = Number(item.product?.purchase_price ?? 0);
            const itemTotal = Number(item.total ?? unitSell * quantity);
            const itemProfit = (unitSell - unitCost) * quantity;
            
            totalSales += itemTotal;
            totalProfit += itemProfit;
            totalQuantitySold += quantity;

            // إضافة البيانات اليومية
            const dateKey = order.created_at ? new Date(order.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            if (!dailySalesMap.has(dateKey)) {
              dailySalesMap.set(dateKey, { date: dateKey, sales: 0, profit: 0, quantity: 0 });
            }
            const dayData = dailySalesMap.get(dateKey);
            dayData.sales += itemTotal;
            dayData.profit += itemProfit;
            dayData.quantity += quantity;

            // إضافة بيانات العملاء
            if (order.customer_id) {
              const customerName = customersMap.get(order.customer_id) || 'عميل غير معروف';
              if (!customerPurchasesMap.has(order.customer_id)) {
                customerPurchasesMap.set(order.customer_id, {
                  customerName,
                  totalPurchases: 0,
                  totalSpent: 0
                });
              }
              const customerData = customerPurchasesMap.get(order.customer_id);
              customerData.totalPurchases += 1;
              customerData.totalSpent += itemTotal;
            }
          }
        });
      }
    });

    // تحويل البيانات اليومية إلى مصفوفة مرتبة
    const dailySales = Array.from(dailySalesMap.values())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30); // آخر 30 يوم

    // أهم العملاء (أعلى 5)
    const topCustomers = Array.from(customerPurchasesMap.values())
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);

    return {
      totalSales,
      totalProfit,
      totalQuantitySold,
      dailySales,
      topCustomers
    };
  } catch (error) {
    console.error("Error fetching product sales analytics:", error);
    // في حالة الخطأ، إرجاع بيانات فارغة
    return {
      totalSales: 0,
      totalProfit: 0,
      totalQuantitySold: 0,
      dailySales: [],
      topCustomers: []
    };
  }
};
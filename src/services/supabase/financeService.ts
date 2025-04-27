
import { supabase } from "@/integrations/supabase/client";

export interface ProfitData {
  storeProfits: number;
  onlineProfits: number;
  storeSales: number;
  onlineSales: number;
}

export interface CashierPerformance {
  id: string;
  name: string;
  totalSales: number;
  salesCount: number;
  averageSale: number;
  totalProfit: number;
}

export const fetchProfitsSummary = async (period: string, startDate?: Date, endDate?: Date): Promise<ProfitData> => {
  try {
    let queryStartDate;
    const now = new Date();
    
    if (period === "custom" && startDate && endDate) {
      queryStartDate = startDate;
    } else {
      switch (period) {
        case "day":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          const day = now.getDay();
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
          break;
        case "month":
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
          queryStartDate = new Date(now.getFullYear(), quarterMonth, 1);
          break;
        case "year":
          queryStartDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }
    }
    
    // Get sales data for both store and online
    let salesQuery = supabase
      .from('sales')
      .select('total, profit, items')
      .gte('date', queryStartDate.toISOString());

    // Fixed the online orders query - removing the nested items selection that was causing the error
    let onlineQuery = supabase
      .from('online_orders')
      .select('total, items, status, shipping_cost')
      .eq('status', 'done')
      .gte('created_at', queryStartDate.toISOString());
    
    if (period === "custom" && endDate) {
      salesQuery = salesQuery.lte('date', endDate.toISOString());
      onlineQuery = onlineQuery.lte('created_at', endDate.toISOString());
    }
    
    const [salesData, onlineData] = await Promise.all([
      salesQuery,
      onlineQuery
    ]);

    if (salesData.error) throw salesData.error;
    if (onlineData.error) throw onlineData.error;

    // Process store sales data
    let storeSales = 0;
    let storeProfits = 0;

    salesData.data?.forEach(sale => {
      storeSales += sale.total;
      storeProfits += sale.profit;
    });

    // Process online orders data
    let onlineSales = 0;
    let onlineProfits = 0;

    // Extract product IDs from the orders' items
    const productIds = onlineData.data?.flatMap(order => {
      if (typeof order.items === 'string') {
        try {
          return JSON.parse(order.items)?.map((item: any) => item.product_id).filter(Boolean) || [];
        } catch {
          return [];
        }
      } else if (Array.isArray(order.items)) {
        return order.items.map((item: any) => item.product_id).filter(Boolean);
      }
      return [];
    }) || [];
    
    // Get unique product ids
    const uniqueProductIds = [...new Set(productIds)].filter(Boolean);
    
    if (uniqueProductIds.length > 0) {
      // Fetch all purchase prices in a single query
      const { data: products } = await supabase
        .from('products')
        .select('id, purchase_price')
        .in('id', uniqueProductIds);
      
      // Create a lookup map for easier access
      const purchasePriceMap = new Map();
      products?.forEach(product => {
        purchasePriceMap.set(product.id, product.purchase_price || 0);
      });

      // Now process the orders with the purchase price data
      onlineData.data?.forEach(order => {
        const orderTotalWithoutShipping = order.total - (order.shipping_cost || 0);
        onlineSales += orderTotalWithoutShipping;
        
        // Parse items if they are stored as a JSON string
        let items;
        if (typeof order.items === 'string') {
          try {
            items = JSON.parse(order.items);
          } catch {
            items = [];
          }
        } else {
          items = order.items;
        }
        
        // Calculate profits for each item in the order
        if (Array.isArray(items)) {
          items.forEach((item: any) => {
            const sellingPrice = parseFloat(item.price) || 0;
            const purchasePrice = purchasePriceMap.get(item.product_id) || 0;
            const quantity = parseInt(item.quantity) || 0;

            // Calculate profit based on bulk or regular pricing
            if (item.is_bulk && item.bulk_quantity) {
              // For bulk items, calculate profit
              const profit = (sellingPrice - purchasePrice) * quantity;
              onlineProfits += profit;
            } else {
              // For regular items
              const profit = (sellingPrice - purchasePrice) * quantity;
              onlineProfits += profit;
            }
          });
        }
      });
    }

    return {
      storeProfits,
      onlineProfits,
      storeSales,
      onlineSales
    };

  } catch (error) {
    console.error('Error fetching profits summary:', error);
    return {
      storeProfits: 0,
      onlineProfits: 0,
      storeSales: 0,
      onlineSales: 0
    };
  }
};

// Now adding the other missing functions that are imported in Finance.tsx and Reports.tsx
export const fetchFinancialSummary = async (period: string, startDate?: Date, endDate?: Date) => {
  // Mock implementation for now
  return {
    totalRevenue: 5000,
    totalExpenses: 2000,
    netProfit: 3000,
    profitMargin: 60,
    cashBalance: 10000
  };
};

export const fetchMonthlyRevenue = async (period: string, startDate?: Date, endDate?: Date) => {
  // Mock implementation
  return [
    { name: 'Jan', amount: 1200 },
    { name: 'Feb', amount: 1500 },
    { name: 'Mar', amount: 1800 }
  ];
};

export const fetchExpensesByCategory = async (period: string, startDate?: Date, endDate?: Date) => {
  // Mock implementation
  return [
    { name: 'Rent', value: 2500, color: '#FF6B6B' },
    { name: 'Utilities', value: 800, color: '#4ECDC4' },
    { name: 'Payroll', value: 5000, color: '#FFD166' }
  ];
};

export const fetchRecentTransactions = async (limit: number, period?: string, startDate?: Date, endDate?: Date) => {
  // Mock implementation
  return [
    { id: '1', type: 'income', description: 'Sales Revenue', amount: 1200, date: new Date().toISOString() },
    { id: '2', type: 'expense', description: 'Rent Payment', amount: 800, date: new Date().toISOString() }
  ];
};

export const fetchAllTransactions = async () => {
  // Mock implementation
  return [
    { id: '1', type: 'income', description: 'Sales Revenue', amount: 1200, date: new Date().toISOString() },
    { id: '2', type: 'expense', description: 'Rent Payment', amount: 800, date: new Date().toISOString() }
  ];
};

export const fetchCashierPerformance = async (period: string, startDate?: Date, endDate?: Date): Promise<CashierPerformance[]> => {
  // Mock implementation
  return [
    { id: '1', name: 'Ahmed', totalSales: 5000, salesCount: 20, averageSale: 250, totalProfit: 1500 },
    { id: '2', name: 'Sara', totalSales: 4500, salesCount: 18, averageSale: 250, totalProfit: 1350 }
  ];
};

export const exportReportToExcel = async (period: string, reportType: string, startDate?: Date, endDate?: Date) => {
  // Mock implementation
  console.log(`Exporting ${reportType} report for period ${period}`);
  return Promise.resolve();
};

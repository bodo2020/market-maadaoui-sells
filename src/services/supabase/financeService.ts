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
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
    }
    
    let salesQuery = supabase
      .from('sales')
      .select('total, profit, items')
      .gte('date', queryStartDate.toISOString());

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

    let storeSales = 0;
    let storeProfits = 0;

    salesData.data?.forEach(sale => {
      storeSales += sale.total;
      storeProfits += sale.profit;
    });

    let onlineSales = 0;
    let onlineProfits = 0;

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
    
    const uniqueProductIds = [...new Set(productIds)].filter(Boolean);
    
    if (uniqueProductIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, purchase_price, bulk_price, bulk_quantity, unit_of_measure')
        .in('id', uniqueProductIds);
      
      const purchasePriceMap = new Map();
      products?.forEach(product => {
        purchasePriceMap.set(product.id, {
          purchase_price: product.purchase_price || 0,
          bulk_price: product.bulk_price,
          bulk_quantity: product.bulk_quantity,
          unit_of_measure: product.unit_of_measure
        });
      });

      onlineData.data?.forEach(order => {
        const orderTotalWithoutShipping = order.total - (order.shipping_cost || 0);
        onlineSales += orderTotalWithoutShipping;
        
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
        
        if (Array.isArray(items)) {
          items.forEach((item: any) => {
            const productInfo = purchasePriceMap.get(item.product_id);
            if (!productInfo) return;

            const sellingPrice = parseFloat(item.price) || 0;
            const quantity = parseFloat(item.quantity) || 0;

            // Handle weight-based products
            if (productInfo.unit_of_measure === 'weight') {
              const profit = (sellingPrice - productInfo.purchase_price) * quantity;
              onlineProfits += profit;
            }
            // Handle bulk products
            else if (item.is_bulk && productInfo.bulk_quantity && productInfo.bulk_price) {
              const profitPerBulk = (productInfo.bulk_price / productInfo.bulk_quantity - productInfo.purchase_price) * productInfo.bulk_quantity;
              onlineProfits += profitPerBulk * quantity;
            } 
            // Handle regular products
            else {
              const profit = (sellingPrice - productInfo.purchase_price) * quantity;
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

export const fetchFinancialSummary = async (period: string, startDate?: Date, endDate?: Date) => {
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
    
    const profitsData = await fetchProfitsSummary(period, startDate, endDate);
    
    const { data: expensesData, error: expensesError } = await supabase
      .from('expenses')
      .select('amount')
      .gte('date', queryStartDate.toISOString());
      
    if (expensesError) throw expensesError;
    
    const totalExpenses = expensesData.reduce((sum, expense) => sum + expense.amount, 0);
    
    const { data: cashData, error: cashError } = await supabase
      .from('cash_tracking')
      .select('closing_balance, register_type')
      .order('created_at', { ascending: false })
      .limit(2);
      
    if (cashError) throw cashError;
    
    const storeCash = cashData?.find(c => c.register_type === 'store')?.closing_balance || 0;
    const onlineCash = cashData?.find(c => c.register_type === 'online')?.closing_balance || 0;
    const totalCashBalance = storeCash + onlineCash;
    
    const totalRevenue = profitsData.storeSales + profitsData.onlineSales;
    const totalProfit = profitsData.storeProfits + profitsData.onlineProfits;
    
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    
    return {
      totalRevenue,
      totalExpenses,
      netProfit: totalProfit,
      profitMargin,
      cashBalance: totalCashBalance
    };
  } catch (error) {
    console.error('Error fetching financial summary:', error);
    return {
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      profitMargin: 0,
      cashBalance: 0
    };
  }
};

export const fetchMonthlyRevenue = async (period: string, startDate?: Date, endDate?: Date) => {
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
    
    let query = supabase
      .from('sales')
      .select('date, total')
      .gte('date', queryStartDate.toISOString());
    
    if (period === "custom" && endDate) {
      query = query.lte('date', endDate.toISOString());
    }
    
    const { data: salesData, error: salesError } = await query;
    
    if (salesError) throw salesError;
    
    const monthlyRevenue = new Map();
    
    salesData?.forEach(sale => {
      const date = new Date(sale.date);
      const monthKey = date.toLocaleString('ar-EG', { month: 'short' });
      const currentAmount = monthlyRevenue.get(monthKey) || 0;
      monthlyRevenue.set(monthKey, currentAmount + sale.total);
    });
    
    return Array.from(monthlyRevenue.entries()).map(([name, amount]) => ({
      name,
      amount
    }));
  } catch (error) {
    console.error('Error fetching monthly revenue:', error);
    return [];
  }
};

export const fetchExpensesByCategory = async (period: string, startDate?: Date, endDate?: Date) => {
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
    
    let query = supabase
      .from('expenses')
      .select('type, amount')
      .gte('date', queryStartDate.toISOString());
    
    if (period === "custom" && endDate) {
      query = query.lte('date', endDate.toISOString());
    }
    
    const { data: expensesData, error: expensesError } = await query;
    
    if (expensesError) throw expensesError;
    
    const expensesByType = new Map();
    const colors = ['#FF6B6B', '#4ECDC4', '#FFD166', '#45B7D1', '#96CEB4', '#FFEEAD'];
    let colorIndex = 0;
    
    expensesData?.forEach(expense => {
      const currentAmount = expensesByType.get(expense.type)?.value || 0;
      if (!expensesByType.has(expense.type)) {
        expensesByType.set(expense.type, {
          value: currentAmount + expense.amount,
          color: colors[colorIndex % colors.length]
        });
        colorIndex++;
      } else {
        expensesByType.get(expense.type).value += expense.amount;
      }
    });
    
    return Array.from(expensesByType.entries()).map(([name, data]) => ({
      name,
      value: data.value,
      color: data.color
    }));
  } catch (error) {
    console.error('Error fetching expenses by category:', error);
    return [];
  }
};

export const fetchCashierPerformance = async (period: string, startDate?: Date, endDate?: Date): Promise<CashierPerformance[]> => {
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
          queryStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }
    }
    
    let query = supabase
      .from('sales')
      .select(`
        cashier_id,
        total,
        profit,
        date,
        users!inner (
          name
        )
      `)
      .gte('date', queryStartDate.toISOString());
    
    if (period === "custom" && endDate) {
      query = query.lte('date', endDate.toISOString());
    }
    
    const { data: salesData, error: salesError } = await query;
    
    if (salesError) throw salesError;
    
    const dailySales = new Map();
    
    salesData?.forEach(sale => {
      if (!sale.cashier_id) return;
      
      const dateKey = new Date(sale.date).toLocaleDateString('ar-EG');
      const cashierKey = `${sale.cashier_id}-${dateKey}`;
      
      const currentStats = dailySales.get(cashierKey) || {
        id: sale.cashier_id,
        name: sale.users.name,
        date: dateKey,
        totalSales: 0,
        salesCount: 0,
        averageSale: 0,
        totalProfit: 0
      };
      
      currentStats.totalSales += sale.total;
      currentStats.salesCount += 1;
      currentStats.totalProfit += sale.profit;
      currentStats.averageSale = currentStats.totalSales / currentStats.salesCount;
      
      dailySales.set(cashierKey, currentStats);
    });
    
    return Array.from(dailySales.values())
      .sort((a, b) => {
        const dateComparison = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateComparison !== 0) return dateComparison;
        return b.totalSales - a.totalSales;
      });
  } catch (error) {
    console.error('Error fetching cashier performance:', error);
    return [];
  }
};

export const fetchRecentTransactions = async (limit: number, period?: string, startDate?: Date, endDate?: Date) => {
  return [
    { id: '1', type: 'income', description: 'Sales Revenue', amount: 1200, date: new Date().toISOString() },
    { id: '2', type: 'expense', description: 'Rent Payment', amount: 800, date: new Date().toISOString() }
  ];
};

export const fetchAllTransactions = async () => {
  return [
    { id: '1', type: 'income', description: 'Sales Revenue', amount: 1200, date: new Date().toISOString() },
    { id: '2', type: 'expense', description: 'Rent Payment', amount: 800, date: new Date().toISOString() }
  ];
};

export const exportReportToExcel = async (period: string, reportType: string, startDate?: Date, endDate?: Date) => {
  console.log(`Exporting ${reportType} report for period ${period}`);
  return Promise.resolve();
};

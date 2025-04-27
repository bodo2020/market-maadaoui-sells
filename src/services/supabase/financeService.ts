
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

    onlineData.data?.forEach(order => {
      const orderTotalWithoutShipping = order.total - (order.shipping_cost || 0);
      onlineSales += orderTotalWithoutShipping;
      
      // Calculate profits for each item in the order
      if (Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          const sellingPrice = item.price;
          const purchasePrice = item.product?.purchase_price || 0;
          const quantity = item.quantity || 0;

          // Calculate profit based on bulk or regular pricing
          if (item.is_bulk && item.bulk_quantity) {
            // For bulk items, calculate unit price and profit
            const bulkUnitPrice = item.price / item.bulk_quantity;
            onlineProfits += (bulkUnitPrice - purchasePrice) * quantity * item.bulk_quantity;
          } else {
            // For regular items
            onlineProfits += (sellingPrice - purchasePrice) * quantity;
          }
        });
      }
    });

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

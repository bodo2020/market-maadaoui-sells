
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Purchase } from "@/types";

// Mock purchases data for development - will be replaced by real data once the table exists
const mockPurchases: Purchase[] = [
  {
    id: "1",
    supplier_id: "1",
    invoice_number: "INV-2023-001",
    date: new Date().toISOString(),
    total: 5000,
    paid: 5000,
    description: "شراء بضائع متنوعة",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

export async function fetchPurchases() {
  try {
    // Using mock data for now - this will be replaced with real database query
    // when the purchases table is created
    return mockPurchases as Purchase[];
  } catch (error) {
    console.error("Error fetching purchases:", error);
    toast.error("فشل في جلب المشتريات");
    return [];
  }
}

export async function getPurchaseById(id: string) {
  try {
    // Mock implementation
    const purchase = mockPurchases.find(p => p.id === id);
    return purchase as Purchase;
  } catch (error) {
    console.error("Error fetching purchase:", error);
    toast.error("فشل في جلب بيانات فاتورة الشراء");
    return null;
  }
}

export async function createPurchase(data: any) {
  try {
    const { supplier_id, invoice_number, date, total, paid, description, invoice_file } = data;
    
    let invoice_file_url = null;
    
    // Handle file upload if provided
    if (invoice_file) {
      const fileExt = invoice_file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `purchases/${fileName}`;
      
      // Mock file upload - will be implemented with Supabase Storage
      invoice_file_url = '/placeholder.svg';
    }
    
    // Create new purchase object
    const newPurchase: Partial<Purchase> = {
      id: crypto.randomUUID(),
      supplier_id,
      invoice_number,
      date,
      total,
      paid,
      description,
      invoice_file_url,
      created_at: new Date().toISOString()
    };
    
    // Add to mock data
    mockPurchases.push(newPurchase as Purchase);
    
    return newPurchase as Purchase;
  } catch (error) {
    console.error("Error creating purchase:", error);
    toast.error("فشل في إنشاء فاتورة الشراء");
    throw error;
  }
}

export async function deletePurchase(id: string) {
  try {
    // Mock implementation
    const index = mockPurchases.findIndex(p => p.id === id);
    if (index !== -1) {
      mockPurchases.splice(index, 1);
    }
    return true;
  } catch (error) {
    console.error("Error deleting purchase:", error);
    toast.error("فشل في حذف فاتورة الشراء");
    throw error;
  }
}

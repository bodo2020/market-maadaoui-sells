
import { supabase } from "@/integrations/supabase/client";
import * as ExcelJS from 'exceljs';
import * as FileSaver from 'file-saver';

interface Purchase {
  id?: string;
  supplier_id: string;
  invoice_number: string;
  date: string;
  total: number;
  paid: number;
  description?: string;
  invoice_file_url?: string;
  created_at?: string;
  updated_at?: string;
}

export async function fetchPurchases() {
  try {
    const { data, error } = await supabase
      .from("purchases")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Error fetching purchases:", error);
      throw error;
    }

    return data as Purchase[];
  } catch (error) {
    console.error("Error in fetchPurchases:", error);
    throw error;
  }
}

export async function fetchPurchaseById(id: string) {
  try {
    const { data, error } = await supabase
      .from("purchases")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("Error fetching purchase:", error);
      throw error;
    }

    return data as Purchase;
  } catch (error) {
    console.error("Error in fetchPurchaseById:", error);
    throw error;
  }
}

export async function createPurchase({ invoice_file, ...purchase }: { invoice_file?: File | null } & Omit<Purchase, "id" | "invoice_file_url" | "created_at" | "updated_at">) {
  try {
    let invoice_file_url = null;

    // Upload invoice file if provided
    if (invoice_file) {
      const fileExt = invoice_file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `purchases/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, invoice_file);

      if (uploadError) {
        console.error("Error uploading file:", uploadError);
        throw uploadError;
      }

      // Get the public URL for the uploaded file
      const { data: publicUrlData } = await supabase.storage
        .from('invoices')
        .getPublicUrl(filePath);

      invoice_file_url = publicUrlData.publicUrl;
    }

    // Create the purchase record
    const { data, error } = await supabase
      .from("purchases")
      .insert([
        {
          supplier_id: purchase.supplier_id,
          invoice_number: purchase.invoice_number,
          date: purchase.date,
          total: purchase.total,
          paid: purchase.paid,
          description: purchase.description,
          invoice_file_url: invoice_file_url
        }
      ])
      .select();

    if (error) {
      console.error("Error creating purchase:", error);
      throw error;
    }

    // Update product inventory if items are provided
    if (purchase.items && purchase.items.length > 0) {
      // Example implementation for updating product inventory
      // This would typically involve fetching the current quantity of each product
      // and updating it based on the purchase
      for (const item of purchase.items) {
        const { data: product, error: fetchError } = await supabase
          .from("products")
          .select("quantity")
          .eq("id", item.product_id)
          .single();

        if (fetchError) {
          console.error(`Error fetching product ${item.product_id}:`, fetchError);
          continue;
        }

        const newQuantity = (product.quantity || 0) + item.quantity;

        const { error: updateError } = await supabase
          .from("products")
          .update({ quantity: newQuantity })
          .eq("id", item.product_id);

        if (updateError) {
          console.error(`Error updating product ${item.product_id} quantity:`, updateError);
        }
      }
    }

    return data[0] as Purchase;
  } catch (error) {
    console.error("Error in createPurchase:", error);
    throw error;
  }
}

export async function updatePurchase(id: string, updates: Partial<Purchase>, invoice_file?: File | null) {
  try {
    const updateData: any = { ...updates };

    // Upload new invoice file if provided
    if (invoice_file) {
      const fileExt = invoice_file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `purchases/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(filePath, invoice_file);

      if (uploadError) {
        console.error("Error uploading file:", uploadError);
        throw uploadError;
      }

      // Get the public URL for the uploaded file
      const { data: publicUrlData } = await supabase.storage
        .from('invoices')
        .getPublicUrl(filePath);

      updateData.invoice_file_url = publicUrlData.publicUrl;
    }

    const { data, error } = await supabase
      .from("purchases")
      .update(updateData)
      .eq("id", id)
      .select();

    if (error) {
      console.error("Error updating purchase:", error);
      throw error;
    }

    return data[0] as Purchase;
  } catch (error) {
    console.error("Error in updatePurchase:", error);
    throw error;
  }
}

export async function deletePurchase(id: string) {
  try {
    // Get the purchase record to check if it has an associated file
    const { data: purchase, error: fetchError } = await supabase
      .from("purchases")
      .select("invoice_file_url")
      .eq("id", id)
      .single();

    if (fetchError) {
      console.error("Error fetching purchase:", fetchError);
      throw fetchError;
    }

    // Delete the associated file if it exists
    if (purchase.invoice_file_url) {
      // Extract the path from the URL
      const filePath = purchase.invoice_file_url.split('/').slice(-2).join('/');
      
      const { error: deleteFileError } = await supabase.storage
        .from('invoices')
        .remove([filePath]);

      if (deleteFileError) {
        console.error("Error deleting invoice file:", deleteFileError);
        // Continue with deletion of the record even if file deletion fails
      }
    }

    // Delete the purchase record
    const { error } = await supabase
      .from("purchases")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting purchase:", error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Error in deletePurchase:", error);
    throw error;
  }
}

export async function exportPurchasesToExcel() {
  try {
    const { data: purchases, error: purchasesError } = await supabase
      .from("purchases")
      .select("*")
      .order("date", { ascending: false });

    if (purchasesError) {
      console.error("Error fetching purchases for export:", purchasesError);
      throw purchasesError;
    }

    const { data: suppliers, error: suppliersError } = await supabase
      .from("suppliers")
      .select("id, name");

    if (suppliersError) {
      console.error("Error fetching suppliers for export:", suppliersError);
      throw suppliersError;
    }

    // Create a map of supplier IDs to names for quick lookup
    const supplierMap = new Map();
    suppliers.forEach(supplier => {
      supplierMap.set(supplier.id, supplier.name);
    });

    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('المشتريات');

    // Set right-to-left for Arabic support
    worksheet.views = [{ rightToLeft: true }];

    // Add headers
    const headerRow = [
      'رقم الفاتورة',
      'المورد',
      'التاريخ',
      'إجمالي الفاتورة',
      'المبلغ المدفوع',
      'المبلغ المتبقي',
      'الوصف',
      'تاريخ الإضافة'
    ];
    
    worksheet.addRow(headerRow);

    // Format header row
    worksheet.getRow(1).font = { bold: true, size: 14 };
    worksheet.getRow(1).alignment = { horizontal: 'center' };

    // Add data
    purchases.forEach(purchase => {
      const supplierName = supplierMap.get(purchase.supplier_id) || 'غير معروف';
      const remainingAmount = purchase.total - purchase.paid;

      worksheet.addRow([
        purchase.invoice_number,
        supplierName,
        new Date(purchase.date).toLocaleDateString('ar-EG'),
        purchase.total,
        purchase.paid,
        remainingAmount,
        purchase.description || '',
        new Date(purchase.created_at || '').toLocaleDateString('ar-EG')
      ]);
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = maxLength < 10 ? 10 : maxLength;
    });

    // Format number columns
    worksheet.getColumn(4).numFmt = '#,##0.00';
    worksheet.getColumn(5).numFmt = '#,##0.00';
    worksheet.getColumn(6).numFmt = '#,##0.00';

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();

    // Create a Blob and save file
    const date = new Date().toISOString().split('T')[0];
    const fileName = `قائمة_المشتريات_${date}.xlsx`;
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    FileSaver.saveAs(blob, fileName);
  } catch (error) {
    console.error("Error exporting purchases to Excel:", error);
    throw error;
  }
}

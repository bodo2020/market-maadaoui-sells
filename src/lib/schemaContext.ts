import { supabase } from "@/integrations/supabase/client";

/**
 * Schema Manager للتعامل مع Multi-Schema Architecture
 * يتيح التبديل بين schemas حسب نوع الفرع
 */

interface BranchInfo {
  id: string;
  branch_type: 'internal' | 'external';
  independent_inventory: boolean;
  schema_name: string | null;
}

// Cache للـ branch info لتحسين الأداء
const branchCache = new Map<string, BranchInfo>();

/**
 * جلب معلومات الفرع من قاعدة البيانات أو الـ cache
 */
export async function getBranchInfo(branchId: string): Promise<BranchInfo | null> {
  // التحقق من الـ cache أولاً
  if (branchCache.has(branchId)) {
    return branchCache.get(branchId)!;
  }

  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id, branch_type, independent_inventory, schema_name')
      .eq('id', branchId)
      .single();

    if (error) throw error;
    if (!data) return null;

    // حفظ في الـ cache
    branchCache.set(branchId, data);
    return data;
  } catch (error) {
    console.error('Error fetching branch info:', error);
    return null;
  }
}

/**
 * الحصول على اسم الـ schema المناسب للفرع
 */
export async function getSchemaForBranch(branchId: string | null): Promise<string> {
  // إذا لم يتم تحديد فرع، استخدم public schema
  if (!branchId) return 'public';

  const branchInfo = await getBranchInfo(branchId);
  
  // إذا كان فرع خارجي وله schema خاص، استخدمه
  if (branchInfo?.branch_type === 'external' && branchInfo.schema_name) {
    return branchInfo.schema_name;
  }

  // وإلا، استخدم public schema
  return 'public';
}

/**
 * إنشاء Supabase client مع schema محدد
 */
export async function getSupabaseForBranch(branchId: string | null) {
  const schema = await getSchemaForBranch(branchId);
  return { supabase, schema };
}

/**
 * تنظيف الـ cache (مفيد عند تحديث معلومات الفرع)
 */
export function clearBranchCache(branchId?: string) {
  if (branchId) {
    branchCache.delete(branchId);
  } else {
    branchCache.clear();
  }
}

/**
 * تهيئة فرع خارجي جديد بـ schema خاص
 */
export async function initializeExternalBranch(branchId: string, branchCode: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .rpc('initialize_external_branch', {
        p_branch_id: branchId,
        p_branch_code: branchCode
      });

    if (error) throw error;

    // تنظيف الـ cache
    clearBranchCache(branchId);

    return data;
  } catch (error) {
    console.error('Error initializing external branch:', error);
    return null;
  }
}

/**
 * التحقق من أن الفرع له schema خاص
 */
export async function hasDedicatedSchema(branchId: string): Promise<boolean> {
  const branchInfo = await getBranchInfo(branchId);
  return branchInfo?.branch_type === 'external' && !!branchInfo.schema_name;
}

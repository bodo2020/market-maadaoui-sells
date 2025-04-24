
import { supabase } from "@/integrations/supabase/client";
import { MainCategory, Subcategory } from "@/types";

// Main Categories
export async function fetchMainCategories() {
  const { data, error } = await supabase
    .from("main_categories")
    .select("*")
    .order("name");

  if (error) {
    console.error("Error fetching main categories:", error);
    throw error;
  }

  return data as MainCategory[];
}

export async function fetchMainCategoryById(id: string) {
  const { data, error } = await supabase
    .from("main_categories")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching main category:", error);
    throw error;
  }

  return data as MainCategory;
}

export async function createMainCategory(category: Omit<MainCategory, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabase
    .from("main_categories")
    .insert([category])
    .select();

  if (error) {
    console.error("Error creating main category:", error);
    throw error;
  }

  return data[0] as MainCategory;
}

export async function updateMainCategory(id: string, category: Partial<Omit<MainCategory, "id" | "created_at" | "updated_at">>) {
  const { data, error } = await supabase
    .from("main_categories")
    .update(category)
    .eq("id", id)
    .select();

  if (error) {
    console.error("Error updating main category:", error);
    throw error;
  }

  return data[0] as MainCategory;
}

export async function deleteMainCategory(id: string) {
  const { error } = await supabase
    .from("main_categories")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting main category:", error);
    throw error;
  }

  return true;
}

// Subcategories
export async function fetchSubcategories(categoryId?: string) {
  let query = supabase
    .from("subcategories")
    .select("*")
    .order('name');
  
  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }
  
  const { data, error } = await query;

  if (error) {
    console.error("Error fetching subcategories:", error);
    throw error;
  }

  return data as Subcategory[];
}

export async function fetchSubcategoryById(id: string) {
  const { data, error } = await supabase
    .from("subcategories")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching subcategory:", error);
    throw error;
  }

  return data as Subcategory;
}

export async function createSubcategory(subcategory: Omit<Subcategory, "id" | "created_at" | "updated_at">) {
  const { data, error } = await supabase
    .from("subcategories")
    .insert([subcategory])
    .select();

  if (error) {
    console.error("Error creating subcategory:", error);
    throw error;
  }

  return data[0] as Subcategory;
}

export async function updateSubcategory(id: string, subcategory: Partial<Omit<Subcategory, "id" | "created_at" | "updated_at">>) {
  const { data, error } = await supabase
    .from("subcategories")
    .update(subcategory)
    .eq("id", id)
    .select();

  if (error) {
    console.error("Error updating subcategory:", error);
    throw error;
  }

  return data[0] as Subcategory;
}

export async function deleteSubcategory(id: string) {
  const { error } = await supabase
    .from("subcategories")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting subcategory:", error);
    throw error;
  }

  return true;
}

// For backwards compatibility - get category hierarchy
export async function getCategoryHierarchy() {
  try {
    // Fetch all categories
    const mainCategories = await fetchMainCategories();
    const subcategories = await fetchSubcategories();
    
    // Create a mapped structure that matches the old format
    const formattedCategories = mainCategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      image_url: cat.image_url,
      level: 'category' as const,
      parent_id: null,
      created_at: cat.created_at,
      updated_at: cat.updated_at,
      children: subcategories
        .filter(sub => sub.category_id === cat.id)
        .map(sub => ({
          id: sub.id,
          name: sub.name,
          description: sub.description,
          image_url: sub.image_url,
          level: 'subcategory' as const,
          parent_id: sub.category_id,
          created_at: sub.created_at,
          updated_at: sub.updated_at,
          children: []
        }))
    }));
    
    return formattedCategories;
  } catch (error) {
    console.error("Error building category hierarchy:", error);
    throw error;
  }
}

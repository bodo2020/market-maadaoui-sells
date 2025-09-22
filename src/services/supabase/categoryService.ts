import { supabase } from "@/integrations/supabase/client";
import { MainCategory, Subcategory } from "@/types";

// Main Categories
export async function fetchMainCategories() {
  console.log("Fetching main categories");
  
  try {
    const { data, error } = await supabase
      .from("main_categories")
      .select("*")
      .order("position");

    if (error) {
      console.error("Error fetching main categories:", error);
      throw error;
    }

    console.log(`Successfully fetched ${data.length} main categories`);
    return data as MainCategory[];
  } catch (error) {
    console.error("Error in fetchMainCategories:", error);
    return [];
  }
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
  // Get the next position
  const { data: lastCategory } = await supabase
    .from("main_categories")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const nextPosition = lastCategory ? (lastCategory.position || 0) + 1 : 0;

  const { data, error } = await supabase
    .from("main_categories")
    .insert([{ ...category, position: nextPosition }])
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
  console.log(`Fetching subcategories${categoryId ? ` for category ${categoryId}` : ''}`);
  
  try {
    let query = supabase
      .from("subcategories")
      .select("*")
      .order('position');
    
    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }
    
    const { data, error } = await query;

    if (error) {
      console.error("Error fetching subcategories:", error);
      throw error;
    }

    console.log(`Successfully fetched ${data.length} subcategories`);
    return data as Subcategory[];
  } catch (error) {
    console.error("Error in fetchSubcategories:", error);
    return [];
  }
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
  // Get the next position for this category
  const { data: lastSubcategory } = await supabase
    .from("subcategories")
    .select("position")
    .eq("category_id", subcategory.category_id)
    .order("position", { ascending: false })
    .limit(1)
    .single();

  const nextPosition = lastSubcategory ? (lastSubcategory.position || 0) + 1 : 0;

  const { data, error } = await supabase
    .from("subcategories")
    .insert([{ ...subcategory, position: nextPosition }])
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

export const deleteSubcategory = async (id: string) => {
  const { error } = await supabase
    .from('subcategories')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// For backwards compatibility - get category hierarchy
export async function getCategoryHierarchy() {
  try {
    // Fetch all categories
    const mainCategories = await fetchMainCategories();
    const subcategories = await fetchSubcategories();
    
    if (!mainCategories || !subcategories) {
      console.error("Failed to fetch categories or subcategories");
      return [];
    }
    
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
    return [];
  }
}

// Position Management Functions
export async function updateMainCategoryPosition(id: string, newPosition: number) {
  const { data, error } = await supabase
    .from("main_categories")
    .update({ position: newPosition })
    .eq("id", id);

  if (error) {
    console.error("Error updating main category position:", error);
    throw error;
  }

  return data;
}

export async function updateSubcategoryPosition(id: string, newPosition: number) {
  const { data, error } = await supabase
    .from("subcategories")
    .update({ position: newPosition })
    .eq("id", id);

  if (error) {
    console.error("Error updating subcategory position:", error);
    throw error;
  }

  return data;
}

export async function reorderMainCategories(categoryPositions: { id: string; position: number }[]) {
  const updates = categoryPositions.map(({ id, position }) =>
    supabase
      .from("main_categories")
      .update({ position })
      .eq("id", id)
  );

  const results = await Promise.all(updates);
  
  // Check for any errors
  const errors = results.filter(result => result.error);
  if (errors.length > 0) {
    console.error("Error reordering main categories:", errors);
    throw new Error("Failed to reorder categories");
  }

  return true;
}

export async function reorderSubcategories(subcategoryPositions: { id: string; position: number }[]) {
  const updates = subcategoryPositions.map(({ id, position }) =>
    supabase
      .from("subcategories")
      .update({ position })
      .eq("id", id)
  );

  const results = await Promise.all(updates);
  
  // Check for any errors
  const errors = results.filter(result => result.error);
  if (errors.length > 0) {
    console.error("Error reordering subcategories:", errors);
    throw new Error("Failed to reorder subcategories");
  }

  return true;
}

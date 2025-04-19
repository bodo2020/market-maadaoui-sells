
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Product, Category, Subcategory, Subsubcategory, MainCategory, Company } from "@/types";
import { getCategoryHierarchy } from "@/services/supabase/categoryService";
import { fetchMainCategories } from "@/services/supabase/categoryService";

export const useInventoryManagement = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [subsubcategories, setSubsubcategories] = useState<Subsubcategory[]>([]);
  const [mainCategories, setMainCategories] = useState<MainCategory[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedSubsubcategory, setSelectedSubsubcategory] = useState<string | null>(null);
  const [selectedMainCategory, setSelectedMainCategory] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetchProducts();
    fetchCategoriesData();
    fetchSubcategories();
    fetchSubsubcategories();
    fetchMainCategoriesData();
    fetchCompanies();
  }, [searchQuery, selectedCategory, selectedSubcategory, selectedSubsubcategory, selectedMainCategory, selectedCompany, sortField, sortOrder]);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("products")
        .select("*")
        .like("name", `%${searchQuery}%`);

      if (selectedCategory) {
        query = query.eq("category_id", selectedCategory);
      }

      if (selectedSubcategory) {
        query = query.eq("subcategory_id", selectedSubcategory);
      }

      if (selectedSubsubcategory) {
        query = query.eq("subsubcategory_id", selectedSubsubcategory);
      }

      if (selectedMainCategory) {
        query = query.eq("main_category_id", selectedMainCategory);
      }

      if (selectedCompany) {
        query = query.eq("company_id", selectedCompany);
      }

      query = query.order(sortField, { ascending: sortOrder === "asc" });

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching products:", error);
        toast.error("فشل في جلب المنتجات.");
      }

      setProducts(data || []);
    } catch (error) {
      console.error("Unexpected error fetching products:", error);
      toast.error("حدث خطأ غير متوقع أثناء جلب المنتجات.");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategoriesData = async () => {
    try {
      const categoriesData = await getCategoryHierarchy();
      setCategories(categoriesData);
    } catch (error) {
      console.error("Unexpected error fetching categories:", error);
      toast.error("حدث خطأ غير متوقع أثناء جلب الفئات.");
    }
  };

  const fetchSubcategories = async () => {
    try {
      const { data, error } = await supabase
        .from("subcategories")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching subcategories:", error);
        toast.error("فشل في جلب الفئات الفرعية.");
      } else {
        setSubcategories(data || []);
      }
    } catch (error) {
      console.error("Unexpected error fetching subcategories:", error);
      toast.error("حدث خطأ غير متوقع أثناء جلب الفئات الفرعية.");
    }
  };

  const fetchSubsubcategories = async () => {
    try {
      const { data, error } = await supabase
        .from("subsubcategories")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching subsubcategories:", error);
        toast.error("فشل في جلب الفئات الفرعية الفرعية.");
      } else {
        setSubsubcategories(data || []);
      }
    } catch (error) {
      console.error("Unexpected error fetching subsubcategories:", error);
      toast.error("حدث خطأ غير متوقع أثناء جلب الفئات الفرعية الفرعية.");
    }
  };

  const fetchMainCategoriesData = async () => {
    try {
      const mainCategoriesData = await fetchMainCategories();
      setMainCategories(mainCategoriesData);
    } catch (error) {
      console.error("Error fetching main categories:", error);
      toast.error("فشل في جلب الفئات الرئيسية.");
    }
  };

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error fetching companies:", error);
        toast.error("فشل في جلب الشركات.");
      } else {
        setCompanies(data || []);
      }
    } catch (error) {
      console.error("Unexpected error fetching companies:", error);
      toast.error("حدث خطأ غير متوقع أثناء جلب الشركات.");
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory(null);
    setSelectedSubcategory(null);
    setSelectedSubsubcategory(null);
    setSelectedMainCategory(null);
    setSelectedCompany(null);
    setStatusFilter("all");
  };

  const getFilteredProducts = () => {
    let filtered = products.filter(product => 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (product.barcode && product.barcode.includes(searchQuery))
    );

    if (selectedCompany && selectedCompany !== "all") {
      filtered = filtered.filter(product => product.company_id === selectedCompany);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(product => {
        const quantity = product.quantity || 0;
        switch (statusFilter) {
          case "available":
            return quantity > 10;
          case "low":
            return quantity > 0 && quantity <= 10;
          case "out":
            return quantity === 0;
          default:
            return true;
        }
      });
    }

    return filtered;
  };

  return {
    products: getFilteredProducts(),
    loading,
    categories,
    subcategories,
    subsubcategories,
    mainCategories,
    companies,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedSubcategory,
    setSelectedSubcategory,
    selectedSubsubcategory,
    setSelectedSubsubcategory,
    selectedMainCategory,
    setSelectedMainCategory,
    selectedCompany,
    setSelectedCompany,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    statusFilter,
    setStatusFilter,
    clearFilters
  };
};

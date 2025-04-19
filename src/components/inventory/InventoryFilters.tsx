
import { Search, ScanLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusFilter from "./StatusFilter";
import { Category, Subcategory, Subsubcategory, MainCategory, Company } from "@/types";

interface InventoryFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onBarcodeClick: () => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  companies: Company[];
  selectedCompany: string | null;
  onCompanyChange: (value: string) => void;
  categories: Category[];
  selectedCategory: string | null;
  onCategoryChange: (value: string) => void;
  subcategories: Subcategory[];
  selectedSubcategory: string | null;
  onSubcategoryChange: (value: string) => void;
  subsubcategories: Subsubcategory[];
  selectedSubsubcategory: string | null;
  onSubsubcategoryChange: (value: string) => void;
  mainCategories: MainCategory[];
  selectedMainCategory: string | null;
  onMainCategoryChange: (value: string) => void;
  onClearFilters: () => void;
  sortField: string;
  onSortFieldChange: (value: string) => void;
  sortOrder: "asc" | "desc";
  onSortOrderChange: (value: "asc" | "desc") => void;
}

const InventoryFilters = ({
  searchQuery,
  onSearchChange,
  onBarcodeClick,
  statusFilter,
  onStatusChange,
  companies,
  selectedCompany,
  onCompanyChange,
  categories,
  selectedCategory,
  onCategoryChange,
  subcategories,
  selectedSubcategory,
  onSubcategoryChange,
  subsubcategories,
  selectedSubsubcategory,
  onSubsubcategoryChange,
  mainCategories,
  selectedMainCategory,
  onMainCategoryChange,
  onClearFilters,
  sortField,
  onSortFieldChange,
  sortOrder,
  onSortOrderChange
}: InventoryFiltersProps) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="ابحث بالاسم أو الباركود" 
              value={searchQuery} 
              onChange={e => onSearchChange(e.target.value)} 
              className="pl-10" 
            />
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={onBarcodeClick}
            className="shrink-0"
          >
            <ScanLine className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <StatusFilter 
            value={statusFilter}
            onChange={onStatusChange}
          />
          
          <Select 
            value={selectedCompany || ""} 
            onValueChange={onCompanyChange}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="الشركة المصنعة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">الكل</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select onValueChange={value => onCategoryChange(value === "all" ? null : value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="اختر فئة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select onValueChange={value => onSubcategoryChange(value === "all" ? null : value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="اختر فئة فرعية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {subcategories.map((subcategory) => (
                <SelectItem key={subcategory.id} value={subcategory.id}>
                  {subcategory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select onValueChange={value => onSubsubcategoryChange(value === "all" ? null : value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="اختر فئة فرعية فرعية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {subsubcategories.map((subsubcategory) => (
                <SelectItem key={subsubcategory.id} value={subsubcategory.id}>
                  {subsubcategory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select onValueChange={value => onMainCategoryChange(value === "all" ? null : value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="اختر فئة رئيسية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {mainCategories.map((mainCategory) => (
                <SelectItem key={mainCategory.id} value={mainCategory.id}>
                  {mainCategory.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={onClearFilters}>
          إعادة تعيين الفلاتر
        </Button>

        <div className="flex items-center space-x-2 space-x-reverse">
          <Select value={sortField} onValueChange={onSortFieldChange}>
            <SelectTrigger id="sort">
              <SelectValue placeholder="اسم المنتج" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">اسم المنتج</SelectItem>
              <SelectItem value="price">السعر</SelectItem>
              <SelectItem value="quantity">الكمية</SelectItem>
              <SelectItem value="created_at">تاريخ الإنشاء</SelectItem>
              <SelectItem value="updated_at">تاريخ التعديل</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOrder} onValueChange={onSortOrderChange}>
            <SelectTrigger id="order">
              <SelectValue placeholder="تصاعدي" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">تصاعدي</SelectItem>
              <SelectItem value="desc">تنازلي</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default InventoryFilters;

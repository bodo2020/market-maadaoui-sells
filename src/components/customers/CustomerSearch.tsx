
import React from 'react';
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type CustomerSearchProps = {
  search: string;
  setSearch: (value: string) => void;
  placeholder?: string;
  onSearch?: () => void;
};

export function CustomerSearch({ 
  search, 
  setSearch, 
  placeholder = "ابحث باسم العميل أو رقم الهاتف",
  onSearch 
}: CustomerSearchProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch();
    }
  };

  return (
    <div className="flex gap-2">
      <Input 
        placeholder={placeholder} 
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={handleKeyDown}
        className="max-w-sm"
      />
      <Button variant="outline" onClick={onSearch}>
        <Search className="ml-2 h-4 w-4" />
        بحث
      </Button>
    </div>
  );
}

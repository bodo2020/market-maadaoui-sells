
import React, { useState, useEffect } from 'react';
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type CustomerSearchProps = {
  search: string;
  setSearch: (value: string) => void;
  placeholder?: string;
};

export function CustomerSearch({ search, setSearch, placeholder = "ابحث باسم العميل أو رقم الهاتف" }: CustomerSearchProps) {
  return (
    <div className="flex gap-2">
      <Input 
        placeholder={placeholder} 
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />
      <Button variant="outline">
        <Search className="ml-2 h-4 w-4" />
        بحث
      </Button>
    </div>
  );
}


import React from 'react';
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type EmployeeSearchProps = {
  search: string;
  setSearch: (value: string) => void;
};

export function EmployeeSearch({ search, setSearch }: EmployeeSearchProps) {
  return (
    <div className="flex gap-2 mb-6">
      <Input 
        placeholder="ابحث بالاسم أو رقم الهاتف" 
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

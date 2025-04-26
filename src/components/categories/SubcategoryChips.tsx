
import React from 'react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Subcategory } from "@/types";

interface SubcategoryChipsProps {
  subcategories: Subcategory[];
  selectedSubcategory: string | null;
  onSelect: (id: string | null) => void;
}

export function SubcategoryChips({ subcategories, selectedSubcategory, onSelect }: SubcategoryChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      <Button
        variant={selectedSubcategory === null ? "default" : "outline"}
        size="sm"
        onClick={() => onSelect(null)}
      >
        الكل
      </Button>
      {subcategories.map((subcategory) => (
        <Button
          key={subcategory.id}
          variant={selectedSubcategory === subcategory.id ? "default" : "outline"}
          size="sm"
          onClick={() => onSelect(subcategory.id)}
        >
          {subcategory.name}
        </Button>
      ))}
    </div>
  );
}

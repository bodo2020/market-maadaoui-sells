import React from 'react';
import './brand-loader.css';

export default function BrandLoader({ size = 'md', label = 'جاري التحميل', className = '' }: {
  size?: 'sm' | 'md' | 'lg'; label?: string; className?: string;
}) {
  return <span role="status" className={`brand-loader brand-loader--${size} ${className}`}>
    <img src="/elmadawy-logo.png" alt="" width="64" height="64" draggable={false} />
    <span className="sr-only">{label}</span>
  </span>;
}

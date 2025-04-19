
import { useState } from 'react';
import { CartItem } from '@/types';

export const useCart = () => {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = (item: CartItem) => {
    setCart([...cart, item]);
  };

  const removeFromCart = (index: number) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const clearCart = () => {
    setCart([]);
  };

  return {
    cart,
    addToCart,
    removeFromCart,
    clearCart
  };
};

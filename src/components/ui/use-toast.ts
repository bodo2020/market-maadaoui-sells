
import { useToast as useToastOriginal, toast as toastOriginal } from "@/hooks/use-toast";

// Re-export with the original methods
export const useToast = useToastOriginal;

// Create a toast object that has the same API as the original toast
export const toast = toastOriginal;

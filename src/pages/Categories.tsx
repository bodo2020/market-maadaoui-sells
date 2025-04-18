
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function Categories() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Redirect to the new categories page
    navigate("/categories");
  }, [navigate]);
  
  return null;
}

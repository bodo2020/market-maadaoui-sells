import { useLocation } from "react-router-dom";
import POSOnlineOrdersDock from "@/components/POS/POSOnlineOrdersDock";

export default function POSOnlineOrdersRouteDock() {
  const { pathname } = useLocation();
  if (pathname !== "/" && pathname !== "/pos") return null;
  return <POSOnlineOrdersDock />;
}

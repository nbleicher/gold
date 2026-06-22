import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { PageHeader } from "../../components/ui";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `nav-tab${isActive ? " active" : ""}`;

export function InventoryLayout() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const id = window.decodeURIComponent(location.hash.slice(1));
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash]);

  return (
    <div className="operations-layout">
      <PageHeader title="Operations" description="Inventory, supplies, and break templates." />
      <div className="subtabs">
        <NavLink to="/admin/operations/inventory" className={tabClass} end>
          Inventory
        </NavLink>
        <NavLink to="/admin/operations/inventory#add-metal" className="nav-tab nav-tab-sub">
          Add Metal
        </NavLink>
        <NavLink to="/admin/operations/inventory#create-stickers" className="nav-tab nav-tab-sub">
          Create Stickers
        </NavLink>
        <NavLink to="/admin/operations/inventory#inventory-on-hand" className="nav-tab nav-tab-sub">
          Inventory On Hand
        </NavLink>
        <NavLink to="/admin/operations/supplies" className={tabClass}>
          Supplies
        </NavLink>
        <NavLink to="/admin/operations/breaks" className={tabClass}>
          Break Templates
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}

import { NavLink, Outlet } from "react-router-dom";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `nav-tab${isActive ? " active" : ""}`;

export function InventoryLayout() {
  return (
    <div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "1.25rem",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: "0.75rem"
        }}
      >
        <NavLink to="/admin/inventory-management/nuggets" className={tabClass} end>
          Nuggets
        </NavLink>
        <NavLink to="/admin/inventory-management/breaks" className={tabClass}>
          Breaks
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}

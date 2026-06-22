import { NavLink, Outlet } from "react-router-dom";

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `nav-tab${isActive ? " active" : ""}`;

export function InventoryLayout() {
  return (
    <div className="operations-layout">
      <div className="page-head">
        <div>
          <h1>Operations</h1>
          <p>Inventory, supplies, and break templates.</p>
        </div>
      </div>
      <div className="subtabs">
        <NavLink to="/admin/operations/inventory" className={tabClass} end>
          Inventory
        </NavLink>
        <NavLink to="/admin/operations/supplies" className={tabClass}>
          Supplies
        </NavLink>
        <NavLink to="/admin/operations/breaks" className={tabClass}>
          Breaks
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}

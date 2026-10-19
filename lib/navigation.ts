import { hasRole, type Role } from "./roles";

export type NavItem = {
  href: string;
  label: string;
  /** Minimum role needed to SEE the link. Pages still enforce access on the server. */
  minimumRole: Role;
};

export type NavSection = { label?: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", minimumRole: "VIEWER" },
      { href: "/charities", label: "Charities", minimumRole: "VIEWER" },
      { href: "/account", label: "Account", minimumRole: "VIEWER" },
    ],
  },
  {
    label: "Administration",
    items: [{ href: "/admin/users", label: "Users", minimumRole: "ADMINISTRATOR" }],
  },
];

/** Sections and items visible to `role`; empty sections are dropped. */
export function navForRole(role: Role): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => hasRole(role, item.minimumRole)),
  })).filter((section) => section.items.length > 0);
}

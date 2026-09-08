/**
 * Product modules for the role-based access matrix (RBAC foundation). These
 * map to what a user sees in the admin panel sidebar — NOT 1:1 with the API's
 * module folders under src/modules (e.g. `properties` here covers the
 * properties, amenities AND collections admin controllers). See
 * RequireModule()/RolesGuard for enforcement and RbacService for the grant
 * model.
 */
export enum AccessModule {
  DASHBOARD = 'dashboard',
  PROPERTIES = 'properties',
  EVENT_SUPPORT = 'event-support',
  STORAGE = 'storage',
  MOVING = 'moving',
  CONTENT_MEDIA = 'content-media',
  USERS = 'users',
  NOTIFICATIONS = 'notifications',
  RBAC = 'rbac',
}

export interface AccessModuleMeta {
  key: AccessModule;
  /** English — matches the admin panel's sidebar labels. */
  label: string;
  /** Indonesian — shown as the row description on the RBAC page. */
  description: string;
  /** false = can never be granted to a non-admin role (enforced in
   *  RbacService.setRoleModules, not just the UI). */
  grantable: boolean;
  /** true = every active user has this module, admin or not — unioned in
   *  at read time in RbacService, never stored as a grant row. */
  alwaysOn: boolean;
}

export const ACCESS_MODULES: AccessModuleMeta[] = [
  {
    key: AccessModule.DASHBOARD,
    label: 'Dashboard',
    description: 'Halaman utama panel admin.',
    grantable: false,
    alwaysOn: true,
  },
  {
    key: AccessModule.PROPERTIES,
    label: 'Property Management',
    description: 'Kelola properti, fasilitas, dan koleksi.',
    grantable: true,
    alwaysOn: false,
  },
  {
    key: AccessModule.EVENT_SUPPORT,
    label: 'Event Support',
    description: 'Kelola layanan dan pemesanan Event Support.',
    grantable: true,
    alwaysOn: false,
  },
  {
    key: AccessModule.STORAGE,
    label: 'Smart Storage',
    description: 'Kelola fasilitas, unit, dan pemesanan Smart Storage.',
    grantable: true,
    alwaysOn: false,
  },
  {
    key: AccessModule.MOVING,
    label: 'Moving Support',
    description: 'Kelola armada, add-on, dan pemesanan Moving Support.',
    grantable: true,
    alwaysOn: false,
  },
  {
    key: AccessModule.CONTENT_MEDIA,
    label: 'Content Media Management',
    description: 'Kelola media, konten halaman, dan homepage.',
    grantable: true,
    alwaysOn: false,
  },
  {
    key: AccessModule.USERS,
    label: 'User Management',
    description: 'Kelola akun admin dan editor. Hanya untuk admin.',
    grantable: false,
    alwaysOn: false,
  },
  {
    key: AccessModule.NOTIFICATIONS,
    label: 'Notifikasi',
    description: 'Notifikasi admin real-time. Hanya untuk admin.',
    grantable: false,
    alwaysOn: false,
  },
  {
    key: AccessModule.RBAC,
    label: 'Roles & Permissions',
    description: 'Kelola hak akses modul per peran. Hanya untuk admin.',
    grantable: false,
    alwaysOn: false,
  },
];

export const GRANTABLE_MODULES = ACCESS_MODULES.filter((m) => m.grantable).map(
  (m) => m.key,
);

export const ALWAYS_ON_MODULES = ACCESS_MODULES.filter((m) => m.alwaysOn).map(
  (m) => m.key,
);

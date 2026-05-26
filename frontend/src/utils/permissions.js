export const USER_ROLES = {
  ADMIN: "admin",
  ANALYST: "analyst",
  SECTOR_FOCAL_POINT: "sector_focal_point",
  REVIEWER: "reviewer",
  VIEWER: "viewer",
  PUBLIC: "public",
};

export function getUserRole(user) {
  return user?.profile?.role || USER_ROLES.PUBLIC;
}

export function isSuperuser(user) {
  return Boolean(user?.is_superuser);
}

export function hasRole(user, allowedRoles = []) {
  if (isSuperuser(user)) {
    return true;
  }

  const role = getUserRole(user);
  return allowedRoles.includes(role);
}

export function canAccessAdministration(user) {
  return hasRole(user, [USER_ROLES.ADMIN]);
}

export function canManageGHGInventory(user) {
  return hasRole(user, [
    USER_ROLES.ADMIN,
    USER_ROLES.ANALYST,
    USER_ROLES.SECTOR_FOCAL_POINT,
  ]);
}

export function canReviewGHGInventory(user) {
  return hasRole(user, [
    USER_ROLES.ADMIN,
    USER_ROLES.ANALYST,
    USER_ROLES.REVIEWER,
  ]);
}

export function canManageClimateRisk(user) {
  return hasRole(user, [USER_ROLES.ADMIN, USER_ROLES.ANALYST]);
}

export function canManageProjectPortfolio(user) {
  return hasRole(user, [
    USER_ROLES.ADMIN,
    USER_ROLES.ANALYST,
    USER_ROLES.SECTOR_FOCAL_POINT,
  ]);
}

export function canManageReports(user) {
  return hasRole(user, [USER_ROLES.ADMIN, USER_ROLES.ANALYST]);
}

export function canViewInternalModules(user) {
  return hasRole(user, [
    USER_ROLES.ADMIN,
    USER_ROLES.ANALYST,
    USER_ROLES.SECTOR_FOCAL_POINT,
    USER_ROLES.REVIEWER,
    USER_ROLES.VIEWER,
  ]);
}
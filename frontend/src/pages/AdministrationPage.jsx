import { useEffect, useMemo, useState } from "react";
import AuditTrailPanel from "../components/AuditTrailPanel";
import {
  CommandBadge,
  CommandButton,
  CommandNotice,
  CommandPageHeader,
  CommandSection,
  CommandStatCard,
} from "../components/CommandUI";
import {
  createManagedUser,
  getManagedUsers,
  updateManagedUser,
} from "../services/api";

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "analyst", label: "Analyst" },
  { value: "sector_focal_point", label: "Sector Focal Point" },
];

const sectorOptions = [
  { value: "none", label: "None" },
  { value: "energy", label: "Energy" },
  { value: "agriculture", label: "Agriculture" },
  { value: "lulucf", label: "LULUCF" },
  { value: "waste", label: "Waste" },
  { value: "ippu", label: "IPPU" },
  { value: "projects", label: "Projects" },
];

const initialForm = {
  username: "",
  email: "",
  first_name: "",
  last_name: "",
  password: "",
  role: "sector_focal_point",
  assigned_sector: "none",
  assigned_lga: "",
  ministry_department: "",
  phone_number: "",
};

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-[#030454] outline-none transition placeholder:text-slate-400 focus:border-[#009B35] focus:ring-2 focus:ring-[#009B35]/10";

function getRoleLabel(role) {
  const found = roleOptions.find((item) => item.value === role);
  return found?.label || role || "—";
}

function getSectorLabel(sector) {
  const found = sectorOptions.find((item) => item.value === sector);
  return found?.label || sector || "—";
}

// Maps the existing role taxonomy onto CommandBadge's tone vocabulary -
// roleOptions above remains the single source of truth for the roles
// themselves and their labels.
function getRoleTone(role) {
  if (role === "admin") return "info";
  if (role === "analyst") return "success";
  return "warning";
}

function formatLastLogin(value) {
  if (!value) return "Never signed in";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never signed in";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function FormField({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-[#030454]">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function AdministrationPage({ foundation }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Client-side only: getManagedUsers() already returns every managed user
  // in one call (no backend search/filter params exist), so this filters
  // the already-fetched list rather than issuing new requests.
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");

  const lgas = foundation?.lgas || [];

  const userStats = useMemo(() => {
    const activeUsers = users.filter((user) => {
      const profile = user.profile || {};
      return user.is_active && profile.is_active_profile !== false;
    }).length;

    const inactiveUsers = users.length - activeUsers;
    const adminUsers = users.filter(
      (user) => user.profile?.role === "admin"
    ).length;

    const sectorUsers = users.filter(
      (user) => user.profile?.role === "sector_focal_point"
    ).length;

    return {
      total: users.length,
      active: activeUsers,
      inactive: inactiveUsers,
      admins: adminUsers,
      sectorUsers,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();

    return users.filter((user) => {
      const profile = user.profile || {};
      const isActive = user.is_active && profile.is_active_profile !== false;

      const matchesSearch =
        !search ||
        [user.username, user.full_name, user.email]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(search));

      const matchesRole = roleFilter === "all" || profile.role === roleFilter;

      const matchesAccount =
        accountFilter === "all" ||
        (accountFilter === "active" ? isActive : !isActive);

      return matchesSearch && matchesRole && matchesAccount;
    });
  }, [users, userSearch, roleFilter, accountFilter]);

  async function loadUsers() {
    setIsLoading(true);
    setError("");

    try {
      const data = await getManagedUsers();
      setUsers(data.results || []);
    } catch (err) {
      console.error(err);
      setError("Could not load users. Confirm you are logged in as Admin.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    getManagedUsers()
      .then((data) => {
        if (!cancelled) {
          setUsers(data.results || []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setError("Could not load users. Confirm you are logged in as Admin.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function resetForm() {
    setForm(initialForm);
    setMessage("");
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setIsSubmitting(true);
    setMessage("");
    setError("");

    const payload = {
      ...form,
      assigned_lga: form.assigned_lga ? Number(form.assigned_lga) : null,
    };

    try {
      await createManagedUser(payload);
      setMessage("User created successfully.");
      setForm(initialForm);
      await loadUsers();
    } catch (err) {
      console.error(err);

      const responseData = err?.response?.data;

      setError(
        responseData ? JSON.stringify(responseData) : "Could not create user."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleUserStatus(user) {
    const nextStatus = !user.is_active;

    setMessage("");
    setError("");

    try {
      await updateManagedUser(user.id, {
        is_active: nextStatus,
        is_active_profile: nextStatus,
      });

      setMessage(
        nextStatus
          ? "User account activated successfully."
          : "User account deactivated successfully."
      );

      await loadUsers();
    } catch (err) {
      console.error(err);
      setError("Could not update user status.");
    }
  }

  return (
    <div className="space-y-6">
      <CommandPageHeader
        title="Administration"
        description="Manage platform users, access permissions, and supported system settings."
        actions={
          <div className="flex flex-wrap gap-3">
            <CommandButton variant="outline" onClick={loadUsers}>
              Refresh Users
            </CommandButton>

            <CommandButton variant="outline" onClick={resetForm}>
              Reset Form
            </CommandButton>
          </div>
        }
      />

      {error && (
        <CommandNotice title="Administration error" tone="red">
          {error}
        </CommandNotice>
      )}

      {message && (
        <CommandNotice title="Administration update" tone="green">
          {message}
        </CommandNotice>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CommandStatCard
          label="Total Users"
          value={userStats.total}
          helper="All managed platform accounts."
          tone="blue"
        />

        <CommandStatCard
          label="Active Users"
          value={userStats.active}
          helper="Accounts currently enabled."
          tone="green"
        />

        <CommandStatCard
          label="Admin Users"
          value={userStats.admins}
          helper="Users with administrative access."
          tone="yellow"
        />

        <CommandStatCard
          label="Inactive Users"
          value={userStats.inactive}
          helper="Disabled or inactive accounts."
          tone="white"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[220px_1fr]">
        <form onSubmit={handleSubmit}>
          <CommandSection
            title="Create new user"
            description="Add Admin, Analyst, or Sector Focal Point accounts with the correct ministry, sector and LGA assignment."
          >
            <div className="space-y-4">
              <FormField label="Username">
                <input
                  className={inputClass}
                  value={form.username}
                  onChange={(event) =>
                    updateForm("username", event.target.value)
                  }
                  placeholder="e.g. energy_officer"
                  required
                />
              </FormField>

              <FormField label="Email">
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="user@example.com"
                />
              </FormField>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <FormField label="First Name">
                  <input
                    className={inputClass}
                    value={form.first_name}
                    onChange={(event) =>
                      updateForm("first_name", event.target.value)
                    }
                    placeholder="First name"
                  />
                </FormField>

                <FormField label="Last Name">
                  <input
                    className={inputClass}
                    value={form.last_name}
                    onChange={(event) =>
                      updateForm("last_name", event.target.value)
                    }
                    placeholder="Last name"
                  />
                </FormField>
              </div>

              <FormField label="Temporary Password">
                <input
                  type="password"
                  className={inputClass}
                  value={form.password}
                  onChange={(event) =>
                    updateForm("password", event.target.value)
                  }
                  placeholder="Minimum 8 characters"
                  required
                />
              </FormField>

              <FormField label="Role">
                <select
                  className={inputClass}
                  value={form.role}
                  onChange={(event) => updateForm("role", event.target.value)}
                >
                  {roleOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Assigned Sector">
                <select
                  className={inputClass}
                  value={form.assigned_sector}
                  onChange={(event) =>
                    updateForm("assigned_sector", event.target.value)
                  }
                >
                  {sectorOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Assigned LGA">
                <select
                  className={inputClass}
                  value={form.assigned_lga}
                  onChange={(event) =>
                    updateForm("assigned_lga", event.target.value)
                  }
                >
                  <option value="">None</option>
                  {lgas.map((lga) => (
                    <option key={lga.lga_id} value={lga.lga_id}>
                      {lga.lga_name}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Ministry / Department">
                <input
                  className={inputClass}
                  value={form.ministry_department}
                  onChange={(event) =>
                    updateForm("ministry_department", event.target.value)
                  }
                  placeholder="e.g. Ministry of Environment"
                />
              </FormField>

              <FormField label="Phone Number">
                <input
                  className={inputClass}
                  value={form.phone_number}
                  onChange={(event) =>
                    updateForm("phone_number", event.target.value)
                  }
                  placeholder="Phone number"
                />
              </FormField>

              <div className="flex flex-wrap gap-3 pt-2">
                <CommandButton type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating User..." : "Create User"}
                </CommandButton>

                <CommandButton variant="outline" onClick={resetForm}>
                  Clear
                </CommandButton>
              </div>
            </div>
          </CommandSection>
        </form>

        <CommandSection
          title="Platform users"
          description="All authorised users currently registered in the system."
          actions={
            <div className="flex w-full flex-wrap items-center gap-3">
              <input
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Search username, name or email..."
                aria-label="Search users"
                className={`${inputClass} max-w-xs`}
              />

              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                aria-label="Filter by role"
                className={`${inputClass} max-w-[180px]`}
              >
                <option value="all">All roles</option>
                {roleOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>

              <select
                value={accountFilter}
                onChange={(event) => setAccountFilter(event.target.value)}
                aria-label="Filter by account status"
                className={`${inputClass} max-w-[160px]`}
              >
                <option value="all">All accounts</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>

              <span className="rounded-md bg-[#030454]/10 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#030454]">
                {filteredUsers.length} of {users.length} users
              </span>
            </div>
          }
        >
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading users...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-3 font-bold">User</th>
                    <th className="px-3 py-3 font-bold">Role</th>
                    <th className="px-3 py-3 font-bold">Sector</th>
                    <th className="px-3 py-3 font-bold">LGA</th>
                    <th className="px-3 py-3 font-bold">Department</th>
                    <th className="px-3 py-3 font-bold">Last Login</th>
                    <th className="px-3 py-3 font-bold">Status</th>
                    <th className="px-3 py-3 font-bold">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredUsers.map((user) => {
                    const profile = user.profile || {};

                    const isActive =
                      user.is_active && profile.is_active_profile !== false;

                    return (
                      <tr
                        key={user.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-[#009B35]/5"
                      >
                        <td className="px-3 py-4">
                          <p className="font-black text-[#030454]">
                            {user.full_name || user.username}
                          </p>

                          <p className="text-xs text-slate-500">
                            {user.email || user.username}
                          </p>
                        </td>

                        <td className="px-3 py-4">
                          <CommandBadge tone={getRoleTone(profile.role)}>
                            {profile.role_display || getRoleLabel(profile.role)}
                          </CommandBadge>
                        </td>

                        <td className="px-3 py-4">
                          {profile.assigned_sector_display ||
                            getSectorLabel(profile.assigned_sector)}
                        </td>

                        <td className="px-3 py-4">
                          {profile.assigned_lga_name || "—"}
                        </td>

                        <td className="px-3 py-4">
                          {profile.ministry_department || "—"}
                        </td>

                        <td className="px-3 py-4 text-slate-600">
                          {formatLastLogin(user.last_login)}
                        </td>

                        <td className="px-3 py-4">
                          <CommandBadge tone={isActive ? "success" : "danger"}>
                            {isActive ? "Active" : "Inactive"}
                          </CommandBadge>
                        </td>

                        <td className="px-3 py-4">
                          <button
                            type="button"
                            onClick={() => toggleUserStatus(user)}
                            className={`rounded-md border px-3 py-1 text-xs font-bold transition ${
                              isActive
                                ? "border-red-200 text-red-700 hover:bg-red-50"
                                : "border-[#009B35]/30 text-[#009B35] hover:bg-[#009B35]/10"
                            }`}
                          >
                            {isActive ? "Deactivate" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredUsers.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-3 py-8 text-center text-slate-500"
                      >
                        {users.length === 0
                          ? "No managed users found."
                          : "No users match the current filters."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CommandSection>
      </section>

      <CommandSection
        title="Audit trail"
        description="Review administrative and platform activity logs for accountability and traceability."
      >
        <AuditTrailPanel />
      </CommandSection>
    </div>
  );
}
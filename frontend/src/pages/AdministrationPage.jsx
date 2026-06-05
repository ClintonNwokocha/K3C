import { useEffect, useMemo, useState } from "react";
import AuditTrailPanel from "../components/AuditTrailPanel";
import {
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

function getRoleBadgeClass(role) {
  if (role === "admin") return "bg-[#030454]/10 text-[#030454]";
  if (role === "analyst") return "bg-[#009B35]/10 text-[#009B35]";
  return "bg-[#F3F74B]/45 text-[#030454]";
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
    loadUsers();
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
        title="User management and access control"
        description="Create authorised platform users, assign roles, control sector access, manage active accounts, and review audit activity across the system."
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
            <span className="rounded-md bg-[#030454]/10 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-[#030454]">
              {users.length} users
            </span>
          }
        >
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading users...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-3 font-bold">User</th>
                    <th className="px-3 py-3 font-bold">Role</th>
                    <th className="px-3 py-3 font-bold">Sector</th>
                    <th className="px-3 py-3 font-bold">LGA</th>
                    <th className="px-3 py-3 font-bold">Department</th>
                    <th className="px-3 py-3 font-bold">Status</th>
                    <th className="px-3 py-3 font-bold">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user) => {
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
                          <span
                            className={`rounded-md px-3 py-1 text-xs font-bold ${getRoleBadgeClass(
                              profile.role
                            )}`}
                          >
                            {profile.role_display || getRoleLabel(profile.role)}
                          </span>
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

                        <td className="px-3 py-4">
                          <span
                            className={`rounded-md px-3 py-1 text-xs font-bold ${
                              isActive
                                ? "bg-[#009B35]/10 text-[#009B35]"
                                : "bg-red-50 text-red-700"
                            }`}
                          >
                            {isActive ? "Active" : "Inactive"}
                          </span>
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

                  {users.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-slate-500"
                      >
                        No managed users found.
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
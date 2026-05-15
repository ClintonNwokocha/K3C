import { useEffect, useState } from "react";
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

function getRoleLabel(role) {
  const found = roleOptions.find((item) => item.value === role);
  return found?.label || role;
}

function getSectorLabel(sector) {
  const found = sectorOptions.find((item) => item.value === sector);
  return found?.label || sector;
}

export default function AdministrationPage({ foundation }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const lgas = foundation?.lgas || [];

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
        responseData
          ? JSON.stringify(responseData)
          : "Could not create user."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleUserStatus(user) {
    const nextStatus = !user.is_active;

    try {
      await updateManagedUser(user.id, {
        is_active: nextStatus,
        is_active_profile: nextStatus,
      });

      await loadUsers();
    } catch (err) {
      console.error(err);
      setError("Could not update user status.");
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-medium text-emerald-700">
          Administration
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          User Management
        </h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Create authorised platform users, assign roles, and control sector
          access. Public users will use the transparency portal without login.
        </p>
      </section>

      {(message || error) && (
        <div
          className={`rounded-2xl border p-4 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error || message}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-3">
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-1"
        >
          <h2 className="text-lg font-bold">Create New User</h2>
          <p className="mt-1 text-sm text-slate-500">
            Add Admin, Analyst, or Sector Focal Point accounts.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Username
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.username}
                onChange={(event) => updateForm("username", event.target.value)}
                placeholder="e.g. energy_officer"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.email}
                onChange={(event) => updateForm("email", event.target.value)}
                placeholder="user@example.com"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  First Name
                </label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  value={form.first_name}
                  onChange={(event) =>
                    updateForm("first_name", event.target.value)
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Last Name
                </label>
                <input
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  value={form.last_name}
                  onChange={(event) =>
                    updateForm("last_name", event.target.value)
                  }
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Temporary Password
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.password}
                onChange={(event) => updateForm("password", event.target.value)}
                placeholder="Minimum 8 characters"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Role
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.role}
                onChange={(event) => updateForm("role", event.target.value)}
              >
                {roleOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Assigned Sector
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Assigned LGA
              </label>
              <select
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Ministry / Department
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.ministry_department}
                onChange={(event) =>
                  updateForm("ministry_department", event.target.value)
                }
                placeholder="e.g. Ministry of Energy"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Phone Number
              </label>
              <input
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                value={form.phone_number}
                onChange={(event) =>
                  updateForm("phone_number", event.target.value)
                }
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "Creating user..." : "Create User"}
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Platform Users</h2>
              <p className="text-sm text-slate-500">
                All authorised users currently in the system.
              </p>
            </div>

            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              {users.length} users
            </span>
          </div>

          {isLoading ? (
            <p className="text-slate-500">Loading users...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-3 font-medium">User</th>
                    <th className="px-3 py-3 font-medium">Role</th>
                    <th className="px-3 py-3 font-medium">Sector</th>
                    <th className="px-3 py-3 font-medium">LGA</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Action</th>
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
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-3 py-4">
                          <p className="font-semibold text-slate-900">
                            {user.full_name || user.username}
                          </p>
                          <p className="text-xs text-slate-500">
                            {user.email || user.username}
                          </p>
                        </td>

                        <td className="px-3 py-4">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {profile.role_display ||
                              getRoleLabel(profile.role)}
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
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              isActive
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-red-50 text-red-700"
                            }`}
                          >
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </td>

                        <td className="px-3 py-4">
                          <button
                            onClick={() => toggleUserStatus(user)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                          >
                            {isActive ? "Deactivate" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
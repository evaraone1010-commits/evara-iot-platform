/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { adminService } from "../../services/admin";
import { deviceService } from "../../services/DeviceService";
import { User, Search, MapPin, Filter, Plus, Edit2, Trash2, AlertTriangle } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { AddCustomerForm } from "../../components/admin/forms/AddCustomerForm";
import { useToast } from "../../components/ToastProvider";

const AdminCustomers = () => {
  const navigate = useNavigate();
  const { role, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<any[]>([]);

  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchClients = async () => {
    try {
      const [custData, zoneData] = await Promise.all([
        adminService.getCustomers(),
        adminService.getRegions(),
      ]);
      const clientsArr = Array.isArray(custData) ? custData : [];
      // Fetch nodes once and aggregate by customer id
      const nodes = await deviceService.getMapNodes();
      const byCustomer: Record<string, any[]> = {};
      nodes.forEach((n: any) => {
        const cid = n.customer_id || n.customerId || n.customer || n.customer_id;
        if (!cid) return;
        if (!byCustomer[cid]) byCustomer[cid] = [];
        byCustomer[cid].push(n);
      });

      const clientsWithDevices = clientsArr.map((c: any) => ({
        ...c,
        devices: byCustomer[c.id] || [],
        deviceCount: (byCustomer[c.id] || []).length,
      }));
      setClients(clientsWithDevices);
      setZones(Array.isArray(zoneData) ? zoneData : []);
    } catch (error) {
      console.error("Failed to fetch clients or hierarchy:", error);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);



  const zoneMap = useMemo(
    () => Object.fromEntries((zones || []).map((z) => [z.id, z])),
    [zones],
  );

  const filteredClients = (clients || []).filter((c) => {
    const name = (c.display_name || c.full_name || "").toLowerCase();
    const email = (c.email || "").toLowerCase();
    return (
      name.includes(search.toLowerCase()) ||
      email.includes(search.toLowerCase())
    );
  });

  const handleEditClick = (e: React.MouseEvent, client: any) => {
    e.stopPropagation();
    setEditingCustomer(client);
    setShowAddModal(true);
  };

  const handleDeleteClick = (e: React.MouseEvent, client: any) => {
    e.stopPropagation();
    setCustomerToDelete(client);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!customerToDelete) return;
    setIsDeleting(true);
    try {
      await adminService.deleteCustomer(customerToDelete.id);
      showToast("Customer deleted successfully", "success");
      fetchClients();
    } catch (err: any) {
      showToast(err.message || "Failed to delete customer", "error");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setCustomerToDelete(null);
    }
  };


  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-[24px]">
        <div>
          <h2 className="text-[28px] font-[600] tracking-[-0.5px] text-[var(--text-primary)] leading-tight">
            Customer Management
          </h2>
          <p className="glass-secondary mt-1">
            Global list of registered customers across all zones.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1F2937] opacity-40"
              size={18}
            />
            <input
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl text-sm focus:ring-2 focus:ring-[rgba(38,122,254,0.3)] focus:border-[#3A7AFE] outline-none w-64 shadow-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all"
            />
          </div>
          <button className="p-2 bg-[rgba(255,255,255,0.3)] border border-[rgba(255,255,255,0.4)] rounded-xl text-[#1F2937] opacity-80 hover:bg-[rgba(255,255,255,0.5)] shadow-sm transition-all">
            <Filter size={18} />
          </button>
          {role === "superadmin" && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-[12px] bg-[#3A7AFE] text-white font-[700] text-[13px] shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Plus size={16} /> Add Customer
            </button>
          )}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur-2xl rounded-3xl border border-white/20 overflow-hidden shadow-xl">
        <div className="p-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)] text-[11px] font-[600] text-[var(--text-muted)] uppercase tracking-wider">
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Location Context</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Devices</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.1)]">
              {(filteredClients || []).map((client) => (
                <tr
                  key={client?.id}
                  onClick={() => navigate(`/superadmin/customers/${client?.id}`)}
                  className="group hover:bg-[rgba(255,255,255,0.2)] transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[rgba(255,255,255,0.3)] flex items-center justify-center text-[#1F2937] border border-[rgba(255,255,255,0.4)] shadow-sm">
                        <User size={18} className="opacity-70" />
                      </div>
                      <div>
                        <p className="text-[14px] font-[600] customer-name group-hover:text-[#3A7AFE] dark:group-hover:text-blue-400 transition-colors">
                          {client?.display_name ||
                            client?.full_name ||
                            "Unnamed Customer"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[13px]">
                      <MapPin size={14} className="customer-location opacity-50" />
                      <div>
                        <span className="customer-location font-[500]">
                          {zoneMap[client?.zone_id || client?.regionFilter]?.zoneName || "No Zone Assigned"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-[13px] customer-email">
                      <p className="font-[500] opacity-90">
                        {client?.email || "—"}
                      </p>
                      <p className="customer-secondary">{client?.phone || "N/A"}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-[13px] font-[600] customer-badge bg-[rgba(255,255,255,0.4)] dark:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.5)] dark:border-[rgba(255,255,255,0.2)] px-2.5 py-1 rounded-[8px] shadow-sm">
                      {client?.devices?.length || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={(e) => handleEditClick(e, client)}
                        className="flex items-center gap-1.5 text-[12px] font-[600] text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-[8px] hover:bg-blue-100 transition-all shadow-sm"
                      >
                        <Edit2 size={14} /> Edit
                      </button>
                      <button 
                        onClick={(e) => handleDeleteClick(e, client)}
                        className="flex items-center gap-1.5 text-[12px] font-[600] text-red-600 border border-red-200 bg-red-50 px-3 py-1.5 rounded-[8px] hover:bg-red-100 transition-all shadow-sm"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredClients.length === 0 && (
          <div className="p-12 text-center">
            <User className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500 font-medium">
              {loading
                ? "Loading..."
                : "No customers yet. Add your first customer."}
            </p>
          </div>
        )}
      </div>

      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingCustomer(null);
        }}
        title={editingCustomer ? "Edit Customer Profile" : "Add New Customer"}
      >
        <AddCustomerForm
          initialData={editingCustomer}
          onSubmit={() => {
            setShowAddModal(false);
            setEditingCustomer(null);
            fetchClients();
          }}
          onCancel={() => {
            setShowAddModal(false);
            setEditingCustomer(null);
          }}
        />
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => !isDeleting && setShowDeleteConfirm(false)}
        title="Confirm Deletion"
      >
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
            <AlertTriangle size={32} />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Are you sure?</h3>
          <p className="text-slate-600 mb-8">
            You are about to delete <span className="font-bold text-slate-900">{customerToDelete?.display_name || customerToDelete?.full_name}</span>. 
            This action cannot be undone and will permanently remove the user from the system.
          </p>
          <div className="flex gap-3">
            <button
              disabled={isDeleting}
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={isDeleting}
              onClick={confirmDelete}
              className="flex-1 px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all disabled:opacity-50 shadow-lg shadow-red-500/20"
            >
              {isDeleting ? "Deleting..." : "Yes, Delete Customer"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminCustomers;

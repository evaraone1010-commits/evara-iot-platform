import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, MapPin, Cpu } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "../services/api";
import type { NodeRow } from "../types/database";

import clsx from "clsx";

interface MapDevice {
  id: string;
  name: string;
  asset_type: string;
  asset_category?: string;
  latitude: number;
  longitude: number;
  capacity?: string;
  specifications?: string;
  status: string;
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  pump: "Pump House",
  sump: "Sump",
  tank: "Overhead Tank",
  bore: "Borewell (IIIT)",
  govt: "Borewell (Govt)",
};

const ASSET_TYPE_STYLES: Record<
  string,
  { badge: string; accentBg: string; accentText: string }
> = {
  pump: {
    badge: "bg-purple-100 text-purple-700",
    accentBg: "from-purple-50 to-violet-50",
    accentText: "text-purple-700",
  },
  sump: {
    badge: "bg-emerald-100 text-emerald-700",
    accentBg: "from-emerald-50 to-teal-50",
    accentText: "text-emerald-700",
  },
  tank: {
    badge: "bg-blue-100 text-blue-700",
    accentBg: "from-blue-50 to-indigo-50",
    accentText: "text-blue-700",
  },
  bore: {
    badge: "bg-amber-100 text-amber-700",
    accentBg: "from-amber-50 to-yellow-50",
    accentText: "text-amber-700",
  },
  govt: {
    badge: "bg-slate-200 text-slate-700",
    accentBg: "from-slate-50 to-gray-100",
    accentText: "text-slate-600",
  },
};

const NodeDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: device, isLoading: deviceLoading } = useQuery<MapDevice>({
    queryKey: ["device", id],
    queryFn: async () => {
      const response = await api.get<MapDevice[]>("/devices/map/all");
      const found = response.data.find((d) => d.id === id);
      if (!found) throw new Error("Device not found");
      return found;
    },
    enabled: !!id,
  });

  // Mock node fallback for specific templates if needed, but keeping it empty for real data
  const [node] = useState<NodeRow | null>(null);

  if (deviceLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-32 text-center apple-glass-inner">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-[var(--text-muted)] font-medium">Loading Heartbeat...</p>
      </div>
    );
  }

  if (device) {
    const styles =
      ASSET_TYPE_STYLES[device.asset_type] || ASSET_TYPE_STYLES.pump;
    const label = ASSET_TYPE_LABELS[device.asset_type] || device.asset_type;
    const isOnline =
      device.status === "Online" ||
      device.status === "Working" ||
      device.status === "Running";

    return (
      <div className="flex flex-col min-h-full apple-glass-inner">
        <div className="p-6 max-w-4xl mx-auto w-full">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-6 transition-colors"
          >
            <ArrowLeft size={20} />
            <span className="font-semibold">Back</span>
          </button>

          <div
            className={clsx(
              "bg-gradient-to-br rounded-3xl p-8 border border-[var(--card-border)] shadow-xl",
              styles.accentBg,
            )}
          >
            <div className="flex items-start gap-4 mb-6">
              <div
                className={clsx(
                  "p-3 rounded-xl",
                  isOnline ? "bg-green-500" : "bg-red-500",
                )}
              >
                <MapPin className="text-white" size={24} />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-extrabold text-[var(--text-primary)] mb-2">
                  {device.name}
                </h1>
                <div className="flex gap-2 flex-wrap">
                  <span
                    className={clsx(
                      "px-3 py-1 rounded-full text-sm font-bold",
                      styles.badge,
                    )}
                  >
                    {label}
                  </span>
                  <span
                    className={clsx(
                      "px-3 py-1 rounded-full text-sm font-bold",
                      isOnline
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700",
                    )}
                  >
                    {device.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="apple-glass-card backdrop-blur rounded-xl p-4 border border-[var(--card-border)]">
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase mb-1">
                  Location
                </p>
                <p className="text-sm font-mono text-[var(--text-primary)] opacity-80">
                  {device.latitude.toFixed(6)}, {device.longitude.toFixed(6)}
                </p>
              </div>
              <div className="apple-glass-card backdrop-blur rounded-xl p-4 border border-[var(--card-border)]">
                <p className="text-xs font-bold text-[var(--text-muted)] uppercase mb-1">
                  Blueprint ID
                </p>
                <p className="text-xs font-mono text-[var(--text-primary)] opacity-80 break-all">
                  {device.id}
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    );
  }

  if (!device && !node) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-32 text-center apple-glass-inner">
        <Cpu size={28} className="text-[var(--card-border)] mb-4" />
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-1">
          Asset Not Found
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-6">Blueprint ID: {id}</p>
        <button
          onClick={() => navigate(-1)}
          className="px-5 py-2.5 bg-[#3A7AFE] text-white rounded-xl text-sm font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          Go Back
        </button>
      </div>
    );
  }

  return null;
};

export default NodeDetails;

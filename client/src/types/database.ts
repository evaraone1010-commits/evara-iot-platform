export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1";
  };
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          created_at: string | null;
          details: Json | null;
          distributor_id: string | null;
          id: string;
          resource_id: string | null;
          resource_type: string;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string | null;
          details?: Json | null;
          distributor_id?: string | null;
          id?: string;
          resource_id?: string | null;
          resource_type: string;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string | null;
          details?: Json | null;
          distributor_id?: string | null;
          id?: string;
          resource_id?: string | null;
          resource_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      communities: {
        Row: {
          address: string | null;
          contact_email: string | null;
          contact_info: Json | null;
          contact_person: string | null;
          contact_phone: string | null;
          created_at: string | null;
          deleted_at: string | null;
          id: string;
          metadata: Json | null;
          name: string;
          operational_status: string | null;
          pincode: string | null;
          updated_at: string | null;
          zone_id: string;
        };
        Insert: {
          address?: string | null;
          contact_email?: string | null;
          contact_info?: Json | null;
          contact_person?: string | null;
          contact_phone?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          id?: string;
          metadata?: Json | null;
          name: string;
          operational_status?: string | null;
          pincode?: string | null;
          updated_at?: string | null;
          zone_id: string;
        };
        Update: {
          address?: string | null;
          contact_email?: string | null;
          contact_info?: Json | null;
          contact_person?: string | null;
          contact_phone?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          id?: string;
          metadata?: Json | null;
          name?: string;
          operational_status?: string | null;
          pincode?: string | null;
          updated_at?: string | null;
          zone_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "communities_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "zone_detailed_stats";
            referencedColumns: ["zone_id"];
          },
          {
            foreignKeyName: "communities_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "zones";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          community_id: string | null;
          created_at: string | null;
          deleted_at: string | null;
          display_name: string | null;
          distributor_id: string | null;
          email: string;
          full_name: string | null;
          id: string;
          metadata: Json | null;
          phone_number: string | null;
          role: string | null;
          status: string | null;
          updated_at: string | null;
        };
        Insert: {
          community_id?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          display_name?: string | null;
          distributor_id?: string | null;
          email: string;
          full_name?: string | null;
          id: string;
          metadata?: Json | null;
          phone_number?: string | null;
          role?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Update: {
          community_id?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          display_name?: string | null;
          distributor_id?: string | null;
          email?: string;
          full_name?: string | null;
          id?: string;
          metadata?: Json | null;
          phone_number?: string | null;
          role?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
        ];
      };
      device_config_deep: {
        Row: {
          created_at: string | null;
          device_id: string;
          dynamic_depth: number | null;
          recharge_threshold: number | null;
          static_depth: number | null;
          thingspeak_channel_id: string | null;
          thingspeak_read_key: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          device_id: string;
          dynamic_depth?: number | null;
          recharge_threshold?: number | null;
          static_depth?: number | null;
          thingspeak_channel_id?: string | null;
          thingspeak_read_key?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          device_id?: string;
          dynamic_depth?: number | null;
          recharge_threshold?: number | null;
          static_depth?: number | null;
          thingspeak_channel_id?: string | null;
          thingspeak_read_key?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "device_config_deep_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: true;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "device_config_deep_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: true;
            referencedRelation: "vw_device_hierarchy";
            referencedColumns: ["device_id"];
          },
        ];
      };
      device_config_flow: {
        Row: {
          abnormal_threshold: number | null;
          created_at: string | null;
          device_id: string;
          max_flow_rate: number | null;
          pipe_diameter: number | null;
          thingspeak_channel_id: string | null;
          thingspeak_read_key: string | null;
          updated_at: string | null;
        };
        Insert: {
          abnormal_threshold?: number | null;
          created_at?: string | null;
          device_id: string;
          max_flow_rate?: number | null;
          pipe_diameter?: number | null;
          thingspeak_channel_id?: string | null;
          thingspeak_read_key?: string | null;
          updated_at?: string | null;
        };
        Update: {
          abnormal_threshold?: number | null;
          created_at?: string | null;
          device_id?: string;
          max_flow_rate?: number | null;
          pipe_diameter?: number | null;
          thingspeak_channel_id?: string | null;
          thingspeak_read_key?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "device_config_flow_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: true;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "device_config_flow_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: true;
            referencedRelation: "vw_device_hierarchy";
            referencedColumns: ["device_id"];
          },
        ];
      };
      device_config_tank: {
        Row: {
          breadth: number | null;
          created_at: string | null;
          device_id: string;
          dimension_unit: string | null;
          height: number | null;
          length: number | null;
          radius: number | null;
          tank_shape: string | null;
          thingspeak_channel_id: string | null;
          thingspeak_read_key: string | null;
          updated_at: string | null;
        };
        Insert: {
          breadth?: number | null;
          created_at?: string | null;
          device_id: string;
          dimension_unit?: string | null;
          height?: number | null;
          length?: number | null;
          radius?: number | null;
          tank_shape?: string | null;
          thingspeak_channel_id?: string | null;
          thingspeak_read_key?: string | null;
          updated_at?: string | null;
        };
        Update: {
          breadth?: number | null;
          created_at?: string | null;
          device_id?: string;
          dimension_unit?: string | null;
          height?: number | null;
          length?: number | null;
          radius?: number | null;
          tank_shape?: string | null;
          thingspeak_channel_id?: string | null;
          thingspeak_read_key?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "device_config_tank_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: true;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "device_config_tank_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: true;
            referencedRelation: "vw_device_hierarchy";
            referencedColumns: ["device_id"];
          },
        ];
      };
      device_shares: {
        Row: {
          access_level: string | null;
          created_at: string | null;
          device_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          access_level?: string | null;
          created_at?: string | null;
          device_id: string;
          id?: string;
          user_id: string;
        };
        Update: {
          access_level?: string | null;
          created_at?: string | null;
          device_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      devices: {
        Row: {
          analytics_template: string | null;
          asset_type: string | null;
          community_id: string | null;
          created_at: string | null;
          deleted_at: string | null;
          field_mapping: Json | null;
          id: string;
          is_active: boolean | null;
          label: string;
          latitude: number | null;
          longitude: number | null;
          node_key: string;
          status: string | null;
          thingspeak_channel_id: string;
          thingspeak_read_key: string;
          thingspeak_write_key: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          analytics_template?: string | null;
          asset_type?: string | null;
          community_id?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          field_mapping?: Json | null;
          id?: string;
          is_active?: boolean | null;
          label: string;
          latitude?: number | null;
          longitude?: number | null;
          node_key: string;
          status?: string | null;
          thingspeak_channel_id: string;
          thingspeak_read_key: string;
          thingspeak_write_key?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          analytics_template?: string | null;
          asset_type?: string | null;
          community_id?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          field_mapping?: Json | null;
          id?: string;
          is_active?: boolean | null;
          label?: string;
          latitude?: number | null;
          longitude?: number | null;
          node_key?: string;
          status?: string | null;
          thingspeak_channel_id?: string;
          thingspeak_read_key?: string;
          thingspeak_write_key?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "devices_community_id_fkey";
            columns: ["community_id"];
            isOneToOne: false;
            referencedRelation: "communities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "devices_owner_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      distributors: {
        Row: {
          created_at: string | null;
          deleted_at: string | null;
          id: string;
          metadata: Json | null;
          name: string;
          plan_id: string | null;
          region: string | null;
          status: string | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          deleted_at?: string | null;
          id?: string;
          metadata?: Json | null;
          name: string;
          plan_id?: string | null;
          region?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          deleted_at?: string | null;
          id?: string;
          metadata?: Json | null;
          name?: string;
          plan_id?: string | null;
          region?: string | null;
          status?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "distributors_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      frontend_errors: {
        Row: {
          created_at: string | null;
          error_message: string;
          id: string;
          stack_trace: string | null;
          url: string;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string | null;
          error_message: string;
          id?: string;
          stack_trace?: string | null;
          url: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string | null;
          error_message?: string;
          id?: string;
          stack_trace?: string | null;
          url?: string;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      ingestion_audit: {
        Row: {
          created_at: string | null;
          device_id: string | null;
          duration_ms: number | null;
          error_message: string | null;
          id: string;
          operation: string | null;
          status: string | null;
        };
        Insert: {
          created_at?: string | null;
          device_id?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          operation?: string | null;
          status?: string | null;
        };
        Update: {
          created_at?: string | null;
          device_id?: string | null;
          duration_ms?: number | null;
          error_message?: string | null;
          id?: string;
          operation?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ingestion_audit_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ingestion_audit_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "vw_device_hierarchy";
            referencedColumns: ["device_id"];
          },
        ];
      };
      pipelines: {
        Row: {
          coordinates: Json | null;
          created_at: string | null;
          diameter: string | null;
          from_device_id: string | null;
          id: string;
          is_active: boolean | null;
          material: string | null;
          name: string;
          pipeline_type: string | null;
          status: string | null;
          to_device_id: string | null;
          updated_at: string | null;
        };
        Insert: {
          coordinates?: Json | null;
          created_at?: string | null;
          diameter?: string | null;
          from_device_id?: string | null;
          id?: string;
          is_active?: boolean | null;
          material?: string | null;
          name: string;
          pipeline_type?: string | null;
          status?: string | null;
          to_device_id?: string | null;
          updated_at?: string | null;
        };
        Update: {
          coordinates?: Json | null;
          created_at?: string | null;
          diameter?: string | null;
          from_device_id?: string | null;
          id?: string;
          is_active?: boolean | null;
          material?: string | null;
          name?: string;
          pipeline_type?: string | null;
          status?: string | null;
          to_device_id?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pipelines_from_device_id_fkey";
            columns: ["from_device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipelines_from_device_id_fkey";
            columns: ["from_device_id"];
            isOneToOne: false;
            referencedRelation: "vw_device_hierarchy";
            referencedColumns: ["device_id"];
          },
          {
            foreignKeyName: "pipelines_to_device_id_fkey";
            columns: ["to_device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pipelines_to_device_id_fkey";
            columns: ["to_device_id"];
            isOneToOne: false;
            referencedRelation: "vw_device_hierarchy";
            referencedColumns: ["device_id"];
          },
        ];
      };
      plans: {
        Row: {
          created_at: string | null;
          id: string;
          max_devices: number | null;
          name: string;
          retention_days: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          max_devices?: number | null;
          name: string;
          retention_days?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          max_devices?: number | null;
          name?: string;
          retention_days?: number | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      telemetry_history: {
        Row: {
          created_at: string | null;
          device_id: string;
          id: string;
          metrics: Json;
          timestamp: string;
        };
        Insert: {
          created_at?: string | null;
          device_id: string;
          id?: string;
          metrics: Json;
          timestamp: string;
        };
        Update: {
          created_at?: string | null;
          device_id?: string;
          id?: string;
          metrics?: Json;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telemetry_history_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telemetry_history_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "vw_device_hierarchy";
            referencedColumns: ["device_id"];
          },
        ];
      };
      telemetry_snapshots: {
        Row: {
          created_at: string | null;
          depth_value: number | null;
          device_id: string;
          flow_rate: number | null;
          last_timestamp: string;
          level_percentage: number | null;
          mapped_values: Json | null;
          payload: Json;
          temperature_value: number | null;
          total_liters: number | null;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          depth_value?: number | null;
          device_id: string;
          flow_rate?: number | null;
          last_timestamp: string;
          level_percentage?: number | null;
          mapped_values?: Json | null;
          payload: Json;
          temperature_value?: number | null;
          total_liters?: number | null;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          depth_value?: number | null;
          device_id?: string;
          flow_rate?: number | null;
          last_timestamp?: string;
          level_percentage?: number | null;
          mapped_values?: Json | null;
          payload?: Json;
          temperature_value?: number | null;
          total_liters?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telemetry_snapshots_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: true;
            referencedRelation: "devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telemetry_snapshots_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: true;
            referencedRelation: "vw_device_hierarchy";
            referencedColumns: ["device_id"];
          },
        ];
      };
      zones: {
        Row: {
          country: string | null;
          created_at: string | null;
          deleted_at: string | null;
          description: string | null;
          distributor_id: string | null;
          geo_boundary: Json | null;
          id: string;
          is_active: boolean | null;
          name: string;
          regional_admin_id: string | null;
          state: string | null;
          updated_at: string | null;
          zone_code: string | null;
        };
        Insert: {
          country?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          distributor_id?: string | null;
          geo_boundary?: Json | null;
          id?: string;
          is_active?: boolean | null;
          name: string;
          regional_admin_id?: string | null;
          state?: string | null;
          updated_at?: string | null;
          zone_code?: string | null;
        };
        Update: {
          country?: string | null;
          created_at?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          distributor_id?: string | null;
          geo_boundary?: Json | null;
          id?: string;
          is_active?: boolean | null;
          name?: string;
          regional_admin_id?: string | null;
          state?: string | null;
          updated_at?: string | null;
          zone_code?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      dashboard_stats: {
        Row: {
          active_alerts: number | null;
          online_nodes: number | null;
          total_communities: number | null;
          total_customers: number | null;
          total_nodes: number | null;
        };
        Relationships: [];
      };
      vw_device_hierarchy: {
        Row: {
          community_name: string | null;
          device_id: string | null;
          device_name: string | null;
          distributor_id: string | null;
          distributor_name: string | null;
          node_key: string | null;
          zone_name: string | null;
        };
        Relationships: [];
      };
      zone_detailed_stats: {
        Row: {
          community_count: number | null;
          country: string | null;
          customer_count: number | null;
          device_count: number | null;
          health_percent: number | null;
          offline_devices: number | null;
          online_devices: number | null;
          state: string | null;
          zone_id: string | null;
          zone_name: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_fleet_summary: {
        Args: never;
        Returns: {
          avg_health: number;
          device_type: string;
          online_count: number;
          total_count: number;
        }[];
      };
      get_node_daily_stats: {
        Args: { p_days_back?: number; p_node_id: string };
        Returns: {
          avg_value: number;
          max_value: number;
          min_value: number;
          reading_count: number;
          stat_date: string;
        }[];
      };
      get_user_role: { Args: never; Returns: string };
      is_admin: { Args: { user_id: string }; Returns: boolean };
      is_in_community: {
        Args: { comm_id: string; user_id: string };
        Returns: boolean;
      };
      is_superadmin: { Args: never; Returns: boolean };
      refresh_dashboard_stats: { Args: never; Returns: undefined };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
    };
    Enums: {
      analytics_type: "EvaraTank" | "EvaraDeep" | "EvaraFlow";
      device_category: "EvaraTank" | "EvaraDeep" | "EvaraFlow";
      device_classification: "EvaraTank" | "EvaraDeep" | "EvaraFlow";
      node_asset_type: "tank" | "sump" | "borewell" | "well" | "flow_meter";
      node_category: "OHT" | "Sump" | "Borewell" | "GovtBorewell" | "PumpHouse";
      period_type: "hourly" | "daily" | "weekly" | "monthly";
      user_plan: "base" | "plus" | "pro";
      user_role: "superadmin" | "distributor" | "customer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      analytics_type: ["EvaraTank", "EvaraDeep", "EvaraFlow", "EvaraTDS"],
      device_category: ["EvaraTank", "EvaraDeep", "EvaraFlow", "EvaraTDS"],
      device_classification: ["EvaraTank", "EvaraDeep", "EvaraFlow", "EvaraTDS"],
      node_asset_type: ["tank", "sump", "borewell", "well", "flow_meter"],
      node_category: ["OHT", "Sump", "Borewell", "GovtBorewell", "PumpHouse", "EvaraTDS"],
      period_type: ["hourly", "daily", "weekly", "monthly"],
      user_plan: ["base", "plus", "pro"],
      user_role: ["superadmin", "distributor", "customer"],
    },
  },
} as const;

// ─── Convenience Row Aliases ─────────────────────────────────────────────────

export type RegionRow = Tables<"zones">;
export type CommunityRow = Tables<"communities">;
export type ProfileRow = Tables<"customers">;
export type UserProfileRow = Tables<"customers">;
export type DistributorRow = Tables<"distributors">;

// Unified device row — common fields across evaratank / evaraflow / evaradeep
export interface DeviceRow {
  id: string;
  name: string | null;
  node_key: string | null;
  analytics_template: string | null;
  asset_type: string | null;
  community_id: string | null;
  customer_id: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  is_active: boolean | null;
  thingspeak_channel_id: string | null;
  thingspeak_read_key: string | null;
  thingspeak_write_key: string | null;
  last_seen: string | null;
  created_at: string | null;
  updated_at: string | null;
  device_type?: string;
  [key: string]: unknown;
}

export type CustomerWithDevices = ProfileRow & {
  devices?: DeviceRow[];
  communities?: CommunityRow | null;
};

export type UserRole = "superadmin" | "distributor" | "customer";
export type UserPlan = "base" | "plus" | "pro";

// Node aliases
export type NodeRow = DeviceRow;

// Categorical enums used in AllNodes, AdminNodes etc.
export type NodeCategory =
  | "OHT"
  | "Sump"
  | "Borewell"
  | "GovtBorewell"
  | "PumpHouse"
  | "FlowMeter"
  | "EvaraTDS";
export type AnalyticsType = "EvaraTank" | "EvaraDeep" | "EvaraFlow" | "EvaraTDS";

// Stub types for tables that are not yet in the schema but referenced in the codebase
export interface AlertRule {
  id: string;
  name: string;
  node_id?: string;
  device_id?: string;
  metric?: string;
  condition?: string;
  threshold?: number;
  enabled?: boolean;
  created_at?: string;
}

export interface AlertHistory {
  id: string;
  rule_id?: string;
  device_id?: string;
  triggered_at?: string;
  resolved_at?: string | null;
  value_at_time?: number | string;
  rule?: AlertRule;
}

// Pipeline stubs (table not yet in schema)
export interface PipelineRow {
  id: string;
  name: string;
  created_by?: string;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface PipelineInsert {
  name: string;
  created_by?: string;
  [key: string]: unknown;
}

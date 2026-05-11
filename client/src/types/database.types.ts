export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      alert_events: {
        Row: {
          alert_type: string
          device_id: string
          device_type: string | null
          field_name: string | null
          fired_at: string | null
          id: string
          message: string | null
          resolved: boolean | null
          resolved_at: string | null
          threshold: number | null
          value: number | null
        }
        Insert: {
          alert_type: string
          device_id: string
          device_type?: string | null
          field_name?: string | null
          fired_at?: string | null
          id?: string
          message?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          threshold?: number | null
          value?: number | null
        }
        Update: {
          alert_type?: string
          device_id?: string
          device_type?: string | null
          field_name?: string | null
          fired_at?: string | null
          id?: string
          message?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          threshold?: number | null
          value?: number | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          distributor_id: string | null
          id: string
          resource_id: string | null
          resource_type: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          distributor_id?: string | null
          id?: string
          resource_id?: string | null
          resource_type: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          distributor_id?: string | null
          id?: string
          resource_id?: string | null
          resource_type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      communities: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_info: Json | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string | null
          deleted_at: string | null
          id: string
          metadata: Json | null
          name: string
          operational_status: string | null
          pincode: string | null
          updated_at: string | null
          zone_id: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_info?: Json | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json | null
          name: string
          operational_status?: string | null
          pincode?: string | null
          updated_at?: string | null
          zone_id: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_info?: Json | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          operational_status?: string | null
          pincode?: string | null
          updated_at?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          community_id: string | null
          created_at: string | null
          deleted_at: string | null
          display_name: string | null
          distributor_id: string | null
          email: string
          full_name: string | null
          id: string
          metadata: Json | null
          phone_number: string | null
          role: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          community_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          display_name?: string | null
          distributor_id?: string | null
          email: string
          full_name?: string | null
          id: string
          metadata?: Json | null
          phone_number?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          community_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          display_name?: string | null
          distributor_id?: string | null
          email?: string
          full_name?: string | null
          id?: string
          metadata?: Json | null
          phone_number?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      distributors: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          metadata: Json | null
          name: string
          plan_id: string | null
          region: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json | null
          name: string
          plan_id?: string | null
          region?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          plan_id?: string | null
          region?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "distributors_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      evaradeep: {
        Row: {
          client_id: string | null
          community_id: string | null
          created_at: string | null
          deleted_at: string | null
          depth_field: string | null
          dynamic_water_level: number | null
          id: string
          is_active: boolean | null
          label: string
          last_fetched_at: string | null
          last_seen: string | null
          latitude: number | null
          longitude: number | null
          node_key: string
          recharge_threshold: number | null
          static_water_level: number | null
          temperature_field: string | null
          thingspeak_channel_id: string | null
          thingspeak_read_key: string | null
          thingspeak_write_key: string | null
          total_bore_depth: number | null
          updated_at: string | null
          webhook_secret: string | null
        }
        Insert: {
          client_id?: string | null
          community_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          depth_field?: string | null
          dynamic_water_level?: number | null
          id?: string
          is_active?: boolean | null
          label: string
          last_fetched_at?: string | null
          last_seen?: string | null
          latitude?: number | null
          longitude?: number | null
          node_key: string
          recharge_threshold?: number | null
          static_water_level?: number | null
          temperature_field?: string | null
          thingspeak_channel_id?: string | null
          thingspeak_read_key?: string | null
          thingspeak_write_key?: string | null
          total_bore_depth?: number | null
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Update: {
          client_id?: string | null
          community_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          depth_field?: string | null
          dynamic_water_level?: number | null
          id?: string
          is_active?: boolean | null
          label?: string
          last_fetched_at?: string | null
          last_seen?: string | null
          latitude?: number | null
          longitude?: number | null
          node_key?: string
          recharge_threshold?: number | null
          static_water_level?: number | null
          temperature_field?: string | null
          thingspeak_channel_id?: string | null
          thingspeak_read_key?: string | null
          thingspeak_write_key?: string | null
          total_bore_depth?: number | null
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaradeep_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaradeep_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      evaradeep_snapshots: {
        Row: {
          depth_value: number | null
          device_id: string
          last_timestamp: string
          raw_payload: Json | null
          temperature_value: number | null
          thingspeak_entry_id: number | null
          updated_at: string | null
        }
        Insert: {
          depth_value?: number | null
          device_id: string
          last_timestamp: string
          raw_payload?: Json | null
          temperature_value?: number | null
          thingspeak_entry_id?: number | null
          updated_at?: string | null
        }
        Update: {
          depth_value?: number | null
          device_id?: string
          last_timestamp?: string
          raw_payload?: Json | null
          temperature_value?: number | null
          thingspeak_entry_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaradeep_snapshots_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "evaradeep"
            referencedColumns: ["id"]
          },
        ]
      }
      evaraflow: {
        Row: {
          client_id: string | null
          community_id: string | null
          created_at: string | null
          deleted_at: string | null
          flow_rate_field: string | null
          id: string
          is_active: boolean | null
          label: string
          last_fetched_at: string | null
          last_seen: string | null
          latitude: number | null
          longitude: number | null
          max_flow_rate: number | null
          meter_reading_field: string | null
          node_key: string
          pipe_diameter: number | null
          thingspeak_channel_id: string | null
          thingspeak_read_key: string | null
          thingspeak_write_key: string | null
          updated_at: string | null
          webhook_secret: string | null
        }
        Insert: {
          client_id?: string | null
          community_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          flow_rate_field?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          last_fetched_at?: string | null
          last_seen?: string | null
          latitude?: number | null
          longitude?: number | null
          max_flow_rate?: number | null
          meter_reading_field?: string | null
          node_key: string
          pipe_diameter?: number | null
          thingspeak_channel_id?: string | null
          thingspeak_read_key?: string | null
          thingspeak_write_key?: string | null
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Update: {
          client_id?: string | null
          community_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          flow_rate_field?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          last_fetched_at?: string | null
          last_seen?: string | null
          latitude?: number | null
          longitude?: number | null
          max_flow_rate?: number | null
          meter_reading_field?: string | null
          node_key?: string
          pipe_diameter?: number | null
          thingspeak_channel_id?: string | null
          thingspeak_read_key?: string | null
          thingspeak_write_key?: string | null
          updated_at?: string | null
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaraflow_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaraflow_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      evaraflow_snapshots: {
        Row: {
          device_id: string
          flow_rate: number | null
          last_timestamp: string
          raw_payload: Json | null
          thingspeak_entry_id: number | null
          total_liters: number | null
          updated_at: string | null
        }
        Insert: {
          device_id: string
          flow_rate?: number | null
          last_timestamp: string
          raw_payload?: Json | null
          thingspeak_entry_id?: number | null
          total_liters?: number | null
          updated_at?: string | null
        }
        Update: {
          device_id?: string
          flow_rate?: number | null
          last_timestamp?: string
          raw_payload?: Json | null
          thingspeak_entry_id?: number | null
          total_liters?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaraflow_snapshots_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "evaraflow"
            referencedColumns: ["id"]
          },
        ]
      }
      evaratank: {
        Row: {
          breadth_m: number | null
          capacity_liters: number | null
          client_id: string | null
          community_id: string | null
          created_at: string | null
          deleted_at: string | null
          height_m: number | null
          id: string
          is_active: boolean | null
          label: string
          last_fetched_at: string | null
          last_seen: string | null
          latitude: number | null
          length_m: number | null
          longitude: number | null
          node_key: string
          radius_m: number | null
          tank_shape: string | null
          temperature_field: string | null
          thingspeak_channel_id: string | null
          thingspeak_read_key: string | null
          thingspeak_write_key: string | null
          updated_at: string | null
          water_level_field: string | null
          webhook_secret: string | null
        }
        Insert: {
          breadth_m?: number | null
          capacity_liters?: number | null
          client_id?: string | null
          community_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          height_m?: number | null
          id?: string
          is_active?: boolean | null
          label: string
          last_fetched_at?: string | null
          last_seen?: string | null
          latitude?: number | null
          length_m?: number | null
          longitude?: number | null
          node_key: string
          radius_m?: number | null
          tank_shape?: string | null
          temperature_field?: string | null
          thingspeak_channel_id?: string | null
          thingspeak_read_key?: string | null
          thingspeak_write_key?: string | null
          updated_at?: string | null
          water_level_field?: string | null
          webhook_secret?: string | null
        }
        Update: {
          breadth_m?: number | null
          capacity_liters?: number | null
          client_id?: string | null
          community_id?: string | null
          created_at?: string | null
          deleted_at?: string | null
          height_m?: number | null
          id?: string
          is_active?: boolean | null
          label?: string
          last_fetched_at?: string | null
          last_seen?: string | null
          latitude?: number | null
          length_m?: number | null
          longitude?: number | null
          node_key?: string
          radius_m?: number | null
          tank_shape?: string | null
          temperature_field?: string | null
          thingspeak_channel_id?: string | null
          thingspeak_read_key?: string | null
          thingspeak_write_key?: string | null
          updated_at?: string | null
          water_level_field?: string | null
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaratank_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaratank_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      evaratank_snapshots: {
        Row: {
          device_id: string
          last_timestamp: string
          level_percentage: number | null
          raw_payload: Json | null
          temperature_value: number | null
          thingspeak_entry_id: number | null
          updated_at: string | null
        }
        Insert: {
          device_id: string
          last_timestamp: string
          level_percentage?: number | null
          raw_payload?: Json | null
          temperature_value?: number | null
          thingspeak_entry_id?: number | null
          updated_at?: string | null
        }
        Update: {
          device_id?: string
          last_timestamp?: string
          level_percentage?: number | null
          raw_payload?: Json | null
          temperature_value?: number | null
          thingspeak_entry_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaratank_snapshots_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "evaratank"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string | null
          id: string
          max_devices: number | null
          name: string
          retention_days: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          max_devices?: number | null
          name: string
          retention_days?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          max_devices?: number | null
          name?: string
          retention_days?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      superadmin: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email: string
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      telemetry_history: {
        Row: {
          created_at: string | null
          device_id: string
          device_type: string | null
          id: string
          metrics: Json
          timestamp: string
        }
        Insert: {
          created_at?: string | null
          device_id: string
          device_type?: string | null
          id?: string
          metrics: Json
          timestamp: string
        }
        Update: {
          created_at?: string | null
          device_id?: string
          device_type?: string | null
          id?: string
          metrics?: Json
          timestamp?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          country: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          distributor_id: string | null
          geo_boundary: Json | null
          id: string
          is_active: boolean | null
          name: string
          regional_admin_id: string | null
          state: string | null
          updated_at: string | null
          zone_code: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          distributor_id?: string | null
          geo_boundary?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          regional_admin_id?: string | null
          state?: string | null
          updated_at?: string | null
          zone_code?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          distributor_id?: string | null
          geo_boundary?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          regional_admin_id?: string | null
          state?: string | null
          updated_at?: string | null
          zone_code?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_fleet_summary: {
        Args: never
        Returns: {
          avg_health: number
          device_type: string
          online_count: number
          total_count: number
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      get_node_daily_stats: {
        Args: { p_days_back?: number; p_node_id: string }
        Returns: {
          avg_value: number
          max_value: number
          min_value: number
          reading_count: number
          stat_date: string
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_in_community: {
        Args: { comm_id: string; user_id: string }
        Returns: boolean
      }
      is_superadmin: { Args: never; Returns: boolean }
      refresh_dashboard_stats: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      analytics_type: "EvaraTank" | "EvaraDeep" | "EvaraFlow"
      device_category: "EvaraTank" | "EvaraDeep" | "EvaraFlow"
      device_classification: "EvaraTank" | "EvaraDeep" | "EvaraFlow"
      node_asset_type: "tank" | "sump" | "borewell" | "well" | "flow_meter"
      node_category: "OHT" | "Sump" | "Borewell" | "GovtBorewell" | "PumpHouse"
      period_type: "hourly" | "daily" | "weekly" | "monthly"
      user_plan: "base" | "plus" | "pro"
      user_role: "superadmin" | "distributor" | "customer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      analytics_type: ["EvaraTank", "EvaraDeep", "EvaraFlow"],
      device_category: ["EvaraTank", "EvaraDeep", "EvaraFlow"],
      device_classification: ["EvaraTank", "EvaraDeep", "EvaraFlow"],
      node_asset_type: ["tank", "sump", "borewell", "well", "flow_meter"],
      node_category: ["OHT", "Sump", "Borewell", "GovtBorewell", "PumpHouse"],
      period_type: ["hourly", "daily", "weekly", "monthly"],
      user_plan: ["base", "plus", "pro"],
      user_role: ["superadmin", "distributor", "customer"],
    },
  },
} as const

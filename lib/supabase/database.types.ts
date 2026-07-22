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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      adjustments: {
        Row: {
          count_line_id: string
          created_at: string
          created_by: string
          id: string
          new_qty: number
          previous_qty: number
          reason: string
        }
        Insert: {
          count_line_id: string
          created_at?: string
          created_by: string
          id?: string
          new_qty: number
          previous_qty: number
          reason: string
        }
        Update: {
          count_line_id?: string
          created_at?: string
          created_by?: string
          id?: string
          new_qty?: number
          previous_qty?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "adjustments_count_line_id_fkey"
            columns: ["count_line_id"]
            isOneToOne: false
            referencedRelation: "count_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      count_lines: {
        Row: {
          count_session_id: string
          expected_qty: number
          id: string
          ledger_qty: number | null
          note: string | null
          physical_qty: number | null
          product_id: string
          reason_code: Database["public"]["Enums"]["reason_code"] | null
          variance: number | null
        }
        Insert: {
          count_session_id: string
          expected_qty?: number
          id?: string
          ledger_qty?: number | null
          note?: string | null
          physical_qty?: number | null
          product_id: string
          reason_code?: Database["public"]["Enums"]["reason_code"] | null
          variance?: number | null
        }
        Update: {
          count_session_id?: string
          expected_qty?: number
          id?: string
          ledger_qty?: number | null
          note?: string | null
          physical_qty?: number | null
          product_id?: string
          reason_code?: Database["public"]["Enums"]["reason_code"] | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "count_lines_count_session_id_fkey"
            columns: ["count_session_id"]
            isOneToOne: false
            referencedRelation: "count_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "count_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      count_sessions: {
        Row: {
          as_at_date: string
          counted_by: string
          created_at: string
          department_id: string
          id: string
          locked_at: string | null
          status: Database["public"]["Enums"]["session_status"]
        }
        Insert: {
          as_at_date: string
          counted_by: string
          created_at?: string
          department_id: string
          id?: string
          locked_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
        }
        Update: {
          as_at_date?: string
          counted_by?: string
          created_at?: string
          department_id?: string
          id?: string
          locked_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
        }
        Relationships: [
          {
            foreignKeyName: "count_sessions_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "count_sessions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          id: string
          is_active: boolean
          is_central_store: boolean
          name: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          is_central_store?: boolean
          name: string
        }
        Update: {
          id?: string
          is_active?: boolean
          is_central_store?: boolean
          name?: string
        }
        Relationships: []
      }
      movements: {
        Row: {
          business_day: string
          created_at: string
          created_by: string
          from_department_id: string | null
          id: string
          invoice_reference: string | null
          is_override: boolean
          note: string | null
          override_reason: string | null
          product_id: string
          quantity: number
          received_by: string | null
          reversal_of_movement_id: string | null
          supplier_name: string | null
          to_department_id: string | null
          type: Database["public"]["Enums"]["movement_type"]
        }
        Insert: {
          business_day?: string
          created_at?: string
          created_by: string
          from_department_id?: string | null
          id?: string
          invoice_reference?: string | null
          is_override?: boolean
          note?: string | null
          override_reason?: string | null
          product_id: string
          quantity: number
          received_by?: string | null
          reversal_of_movement_id?: string | null
          supplier_name?: string | null
          to_department_id?: string | null
          type: Database["public"]["Enums"]["movement_type"]
        }
        Update: {
          business_day?: string
          created_at?: string
          created_by?: string
          from_department_id?: string | null
          id?: string
          invoice_reference?: string | null
          is_override?: boolean
          note?: string | null
          override_reason?: string | null
          product_id?: string
          quantity?: number
          received_by?: string | null
          reversal_of_movement_id?: string | null
          supplier_name?: string | null
          to_department_id?: string | null
          type?: Database["public"]["Enums"]["movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_from_department_id_fkey"
            columns: ["from_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_reversal_of_movement_id_fkey"
            columns: ["reversal_of_movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_reversal_of_movement_id_fkey"
            columns: ["reversal_of_movement_id"]
            isOneToOne: false
            referencedRelation: "movements_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_reversal_of_movement_id_fkey"
            columns: ["reversal_of_movement_id"]
            isOneToOne: false
            referencedRelation: "movements_detail"
            referencedColumns: ["reversed_by_movement_id"]
          },
          {
            foreignKeyName: "movements_to_department_id_fkey"
            columns: ["to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      product_assignments: {
        Row: {
          department_id: string
          id: string
          product_id: string
          shelf_order: number | null
        }
        Insert: {
          department_id: string
          id?: string
          product_id: string
          shelf_order?: number | null
        }
        Update: {
          department_id?: string
          id?: string
          product_id?: string
          shelf_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_assignments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          code: string
          id: string
          is_active: boolean
          name: string
          unit_cost: number
        }
        Insert: {
          code: string
          id?: string
          is_active?: boolean
          name: string
          unit_cost?: number
        }
        Update: {
          code?: string
          id?: string
          is_active?: boolean
          name?: string
          unit_cost?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          department_id: string | null
          full_name: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          department_id?: string | null
          full_name: string
          id: string
          is_active?: boolean
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          department_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_drafts: {
        Row: {
          business_day: string
          created_by: string
          department_id: string
          id: string
          lines: Json
          updated_at: string
        }
        Insert: {
          business_day: string
          created_by: string
          department_id: string
          id?: string
          lines?: Json
          updated_at?: string
        }
        Update: {
          business_day?: string
          created_by?: string
          department_id?: string
          id?: string
          lines?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_drafts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      movements_detail: {
        Row: {
          business_day: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          from_department_id: string | null
          from_department_name: string | null
          id: string | null
          invoice_reference: string | null
          is_override: boolean | null
          note: string | null
          override_reason: string | null
          product_code: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          received_by: string | null
          received_by_name: string | null
          reversal_of_movement_id: string | null
          reversed_by_movement_id: string | null
          supplier_name: string | null
          to_department_id: string | null
          to_department_name: string | null
          type: Database["public"]["Enums"]["movement_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_from_department_id_fkey"
            columns: ["from_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_reversal_of_movement_id_fkey"
            columns: ["reversal_of_movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_reversal_of_movement_id_fkey"
            columns: ["reversal_of_movement_id"]
            isOneToOne: false
            referencedRelation: "movements_detail"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_reversal_of_movement_id_fkey"
            columns: ["reversal_of_movement_id"]
            isOneToOne: false
            referencedRelation: "movements_detail"
            referencedColumns: ["reversed_by_movement_id"]
          },
          {
            foreignKeyName: "movements_to_department_id_fkey"
            columns: ["to_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_import_products: {
        Args: { p_rows: Json }
        Returns: {
          action: string
          code: string
        }[]
      }
      admin_set_central_store: {
        Args: { p_department_id: string }
        Returns: undefined
      }
      app_current_department_id: { Args: never; Returns: string }
      app_current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_department_balance: {
        Args: { p_as_at_date: string; p_department_id: string }
        Returns: {
          closing_qty: number
          closing_value: number
          issued_qty: number
          issued_value: number
          opening_qty: number
          opening_value: number
          product_code: string
          product_id: string
          product_name: string
          received_qty: number
          received_value: number
          unit_cost: number
        }[]
      }
      post_movement_reversal: {
        Args: { p_created_by: string; p_movement_id: string; p_reason: string }
        Returns: string
      }
      post_purchase_batch: {
        Args: {
          p_business_day: string
          p_created_by: string
          p_invoice_reference: string
          p_lines: Json
          p_supplier_name: string
        }
        Returns: string[]
      }
      post_requisition_batch: {
        Args: {
          p_business_day: string
          p_created_by: string
          p_lines: Json
          p_received_by: string
          p_to_department_id: string
        }
        Returns: string[]
      }
      post_sales_batch: {
        Args: {
          p_business_day: string
          p_created_by: string
          p_department_id: string
          p_lines: Json
        }
        Returns: string[]
      }
    }
    Enums: {
      movement_type: "PURCHASE" | "REQUISITION" | "SALE"
      reason_code:
        | "BREAKAGE"
        | "SPILLAGE"
        | "UNRECORDED_SALE"
        | "TRANSFER_NOT_POSTED"
        | "POSTING_ERROR"
        | "UNDER_INVESTIGATION"
      session_status: "DRAFT" | "COMPLETED" | "LOCKED"
      user_role: "ADMIN" | "STOREKEEPER" | "DEPARTMENT_USER" | "AUDITOR"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      movement_type: ["PURCHASE", "REQUISITION", "SALE"],
      reason_code: [
        "BREAKAGE",
        "SPILLAGE",
        "UNRECORDED_SALE",
        "TRANSFER_NOT_POSTED",
        "POSTING_ERROR",
        "UNDER_INVESTIGATION",
      ],
      session_status: ["DRAFT", "COMPLETED", "LOCKED"],
      user_role: ["ADMIN", "STOREKEEPER", "DEPARTMENT_USER", "AUDITOR"],
    },
  },
} as const

// Generado desde el esquema de Supabase de QA (pnpm db:qa:types). No editar a mano.
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
    PostgrestVersion: "14.18"
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
      admin_notifications: {
        Row: {
          body: string
          created_at: string
          id: number
          kind: string
          pushed_at: string | null
          read_at: string | null
          reservation_code: string | null
          title: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: never
          kind: string
          pushed_at?: string | null
          read_at?: string | null
          reservation_code?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          kind?: string
          pushed_at?: string | null
          read_at?: string | null
          reservation_code?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_reservation_code_fkey"
            columns: ["reservation_code"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["code"]
          },
        ]
      }
      bathroom_blocks: {
        Row: {
          bathroom_id: string
          created_at: string
          from_date: string
          id: string
          notes: string
          reason: string
          to_date: string
        }
        Insert: {
          bathroom_id: string
          created_at?: string
          from_date: string
          id?: string
          notes?: string
          reason: string
          to_date: string
        }
        Update: {
          bathroom_id?: string
          created_at?: string
          from_date?: string
          id?: string
          notes?: string
          reason?: string
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bathroom_blocks_bathroom_id_fkey"
            columns: ["bathroom_id"]
            isOneToOne: false
            referencedRelation: "bathrooms"
            referencedColumns: ["id"]
          },
        ]
      }
      bathrooms: {
        Row: {
          cabin_type_id: string | null
          created_at: string
          id: string
          name: string
          notes: string
          status: string
          status_updated_at: string
          unit: number | null
          updated_at: string
        }
        Insert: {
          cabin_type_id?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string
          status?: string
          status_updated_at?: string
          unit?: number | null
          updated_at?: string
        }
        Update: {
          cabin_type_id?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string
          status?: string
          status_updated_at?: string
          unit?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bathrooms_cabin_type_id_fkey"
            columns: ["cabin_type_id"]
            isOneToOne: false
            referencedRelation: "cabin_types"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          cabin_type_id: string
          created_at: string
          created_by: string | null
          from_date: string
          id: string
          notes: string
          reason: string
          to_date: string
          unit: number
          updated_at: string
        }
        Insert: {
          cabin_type_id: string
          created_at?: string
          created_by?: string | null
          from_date: string
          id?: string
          notes?: string
          reason: string
          to_date: string
          unit: number
          updated_at?: string
        }
        Update: {
          cabin_type_id?: string
          created_at?: string
          created_by?: string | null
          from_date?: string
          id?: string
          notes?: string
          reason?: string
          to_date?: string
          unit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_cabin_type_id_fkey"
            columns: ["cabin_type_id"]
            isOneToOne: false
            referencedRelation: "cabin_types"
            referencedColumns: ["id"]
          },
        ]
      }
      cabin_types: {
        Row: {
          activa: boolean
          badge: string
          caracteristicas: string[]
          created_at: string
          descripcion: string
          fotos: string[]
          id: string
          max_personas: number
          nombre: string
          persona_adicional: number
          precio_pareja: number
          sort: number
          units: number
          updated_at: string
        }
        Insert: {
          activa?: boolean
          badge?: string
          caracteristicas?: string[]
          created_at?: string
          descripcion?: string
          fotos?: string[]
          id: string
          max_personas: number
          nombre: string
          persona_adicional: number
          precio_pareja: number
          sort?: number
          units: number
          updated_at?: string
        }
        Update: {
          activa?: boolean
          badge?: string
          caracteristicas?: string[]
          created_at?: string
          descripcion?: string
          fotos?: string[]
          id?: string
          max_personas?: number
          nombre?: string
          persona_adicional?: number
          precio_pareja?: number
          sort?: number
          units?: number
          updated_at?: string
        }
        Relationships: []
      }
      client_entries: {
        Row: {
          client_key: string
          created_at: string
          created_by: string | null
          id: number
          kind: string
          reservation_code: string | null
          severity: string | null
          text: string
        }
        Insert: {
          client_key: string
          created_at?: string
          created_by?: string | null
          id?: never
          kind: string
          reservation_code?: string | null
          severity?: string | null
          text: string
        }
        Update: {
          client_key?: string
          created_at?: string
          created_by?: string | null
          id?: never
          kind?: string
          reservation_code?: string | null
          severity?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_entries_client_key_fkey"
            columns: ["client_key"]
            isOneToOne: false
            referencedRelation: "client_profiles"
            referencedColumns: ["client_key"]
          },
          {
            foreignKeyName: "client_entries_reservation_code_fkey"
            columns: ["reservation_code"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["code"]
          },
        ]
      }
      client_profiles: {
        Row: {
          client_key: string
          created_at: string
          preferences: string
          rating: number | null
          summary: string
          tags: string[]
          trust: string
          updated_at: string
        }
        Insert: {
          client_key: string
          created_at?: string
          preferences?: string
          rating?: number | null
          summary?: string
          tags?: string[]
          trust?: string
          updated_at?: string
        }
        Update: {
          client_key?: string
          created_at?: string
          preferences?: string
          rating?: number | null
          summary?: string
          tags?: string[]
          trust?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          created_by: string | null
          dedupe_key: string
          id: string
          kind: string
          last_error: string
          next_attempt_at: string
          payload: Json
          provider_id: string | null
          reservation_code: string | null
          sent_at: string | null
          status: string
          subject: string
          to_email: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          dedupe_key: string
          id?: string
          kind: string
          last_error?: string
          next_attempt_at?: string
          payload?: Json
          provider_id?: string | null
          reservation_code?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          to_email: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string | null
          dedupe_key?: string
          id?: string
          kind?: string
          last_error?: string
          next_attempt_at?: string
          payload?: Json
          provider_id?: string | null
          reservation_code?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_reservation_code_fkey"
            columns: ["reservation_code"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["code"]
          },
        ]
      }
      payment_proofs: {
        Row: {
          created_at: string
          file_name: string
          id: string
          mime: string
          note: string
          path: string
          reservation_code: string
          review_note: string
          reviewed_at: string | null
          reviewed_by: string | null
          size: number
          status: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          mime: string
          note?: string
          path: string
          reservation_code: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          size: number
          status?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          mime?: string
          note?: string
          path?: string
          reservation_code?: string
          review_note?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          size?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_reservation_code_fkey"
            columns: ["reservation_code"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["code"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          approved_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          expires_at: string | null
          id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          method: string
          provider: string
          reference: string
          reservation_code: string
          status: Database["public"]["Enums"]["payment_status"]
          status_detail: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expires_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["payment_kind"]
          method?: string
          provider: string
          reference: string
          reservation_code: string
          status?: Database["public"]["Enums"]["payment_status"]
          status_detail?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expires_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          method?: string
          provider?: string
          reference?: string
          reservation_code?: string
          status?: Database["public"]["Enums"]["payment_status"]
          status_detail?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_reservation_code_fkey"
            columns: ["reservation_code"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["code"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device: string
          endpoint: string
          groups: string[]
          id: string
          last_success_at: string | null
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device?: string
          endpoint: string
          groups?: string[]
          id?: string
          last_success_at?: string | null
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          device?: string
          endpoint?: string
          groups?: string[]
          id?: string
          last_success_at?: string | null
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      rate_seasons: {
        Row: {
          activa: boolean
          cabin_type_id: string
          created_at: string
          from_date: string
          id: string
          nombre: string
          persona_adicional: number
          precio_pareja: number
          to_date: string
          updated_at: string
        }
        Insert: {
          activa?: boolean
          cabin_type_id: string
          created_at?: string
          from_date: string
          id?: string
          nombre: string
          persona_adicional: number
          precio_pareja: number
          to_date: string
          updated_at?: string
        }
        Update: {
          activa?: boolean
          cabin_type_id?: string
          created_at?: string
          from_date?: string
          id?: string
          nombre?: string
          persona_adicional?: number
          precio_pareja?: number
          to_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_seasons_cabin_type_id_fkey"
            columns: ["cabin_type_id"]
            isOneToOne: false
            referencedRelation: "cabin_types"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          reservation_code: string
          text: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: never
          reservation_code: string
          text: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: never
          reservation_code?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_notes_reservation_code_fkey"
            columns: ["reservation_code"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["code"]
          },
        ]
      }
      reservations: {
        Row: {
          adults: number
          balance_paid_at: string | null
          cabin_type_id: string
          channel: string
          check_in: string
          check_out: string
          checked_in_at: string | null
          children: number
          client_key: string | null
          code: string
          commission: number
          consents: Json
          created_at: string
          decoration: Json
          deposit_due_at: string
          deposit_paid_at: string | null
          estimated_arrival: string
          external_ref: string | null
          guest_city: string
          guest_doc_number: string
          guest_doc_type: string
          guest_email: string
          guest_full_name: string
          guest_phone: string
          idempotency_key: string | null
          live_key: string
          paid_amount: number
          pet: Json
          quote: Json
          source: string
          special_requests: string
          status: Database["public"]["Enums"]["reservation_status"]
          unit: number
          updated_at: string
        }
        Insert: {
          adults: number
          balance_paid_at?: string | null
          cabin_type_id: string
          channel?: string
          check_in: string
          check_out: string
          checked_in_at?: string | null
          children?: number
          client_key?: string | null
          code: string
          commission?: number
          consents: Json
          created_at?: string
          decoration?: Json
          deposit_due_at: string
          deposit_paid_at?: string | null
          estimated_arrival: string
          external_ref?: string | null
          guest_city: string
          guest_doc_number: string
          guest_doc_type: string
          guest_email: string
          guest_full_name: string
          guest_phone: string
          idempotency_key?: string | null
          live_key?: string
          paid_amount?: number
          pet?: Json
          quote: Json
          source?: string
          special_requests?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          unit: number
          updated_at?: string
        }
        Update: {
          adults?: number
          balance_paid_at?: string | null
          cabin_type_id?: string
          channel?: string
          check_in?: string
          check_out?: string
          checked_in_at?: string | null
          children?: number
          client_key?: string | null
          code?: string
          commission?: number
          consents?: Json
          created_at?: string
          decoration?: Json
          deposit_due_at?: string
          deposit_paid_at?: string | null
          estimated_arrival?: string
          external_ref?: string | null
          guest_city?: string
          guest_doc_number?: string
          guest_doc_type?: string
          guest_email?: string
          guest_full_name?: string
          guest_phone?: string
          idempotency_key?: string | null
          live_key?: string
          paid_amount?: number
          pet?: Json
          quote?: Json
          source?: string
          special_requests?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          unit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_cabin_type_id_fkey"
            columns: ["cabin_type_id"]
            isOneToOne: false
            referencedRelation: "cabin_types"
            referencedColumns: ["id"]
          },
        ]
      }
      site_photos: {
        Row: {
          path: string
          slot: string
          updated_at: string
        }
        Insert: {
          path: string
          slot: string
          updated_at?: string
        }
        Update: {
          path?: string
          slot?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_policies: {
        Row: {
          answer: string
          id: string
          question: string
          sort: number
          updated_at: string
        }
        Insert: {
          answer: string
          id?: string
          question: string
          sort?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          id?: string
          question?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      site_services: {
        Row: {
          created_at: string
          description: string
          icon: string
          id: string
          note: string
          sort: number
          title: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          description?: string
          icon?: string
          id?: string
          note?: string
          sort?: number
          title: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          description?: string
          icon?: string
          id?: string
          note?: string
          sort?: number
          title?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          check_in_end: string
          check_in_start: string
          check_out_time: string
          content: Json
          deposit_pct: number
          id: boolean
          phones: string[]
          rnt: string
          theme: Json
          updated_at: string
          whatsapp: string
        }
        Insert: {
          check_in_end: string
          check_in_start: string
          check_out_time: string
          content?: Json
          deposit_pct?: number
          id?: boolean
          phones: string[]
          rnt?: string
          theme?: Json
          updated_at?: string
          whatsapp: string
        }
        Update: {
          check_in_end?: string
          check_in_start?: string
          check_out_time?: string
          content?: Json
          deposit_pct?: number
          id?: boolean
          phones?: string[]
          rnt?: string
          theme?: Json
          updated_at?: string
          whatsapp?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_approved_payment: {
        Args: { p_payment_id: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      panel_role: { Args: never; Returns: string }
      register_manual_payment: {
        Args: {
          p_amount?: number
          p_code: string
          p_kind: Database["public"]["Enums"]["payment_kind"]
          p_note?: string
        }
        Returns: Json
      }
      run_payment_deadlines: { Args: never; Returns: undefined }
    }
    Enums: {
      payment_kind: "deposit" | "balance" | "full"
      payment_status:
        | "initiated"
        | "pending"
        | "approved"
        | "declined"
        | "error"
        | "expired"
      reservation_status:
        | "pending_deposit"
        | "confirmed"
        | "cancelled"
        | "expired"
        | "rescheduled"
        | "checked_in"
        | "completed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      payment_kind: ["deposit", "balance", "full"],
      payment_status: [
        "initiated",
        "pending",
        "approved",
        "declined",
        "error",
        "expired",
      ],
      reservation_status: [
        "pending_deposit",
        "confirmed",
        "cancelled",
        "expired",
        "rescheduled",
        "checked_in",
        "completed",
      ],
    },
  },
} as const

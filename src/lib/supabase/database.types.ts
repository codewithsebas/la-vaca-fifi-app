// Generado desde el esquema de Supabase (MCP generate_typescript_types). No editar a mano.
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
      channel_bookings: {
        Row: {
          beds24_id: number | null
          calendar_id: string
          check_in: string
          check_out: string
          created_at: string
          id: string
          last_error: string
          source: string
          source_id: string
          state: string
          updated_at: string
        }
        Insert: {
          beds24_id?: number | null
          calendar_id: string
          check_in: string
          check_out: string
          created_at?: string
          id?: string
          last_error?: string
          source: string
          source_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          beds24_id?: number | null
          calendar_id?: string
          check_in?: string
          check_out?: string
          created_at?: string
          id?: string
          last_error?: string
          source?: string
          source_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_bookings_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "channel_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_calendars: {
        Row: {
          beds24_room_id: number | null
          cabin_type_id: string
          channel: string
          created_at: string
          export_token: string
          extra_units: number[]
          id: string
          import_url: string | null
          label: string
          last_error: string
          last_event_count: number
          last_fetched_at: string | null
          last_status: string | null
          last_synced_at: string | null
          sync_started_at: string | null
          unit: number
          updated_at: string
        }
        Insert: {
          beds24_room_id?: number | null
          cabin_type_id: string
          channel?: string
          created_at?: string
          export_token?: string
          extra_units?: number[]
          id?: string
          import_url?: string | null
          label?: string
          last_error?: string
          last_event_count?: number
          last_fetched_at?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          sync_started_at?: string | null
          unit: number
          updated_at?: string
        }
        Update: {
          beds24_room_id?: number | null
          cabin_type_id?: string
          channel?: string
          created_at?: string
          export_token?: string
          extra_units?: number[]
          id?: string
          import_url?: string | null
          label?: string
          last_error?: string
          last_event_count?: number
          last_fetched_at?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          sync_started_at?: string | null
          unit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_calendars_cabin_type_id_fkey"
            columns: ["cabin_type_id"]
            isOneToOne: false
            referencedRelation: "cabin_types"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_credentials: {
        Row: {
          access_expires_at: string | null
          access_token: string | null
          created_at: string
          last_error: string
          last_error_at: string | null
          last_pull_at: string | null
          last_push_at: string | null
          last_webhook_at: string | null
          provider: string
          refresh_token: string
          updated_at: string
          webhook_key: string
        }
        Insert: {
          access_expires_at?: string | null
          access_token?: string | null
          created_at?: string
          last_error?: string
          last_error_at?: string | null
          last_pull_at?: string | null
          last_push_at?: string | null
          last_webhook_at?: string | null
          provider: string
          refresh_token: string
          updated_at?: string
          webhook_key?: string
        }
        Update: {
          access_expires_at?: string | null
          access_token?: string | null
          created_at?: string
          last_error?: string
          last_error_at?: string | null
          last_pull_at?: string | null
          last_push_at?: string | null
          last_webhook_at?: string | null
          provider?: string
          refresh_token?: string
          updated_at?: string
          webhook_key?: string
        }
        Relationships: []
      }
      channel_stays: {
        Row: {
          cabin_type_id: string
          calendar_id: string
          check_in: string
          check_out: string
          external_uid: string
          first_seen_at: string
          id: string
          removed_at: string | null
          summary: string
          unit: number
        }
        Insert: {
          cabin_type_id: string
          calendar_id: string
          check_in: string
          check_out: string
          external_uid: string
          first_seen_at?: string
          id?: string
          removed_at?: string | null
          summary?: string
          unit: number
        }
        Update: {
          cabin_type_id?: string
          calendar_id?: string
          check_in?: string
          check_out?: string
          external_uid?: string
          first_seen_at?: string
          id?: string
          removed_at?: string | null
          summary?: string
          unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "channel_stays_cabin_type_id_fkey"
            columns: ["cabin_type_id"]
            isOneToOne: false
            referencedRelation: "cabin_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_stays_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "channel_calendars"
            referencedColumns: ["id"]
          },
        ]
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
      payment_transactions: {
        Row: {
          created_at: string
          detail: string
          id: string
          method: string
          payment_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string
          id: string
          method?: string
          payment_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          method?: string
          payment_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
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
          needs_refund: boolean
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
          needs_refund?: boolean
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
          needs_refund?: boolean
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
          check_in: string
          check_out: string
          children: number
          client_key: string | null
          code: string
          consents: Json
          created_at: string
          decoration: Json
          deposit_due_at: string
          deposit_paid_at: string | null
          estimated_arrival: string
          guest_city: string
          guest_doc_number: string
          guest_doc_type: string
          guest_email: string
          guest_full_name: string
          guest_phone: string
          idempotency_key: string | null
          live_key: string
          pay_token: string | null
          pet: Json
          quote: Json
          source: string
          special_requests: string
          status: Database["public"]["Enums"]["reservation_status"]
          unit: number
          updated_at: string
          balance_due_at: string | null
          balance_overdue_at: string | null
          checked_in_at: string | null
          paid_amount: number
        }
        Insert: {
          adults: number
          balance_paid_at?: string | null
          cabin_type_id: string
          check_in: string
          check_out: string
          children?: number
          client_key?: string | null
          code: string
          consents: Json
          created_at?: string
          decoration?: Json
          deposit_due_at: string
          deposit_paid_at?: string | null
          estimated_arrival: string
          guest_city: string
          guest_doc_number: string
          guest_doc_type: string
          guest_email: string
          guest_full_name: string
          guest_phone: string
          idempotency_key?: string | null
          live_key?: string
          pay_token?: string | null
          pet?: Json
          quote: Json
          source?: string
          special_requests?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          unit: number
          updated_at?: string
          balance_due_at?: string | null
          balance_overdue_at?: string | null
          checked_in_at?: string | null
          paid_amount?: number
        }
        Update: {
          adults?: number
          balance_paid_at?: string | null
          cabin_type_id?: string
          check_in?: string
          check_out?: string
          children?: number
          client_key?: string | null
          code?: string
          consents?: Json
          created_at?: string
          decoration?: Json
          deposit_due_at?: string
          deposit_paid_at?: string | null
          estimated_arrival?: string
          guest_city?: string
          guest_doc_number?: string
          guest_doc_type?: string
          guest_email?: string
          guest_full_name?: string
          guest_phone?: string
          idempotency_key?: string | null
          live_key?: string
          pay_token?: string | null
          pet?: Json
          quote?: Json
          source?: string
          special_requests?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          unit?: number
          updated_at?: string
          balance_due_at?: string | null
          balance_overdue_at?: string | null
          checked_in_at?: string | null
          paid_amount?: number
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
      register_manual_payment: {
        Args: { p_code: string; p_kind: Database["public"]["Enums"]["payment_kind"]; p_note?: string }
        Returns: Json
      }
      request_channel_sync: { Args: { mode?: string }; Returns: undefined }
      run_payment_deadlines: { Args: never; Returns: undefined }
      settle_payment: {
        Args: { p_detail?: string; p_method?: string; p_reference: string; p_status: Database["public"]["Enums"]["payment_status"]; p_tx_id: string }
        Returns: Json
      }
      start_payment: {
        Args: { p_code: string; p_kind: Database["public"]["Enums"]["payment_kind"]; p_provider: string; p_reference: string }
        Returns: Database["public"]["Tables"]["payments"]["Row"]
      }
    }
    Enums: {
      payment_kind: "deposit" | "balance" | "full"
      payment_status: "initiated" | "pending" | "approved" | "declined" | "error" | "expired"
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

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"]

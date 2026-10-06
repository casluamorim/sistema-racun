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
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      agency_settings: {
        Row: {
          agency_document: string | null
          agency_email: string | null
          agency_logo_url: string | null
          agency_name: string
          agency_phone: string | null
          asaas_account_1_cnpj: string | null
          asaas_account_1_label: string | null
          asaas_account_2_cnpj: string | null
          asaas_account_2_label: string | null
          created_at: string
          currency: string
          deadline_alert_days: number
          default_invoice_due_days: number
          default_pix_key: string | null
          default_pix_key_type: string | null
          default_revision_limit: number
          id: string
          invoice_prefix: string
          next_invoice_number: number
          pix_key_1_label: string | null
          pix_key_2: string | null
          pix_key_2_label: string | null
          pix_key_2_type: string | null
          stalled_alert_hours: number
          timezone: string
          updated_at: string
          whatsapp_template: string
        }
        Insert: {
          agency_document?: string | null
          agency_email?: string | null
          agency_logo_url?: string | null
          agency_name?: string
          agency_phone?: string | null
          asaas_account_1_cnpj?: string | null
          asaas_account_1_label?: string | null
          asaas_account_2_cnpj?: string | null
          asaas_account_2_label?: string | null
          created_at?: string
          currency?: string
          deadline_alert_days?: number
          default_invoice_due_days?: number
          default_pix_key?: string | null
          default_pix_key_type?: string | null
          default_revision_limit?: number
          id?: string
          invoice_prefix?: string
          next_invoice_number?: number
          pix_key_1_label?: string | null
          pix_key_2?: string | null
          pix_key_2_label?: string | null
          pix_key_2_type?: string | null
          stalled_alert_hours?: number
          timezone?: string
          updated_at?: string
          whatsapp_template?: string
        }
        Update: {
          agency_document?: string | null
          agency_email?: string | null
          agency_logo_url?: string | null
          agency_name?: string
          agency_phone?: string | null
          asaas_account_1_cnpj?: string | null
          asaas_account_1_label?: string | null
          asaas_account_2_cnpj?: string | null
          asaas_account_2_label?: string | null
          created_at?: string
          currency?: string
          deadline_alert_days?: number
          default_invoice_due_days?: number
          default_pix_key?: string | null
          default_pix_key_type?: string | null
          default_revision_limit?: number
          id?: string
          invoice_prefix?: string
          next_invoice_number?: number
          pix_key_1_label?: string | null
          pix_key_2?: string | null
          pix_key_2_label?: string | null
          pix_key_2_type?: string | null
          stalled_alert_hours?: number
          timezone?: string
          updated_at?: string
          whatsapp_template?: string
        }
        Relationships: []
      }
      asaas_charges: {
        Row: {
          amount: number
          asaas_account: string
          asaas_payment_id: string
          billing_type: string
          client_id: string
          competence_month: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          id: string
          invoice_id: string | null
          invoice_url: string | null
          is_recurring: boolean
          paid_at: string | null
          pix_payload: string | null
          pix_qr_code: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          asaas_account?: string
          asaas_payment_id: string
          billing_type?: string
          client_id: string
          competence_month?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          id?: string
          invoice_id?: string | null
          invoice_url?: string | null
          is_recurring?: boolean
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          asaas_account?: string
          asaas_payment_id?: string
          billing_type?: string
          client_id?: string
          competence_month?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          id?: string
          invoice_id?: string | null
          invoice_url?: string | null
          is_recurring?: boolean
          paid_at?: string | null
          pix_payload?: string | null
          pix_qr_code?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asaas_charges_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asaas_charges_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          created_at: string
          id: string
          message_id: string
          parts: Json
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          parts?: Json
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          parts?: Json
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      client_access_tokens: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          token: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          token?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_access_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assignments: {
        Row: {
          access_level: string
          assigned_by: string | null
          client_id: string
          created_at: string
          id: string
          is_primary: boolean
          user_id: string
        }
        Insert: {
          access_level?: string
          assigned_by?: string | null
          client_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id: string
        }
        Update: {
          access_level?: string
          assigned_by?: string | null
          client_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notifications: {
        Row: {
          author_name: string | null
          client_id: string | null
          content_id: string | null
          created_at: string
          id: string
          kind: string
          message: string | null
          read_at: string | null
          title: string
        }
        Insert: {
          author_name?: string | null
          client_id?: string | null
          content_id?: string | null
          created_at?: string
          id?: string
          kind: string
          message?: string | null
          read_at?: string | null
          title: string
        }
        Update: {
          author_name?: string | null
          client_id?: string | null
          content_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          message?: string | null
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tags: {
        Row: {
          client_id: string
          tag_id: string
        }
        Insert: {
          client_id: string
          tag_id: string
        }
        Update: {
          client_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          asaas_account: string
          asaas_customer_id: string | null
          auth_user_id: string | null
          avg_response_time: string | null
          billing_amount: number | null
          billing_cpf_cnpj: string | null
          billing_description: string | null
          billing_due_day: number | null
          billing_enabled: boolean
          billing_last_generated_month: string | null
          billing_type: string
          company: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          preferred_pix_key: string | null
          profile_type: string | null
          slug: string | null
          status: Database["public"]["Enums"]["client_status"]
          total_approvals: number | null
          total_revisions: number | null
          updated_at: string
        }
        Insert: {
          asaas_account?: string
          asaas_customer_id?: string | null
          auth_user_id?: string | null
          avg_response_time?: string | null
          billing_amount?: number | null
          billing_cpf_cnpj?: string | null
          billing_description?: string | null
          billing_due_day?: number | null
          billing_enabled?: boolean
          billing_last_generated_month?: string | null
          billing_type?: string
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          preferred_pix_key?: string | null
          profile_type?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          total_approvals?: number | null
          total_revisions?: number | null
          updated_at?: string
        }
        Update: {
          asaas_account?: string
          asaas_customer_id?: string | null
          auth_user_id?: string | null
          avg_response_time?: string | null
          billing_amount?: number | null
          billing_cpf_cnpj?: string | null
          billing_description?: string | null
          billing_due_day?: number | null
          billing_enabled?: boolean
          billing_last_generated_month?: string | null
          billing_type?: string
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          preferred_pix_key?: string | null
          profile_type?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["client_status"]
          total_approvals?: number | null
          total_revisions?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          content_version_id: string
          created_at: string
          id: string
          text: string
          user_id: string
        }
        Insert: {
          content_version_id: string
          created_at?: string
          id?: string
          text: string
          user_id: string
        }
        Update: {
          content_version_id?: string
          created_at?: string
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      content_comments: {
        Row: {
          author_name: string | null
          author_user_id: string | null
          content_id: string
          created_at: string
          id: string
          target: string
          text: string
        }
        Insert: {
          author_name?: string | null
          author_user_id?: string | null
          content_id: string
          created_at?: string
          id?: string
          target?: string
          text: string
        }
        Update: {
          author_name?: string | null
          author_user_id?: string | null
          content_id?: string
          created_at?: string
          id?: string
          target?: string
          text?: string
        }
        Relationships: []
      }
      content_tags: {
        Row: {
          content_id: string
          tag_id: string
        }
        Insert: {
          content_id: string
          tag_id: string
        }
        Update: {
          content_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_tags_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          content_id: string
          created_at: string
          created_by: string | null
          file_url: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["content_status"]
          version_number: number
        }
        Insert: {
          content_id: string
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          version_number?: number
        }
        Update: {
          content_id?: string
          created_at?: string
          created_by?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "contents"
            referencedColumns: ["id"]
          },
        ]
      }
      contents: {
        Row: {
          assigned_to: string | null
          caption: string | null
          checklist: Json | null
          copy_status: string
          created_at: string
          created_by: string | null
          deadline: string | null
          description: string | null
          drive_url: string | null
          id: string
          internal_notes: string | null
          media_status: string
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string
          revision_count: number | null
          revision_limit: number | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
          type: Database["public"]["Enums"]["content_type"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          caption?: string | null
          checklist?: Json | null
          copy_status?: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          drive_url?: string | null
          id?: string
          internal_notes?: string | null
          media_status?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id: string
          revision_count?: number | null
          revision_limit?: number | null
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          caption?: string | null
          checklist?: Json | null
          copy_status?: string
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          description?: string | null
          drive_url?: string | null
          id?: string
          internal_notes?: string | null
          media_status?: string
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string
          revision_count?: number | null
          revision_limit?: number | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          type?: Database["public"]["Enums"]["content_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_tags: {
        Row: {
          expense_id: string
          tag_id: string
        }
        Insert: {
          expense_id: string
          tag_id: string
        }
        Update: {
          expense_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_tags_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          attachment_url: string | null
          category: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          financial_type: Database["public"]["Enums"]["financial_type"]
          id: string
          invoice_cost_id: string | null
          is_recurring_active: boolean
          linked_income_id: string | null
          linked_invoice_id: string | null
          notes: string | null
          parent_expense_id: string | null
          project_id: string | null
          recurrence: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day: number | null
          recurrence_end: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          attachment_url?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          financial_type?: Database["public"]["Enums"]["financial_type"]
          id?: string
          invoice_cost_id?: string | null
          is_recurring_active?: boolean
          linked_income_id?: string | null
          linked_invoice_id?: string | null
          notes?: string | null
          parent_expense_id?: string | null
          project_id?: string | null
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day?: number | null
          recurrence_end?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          financial_type?: Database["public"]["Enums"]["financial_type"]
          id?: string
          invoice_cost_id?: string | null
          is_recurring_active?: boolean
          linked_income_id?: string | null
          linked_invoice_id?: string | null
          notes?: string | null
          parent_expense_id?: string | null
          project_id?: string | null
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day?: number | null
          recurrence_end?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_invoice_cost_id_fkey"
            columns: ["invoice_cost_id"]
            isOneToOne: false
            referencedRelation: "invoice_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_income_id_fkey"
            columns: ["linked_income_id"]
            isOneToOne: false
            referencedRelation: "personal_income"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_parent_expense_id_fkey"
            columns: ["parent_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_costs: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          invoice_id: string
          kind: string
          mode: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          invoice_id: string
          kind?: string
          mode?: string
          updated_at?: string
          value?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          invoice_id?: string
          kind?: string
          mode?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_costs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_tags: {
        Row: {
          invoice_id: string
          tag_id: string
        }
        Insert: {
          invoice_id: string
          tag_id: string
        }
        Update: {
          invoice_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_tags_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          asaas_account: string | null
          client_id: string
          cnpj: string | null
          created_at: string
          created_by: string | null
          due_date: string
          financial_type: Database["public"]["Enums"]["financial_type"]
          id: string
          installment_number: number | null
          installment_total: number | null
          is_recurring_active: boolean
          notes: string | null
          paid_at: string | null
          parent_invoice_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          project_id: string | null
          quote_id: string | null
          recurrence: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day: number | null
          recurrence_end: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          tax_percent: number
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          asaas_account?: string | null
          client_id: string
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          due_date: string
          financial_type?: Database["public"]["Enums"]["financial_type"]
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          is_recurring_active?: boolean
          notes?: string | null
          paid_at?: string | null
          parent_invoice_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          quote_id?: string | null
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day?: number | null
          recurrence_end?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tax_percent?: number
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          asaas_account?: string | null
          client_id?: string
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          financial_type?: Database["public"]["Enums"]["financial_type"]
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          is_recurring_active?: boolean
          notes?: string | null
          paid_at?: string | null
          parent_invoice_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          quote_id?: string | null
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day?: number | null
          recurrence_end?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          tax_percent?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string | null
          project_id: string | null
          read: boolean
          stage_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          project_id?: string | null
          read?: boolean
          stage_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          project_id?: string | null
          read?: boolean
          stage_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_income: {
        Row: {
          amount: number
          attachment_url: string | null
          category: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          is_recurring_active: boolean
          notes: string | null
          parent_income_id: string | null
          recurrence: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day: number | null
          recurrence_end: string | null
          status: Database["public"]["Enums"]["expense_status"]
          tax_percent: number
          updated_at: string
        }
        Insert: {
          amount?: number
          attachment_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          id?: string
          is_recurring_active?: boolean
          notes?: string | null
          parent_income_id?: string | null
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day?: number | null
          recurrence_end?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          tax_percent?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          is_recurring_active?: boolean
          notes?: string | null
          parent_income_id?: string | null
          recurrence?: Database["public"]["Enums"]["recurrence_type"]
          recurrence_day?: number | null
          recurrence_end?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          tax_percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_income_parent_income_id_fkey"
            columns: ["parent_income_id"]
            isOneToOne: false
            referencedRelation: "personal_income"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          invited_at: string | null
          invited_by: string | null
          is_active: boolean
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_access: {
        Row: {
          can_edit: boolean
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          role: Database["public"]["Enums"]["project_access_role"]
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_access_role"]
          user_id: string
        }
        Update: {
          can_edit?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_access_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_links: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          project_id: string
          stage_id: string | null
          title: string
          type: Database["public"]["Enums"]["project_link_type"]
          url: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          project_id: string
          stage_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["project_link_type"]
          url: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          project_id?: string
          stage_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["project_link_type"]
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_links_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stages: {
        Row: {
          assigned_role: Database["public"]["Enums"]["app_role"] | null
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          expected_duration_hours: number | null
          id: string
          name: string
          order_index: number
          project_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["project_stage_status"]
          updated_at: string
        }
        Insert: {
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          expected_duration_hours?: number | null
          id?: string
          name: string
          order_index?: number
          project_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["project_stage_status"]
          updated_at?: string
        }
        Update: {
          assigned_role?: Database["public"]["Enums"]["app_role"] | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          expected_duration_hours?: number | null
          id?: string
          name?: string
          order_index?: number
          project_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["project_stage_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tags: {
        Row: {
          project_id: string
          tag_id: string
        }
        Insert: {
          project_id: string
          tag_id: string
        }
        Update: {
          project_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          checklist: Json
          created_at: string
          created_by: string | null
          default_contents: Json
          default_priority: Database["public"]["Enums"]["priority_level"]
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          checklist?: Json
          created_at?: string
          created_by?: string | null
          default_contents?: Json
          default_priority?: Database["public"]["Enums"]["priority_level"]
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          checklist?: Json
          created_at?: string
          created_by?: string | null
          default_contents?: Json
          default_priority?: Database["public"]["Enums"]["priority_level"]
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_updates: {
        Row: {
          created_at: string
          id: string
          message: string
          project_id: string
          stage_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          project_id: string
          stage_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          project_id?: string
          stage_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_updates_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          cycle_label: string | null
          cycle_number: number
          deadline: string | null
          description: string | null
          id: string
          is_monthly: boolean
          name: string
          payment_amount: number | null
          payment_pending: boolean
          payment_trigger: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          quote_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          work_type: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          cycle_label?: string | null
          cycle_number?: number
          deadline?: string | null
          description?: string | null
          id?: string
          is_monthly?: boolean
          name: string
          payment_amount?: number | null
          payment_pending?: boolean
          payment_trigger?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          quote_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          work_type?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          cycle_label?: string | null
          cycle_number?: number
          deadline?: string | null
          description?: string | null
          id?: string
          is_monthly?: boolean
          name?: string
          payment_amount?: number | null
          payment_pending?: boolean
          payment_trigger?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          quote_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          work_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          first_due_date: string | null
          id: string
          installments: number | null
          notes: string | null
          payment_plan: string
          services: Json
          status: Database["public"]["Enums"]["quote_status"]
          title: string
          total_value: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          first_due_date?: string | null
          id?: string
          installments?: number | null
          notes?: string | null
          payment_plan?: string
          services?: Json
          status?: Database["public"]["Enums"]["quote_status"]
          title: string
          total_value?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          first_due_date?: string | null
          id?: string
          installments?: number | null
          notes?: string | null
          payment_plan?: string
          services?: Json
          status?: Database["public"]["Enums"]["quote_status"]
          title?: string
          total_value?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_flow_presets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          order_index: number
          stages: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          order_index?: number
          stages?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          order_index?: number
          stages?: Json
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          full_name: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at: string
          full_name: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_edit_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      can_edit_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_edit_project_stage: {
        Args: { _stage_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_client_via_project: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      generate_unique_client_slug: {
        Args: { _base: string; _client_id: string }
        Returns: string
      }
      get_client_id_by_access_token: {
        Args: { _token: string }
        Returns: string
      }
      get_user_invite_by_token: {
        Args: { _token: string }
        Returns: {
          email: string
          expires_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mark_user_invite_accepted: {
        Args: { _accepted_by: string; _token: string }
        Returns: undefined
      }
      slugify: { Args: { _input: string }; Returns: string }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "editor"
        | "viewer"
        | "financeiro"
        | "social_media"
        | "client"
        | "fotografo"
        | "gestor_anuncios"
        | "designer"
        | "motion_designer"
        | "roteirista"
        | "redator"
        | "produtor"
      client_status: "active" | "inactive" | "prospect"
      content_status:
        | "draft"
        | "in_review"
        | "revision"
        | "approved"
        | "published"
      content_type:
        | "photo"
        | "video"
        | "reels"
        | "stories"
        | "carousel"
        | "cover"
        | "banner"
        | "other"
      expense_status: "pending" | "paid" | "overdue"
      financial_type: "pj" | "pf"
      invoice_status: "pending" | "paid" | "overdue" | "cancelled"
      notification_type:
        | "stage_completed"
        | "deadline_near"
        | "overdue"
        | "stalled"
      payment_method:
        | "pix"
        | "bank_transfer"
        | "credit_card"
        | "boleto"
        | "other"
      priority_level: "low" | "medium" | "high" | "urgent"
      project_access_role:
        | "admin"
        | "editor"
        | "social_media"
        | "visualizador"
        | "fotografo"
        | "gestor_anuncios"
        | "designer"
        | "motion_designer"
        | "roteirista"
        | "redator"
        | "produtor"
      project_link_type: "drive" | "arquivo" | "referencia" | "outro"
      project_stage_status: "not_started" | "in_progress" | "completed"
      project_status:
        | "briefing"
        | "in_progress"
        | "review"
        | "completed"
        | "paused"
        | "cancelled"
        | "delayed"
      quote_status: "draft" | "sent" | "accepted" | "rejected" | "expired"
      recurrence_type: "one_time" | "recurring"
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
  public: {
    Enums: {
      app_role: [
        "admin",
        "manager",
        "editor",
        "viewer",
        "financeiro",
        "social_media",
        "client",
        "fotografo",
        "gestor_anuncios",
        "designer",
        "motion_designer",
        "roteirista",
        "redator",
        "produtor",
      ],
      client_status: ["active", "inactive", "prospect"],
      content_status: [
        "draft",
        "in_review",
        "revision",
        "approved",
        "published",
      ],
      content_type: [
        "photo",
        "video",
        "reels",
        "stories",
        "carousel",
        "cover",
        "banner",
        "other",
      ],
      expense_status: ["pending", "paid", "overdue"],
      financial_type: ["pj", "pf"],
      invoice_status: ["pending", "paid", "overdue", "cancelled"],
      notification_type: [
        "stage_completed",
        "deadline_near",
        "overdue",
        "stalled",
      ],
      payment_method: [
        "pix",
        "bank_transfer",
        "credit_card",
        "boleto",
        "other",
      ],
      priority_level: ["low", "medium", "high", "urgent"],
      project_access_role: [
        "admin",
        "editor",
        "social_media",
        "visualizador",
        "fotografo",
        "gestor_anuncios",
        "designer",
        "motion_designer",
        "roteirista",
        "redator",
        "produtor",
      ],
      project_link_type: ["drive", "arquivo", "referencia", "outro"],
      project_stage_status: ["not_started", "in_progress", "completed"],
      project_status: [
        "briefing",
        "in_progress",
        "review",
        "completed",
        "paused",
        "cancelled",
        "delayed",
      ],
      quote_status: ["draft", "sent", "accepted", "rejected", "expired"],
      recurrence_type: ["one_time", "recurring"],
    },
  },
} as const

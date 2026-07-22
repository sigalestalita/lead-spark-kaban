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
      analytics_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          tool_calls: Json | null
          tool_results: Json | null
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          tool_calls?: Json | null
          tool_results?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          tool_calls?: Json | null
          tool_results?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "analytics_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_chat_threads: {
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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      icp_config: {
        Row: {
          id: string
          is_active: boolean
          name: string
          rules: Json
          thresholds: Json
          updated_at: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name?: string
          rules?: Json
          thresholds?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          rules?: Json
          thresholds?: Json
          updated_at?: string
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          id: string
          provider: string
          status: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          id?: string
          provider: string
          status: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          id?: string
          provider?: string
          status?: string
        }
        Relationships: []
      }
      lead_interactions: {
        Row: {
          author_id: string | null
          content: string | null
          created_at: string
          external_id: string | null
          id: string
          lead_id: string
          metadata: Json | null
          type: string
        }
        Insert: {
          author_id?: string | null
          content?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          type: string
        }
        Update: {
          author_id?: string | null
          content?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          lead_id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          lead_id: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_name: string | null
          approach_result: string | null
          assigned_to: string | null
          campaign: string | null
          channel: string | null
          company_description: string | null
          company_linkedin: string | null
          company_location: string | null
          company_name: string | null
          company_segment: string | null
          company_size: string | null
          company_summary: string | null
          company_website: string | null
          converted_at: string | null
          created_at: string
          demo_free: boolean | null
          email: string | null
          enriched_at: string | null
          enrichment_status: Database["public"]["Enums"]["enrichment_status"]
          first_approach_at: string | null
          form_name: string | null
          form_payload: Json | null
          icp_signals: Json | null
          id: string
          last_action_at: string | null
          lead_type: string | null
          linkedin_company_size: string | null
          linkedin_url: string | null
          lost_reason: string | null
          meeting_at: string | null
          name: string
          next_action: string | null
          original_company_name: string | null
          phone: string | null
          position: string | null
          priority: Database["public"]["Enums"]["lead_priority"]
          probable_pain: string | null
          rd_deal_id: string | null
          rd_owner: string | null
          rd_status: string | null
          score: number
          source: string | null
          stage_entered_at: string | null
          stage_id: string | null
          updated_at: string
        }
        Insert: {
          ad_name?: string | null
          approach_result?: string | null
          assigned_to?: string | null
          campaign?: string | null
          channel?: string | null
          company_description?: string | null
          company_linkedin?: string | null
          company_location?: string | null
          company_name?: string | null
          company_segment?: string | null
          company_size?: string | null
          company_summary?: string | null
          company_website?: string | null
          converted_at?: string | null
          created_at?: string
          demo_free?: boolean | null
          email?: string | null
          enriched_at?: string | null
          enrichment_status?: Database["public"]["Enums"]["enrichment_status"]
          first_approach_at?: string | null
          form_name?: string | null
          form_payload?: Json | null
          icp_signals?: Json | null
          id?: string
          last_action_at?: string | null
          lead_type?: string | null
          linkedin_company_size?: string | null
          linkedin_url?: string | null
          lost_reason?: string | null
          meeting_at?: string | null
          name: string
          next_action?: string | null
          original_company_name?: string | null
          phone?: string | null
          position?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          probable_pain?: string | null
          rd_deal_id?: string | null
          rd_owner?: string | null
          rd_status?: string | null
          score?: number
          source?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Update: {
          ad_name?: string | null
          approach_result?: string | null
          assigned_to?: string | null
          campaign?: string | null
          channel?: string | null
          company_description?: string | null
          company_linkedin?: string | null
          company_location?: string | null
          company_name?: string | null
          company_segment?: string | null
          company_size?: string | null
          company_summary?: string | null
          company_website?: string | null
          converted_at?: string | null
          created_at?: string
          demo_free?: boolean | null
          email?: string | null
          enriched_at?: string | null
          enrichment_status?: Database["public"]["Enums"]["enrichment_status"]
          first_approach_at?: string | null
          form_name?: string | null
          form_payload?: Json | null
          icp_signals?: Json | null
          id?: string
          last_action_at?: string | null
          lead_type?: string | null
          linkedin_company_size?: string | null
          linkedin_url?: string | null
          lost_reason?: string | null
          meeting_at?: string | null
          name?: string
          next_action?: string | null
          original_company_name?: string | null
          phone?: string | null
          position?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          probable_pain?: string | null
          rd_deal_id?: string | null
          rd_owner?: string | null
          rd_status?: string | null
          score?: number
          source?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rd_oauth_tokens: {
        Row: {
          access_token: string
          connected_at: string
          connected_by: string | null
          expires_at: string
          id: boolean
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          connected_by?: string | null
          expires_at: string
          id?: boolean
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          connected_by?: string | null
          expires_at?: string
          id?: boolean
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_terminal: boolean
          name: string
          position: number
          slug: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          name: string
          position: number
          slug: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          name?: string
          position?: number
          slug?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_digests: {
        Row: {
          content_html: string
          content_summary: string | null
          created_at: string
          error_message: string | null
          id: string
          sent_at: string | null
          stats: Json
          status: string
          subject: string
          updated_at: string
          week_start: string
        }
        Insert: {
          content_html: string
          content_summary?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          stats?: Json
          status?: string
          subject: string
          updated_at?: string
          week_start: string
        }
        Update: {
          content_html?: string
          content_summary?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          stats?: Json
          status?: string
          subject?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      whatsapp_accounts: {
        Row: {
          access_token: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string | null
          metadata: Json
          owner_user_id: string | null
          phone_number: string
          provider: string
          provider_base_url: string | null
          provider_instance_id: string | null
          status: string
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          metadata?: Json
          owner_user_id?: string | null
          phone_number: string
          provider?: string
          provider_base_url?: string | null
          provider_instance_id?: string | null
          status?: string
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          metadata?: Json
          owner_user_id?: string | null
          phone_number?: string
          provider?: string
          provider_base_url?: string | null
          provider_instance_id?: string | null
          status?: string
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      whatsapp_automation_logs: {
        Row: {
          created_at: string
          error: string | null
          executed_at: string | null
          id: string
          lead_id: string | null
          message_id: string | null
          rule_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          executed_at?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          rule_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          executed_at?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          rule_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_automation_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_automation_logs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_automation_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_automation_rules: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          delay_minutes: number
          id: string
          name: string
          template_id: string | null
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          delay_minutes?: number
          id?: string
          name: string
          template_id?: string | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          delay_minutes?: number
          id?: string
          name?: string
          template_id?: string | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_automation_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaign_messages: {
        Row: {
          campaign_id: string
          created_at: string
          error: string | null
          id: string
          lead_id: string
          message_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          error?: string | null
          id?: string
          lead_id: string
          message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          error?: string | null
          id?: string
          lead_id?: string
          message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaigns: {
        Row: {
          account_id: string | null
          audience_filters: Json
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          scheduled_at: string | null
          started_at: string | null
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          audience_filters?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          audience_filters?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contacts: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          lead_id: string | null
          name: string | null
          opt_in: boolean
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          name?: string | null
          opt_in?: boolean
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          name?: string | null
          opt_in?: boolean
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          account_id: string | null
          ai_summary: string | null
          ai_summary_at: string | null
          assigned_user_id: string | null
          assumed_at: string | null
          assumed_by_user_id: string | null
          contact_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          last_preview: string | null
          lead_id: string
          status: string
          temperature: string | null
          temperature_at: string | null
          temperature_reason: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          ai_summary?: string | null
          ai_summary_at?: string | null
          assigned_user_id?: string | null
          assumed_at?: string | null
          assumed_by_user_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_preview?: string | null
          lead_id: string
          status?: string
          temperature?: string | null
          temperature_at?: string | null
          temperature_reason?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          ai_summary?: string | null
          ai_summary_at?: string | null
          assigned_user_id?: string | null
          assumed_at?: string | null
          assumed_by_user_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_preview?: string | null
          lead_id?: string
          status?: string
          temperature?: string | null
          temperature_at?: string | null
          temperature_reason?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_fup_enrollments: {
        Row: {
          completed_at: string | null
          current_step: number
          enrolled_at: string
          id: string
          last_error: string | null
          last_step_at: string | null
          lead_id: string
          next_run_at: string | null
          sequence_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          id?: string
          last_error?: string | null
          last_step_at?: string | null
          lead_id: string
          next_run_at?: string | null
          sequence_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          id?: string
          last_error?: string | null
          last_step_at?: string | null
          lead_id?: string
          next_run_at?: string | null
          sequence_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_fup_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_fup_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_fup_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_fup_sequences: {
        Row: {
          active: boolean
          audience_filters: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          stop_on_reply: boolean
          stop_on_stage_ids: string[]
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          audience_filters?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          stop_on_reply?: boolean
          stop_on_stage_ids?: string[]
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          audience_filters?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          stop_on_reply?: boolean
          stop_on_stage_ids?: string[]
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_fup_steps: {
        Row: {
          created_at: string
          delay_hours: number
          id: string
          sequence_id: string
          step_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          delay_hours?: number
          id?: string
          sequence_id: string
          step_order: number
          template_id: string
        }
        Update: {
          created_at?: string
          delay_hours?: number
          id?: string
          sequence_id?: string
          step_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_fup_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_fup_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_fup_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          error: string | null
          id: string
          lead_id: string
          media_mime: string | null
          media_url: string | null
          message_type: string
          metadata: Json
          provider_message_id: string | null
          read_at: string | null
          sender_type: string
          sender_user_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          lead_id: string
          media_mime?: string | null
          media_url?: string | null
          message_type?: string
          metadata?: Json
          provider_message_id?: string | null
          read_at?: string | null
          sender_type: string
          sender_user_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          lead_id?: string
          media_mime?: string | null
          media_url?: string | null
          message_type?: string
          metadata?: Json
          provider_message_id?: string | null
          read_at?: string | null
          sender_type?: string
          sender_user_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          buttons: Json
          category: string | null
          created_at: string
          created_by: string | null
          footer_text: string | null
          header_text: string | null
          header_type: string | null
          id: string
          language: string
          meta_last_synced_at: string | null
          meta_template_id: string | null
          name: string
          provider_template_name: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          buttons?: Json
          category?: string | null
          created_at?: string
          created_by?: string | null
          footer_text?: string | null
          header_text?: string | null
          header_type?: string | null
          id?: string
          language?: string
          meta_last_synced_at?: string | null
          meta_template_id?: string | null
          name: string
          provider_template_name?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          buttons?: Json
          category?: string | null
          created_at?: string
          created_by?: string | null
          footer_text?: string | null
          header_text?: string | null
          header_type?: string | null
          id?: string
          language?: string
          meta_last_synced_at?: string | null
          meta_template_id?: string | null
          name?: string
          provider_template_name?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_lead: { Args: { _lead_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "gestao"
        | "executivo"
        | "sdr"
        | "comercial"
        | "cs"
        | "financeiro"
      enrichment_status: "pending" | "found" | "not_found" | "manual"
      lead_priority: "alta" | "media" | "baixa" | "fora_icp" | "pendente"
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
      app_role: [
        "super_admin",
        "gestao",
        "executivo",
        "sdr",
        "comercial",
        "cs",
        "financeiro",
      ],
      enrichment_status: ["pending", "found", "not_found", "manual"],
      lead_priority: ["alta", "media", "baixa", "fora_icp", "pendente"],
    },
  },
} as const

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
          email: string | null
          enriched_at: string | null
          enrichment_status: Database["public"]["Enums"]["enrichment_status"]
          first_approach_at: string | null
          form_name: string | null
          form_payload: Json | null
          icp_signals: Json | null
          id: string
          last_action_at: string | null
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
          email?: string | null
          enriched_at?: string | null
          enrichment_status?: Database["public"]["Enums"]["enrichment_status"]
          first_approach_at?: string | null
          form_name?: string | null
          form_payload?: Json | null
          icp_signals?: Json | null
          id?: string
          last_action_at?: string | null
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
          email?: string | null
          enriched_at?: string | null
          enrichment_status?: Database["public"]["Enums"]["enrichment_status"]
          first_approach_at?: string | null
          form_name?: string | null
          form_payload?: Json | null
          icp_signals?: Json | null
          id?: string
          last_action_at?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
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
      enrichment_status: ["pending", "found", "not_found", "manual"],
      lead_priority: ["alta", "media", "baixa", "fora_icp", "pendente"],
    },
  },
} as const

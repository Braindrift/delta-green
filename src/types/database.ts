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
      campaign_invitations: {
        Row: {
          campaign_id: string
          created_at: string
          expires_at: string
          id: string
          invited_by: string
          invitee_email: string | null
          invitee_user_id: string | null
          message: string | null
          resolved_at: string | null
          status: string
          token: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_by: string
          invitee_email?: string | null
          invitee_user_id?: string | null
          message?: string | null
          resolved_at?: string | null
          status?: string
          token?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invitee_email?: string | null
          invitee_user_id?: string | null
          message?: string | null
          resolved_at?: string | null
          status?: string
          token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_invitations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_members: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          left_at: string | null
          plan: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          left_at?: string | null
          plan?: string
          role: string
          status?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          left_at?: string | null
          plan?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_transfers: {
        Row: {
          campaign_id: string
          created_at: string
          from_user_id: string
          id: string
          message: string | null
          resolved_at: string | null
          status: string
          to_user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          from_user_id: string
          id?: string
          message?: string | null
          resolved_at?: string | null
          status?: string
          to_user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          from_user_id?: string
          id?: string
          message?: string | null
          resolved_at?: string | null
          status?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_transfers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          codename: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          max_agents: number
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          codename?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          max_agents?: number
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          codename?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          max_agents?: number
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      linked_records: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          record_id_a: string
          record_id_b: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          record_id_a: string
          record_id_b: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          record_id_a?: string
          record_id_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "linked_records_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linked_records_record_id_a_fkey"
            columns: ["record_id_a"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "linked_records_record_id_b_fkey"
            columns: ["record_id_b"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          source_id: string
          source_kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          source_id: string
          source_kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          source_id?: string
          source_kind?: string
          user_id?: string
        }
        Relationships: []
      }
      player_characters: {
        Row: {
          archetype: string | null
          campaign_id: string | null
          campaign_status: string
          created_at: string
          data: Json
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          archetype?: string | null
          campaign_id?: string | null
          campaign_status?: string
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          name: string
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          archetype?: string | null
          campaign_id?: string | null
          campaign_status?: string
          created_at?: string
          data?: Json
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_characters_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      record_visibility: {
        Row: {
          campaign_member_id: string
          created_at: string
          id: string
          is_visible: boolean
          record_id: string
        }
        Insert: {
          campaign_member_id: string
          created_at?: string
          id?: string
          is_visible?: boolean
          record_id: string
        }
        Update: {
          campaign_member_id?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_visibility_campaign_member_id_fkey"
            columns: ["campaign_member_id"]
            isOneToOne: false
            referencedRelation: "campaign_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_visibility_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      records: {
        Row: {
          campaign_id: string
          created_at: string
          data: Json
          date_encountered: string | null
          deleted_at: string | null
          id: string
          name: string
          record_type: string
          tags: string[]
          updated_at: string
          visibility_overrides: Json
        }
        Insert: {
          campaign_id: string
          created_at?: string
          data?: Json
          date_encountered?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          record_type: string
          tags?: string[]
          updated_at?: string
          visibility_overrides?: Json
        }
        Update: {
          campaign_id?: string
          created_at?: string
          data?: Json
          date_encountered?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          record_type?: string
          tags?: string[]
          updated_at?: string
          visibility_overrides?: Json
        }
        Relationships: [
          {
            foreignKeyName: "records_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          campaign_id: string
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          operation_id: string | null
          session_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          operation_id?: string | null
          session_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          operation_id?: string | null
          session_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _detach_pc_to_npc_internal: { Args: { p_pc_id: string }; Returns: string }
      _migrate_pc_to_npc_internal: {
        Args: { p_pc_id: string }
        Returns: string
      }
      accept_handler_transfer: {
        Args: { p_transfer_id: string }
        Returns: string
      }
      accept_invitation: {
        Args: { p_invitation_id: string }
        Returns: {
          campaign_id: string
          status: string
        }[]
      }
      accept_invitation_with_pc: {
        Args: { p_invitation_id: string; p_pc_id: string }
        Returns: {
          campaign_id: string
          status: string
        }[]
      }
      claim_invitation_by_token: {
        Args: { p_token: string }
        Returns: {
          campaign_id: string
          invitation_id: string
        }[]
      }
      decline_invitation_by_token: {
        Args: { p_token: string }
        Returns: {
          invitation_id: string
        }[]
      }
      delete_pc_to_npc: { Args: { p_pc_id: string }; Returns: string }
      find_user_by_email: { Args: { p_email: string }; Returns: string }
      generate_unique_username: {
        Args: { p_email: string; p_metadata_username?: string }
        Returns: string
      }
      get_invitation_by_token: {
        Args: { p_token: string }
        Returns: {
          campaign_name: string
          expires_at: string
          invitee_email: string
          inviter_handle: string
          message: string
          status: string
        }[]
      }
      get_user_handle: { Args: { p_user_id: string }; Returns: string }
      is_campaign_gm: { Args: { p_campaign_id: string }; Returns: boolean }
      is_campaign_member: { Args: { p_campaign_id: string }; Returns: boolean }
      leave_campaign: { Args: { p_campaign_id: string }; Returns: string }
      soft_delete_campaign: { Args: { p_campaign_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

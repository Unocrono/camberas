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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      chat_conversations: {
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
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_function_flags: {
        Row: {
          created_at: string
          description: string | null
          function_name: string
          id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          function_name: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          function_name?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      gps_tracking: {
        Row: {
          accuracy: number | null
          altitude: number | null
          battery_level: number | null
          created_at: string
          id: string
          latitude: number
          longitude: number
          race_id: string
          registration_id: string
          speed: number | null
          timestamp: string
        }
        Insert: {
          accuracy?: number | null
          altitude?: number | null
          battery_level?: number | null
          created_at?: string
          id?: string
          latitude: number
          longitude: number
          race_id: string
          registration_id: string
          speed?: number | null
          timestamp?: string
        }
        Update: {
          accuracy?: number | null
          altitude?: number | null
          battery_level?: number | null
          created_at?: string
          id?: string
          latitude?: number
          longitude?: number
          race_id?: string
          registration_id?: string
          speed?: number | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_tracking_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_tracking_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          autonomous_community: string | null
          birth_date: string | null
          city: string | null
          created_at: string
          dni_passport: string | null
          emergency_contact: string | null
          emergency_phone: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          province: string | null
          updated_at: string
        }
        Insert: {
          autonomous_community?: string | null
          birth_date?: string | null
          city?: string | null
          created_at?: string
          dni_passport?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          province?: string | null
          updated_at?: string
        }
        Update: {
          autonomous_community?: string | null
          birth_date?: string | null
          city?: string | null
          created_at?: string
          dni_passport?: string | null
          emergency_contact?: string | null
          emergency_phone?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          province?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      race_checkpoints: {
        Row: {
          checkpoint_order: number
          created_at: string
          distance_km: number
          id: string
          name: string
          race_id: string
          updated_at: string
        }
        Insert: {
          checkpoint_order: number
          created_at?: string
          distance_km: number
          id?: string
          name: string
          race_id: string
          updated_at?: string
        }
        Update: {
          checkpoint_order?: number
          created_at?: string
          distance_km?: number
          id?: string
          name?: string
          race_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_checkpoints_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      race_distances: {
        Row: {
          created_at: string
          cutoff_time: string | null
          distance_km: number
          elevation_gain: number | null
          gpx_file_url: string | null
          id: string
          image_url: string | null
          max_participants: number | null
          name: string
          price: number
          race_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cutoff_time?: string | null
          distance_km: number
          elevation_gain?: number | null
          gpx_file_url?: string | null
          id?: string
          image_url?: string | null
          max_participants?: number | null
          name: string
          price: number
          race_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cutoff_time?: string | null
          distance_km?: number
          elevation_gain?: number | null
          gpx_file_url?: string | null
          id?: string
          image_url?: string | null
          max_participants?: number | null
          name?: string
          price?: number
          race_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_distances_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      race_results: {
        Row: {
          category_position: number | null
          created_at: string
          finish_time: unknown
          id: string
          notes: string | null
          overall_position: number | null
          photo_url: string | null
          registration_id: string
          status: string
          updated_at: string
        }
        Insert: {
          category_position?: number | null
          created_at?: string
          finish_time: unknown
          id?: string
          notes?: string | null
          overall_position?: number | null
          photo_url?: string | null
          registration_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          category_position?: number | null
          created_at?: string
          finish_time?: unknown
          id?: string
          notes?: string | null
          overall_position?: number | null
          photo_url?: string | null
          registration_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_results_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      races: {
        Row: {
          cover_image_url: string | null
          created_at: string
          date: string
          description: string | null
          gps_tracking_enabled: boolean | null
          gps_update_frequency: number | null
          gpx_file_url: string | null
          id: string
          image_url: string | null
          location: string
          logo_url: string | null
          max_participants: number | null
          name: string
          official_website_url: string | null
          organizer_email: string | null
          organizer_id: string | null
          registration_closes: string | null
          registration_opens: string | null
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          date: string
          description?: string | null
          gps_tracking_enabled?: boolean | null
          gps_update_frequency?: number | null
          gpx_file_url?: string | null
          id?: string
          image_url?: string | null
          location: string
          logo_url?: string | null
          max_participants?: number | null
          name: string
          official_website_url?: string | null
          organizer_email?: string | null
          organizer_id?: string | null
          registration_closes?: string | null
          registration_opens?: string | null
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          date?: string
          description?: string | null
          gps_tracking_enabled?: boolean | null
          gps_update_frequency?: number | null
          gpx_file_url?: string | null
          id?: string
          image_url?: string | null
          location?: string
          logo_url?: string | null
          max_participants?: number | null
          name?: string
          official_website_url?: string | null
          organizer_email?: string | null
          organizer_id?: string | null
          registration_closes?: string | null
          registration_opens?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      registration_form_fields: {
        Row: {
          created_at: string
          field_label: string
          field_name: string
          field_options: Json | null
          field_order: number
          field_type: string
          help_text: string | null
          id: string
          is_required: boolean
          placeholder: string | null
          race_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_label: string
          field_name: string
          field_options?: Json | null
          field_order?: number
          field_type: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          placeholder?: string | null
          race_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_label?: string
          field_name?: string
          field_options?: Json | null
          field_order?: number
          field_type?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          placeholder?: string | null
          race_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_form_fields_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_responses: {
        Row: {
          created_at: string
          field_id: string
          field_value: string
          id: string
          registration_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_id: string
          field_value: string
          id?: string
          registration_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_id?: string
          field_value?: string
          id?: string
          registration_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_responses_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "registration_form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_responses_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          bib_number: number | null
          created_at: string
          id: string
          payment_status: string
          race_distance_id: string
          race_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bib_number?: number | null
          created_at?: string
          id?: string
          payment_status?: string
          race_distance_id: string
          race_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bib_number?: number | null
          created_at?: string
          id?: string
          payment_status?: string
          race_distance_id?: string
          race_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      split_times: {
        Row: {
          checkpoint_name: string
          checkpoint_order: number
          created_at: string
          distance_km: number
          id: string
          race_result_id: string
          split_time: unknown
          updated_at: string
        }
        Insert: {
          checkpoint_name: string
          checkpoint_order: number
          created_at?: string
          distance_km: number
          id?: string
          race_result_id: string
          split_time: unknown
          updated_at?: string
        }
        Update: {
          checkpoint_name?: string
          checkpoint_order?: number
          created_at?: string
          distance_km?: number
          id?: string
          race_result_id?: string
          split_time?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_times_race_result_id_fkey"
            columns: ["race_result_id"]
            isOneToOne: false
            referencedRelation: "race_results"
            referencedColumns: ["id"]
          },
        ]
      }
      training_plans: {
        Row: {
          created_at: string
          fitness_level: string
          goal: string
          id: string
          plan_content: string
          race_id: string | null
          updated_at: string
          user_id: string
          weeks_until_race: number
        }
        Insert: {
          created_at?: string
          fitness_level: string
          goal: string
          id?: string
          plan_content: string
          race_id?: string | null
          updated_at?: string
          user_id: string
          weeks_until_race: number
        }
        Update: {
          created_at?: string
          fitness_level?: string
          goal?: string
          id?: string
          plan_content?: string
          race_id?: string | null
          updated_at?: string
          user_id?: string
          weeks_until_race?: number
        }
        Relationships: [
          {
            foreignKeyName: "training_plans_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "organizer"
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
      app_role: ["admin", "user", "organizer"],
    },
  },
} as const

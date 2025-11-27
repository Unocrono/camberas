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
      bib_designs: {
        Row: {
          background_color: string | null
          canvas_json: Json
          created_at: string
          height_cm: number
          id: string
          name: string
          race_id: string
          updated_at: string
          width_cm: number
        }
        Insert: {
          background_color?: string | null
          canvas_json?: Json
          created_at?: string
          height_cm?: number
          id?: string
          name?: string
          race_id: string
          updated_at?: string
          width_cm?: number
        }
        Update: {
          background_color?: string | null
          canvas_json?: Json
          created_at?: string
          height_cm?: number
          id?: string
          name?: string
          race_id?: string
          updated_at?: string
          width_cm?: number
        }
        Relationships: [
          {
            foreignKeyName: "bib_designs_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
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
      organizer_faqs: {
        Row: {
          answer: string
          created_at: string
          display_order: number
          id: string
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          display_order?: number
          id?: string
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          display_order?: number
          id?: string
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          autonomous_community: string | null
          birth_date: string | null
          city: string | null
          club: string | null
          company_name: string | null
          company_phone: string | null
          created_at: string
          dni_passport: string | null
          first_name: string | null
          gender: string | null
          id: string
          last_name: string | null
          phone: string | null
          province: string | null
          team: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          autonomous_community?: string | null
          birth_date?: string | null
          city?: string | null
          club?: string | null
          company_name?: string | null
          company_phone?: string | null
          created_at?: string
          dni_passport?: string | null
          first_name?: string | null
          gender?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          province?: string | null
          team?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          autonomous_community?: string | null
          birth_date?: string | null
          city?: string | null
          club?: string | null
          company_name?: string | null
          company_phone?: string | null
          created_at?: string
          dni_passport?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          province?: string | null
          team?: string | null
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
          finish_location: string | null
          gpx_file_url: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          max_participants: number | null
          name: string
          price: number
          race_id: string
          start_location: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cutoff_time?: string | null
          distance_km: number
          elevation_gain?: number | null
          finish_location?: string | null
          gpx_file_url?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          max_participants?: number | null
          name: string
          price: number
          race_id: string
          start_location?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cutoff_time?: string | null
          distance_km?: number
          elevation_gain?: number | null
          finish_location?: string | null
          gpx_file_url?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          max_participants?: number | null
          name?: string
          price?: number
          race_id?: string
          start_location?: string | null
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
      race_faqs: {
        Row: {
          answer: string
          created_at: string
          display_order: number
          id: string
          question: string
          race_id: string
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          display_order?: number
          id?: string
          question: string
          race_id: string
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          display_order?: number
          id?: string
          question?: string
          race_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_faqs_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      race_regulation_sections: {
        Row: {
          content: string
          created_at: string
          id: string
          is_required: boolean
          regulation_id: string
          section_order: number
          section_type: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          is_required?: boolean
          regulation_id: string
          section_order?: number
          section_type: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_required?: boolean
          regulation_id?: string
          section_order?: number
          section_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_regulation_sections_regulation_id_fkey"
            columns: ["regulation_id"]
            isOneToOne: false
            referencedRelation: "race_regulations"
            referencedColumns: ["id"]
          },
        ]
      }
      race_regulations: {
        Row: {
          created_at: string
          id: string
          published: boolean
          race_id: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          published?: boolean
          race_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          published?: boolean
          race_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "race_regulations_race_id_fkey"
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
          additional_info: string | null
          cover_image_url: string | null
          created_at: string
          date: string
          description: string | null
          gps_tracking_enabled: boolean | null
          gps_update_frequency: number | null
          gpx_file_url: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          location: string
          logo_url: string | null
          max_participants: number | null
          name: string
          official_website_url: string | null
          organizer_email: string | null
          organizer_id: string | null
          race_type: string
          registration_closes: string | null
          registration_opens: string | null
          updated_at: string
        }
        Insert: {
          additional_info?: string | null
          cover_image_url?: string | null
          created_at?: string
          date: string
          description?: string | null
          gps_tracking_enabled?: boolean | null
          gps_update_frequency?: number | null
          gpx_file_url?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          location: string
          logo_url?: string | null
          max_participants?: number | null
          name: string
          official_website_url?: string | null
          organizer_email?: string | null
          organizer_id?: string | null
          race_type?: string
          registration_closes?: string | null
          registration_opens?: string | null
          updated_at?: string
        }
        Update: {
          additional_info?: string | null
          cover_image_url?: string | null
          created_at?: string
          date?: string
          description?: string | null
          gps_tracking_enabled?: boolean | null
          gps_update_frequency?: number | null
          gpx_file_url?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          location?: string
          logo_url?: string | null
          max_participants?: number | null
          name?: string
          official_website_url?: string | null
          organizer_email?: string | null
          organizer_id?: string | null
          race_type?: string
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
          is_system_field: boolean
          is_visible: boolean
          placeholder: string | null
          race_distance_id: string | null
          race_id: string | null
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
          is_system_field?: boolean
          is_visible?: boolean
          placeholder?: string | null
          race_distance_id?: string | null
          race_id?: string | null
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
          is_system_field?: boolean
          is_visible?: boolean
          placeholder?: string | null
          race_distance_id?: string | null
          race_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_form_fields_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
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
          guest_birth_date: string | null
          guest_dni_passport: string | null
          guest_email: string | null
          guest_emergency_contact: string | null
          guest_emergency_phone: string | null
          guest_first_name: string | null
          guest_last_name: string | null
          guest_phone: string | null
          id: string
          payment_status: string
          race_distance_id: string
          race_id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bib_number?: number | null
          created_at?: string
          guest_birth_date?: string | null
          guest_dni_passport?: string | null
          guest_email?: string | null
          guest_emergency_contact?: string | null
          guest_emergency_phone?: string | null
          guest_first_name?: string | null
          guest_last_name?: string | null
          guest_phone?: string | null
          id?: string
          payment_status?: string
          race_distance_id: string
          race_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bib_number?: number | null
          created_at?: string
          guest_birth_date?: string | null
          guest_dni_passport?: string | null
          guest_email?: string | null
          guest_emergency_contact?: string | null
          guest_emergency_phone?: string | null
          guest_first_name?: string | null
          guest_last_name?: string | null
          guest_phone?: string | null
          id?: string
          payment_status?: string
          race_distance_id?: string
          race_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
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
          {
            foreignKeyName: "registrations_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roadbook_items: {
        Row: {
          altitude: number | null
          created_at: string
          description: string
          icon_url: string | null
          id: string
          is_highlighted: boolean
          item_order: number
          item_type: string
          km_partial: number | null
          km_remaining: number | null
          km_total: number
          latitude: number | null
          longitude: number | null
          notes: string | null
          photo_16_9_url: string | null
          photo_9_16_url: string | null
          roadbook_id: string
          updated_at: string
          via: string | null
        }
        Insert: {
          altitude?: number | null
          created_at?: string
          description: string
          icon_url?: string | null
          id?: string
          is_highlighted?: boolean
          item_order?: number
          item_type?: string
          km_partial?: number | null
          km_remaining?: number | null
          km_total: number
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          photo_16_9_url?: string | null
          photo_9_16_url?: string | null
          roadbook_id: string
          updated_at?: string
          via?: string | null
        }
        Update: {
          altitude?: number | null
          created_at?: string
          description?: string
          icon_url?: string | null
          id?: string
          is_highlighted?: boolean
          item_order?: number
          item_type?: string
          km_partial?: number | null
          km_remaining?: number | null
          km_total?: number
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          photo_16_9_url?: string | null
          photo_9_16_url?: string | null
          roadbook_id?: string
          updated_at?: string
          via?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roadbook_items_roadbook_id_fkey"
            columns: ["roadbook_id"]
            isOneToOne: false
            referencedRelation: "roadbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      roadbook_paces: {
        Row: {
          created_at: string
          id: string
          pace_minutes_per_km: number
          pace_name: string
          pace_order: number
          roadbook_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          pace_minutes_per_km: number
          pace_name: string
          pace_order?: number
          roadbook_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          pace_minutes_per_km?: number
          pace_name?: string
          pace_order?: number
          roadbook_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadbook_paces_roadbook_id_fkey"
            columns: ["roadbook_id"]
            isOneToOne: false
            referencedRelation: "roadbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      roadbook_schedules: {
        Row: {
          created_at: string
          estimated_time: unknown
          id: string
          roadbook_item_id: string
          roadbook_pace_id: string
        }
        Insert: {
          created_at?: string
          estimated_time: unknown
          id?: string
          roadbook_item_id: string
          roadbook_pace_id: string
        }
        Update: {
          created_at?: string
          estimated_time?: unknown
          id?: string
          roadbook_item_id?: string
          roadbook_pace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadbook_schedules_roadbook_item_id_fkey"
            columns: ["roadbook_item_id"]
            isOneToOne: false
            referencedRelation: "roadbook_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roadbook_schedules_roadbook_pace_id_fkey"
            columns: ["roadbook_pace_id"]
            isOneToOne: false
            referencedRelation: "roadbook_paces"
            referencedColumns: ["id"]
          },
        ]
      }
      roadbooks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          race_distance_id: string
          start_time: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          race_distance_id: string
          start_time?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          race_distance_id?: string
          start_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roadbooks_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
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
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_organizer_requests: {
        Args: never
        Returns: {
          created_at: string
          email: string
          first_name: string
          last_name: string
          role: Database["public"]["Enums"]["app_role"]
          role_id: string
          status: string
          user_id: string
        }[]
      }
      get_organizer_status: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      seed_default_registration_fields: {
        Args: { p_race_id: string }
        Returns: undefined
      }
      seed_default_registration_fields_for_distance: {
        Args: { p_distance_id: string }
        Returns: undefined
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

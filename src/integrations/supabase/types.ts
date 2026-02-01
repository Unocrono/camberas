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
      admin_notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      bib_chips: {
        Row: {
          bib_number: number
          chip_code: string
          chip_code_2: string | null
          chip_code_3: string | null
          chip_code_4: string | null
          chip_code_5: string | null
          created_at: string
          id: string
          race_distance_id: string
          race_id: string
          updated_at: string
        }
        Insert: {
          bib_number: number
          chip_code: string
          chip_code_2?: string | null
          chip_code_3?: string | null
          chip_code_4?: string | null
          chip_code_5?: string | null
          created_at?: string
          id?: string
          race_distance_id: string
          race_id: string
          updated_at?: string
        }
        Update: {
          bib_number?: number
          chip_code?: string
          chip_code_2?: string | null
          chip_code_3?: string | null
          chip_code_4?: string | null
          chip_code_5?: string | null
          created_at?: string
          id?: string
          race_distance_id?: string
          race_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bib_chips_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bib_chips_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
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
      blog_post_tags: {
        Row: {
          post_id: string
          tag_id: string
        }
        Insert: {
          post_id: string
          tag_id: string
        }
        Update: {
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "blog_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_id: string | null
          category: string
          content: string
          cover_image_url: string | null
          created_at: string | null
          excerpt: string | null
          id: string
          interviewed_profile_id: string | null
          meta_description: string | null
          meta_title: string | null
          og_image_url: string | null
          published_at: string | null
          race_id: string | null
          reading_time_minutes: number | null
          slug: string
          status: string | null
          title: string
          updated_at: string | null
          view_count: number | null
          youtube_timestamps: Json | null
          youtube_video_id: string | null
        }
        Insert: {
          author_id?: string | null
          category: string
          content?: string
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          interviewed_profile_id?: string | null
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          race_id?: string | null
          reading_time_minutes?: number | null
          slug?: string
          status?: string | null
          title: string
          updated_at?: string | null
          view_count?: number | null
          youtube_timestamps?: Json | null
          youtube_video_id?: string | null
        }
        Update: {
          author_id?: string | null
          category?: string
          content?: string
          cover_image_url?: string | null
          created_at?: string | null
          excerpt?: string | null
          id?: string
          interviewed_profile_id?: string | null
          meta_description?: string | null
          meta_title?: string | null
          og_image_url?: string | null
          published_at?: string | null
          race_id?: string | null
          reading_time_minutes?: number | null
          slug?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          view_count?: number | null
          youtube_timestamps?: Json | null
          youtube_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_interviewed_profile_id_fkey"
            columns: ["interviewed_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_tags: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      category_template_items: {
        Row: {
          age_dependent: boolean | null
          created_at: string | null
          display_order: number | null
          gender: string | null
          id: string
          max_age: number | null
          min_age: number | null
          name: string
          short_name: string | null
          template_id: string
          updated_at: string | null
        }
        Insert: {
          age_dependent?: boolean | null
          created_at?: string | null
          display_order?: number | null
          gender?: string | null
          id?: string
          max_age?: number | null
          min_age?: number | null
          name: string
          short_name?: string | null
          template_id: string
          updated_at?: string | null
        }
        Update: {
          age_dependent?: boolean | null
          created_at?: string | null
          display_order?: number | null
          gender?: string | null
          id?: string
          max_age?: number | null
          min_age?: number | null
          name?: string
          short_name?: string | null
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "category_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      category_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
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
      contact_settings: {
        Row: {
          created_at: string
          email_card_visible: boolean
          form_description: string
          form_enabled: boolean
          form_title: string
          id: string
          page_description: string
          page_title: string
          success_message: string
          support_chat_card_visible: boolean
          support_email: string
          updated_at: string
          whatsapp_card_visible: boolean
          whatsapp_number: string
          whatsapp_url: string
        }
        Insert: {
          created_at?: string
          email_card_visible?: boolean
          form_description?: string
          form_enabled?: boolean
          form_title?: string
          id?: string
          page_description?: string
          page_title?: string
          success_message?: string
          support_chat_card_visible?: boolean
          support_email?: string
          updated_at?: string
          whatsapp_card_visible?: boolean
          whatsapp_number?: string
          whatsapp_url?: string
        }
        Update: {
          created_at?: string
          email_card_visible?: boolean
          form_description?: string
          form_enabled?: boolean
          form_title?: string
          id?: string
          page_description?: string
          page_title?: string
          success_message?: string
          support_chat_card_visible?: boolean
          support_email?: string
          updated_at?: string
          whatsapp_card_visible?: boolean
          whatsapp_number?: string
          whatsapp_url?: string
        }
        Relationships: []
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
      genders: {
        Row: {
          created_at: string
          gender_code: string
          gender_code2: string | null
          gender_code3: string | null
          gender_id: number
          gender_name: string
          gender_name2: string | null
          gender_name3: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          gender_code: string
          gender_code2?: string | null
          gender_code3?: string | null
          gender_id: number
          gender_name: string
          gender_name2?: string | null
          gender_name3?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          gender_code?: string
          gender_code2?: string | null
          gender_code3?: string | null
          gender_id?: number
          gender_name?: string
          gender_name2?: string | null
          gender_name3?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      gps_devices: {
        Row: {
          active: boolean | null
          battery_level: number | null
          created_at: string | null
          device_model: string | null
          device_name: string | null
          id: string
          imei: string
          last_seen_at: string | null
          moto_id: string | null
          notes: string | null
          race_id: string | null
          race_moto_id: string | null
          registration_id: string | null
          update_frequency: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          battery_level?: number | null
          created_at?: string | null
          device_model?: string | null
          device_name?: string | null
          id?: string
          imei: string
          last_seen_at?: string | null
          moto_id?: string | null
          notes?: string | null
          race_id?: string | null
          race_moto_id?: string | null
          registration_id?: string | null
          update_frequency?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          battery_level?: number | null
          created_at?: string | null
          device_model?: string | null
          device_name?: string | null
          id?: string
          imei?: string
          last_seen_at?: string | null
          moto_id?: string | null
          notes?: string | null
          race_id?: string | null
          race_moto_id?: string | null
          registration_id?: string | null
          update_frequency?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_devices_race_moto_id_fkey"
            columns: ["race_moto_id"]
            isOneToOne: false
            referencedRelation: "race_motos"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_tracking: {
        Row: {
          accuracy: number | null
          altitude: number | null
          battery_level: number | null
          created_at: string
          heading: number | null
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
          heading?: number | null
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
          heading?: number | null
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
      menu_items: {
        Row: {
          created_at: string
          display_order: number
          group_label: string | null
          icon: string
          id: string
          is_visible: boolean
          menu_type: string
          parent_id: string | null
          requires_auth: boolean
          route: string | null
          title: string
          updated_at: string
          view_name: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          group_label?: string | null
          icon?: string
          id?: string
          is_visible?: boolean
          menu_type: string
          parent_id?: string | null
          requires_auth?: boolean
          route?: string | null
          title: string
          updated_at?: string
          view_name?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          group_label?: string | null
          icon?: string
          id?: string
          is_visible?: boolean
          menu_type?: string
          parent_id?: string | null
          requires_auth?: boolean
          route?: string | null
          title?: string
          updated_at?: string
          view_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      moto_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          moto_id: string | null
          notes: string | null
          race_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          moto_id?: string | null
          notes?: string | null
          race_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          moto_id?: string | null
          notes?: string | null
          race_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moto_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moto_assignments_moto_id_fkey"
            columns: ["moto_id"]
            isOneToOne: false
            referencedRelation: "race_motos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moto_assignments_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moto_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moto_gps_tracking: {
        Row: {
          accuracy: number | null
          altitude: number | null
          battery_level: number | null
          created_at: string
          distance_from_start: number | null
          distance_id: string | null
          distance_to_finish: number | null
          distance_to_next_checkpoint: number | null
          heading: number | null
          id: string
          latitude: number
          longitude: number
          moto_id: string
          next_checkpoint_id: string | null
          next_checkpoint_name: string | null
          race_id: string
          speed: number | null
          timestamp: string
        }
        Insert: {
          accuracy?: number | null
          altitude?: number | null
          battery_level?: number | null
          created_at?: string
          distance_from_start?: number | null
          distance_id?: string | null
          distance_to_finish?: number | null
          distance_to_next_checkpoint?: number | null
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          moto_id: string
          next_checkpoint_id?: string | null
          next_checkpoint_name?: string | null
          race_id: string
          speed?: number | null
          timestamp?: string
        }
        Update: {
          accuracy?: number | null
          altitude?: number | null
          battery_level?: number | null
          created_at?: string
          distance_from_start?: number | null
          distance_id?: string | null
          distance_to_finish?: number | null
          distance_to_next_checkpoint?: number | null
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          moto_id?: string
          next_checkpoint_id?: string | null
          next_checkpoint_name?: string | null
          race_id?: string
          speed?: number | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "moto_gps_tracking_distance_id_fkey"
            columns: ["distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moto_gps_tracking_moto_id_fkey"
            columns: ["moto_id"]
            isOneToOne: false
            referencedRelation: "race_motos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moto_gps_tracking_next_checkpoint_id_fkey"
            columns: ["next_checkpoint_id"]
            isOneToOne: false
            referencedRelation: "race_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moto_gps_tracking_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_campaigns: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          preview_text: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject: string
          target_segments: string[] | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          preview_text?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          target_segments?: string[] | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          preview_text?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          target_segments?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_sends: {
        Row: {
          bounced: boolean | null
          campaign_id: string
          clicked_at: string | null
          id: string
          opened_at: string | null
          sent_at: string | null
          subscriber_id: string
        }
        Insert: {
          bounced?: boolean | null
          campaign_id: string
          clicked_at?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          subscriber_id: string
        }
        Update: {
          bounced?: boolean | null
          campaign_id?: string
          clicked_at?: string | null
          id?: string
          opened_at?: string | null
          sent_at?: string | null
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "newsletter_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_sends_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "newsletter_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          confirmation_token: string | null
          confirmed_at: string | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          segments: string[] | null
          source: string | null
          status: string
          unsubscribed_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          segments?: string[] | null
          source?: string | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          confirmation_token?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          segments?: string[] | null
          source?: string | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_subscribers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      overlay_config: {
        Row: {
          active_wave_ids: Json | null
          checkpoint_bg_color: string | null
          checkpoint_bg_opacity: number | null
          checkpoint_color: string | null
          checkpoint_font: string | null
          checkpoint_manual_mode: boolean | null
          checkpoint_manual_value: string | null
          checkpoint_pos_x: number | null
          checkpoint_pos_y: number | null
          checkpoint_scale: number | null
          checkpoint_size: number | null
          checkpoint_visible: boolean | null
          clock_bg_color: string | null
          clock_bg_opacity: number | null
          clock_color: string | null
          clock_font: string | null
          clock_pos_x: number | null
          clock_pos_y: number | null
          clock_scale: number | null
          clock_size: number | null
          clock_visible: boolean | null
          compare_moto_id: string | null
          created_at: string
          delay_seconds: number
          distance_bg_color: string
          distance_bg_opacity: number | null
          distance_color: string
          distance_font: string
          distance_manual_mode: boolean
          distance_manual_value: string | null
          distance_pos_x: number | null
          distance_pos_y: number | null
          distance_scale: number | null
          distance_size: number
          distance_visible: boolean
          elevation_fill_opacity: number | null
          elevation_line_color: string | null
          elevation_moto_marker_size: number | null
          elevation_visible: boolean | null
          gaps_bg_color: string
          gaps_bg_opacity: number | null
          gaps_color: string
          gaps_font: string
          gaps_manual_mode: boolean
          gaps_manual_value: string | null
          gaps_pos_x: number | null
          gaps_pos_y: number | null
          gaps_scale: number | null
          gaps_size: number
          gaps_visible: boolean
          id: string
          layout: string
          map_overlay_moto_ids: Json | null
          race_id: string | null
          route_map_line_color: string | null
          route_map_line_width: number | null
          route_map_moto_label_bg_color: string | null
          route_map_moto_label_color: string | null
          route_map_moto_label_size: number | null
          route_map_visible: boolean | null
          selected_distance_id: string | null
          selected_moto_id: string | null
          speed_bg_color: string
          speed_bg_opacity: number | null
          speed_color: string
          speed_display_type: string | null
          speed_font: string
          speed_manual_mode: boolean
          speed_manual_value: string | null
          speed_pos_x: number | null
          speed_pos_y: number | null
          speed_scale: number | null
          speed_size: number
          speed_visible: boolean
          updated_at: string
        }
        Insert: {
          active_wave_ids?: Json | null
          checkpoint_bg_color?: string | null
          checkpoint_bg_opacity?: number | null
          checkpoint_color?: string | null
          checkpoint_font?: string | null
          checkpoint_manual_mode?: boolean | null
          checkpoint_manual_value?: string | null
          checkpoint_pos_x?: number | null
          checkpoint_pos_y?: number | null
          checkpoint_scale?: number | null
          checkpoint_size?: number | null
          checkpoint_visible?: boolean | null
          clock_bg_color?: string | null
          clock_bg_opacity?: number | null
          clock_color?: string | null
          clock_font?: string | null
          clock_pos_x?: number | null
          clock_pos_y?: number | null
          clock_scale?: number | null
          clock_size?: number | null
          clock_visible?: boolean | null
          compare_moto_id?: string | null
          created_at?: string
          delay_seconds?: number
          distance_bg_color?: string
          distance_bg_opacity?: number | null
          distance_color?: string
          distance_font?: string
          distance_manual_mode?: boolean
          distance_manual_value?: string | null
          distance_pos_x?: number | null
          distance_pos_y?: number | null
          distance_scale?: number | null
          distance_size?: number
          distance_visible?: boolean
          elevation_fill_opacity?: number | null
          elevation_line_color?: string | null
          elevation_moto_marker_size?: number | null
          elevation_visible?: boolean | null
          gaps_bg_color?: string
          gaps_bg_opacity?: number | null
          gaps_color?: string
          gaps_font?: string
          gaps_manual_mode?: boolean
          gaps_manual_value?: string | null
          gaps_pos_x?: number | null
          gaps_pos_y?: number | null
          gaps_scale?: number | null
          gaps_size?: number
          gaps_visible?: boolean
          id?: string
          layout?: string
          map_overlay_moto_ids?: Json | null
          race_id?: string | null
          route_map_line_color?: string | null
          route_map_line_width?: number | null
          route_map_moto_label_bg_color?: string | null
          route_map_moto_label_color?: string | null
          route_map_moto_label_size?: number | null
          route_map_visible?: boolean | null
          selected_distance_id?: string | null
          selected_moto_id?: string | null
          speed_bg_color?: string
          speed_bg_opacity?: number | null
          speed_color?: string
          speed_display_type?: string | null
          speed_font?: string
          speed_manual_mode?: boolean
          speed_manual_value?: string | null
          speed_pos_x?: number | null
          speed_pos_y?: number | null
          speed_scale?: number | null
          speed_size?: number
          speed_visible?: boolean
          updated_at?: string
        }
        Update: {
          active_wave_ids?: Json | null
          checkpoint_bg_color?: string | null
          checkpoint_bg_opacity?: number | null
          checkpoint_color?: string | null
          checkpoint_font?: string | null
          checkpoint_manual_mode?: boolean | null
          checkpoint_manual_value?: string | null
          checkpoint_pos_x?: number | null
          checkpoint_pos_y?: number | null
          checkpoint_scale?: number | null
          checkpoint_size?: number | null
          checkpoint_visible?: boolean | null
          clock_bg_color?: string | null
          clock_bg_opacity?: number | null
          clock_color?: string | null
          clock_font?: string | null
          clock_pos_x?: number | null
          clock_pos_y?: number | null
          clock_scale?: number | null
          clock_size?: number | null
          clock_visible?: boolean | null
          compare_moto_id?: string | null
          created_at?: string
          delay_seconds?: number
          distance_bg_color?: string
          distance_bg_opacity?: number | null
          distance_color?: string
          distance_font?: string
          distance_manual_mode?: boolean
          distance_manual_value?: string | null
          distance_pos_x?: number | null
          distance_pos_y?: number | null
          distance_scale?: number | null
          distance_size?: number
          distance_visible?: boolean
          elevation_fill_opacity?: number | null
          elevation_line_color?: string | null
          elevation_moto_marker_size?: number | null
          elevation_visible?: boolean | null
          gaps_bg_color?: string
          gaps_bg_opacity?: number | null
          gaps_color?: string
          gaps_font?: string
          gaps_manual_mode?: boolean
          gaps_manual_value?: string | null
          gaps_pos_x?: number | null
          gaps_pos_y?: number | null
          gaps_scale?: number | null
          gaps_size?: number
          gaps_visible?: boolean
          id?: string
          layout?: string
          map_overlay_moto_ids?: Json | null
          race_id?: string | null
          route_map_line_color?: string | null
          route_map_line_width?: number | null
          route_map_moto_label_bg_color?: string | null
          route_map_moto_label_color?: string | null
          route_map_moto_label_size?: number | null
          route_map_visible?: boolean | null
          selected_distance_id?: string | null
          selected_moto_id?: string | null
          speed_bg_color?: string
          speed_bg_opacity?: number | null
          speed_color?: string
          speed_display_type?: string | null
          speed_font?: string
          speed_manual_mode?: boolean
          speed_manual_value?: string | null
          speed_pos_x?: number | null
          speed_pos_y?: number | null
          speed_scale?: number | null
          speed_size?: number
          speed_visible?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overlay_config_compare_moto_id_fkey"
            columns: ["compare_moto_id"]
            isOneToOne: false
            referencedRelation: "race_motos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overlay_config_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: true
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overlay_config_selected_distance_id_fkey"
            columns: ["selected_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overlay_config_selected_moto_id_fkey"
            columns: ["selected_moto_id"]
            isOneToOne: false
            referencedRelation: "race_motos"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          amount: number
          auth_code: string | null
          completed_at: string | null
          created_at: string
          currency: string
          id: string
          merchant_params: Json | null
          order_number: string
          registration_id: string | null
          response_code: string | null
          response_message: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          auth_code?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          merchant_params?: Json | null
          order_number: string
          registration_id?: string | null
          response_code?: string | null
          response_message?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          auth_code?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          id?: string
          merchant_params?: Json | null
          order_number?: string
          registration_id?: string | null
          response_code?: string | null
          response_message?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          autonomous_community: string | null
          birth_date: string | null
          city: string | null
          club: string | null
          country: string | null
          created_at: string
          dni_passport: string | null
          email: string | null
          first_name: string | null
          gender: string | null
          gender_id: number | null
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
          country?: string | null
          created_at?: string
          dni_passport?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          gender_id?: number | null
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
          country?: string | null
          created_at?: string
          dni_passport?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          gender_id?: number | null
          id?: string
          last_name?: string | null
          phone?: string | null
          province?: string | null
          team?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_gender_id_fkey"
            columns: ["gender_id"]
            isOneToOne: false
            referencedRelation: "genders"
            referencedColumns: ["gender_id"]
          },
        ]
      }
      race_categories: {
        Row: {
          age_calculation_date: string | null
          age_dependent: boolean | null
          category_number: number | null
          created_at: string
          display_order: number
          gender: string | null
          id: string
          max_age: number | null
          min_age: number | null
          name: string
          race_distance_id: string | null
          race_id: string
          short_name: string | null
          updated_at: string
        }
        Insert: {
          age_calculation_date?: string | null
          age_dependent?: boolean | null
          category_number?: number | null
          created_at?: string
          display_order?: number
          gender?: string | null
          id?: string
          max_age?: number | null
          min_age?: number | null
          name: string
          race_distance_id?: string | null
          race_id: string
          short_name?: string | null
          updated_at?: string
        }
        Update: {
          age_calculation_date?: string | null
          age_dependent?: boolean | null
          category_number?: number | null
          created_at?: string
          display_order?: number
          gender?: string | null
          id?: string
          max_age?: number | null
          min_age?: number | null
          name?: string
          race_distance_id?: string | null
          race_id?: string
          short_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_categories_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_categories_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      race_checkpoints: {
        Row: {
          checkpoint_order: number
          checkpoint_type: string
          created_at: string
          distance_km: number
          expected_laps: number | null
          geofence_radius: number | null
          id: string
          latitude: number | null
          longitude: number | null
          lugar: string | null
          max_time: unknown
          min_lap_time: unknown
          min_time: unknown
          name: string
          race_distance_id: string | null
          race_id: string
          timing_point_id: string | null
          updated_at: string
          youtube_enabled: boolean | null
          youtube_error_text: string | null
          youtube_seconds_after: number | null
          youtube_seconds_before: number | null
          youtube_video_id: string | null
          youtube_video_start_time: string | null
        }
        Insert: {
          checkpoint_order: number
          checkpoint_type?: string
          created_at?: string
          distance_km: number
          expected_laps?: number | null
          geofence_radius?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          lugar?: string | null
          max_time?: unknown
          min_lap_time?: unknown
          min_time?: unknown
          name: string
          race_distance_id?: string | null
          race_id: string
          timing_point_id?: string | null
          updated_at?: string
          youtube_enabled?: boolean | null
          youtube_error_text?: string | null
          youtube_seconds_after?: number | null
          youtube_seconds_before?: number | null
          youtube_video_id?: string | null
          youtube_video_start_time?: string | null
        }
        Update: {
          checkpoint_order?: number
          checkpoint_type?: string
          created_at?: string
          distance_km?: number
          expected_laps?: number | null
          geofence_radius?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          lugar?: string | null
          max_time?: unknown
          min_lap_time?: unknown
          min_time?: unknown
          name?: string
          race_distance_id?: string | null
          race_id?: string
          timing_point_id?: string | null
          updated_at?: string
          youtube_enabled?: boolean | null
          youtube_error_text?: string | null
          youtube_seconds_after?: number | null
          youtube_seconds_before?: number | null
          youtube_video_id?: string | null
          youtube_video_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "race_checkpoints_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_checkpoints_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_checkpoints_timing_point_id_fkey"
            columns: ["timing_point_id"]
            isOneToOne: false
            referencedRelation: "timing_points"
            referencedColumns: ["id"]
          },
        ]
      }
      race_distance_prices: {
        Row: {
          created_at: string
          end_datetime: string
          id: string
          price: number
          race_distance_id: string
          start_datetime: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_datetime: string
          id?: string
          price: number
          race_distance_id: string
          start_datetime: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_datetime?: string
          id?: string
          price?: number
          race_distance_id?: string
          start_datetime?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_distance_prices_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
        ]
      }
      race_distances: {
        Row: {
          bib_end: number | null
          bib_start: number | null
          created_at: string
          cutoff_time: string | null
          display_order: number | null
          distance_km: number
          elevation_gain: number | null
          finish_location: string | null
          gps_tracking_enabled: boolean | null
          gps_update_frequency: number | null
          gpx_file_url: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          max_participants: number | null
          name: string
          next_bib: number | null
          price: number
          race_id: string
          registration_closes: string | null
          registration_opens: string | null
          show_route_map: boolean | null
          start_location: string | null
          updated_at: string
        }
        Insert: {
          bib_end?: number | null
          bib_start?: number | null
          created_at?: string
          cutoff_time?: string | null
          display_order?: number | null
          distance_km: number
          elevation_gain?: number | null
          finish_location?: string | null
          gps_tracking_enabled?: boolean | null
          gps_update_frequency?: number | null
          gpx_file_url?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          max_participants?: number | null
          name: string
          next_bib?: number | null
          price: number
          race_id: string
          registration_closes?: string | null
          registration_opens?: string | null
          show_route_map?: boolean | null
          start_location?: string | null
          updated_at?: string
        }
        Update: {
          bib_end?: number | null
          bib_start?: number | null
          created_at?: string
          cutoff_time?: string | null
          display_order?: number | null
          distance_km?: number
          elevation_gain?: number | null
          finish_location?: string | null
          gps_tracking_enabled?: boolean | null
          gps_update_frequency?: number | null
          gpx_file_url?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          max_participants?: number | null
          name?: string
          next_bib?: number | null
          price?: number
          race_id?: string
          registration_closes?: string | null
          registration_opens?: string | null
          show_route_map?: boolean | null
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
      race_motos: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          moto_order: number
          name: string
          name_tv: string | null
          race_distance_id: string | null
          race_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          moto_order?: number
          name: string
          name_tv?: string | null
          race_distance_id?: string | null
          race_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          moto_order?: number
          name?: string
          name_tv?: string | null
          race_distance_id?: string | null
          race_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "race_motos_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_motos_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_motos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          gender_position: number | null
          id: string
          notes: string | null
          overall_position: number | null
          photo_url: string | null
          race_distance_id: string
          registration_id: string
          status: string
          updated_at: string
        }
        Insert: {
          category_position?: number | null
          created_at?: string
          finish_time: unknown
          gender_position?: number | null
          id?: string
          notes?: string | null
          overall_position?: number | null
          photo_url?: string | null
          race_distance_id: string
          registration_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          category_position?: number | null
          created_at?: string
          finish_time?: unknown
          gender_position?: number | null
          id?: string
          notes?: string | null
          overall_position?: number | null
          photo_url?: string | null
          race_distance_id?: string
          registration_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_results_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_results_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_results_status_fkey"
            columns: ["status"]
            isOneToOne: false
            referencedRelation: "race_results_status"
            referencedColumns: ["code"]
          },
        ]
      }
      race_results_abandons: {
        Row: {
          abandon_type: string
          bib_number: number
          created_at: string
          id: string
          operator_user_id: string | null
          race_distance_id: string | null
          race_id: string
          reason: string
          registration_id: string
          timing_point_id: string | null
          updated_at: string
        }
        Insert: {
          abandon_type: string
          bib_number: number
          created_at?: string
          id?: string
          operator_user_id?: string | null
          race_distance_id?: string | null
          race_id: string
          reason: string
          registration_id: string
          timing_point_id?: string | null
          updated_at?: string
        }
        Update: {
          abandon_type?: string
          bib_number?: number
          created_at?: string
          id?: string
          operator_user_id?: string | null
          race_distance_id?: string | null
          race_id?: string
          reason?: string
          registration_id?: string
          timing_point_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_results_abandons_operator_user_id_fkey"
            columns: ["operator_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_results_abandons_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_results_abandons_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_results_abandons_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_results_abandons_timing_point_id_fkey"
            columns: ["timing_point_id"]
            isOneToOne: false
            referencedRelation: "timing_points"
            referencedColumns: ["id"]
          },
        ]
      }
      race_results_status: {
        Row: {
          can_change_at_split: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          can_change_at_split?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order: number
          updated_at?: string
        }
        Update: {
          can_change_at_split?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      race_waves: {
        Row: {
          created_at: string
          id: string
          race_distance_id: string
          race_id: string
          start_time: string | null
          updated_at: string
          wave_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          race_distance_id: string
          race_id: string
          start_time?: string | null
          updated_at?: string
          wave_name: string
        }
        Update: {
          created_at?: string
          id?: string
          race_distance_id?: string
          race_id?: string
          start_time?: string | null
          updated_at?: string
          wave_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "race_waves_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: true
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "race_waves_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      races: {
        Row: {
          additional_info: string | null
          category_age_reference: string
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
          slug: string | null
          updated_at: string
          utc_offset: number | null
        }
        Insert: {
          additional_info?: string | null
          category_age_reference?: string
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
          slug?: string | null
          updated_at?: string
          utc_offset?: number | null
        }
        Update: {
          additional_info?: string | null
          category_age_reference?: string
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
          slug?: string | null
          updated_at?: string
          utc_offset?: number | null
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
          profile_field: string | null
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
          profile_field?: string | null
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
          profile_field?: string | null
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
          address: string | null
          autonomous_community: string | null
          bib_number: number | null
          birth_date: string | null
          chip_code: string | null
          city: string | null
          club: string | null
          country: string | null
          created_at: string
          dni_passport: string | null
          email: string | null
          first_name: string | null
          gender: string | null
          gender_id: number | null
          id: string
          last_name: string | null
          payment_status: string
          phone: string | null
          province: string | null
          race_category_id: string | null
          race_distance_id: string
          race_id: string
          status: string
          team: string | null
          tshirt_size: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          autonomous_community?: string | null
          bib_number?: number | null
          birth_date?: string | null
          chip_code?: string | null
          city?: string | null
          club?: string | null
          country?: string | null
          created_at?: string
          dni_passport?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          gender_id?: number | null
          id?: string
          last_name?: string | null
          payment_status?: string
          phone?: string | null
          province?: string | null
          race_category_id?: string | null
          race_distance_id: string
          race_id: string
          status?: string
          team?: string | null
          tshirt_size?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          autonomous_community?: string | null
          bib_number?: number | null
          birth_date?: string | null
          chip_code?: string | null
          city?: string | null
          club?: string | null
          country?: string | null
          created_at?: string
          dni_passport?: string | null
          email?: string | null
          first_name?: string | null
          gender?: string | null
          gender_id?: number | null
          id?: string
          last_name?: string | null
          payment_status?: string
          phone?: string | null
          province?: string | null
          race_category_id?: string | null
          race_distance_id?: string
          race_id?: string
          status?: string
          team?: string | null
          tshirt_size?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_gender_id_fkey"
            columns: ["gender_id"]
            isOneToOne: false
            referencedRelation: "genders"
            referencedColumns: ["gender_id"]
          },
          {
            foreignKeyName: "registrations_race_category_id_fkey"
            columns: ["race_category_id"]
            isOneToOne: false
            referencedRelation: "race_categories"
            referencedColumns: ["id"]
          },
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
      roadbook_item_types: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          icon: string
          id: string
          is_active: boolean
          label: string
          name: string
          race_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          label: string
          name: string
          race_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string
          id?: string
          is_active?: boolean
          label?: string
          name?: string
          race_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      roadbook_items: {
        Row: {
          altitude: number | null
          created_at: string
          description: string
          icon_url: string | null
          id: string
          is_checkpoint: boolean
          is_highlighted: boolean
          item_order: number
          item_type: string
          item_type_id: string | null
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
          is_checkpoint?: boolean
          is_highlighted?: boolean
          item_order?: number
          item_type?: string
          item_type_id?: string | null
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
          is_checkpoint?: boolean
          is_highlighted?: boolean
          item_order?: number
          item_type?: string
          item_type_id?: string | null
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
            foreignKeyName: "roadbook_items_item_type_id_fkey"
            columns: ["item_type_id"]
            isOneToOne: false
            referencedRelation: "roadbook_item_types"
            referencedColumns: ["id"]
          },
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
          category_position: number | null
          checkpoint_id: string | null
          checkpoint_name: string
          checkpoint_order: number
          created_at: string
          distance_km: number
          gender_position: number | null
          id: string
          lap_number: number | null
          overall_position: number | null
          pace: string | null
          race_result_id: string
          split_time: unknown
          updated_at: string
        }
        Insert: {
          category_position?: number | null
          checkpoint_id?: string | null
          checkpoint_name: string
          checkpoint_order: number
          created_at?: string
          distance_km: number
          gender_position?: number | null
          id?: string
          lap_number?: number | null
          overall_position?: number | null
          pace?: string | null
          race_result_id: string
          split_time: unknown
          updated_at?: string
        }
        Update: {
          category_position?: number | null
          checkpoint_id?: string | null
          checkpoint_name?: string
          checkpoint_order?: number
          created_at?: string
          distance_km?: number
          gender_position?: number | null
          id?: string
          lap_number?: number | null
          overall_position?: number | null
          pace?: string | null
          race_result_id?: string
          split_time?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_times_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "race_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_times_race_result_id_fkey"
            columns: ["race_result_id"]
            isOneToOne: false
            referencedRelation: "race_results"
            referencedColumns: ["id"]
          },
        ]
      }
      support_conversations: {
        Row: {
          created_at: string | null
          id: string
          last_message_at: string | null
          status: string
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          status?: string
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          status?: string
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      timer_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          checkpoint_id: string | null
          id: string
          notes: string | null
          race_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          checkpoint_id?: string | null
          id?: string
          notes?: string | null
          race_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          checkpoint_id?: string | null
          id?: string
          notes?: string | null
          race_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timer_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timer_assignments_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "timing_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timer_assignments_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timer_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timing_points: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          point_order: number | null
          race_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          point_order?: number | null
          race_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          point_order?: number | null
          race_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timing_points_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
        ]
      }
      timing_readings: {
        Row: {
          antenna_no: number | null
          bib_number: number
          checkpoint_id: string | null
          chip_code: string | null
          created_at: string | null
          id: string
          is_processed: boolean | null
          is_rewind: boolean | null
          lap_number: number | null
          log_id: number | null
          notes: string | null
          operator_user_id: string | null
          race_distance_id: string | null
          race_id: string
          reader_device_id: string | null
          reader_no: number | null
          reading_timestamp: string | null
          reading_type: string | null
          registration_id: string | null
          rssi: number | null
          status_code: string | null
          timing_point_id: string | null
          timing_timestamp: string
          ultra_id: number | null
          updated_at: string | null
        }
        Insert: {
          antenna_no?: number | null
          bib_number: number
          checkpoint_id?: string | null
          chip_code?: string | null
          created_at?: string | null
          id?: string
          is_processed?: boolean | null
          is_rewind?: boolean | null
          lap_number?: number | null
          log_id?: number | null
          notes?: string | null
          operator_user_id?: string | null
          race_distance_id?: string | null
          race_id: string
          reader_device_id?: string | null
          reader_no?: number | null
          reading_timestamp?: string | null
          reading_type?: string | null
          registration_id?: string | null
          rssi?: number | null
          status_code?: string | null
          timing_point_id?: string | null
          timing_timestamp: string
          ultra_id?: number | null
          updated_at?: string | null
        }
        Update: {
          antenna_no?: number | null
          bib_number?: number
          checkpoint_id?: string | null
          chip_code?: string | null
          created_at?: string | null
          id?: string
          is_processed?: boolean | null
          is_rewind?: boolean | null
          lap_number?: number | null
          log_id?: number | null
          notes?: string | null
          operator_user_id?: string | null
          race_distance_id?: string | null
          race_id?: string
          reader_device_id?: string | null
          reader_no?: number | null
          reading_timestamp?: string | null
          reading_type?: string | null
          registration_id?: string | null
          rssi?: number | null
          status_code?: string | null
          timing_point_id?: string | null
          timing_timestamp?: string
          ultra_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "timing_readings_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "race_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timing_readings_operator_user_id_fkey"
            columns: ["operator_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timing_readings_race_distance_id_fkey"
            columns: ["race_distance_id"]
            isOneToOne: false
            referencedRelation: "race_distances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timing_readings_race_id_fkey"
            columns: ["race_id"]
            isOneToOne: false
            referencedRelation: "races"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timing_readings_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timing_readings_timing_point_id_fkey"
            columns: ["timing_point_id"]
            isOneToOne: false
            referencedRelation: "timing_points"
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
      calculate_race_results: {
        Args: { p_race_distance_id: string }
        Returns: {
          bib_number: number
          finish_checkpoint_id: string
          finish_checkpoint_name: string
          finish_time: unknown
          registration_id: string
        }[]
      }
      calculate_split_positions: {
        Args: { p_race_distance_id: string }
        Returns: {
          updated_count: number
        }[]
      }
      calculate_split_times: {
        Args: { p_race_distance_id: string }
        Returns: {
          bib_number: number
          checkpoint_id: string
          checkpoint_name: string
          checkpoint_order: number
          lap_number: number
          registration_id: string
          split_time: unknown
          timing_reading_id: string
        }[]
      }
      generate_split_times: {
        Args: { p_race_distance_id: string }
        Returns: {
          inserted_count: number
          updated_count: number
        }[]
      }
      get_age_category: {
        Args: { p_birth_date: string; p_gender: string; p_race_date: string }
        Returns: string
      }
      get_current_user_email: { Args: never; Returns: string }
      get_gender_id_from_text: {
        Args: { gender_text: string }
        Returns: number
      }
      get_live_gps_positions: {
        Args: { p_distance_id?: string; p_race_id: string }
        Returns: {
          bib_number: number
          gps_id: string
          gps_timestamp: string
          heading: number
          latitude: number
          longitude: number
          race_distance_id: string
          registration_id: string
          runner_name: string
        }[]
      }
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
      get_race_category: {
        Args: { p_birth_date: string; p_gender: string; p_race_id: string }
        Returns: string
      }
      get_registration_gender: {
        Args: { p_registration_id: string }
        Returns: string
      }
      get_user_email: { Args: { _user_id: string }; Returns: string }
      get_users_with_emails: {
        Args: never
        Returns: {
          email: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_moto_for_race: {
        Args: { _race_id: string; _user_id: string }
        Returns: boolean
      }
      is_timer_for_race: {
        Args: { _race_id: string; _user_id: string }
        Returns: boolean
      }
      process_event_results: {
        Args: { p_race_distance_id: string }
        Returns: {
          finished_count: number
          in_progress_count: number
          processed_count: number
        }[]
      }
      seed_default_registration_fields: {
        Args: { p_race_id: string }
        Returns: undefined
      }
      seed_default_registration_fields_for_distance: {
        Args: { p_distance_id: string }
        Returns: undefined
      }
      user_has_gps_registration: {
        Args: { distance_id: string }
        Returns: boolean
      }
      user_has_gps_registration_for_race: {
        Args: { race_uuid: string }
        Returns: boolean
      }
      user_has_moto_assignment_for_distance: {
        Args: { distance_id: string }
        Returns: boolean
      }
      user_has_moto_assignment_for_race: {
        Args: { p_race_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "organizer"
        | "timer"
        | "moto"
        | "comisario"
        | "editor"
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
        "admin",
        "user",
        "organizer",
        "timer",
        "moto",
        "comisario",
        "editor",
      ],
    },
  },
} as const

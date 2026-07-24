export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          created_at: string | null;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          created_at?: string | null;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      ai_coach_keys: {
        Row: {
          user_id: string;
          gemini_api_key: string;
          model: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          gemini_api_key: string;
          model?: string;
          updated_at?: string;
        };
        Update: {
          gemini_api_key?: string;
          model?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// Tipos do schema Lumio (Supabase). Manter em sync com supabase/schema.sql.

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          role: "user" | "admin";
          onboarded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          email: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          plan: "free" | "pro" | "annual";
          status:
            | "inactive"
            | "active"
            | "past_due"
            | "canceled"
            | "incomplete"
            | "trialing";
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]> & {
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]>;
      };
      subjects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["subjects"]["Row"]> & {
          user_id: string;
          name: string;
        };
        Update: Partial<Database["public"]["Tables"]["subjects"]["Row"]>;
      };
      lectures: {
        Row: {
          id: string;
          user_id: string;
          subject_id: string | null;
          title: string;
          transcript: string;
          duration_sec: number;
          status: "draft" | "live" | "completed";
          slides_file_name: string | null;
          slides: unknown | null;
          summary: unknown | null;
          messages: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["lectures"]["Row"]> & {
          user_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["lectures"]["Row"]>;
      };
      stripe_events: {
        Row: {
          id: string;
          type: string;
          payload: unknown;
          received_at: string;
          processed_at: string | null;
        };
        Insert: {
          id: string;
          type: string;
          payload: unknown;
          received_at?: string;
          processed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["stripe_events"]["Row"]>;
      };
    };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type DbSubject = Database["public"]["Tables"]["subjects"]["Row"];
export type DbLecture = Database["public"]["Tables"]["lectures"]["Row"];

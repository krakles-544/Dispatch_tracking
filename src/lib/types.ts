export type Dispatch = {
  id: string;
  invoice_number: string;
  started_at: string;
  first_arrived_at: string | null;
  last_arrived_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      dispatches: {
        Row: Dispatch & { created_at: string };
        Insert: { invoice_number: string };
        Update: { first_arrived_at?: string | null; last_arrived_at?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

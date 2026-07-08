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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      anunturi: {
        Row: {
          audienta: Json | null
          canal: string
          continut: string
          created: string
          expeditor_email: string | null
          expeditor_user_id: string | null
          id: string
          nr_destinatari: number
          titlu: string
        }
        Insert: {
          audienta?: Json | null
          canal: string
          continut: string
          created?: string
          expeditor_email?: string | null
          expeditor_user_id?: string | null
          id?: string
          nr_destinatari?: number
          titlu: string
        }
        Update: {
          audienta?: Json | null
          canal?: string
          continut?: string
          created?: string
          expeditor_email?: string | null
          expeditor_user_id?: string | null
          id?: string
          nr_destinatari?: number
          titlu?: string
        }
        Relationships: []
      }
      anunturi_clienti: {
        Row: {
          anunt_id: string
          client_id: string
          read_at: string | null
        }
        Insert: {
          anunt_id: string
          client_id: string
          read_at?: string | null
        }
        Update: {
          anunt_id?: string
          client_id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "anunturi_clienti_anunt_id_fkey"
            columns: ["anunt_id"]
            isOneToOne: false
            referencedRelation: "anunturi"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anunturi_clienti_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anunturi_clienti_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anunturi_clienti_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "anunturi_clienti_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "anunturi_clienti_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anunturi_clienti_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "anunturi_clienti_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
        ]
      }
      anunturi_destinatari: {
        Row: {
          anunt_id: string
          read_at: string | null
          recipient_user_id: string
        }
        Insert: {
          anunt_id: string
          read_at?: string | null
          recipient_user_id: string
        }
        Update: {
          anunt_id?: string
          read_at?: string | null
          recipient_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anunturi_destinatari_anunt_id_fkey"
            columns: ["anunt_id"]
            isOneToOne: false
            referencedRelation: "anunturi"
            referencedColumns: ["id"]
          },
        ]
      }
      app_feedback: {
        Row: {
          autor_email: string | null
          autor_user_id: string | null
          created: string
          detalii: string | null
          id: string
          pagina: string | null
          raspuns: string | null
          status: Database["public"]["Enums"]["app_feedback_status"]
          tip: Database["public"]["Enums"]["app_feedback_tip"]
          titlu: string
          updated: string
          user_agent: string | null
        }
        Insert: {
          autor_email?: string | null
          autor_user_id?: string | null
          created?: string
          detalii?: string | null
          id?: string
          pagina?: string | null
          raspuns?: string | null
          status?: Database["public"]["Enums"]["app_feedback_status"]
          tip: Database["public"]["Enums"]["app_feedback_tip"]
          titlu: string
          updated?: string
          user_agent?: string | null
        }
        Update: {
          autor_email?: string | null
          autor_user_id?: string | null
          created?: string
          detalii?: string | null
          id?: string
          pagina?: string | null
          raspuns?: string | null
          status?: Database["public"]["Enums"]["app_feedback_status"]
          tip?: Database["public"]["Enums"]["app_feedback_tip"]
          titlu?: string
          updated?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          created: string
          entity_id: string | null
          entity_type: string
          id: string
          locatie_id: string | null
          new_value: Json | null
          old_value: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role: string
          created?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          locatie_id?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          created?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          locatie_id?: string | null
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "audit_log_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "audit_log_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "audit_log_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "audit_log_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
        ]
      }
      bilete: {
        Row: {
          client: string | null
          cod: string | null
          created: string
          eveniment: string
          id: string
          order_ref: string | null
          portal_account_id: string | null
          pret: number
          status: string
          validat_at: string | null
        }
        Insert: {
          client?: string | null
          cod?: string | null
          created?: string
          eveniment: string
          id?: string
          order_ref?: string | null
          portal_account_id?: string | null
          pret?: number
          status?: string
          validat_at?: string | null
        }
        Update: {
          client?: string | null
          cod?: string | null
          created?: string
          eveniment?: string
          id?: string
          order_ref?: string | null
          portal_account_id?: string | null
          pret?: number
          status?: string
          validat_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bilete_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilete_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilete_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "bilete_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "bilete_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilete_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "bilete_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "bilete_eveniment_fkey"
            columns: ["eveniment"]
            isOneToOne: false
            referencedRelation: "bilete_publice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bilete_eveniment_fkey"
            columns: ["eveniment"]
            isOneToOne: false
            referencedRelation: "evenimente"
            referencedColumns: ["id"]
          },
        ]
      }
      campanii_promovare: {
        Row: {
          bani: string | null
          canal_comunicare:
            | Database["public"]["Enums"]["canal_comunicare"]
            | null
          canale_online: Database["public"]["Enums"]["canale_online"] | null
          created: string
          descrierea: string | null
          id: string
          nume: string
          rezultate: number | null
          updated: string
        }
        Insert: {
          bani?: string | null
          canal_comunicare?:
            | Database["public"]["Enums"]["canal_comunicare"]
            | null
          canale_online?: Database["public"]["Enums"]["canale_online"] | null
          created?: string
          descrierea?: string | null
          id?: string
          nume: string
          rezultate?: number | null
          updated?: string
        }
        Update: {
          bani?: string | null
          canal_comunicare?:
            | Database["public"]["Enums"]["canal_comunicare"]
            | null
          canale_online?: Database["public"]["Enums"]["canale_online"] | null
          created?: string
          descrierea?: string | null
          id?: string
          nume?: string
          rezultate?: number | null
          updated?: string
        }
        Relationships: []
      }
      campanii_reinscriere: {
        Row: {
          created: string
          created_by: string | null
          data_final: string
          data_incepere: string
          id: string
          inchisa_la: string | null
          nume: string
          sezon_tinta: string
          target_clienti: number
          taxa_rezervare: number
          updated: string
          zile_procesare: number
        }
        Insert: {
          created?: string
          created_by?: string | null
          data_final: string
          data_incepere: string
          id?: string
          inchisa_la?: string | null
          nume: string
          sezon_tinta: string
          target_clienti?: number
          taxa_rezervare: number
          updated?: string
          zile_procesare?: number
        }
        Update: {
          created?: string
          created_by?: string | null
          data_final?: string
          data_incepere?: string
          id?: string
          inchisa_la?: string | null
          nume?: string
          sezon_tinta?: string
          target_clienti?: number
          taxa_rezervare?: number
          updated?: string
          zile_procesare?: number
        }
        Relationships: [
          {
            foreignKeyName: "campanii_reinscriere_sezon_tinta_fkey"
            columns: ["sezon_tinta"]
            isOneToOne: true
            referencedRelation: "sezoane"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_logs: {
        Row: {
          answer: string | null
          audienta: string
          created_at: string
          id: string
          locatie_id: string | null
          question: string
          role: string
          tools_used: string[] | null
          user_id: string
        }
        Insert: {
          answer?: string | null
          audienta: string
          created_at?: string
          id?: string
          locatie_id?: string | null
          question: string
          role: string
          tools_used?: string[] | null
          user_id: string
        }
        Update: {
          answer?: string | null
          audienta?: string
          created_at?: string
          id?: string
          locatie_id?: string | null
          question?: string
          role?: string
          tools_used?: string[] | null
          user_id?: string
        }
        Relationships: []
      }
      cheltuieli: {
        Row: {
          achitat: boolean
          categorie: Database["public"]["Enums"]["categorie_cheltuiala"] | null
          created: string
          data: string | null
          descriere: string | null
          id: string
          nume: string
          updated: string
          valoare: number | null
        }
        Insert: {
          achitat?: boolean
          categorie?: Database["public"]["Enums"]["categorie_cheltuiala"] | null
          created?: string
          data?: string | null
          descriere?: string | null
          id?: string
          nume: string
          updated?: string
          valoare?: number | null
        }
        Update: {
          achitat?: boolean
          categorie?: Database["public"]["Enums"]["categorie_cheltuiala"] | null
          created?: string
          data?: string | null
          descriere?: string | null
          id?: string
          nume?: string
          updated?: string
          valoare?: number | null
        }
        Relationships: []
      }
      client_contacte: {
        Row: {
          canal: Database["public"]["Enums"]["canal_contact"]
          client_id: string
          created: string
          id: string
          observatii: string | null
          rezultat: Database["public"]["Enums"]["rezultat_contact"]
          scop: string
          suma_promisa: number | null
          user_id: string
        }
        Insert: {
          canal: Database["public"]["Enums"]["canal_contact"]
          client_id: string
          created?: string
          id?: string
          observatii?: string | null
          rezultat: Database["public"]["Enums"]["rezultat_contact"]
          scop: string
          suma_promisa?: number | null
          user_id?: string
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal_contact"]
          client_id?: string
          created?: string
          id?: string
          observatii?: string | null
          rezultat?: Database["public"]["Enums"]["rezultat_contact"]
          scop?: string
          suma_promisa?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "client_contacte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "client_contacte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "client_contacte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
        ]
      }
      clienti: {
        Row: {
          auth_user_id: string | null
          created: string
          data_nasterii: string | null
          email: string | null
          familia: string | null
          foto: string | null
          id: string
          link_contract: string | null
          marime_tricou: Database["public"]["Enums"]["marime_tricou"] | null
          nume: string
          old_user_id: number | null
          opt_out_la: string | null
          opt_out_marketing: boolean
          opt_out_motiv: string | null
          participari_concurs: string[]
          prenume: string | null
          sexul: Database["public"]["Enums"]["sex"] | null
          status: Database["public"]["Enums"]["status_client"] | null
          telefon: string | null
          telefonul_2: string | null
          unitate_invatamant: string | null
          updated: string
        }
        Insert: {
          auth_user_id?: string | null
          created?: string
          data_nasterii?: string | null
          email?: string | null
          familia?: string | null
          foto?: string | null
          id?: string
          link_contract?: string | null
          marime_tricou?: Database["public"]["Enums"]["marime_tricou"] | null
          nume: string
          old_user_id?: number | null
          opt_out_la?: string | null
          opt_out_marketing?: boolean
          opt_out_motiv?: string | null
          participari_concurs?: string[]
          prenume?: string | null
          sexul?: Database["public"]["Enums"]["sex"] | null
          status?: Database["public"]["Enums"]["status_client"] | null
          telefon?: string | null
          telefonul_2?: string | null
          unitate_invatamant?: string | null
          updated?: string
        }
        Update: {
          auth_user_id?: string | null
          created?: string
          data_nasterii?: string | null
          email?: string | null
          familia?: string | null
          foto?: string | null
          id?: string
          link_contract?: string | null
          marime_tricou?: Database["public"]["Enums"]["marime_tricou"] | null
          nume?: string
          old_user_id?: number | null
          opt_out_la?: string | null
          opt_out_marketing?: boolean
          opt_out_motiv?: string | null
          participari_concurs?: string[]
          prenume?: string | null
          sexul?: Database["public"]["Enums"]["sex"] | null
          status?: Database["public"]["Enums"]["status_client"] | null
          telefon?: string | null
          telefonul_2?: string | null
          unitate_invatamant?: string | null
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "clienti_auth_user_id_fkey"
            columns: ["auth_user_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clienti_familia"
            columns: ["familia"]
            isOneToOne: false
            referencedRelation: "familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clienti_familia"
            columns: ["familia"]
            isOneToOne: false
            referencedRelation: "lista_familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clienti_familia"
            columns: ["familia"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id_familie"]
          },
          {
            foreignKeyName: "fk_clienti_familia"
            columns: ["familia"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_familie"]
          },
        ]
      }
      concursuri: {
        Row: {
          created: string
          data_evenimentului: string | null
          id: string
          locul_i: number | null
          locul_ii: number | null
          locul_iii: number | null
          numele_concursului: string
          participanti: string[]
          rezultate_obtinute: string | null
          trupa: string[]
          updated: string
        }
        Insert: {
          created?: string
          data_evenimentului?: string | null
          id?: string
          locul_i?: number | null
          locul_ii?: number | null
          locul_iii?: number | null
          numele_concursului: string
          participanti?: string[]
          rezultate_obtinute?: string | null
          trupa?: string[]
          updated?: string
        }
        Update: {
          created?: string
          data_evenimentului?: string | null
          id?: string
          locul_i?: number | null
          locul_ii?: number | null
          locul_iii?: number | null
          numele_concursului?: string
          participanti?: string[]
          rezultate_obtinute?: string | null
          trupa?: string[]
          updated?: string
        }
        Relationships: []
      }
      confirmari_inrolare_sms: {
        Row: {
          created: string
          enrollment_id: string
          error: string | null
          id: string
          mesaj: string | null
          send_after: string
          status: string
          telefon: string | null
          trimis_la: string | null
        }
        Insert: {
          created?: string
          enrollment_id: string
          error?: string | null
          id?: string
          mesaj?: string | null
          send_after?: string
          status?: string
          telefon?: string | null
          trimis_la?: string | null
        }
        Update: {
          created?: string
          enrollment_id?: string
          error?: string | null
          id?: string
          mesaj?: string | null
          send_after?: string
          status?: string
          telefon?: string | null
          trimis_la?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "confirmari_inrolare_sms_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confirmari_inrolare_sms_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_inrolare"]
          },
          {
            foreignKeyName: "confirmari_inrolare_sms_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_enrollment"]
          },
        ]
      }
      confirmari_programare_sms: {
        Row: {
          created: string
          error: string | null
          id: string
          lead_id: string
          send_after: string
          status: string
          trimis_la: string | null
        }
        Insert: {
          created?: string
          error?: string | null
          id?: string
          lead_id: string
          send_after?: string
          status?: string
          trimis_la?: string | null
        }
        Update: {
          created?: string
          error?: string | null
          id?: string
          lead_id?: string
          send_after?: string
          status?: string
          trimis_la?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "confirmari_programare_sms_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      confirmari_review_sms: {
        Row: {
          created: string
          error: string | null
          id: string
          lead_id: string
          send_after: string
          status: string
          trimis_la: string | null
        }
        Insert: {
          created?: string
          error?: string | null
          id?: string
          lead_id: string
          send_after?: string
          status?: string
          trimis_la?: string | null
        }
        Update: {
          created?: string
          error?: string | null
          id?: string
          lead_id?: string
          send_after?: string
          status?: string
          trimis_la?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "confirmari_review_sms_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_events: {
        Row: {
          contract_id: string
          created: string
          id: number
          meta: Json | null
          tip: string
        }
        Insert: {
          contract_id: string
          created?: string
          id?: never
          meta?: Json | null
          tip: string
        }
        Update: {
          contract_id?: string
          created?: string
          id?: never
          meta?: Json | null
          tip?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracte"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          activ: boolean
          created: string
          created_by: string | null
          fields: Json
          id: string
          locked_at: string | null
          nume: string
          pdf_storage_path: string
          sezon: string | null
          tip: string
          updated: string
          valabilitate_zile: number
          versiune: number
        }
        Insert: {
          activ?: boolean
          created?: string
          created_by?: string | null
          fields?: Json
          id?: string
          locked_at?: string | null
          nume: string
          pdf_storage_path: string
          sezon?: string | null
          tip: string
          updated?: string
          valabilitate_zile?: number
          versiune?: number
        }
        Update: {
          activ?: boolean
          created?: string
          created_by?: string | null
          fields?: Json
          id?: string
          locked_at?: string | null
          nume?: string
          pdf_storage_path?: string
          sezon?: string | null
          tip?: string
          updated?: string
          valabilitate_zile?: number
          versiune?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_templates_sezon_fkey"
            columns: ["sezon"]
            isOneToOne: false
            referencedRelation: "sezoane"
            referencedColumns: ["id"]
          },
        ]
      }
      contracte: {
        Row: {
          campanie_id: string | null
          client_id: string | null
          consimtamant_esign_la: string | null
          created: string
          created_by: string | null
          deschis_prima_data_la: string | null
          documente_client_id: string | null
          familie_id: string
          finalizat_la: string | null
          gate_id: string | null
          id: string
          last_reminder_la: string | null
          marketing_optin: boolean | null
          motiv_respingere: string | null
          pdf_drive_link: string | null
          pdf_hash_final: string | null
          pdf_hash_pre: string | null
          pdf_storage_path: string | null
          reminder_count: number
          semnat_la: string | null
          semnatura_path: string | null
          status: string
          template_id: string
          token_expira_la: string | null
          token_hash: string | null
          trimis_la: string | null
          updated: string
          valori: Json | null
        }
        Insert: {
          campanie_id?: string | null
          client_id?: string | null
          consimtamant_esign_la?: string | null
          created?: string
          created_by?: string | null
          deschis_prima_data_la?: string | null
          documente_client_id?: string | null
          familie_id: string
          finalizat_la?: string | null
          gate_id?: string | null
          id?: string
          last_reminder_la?: string | null
          marketing_optin?: boolean | null
          motiv_respingere?: string | null
          pdf_drive_link?: string | null
          pdf_hash_final?: string | null
          pdf_hash_pre?: string | null
          pdf_storage_path?: string | null
          reminder_count?: number
          semnat_la?: string | null
          semnatura_path?: string | null
          status?: string
          template_id: string
          token_expira_la?: string | null
          token_hash?: string | null
          trimis_la?: string | null
          updated?: string
          valori?: Json | null
        }
        Update: {
          campanie_id?: string | null
          client_id?: string | null
          consimtamant_esign_la?: string | null
          created?: string
          created_by?: string | null
          deschis_prima_data_la?: string | null
          documente_client_id?: string | null
          familie_id?: string
          finalizat_la?: string | null
          gate_id?: string | null
          id?: string
          last_reminder_la?: string | null
          marketing_optin?: boolean | null
          motiv_respingere?: string | null
          pdf_drive_link?: string | null
          pdf_hash_final?: string | null
          pdf_hash_pre?: string | null
          pdf_storage_path?: string | null
          reminder_count?: number
          semnat_la?: string | null
          semnatura_path?: string | null
          status?: string
          template_id?: string
          token_expira_la?: string | null
          token_hash?: string | null
          trimis_la?: string | null
          updated?: string
          valori?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "contracte_campanie_id_fkey"
            columns: ["campanie_id"]
            isOneToOne: false
            referencedRelation: "campanii_reinscriere"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "contracte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "contracte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "contracte_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "contracte_documente_client_id_fkey"
            columns: ["documente_client_id"]
            isOneToOne: false
            referencedRelation: "documente_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracte_familie_id_fkey"
            columns: ["familie_id"]
            isOneToOne: false
            referencedRelation: "familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracte_familie_id_fkey"
            columns: ["familie_id"]
            isOneToOne: false
            referencedRelation: "lista_familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracte_familie_id_fkey"
            columns: ["familie_id"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id_familie"]
          },
          {
            foreignKeyName: "contracte_familie_id_fkey"
            columns: ["familie_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_familie"]
          },
          {
            foreignKeyName: "contracte_gate_id_fkey"
            columns: ["gate_id"]
            isOneToOne: false
            referencedRelation: "reinscrieri_gate"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracte_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cursuri: {
        Row: {
          capacitate_maxima: number | null
          created: string
          cursul_original: string | null
          durata_cursului: number | null
          facultativ: boolean
          id: string
          link_whatsapp: string | null
          locatie: string | null
          nivelul: Database["public"]["Enums"]["nivel_curs"] | null
          numele: string
          old_sub_id: number | null
          one_time: boolean
          ora: string | null
          ore_pe_zi: Json | null
          participari_eveniment: boolean
          pret_anual: number | null
          pret_lunar: number | null
          pret_lunar_promo: number | null
          pret_sedinta: number | null
          pret_sedinta_reziliere: number | null
          sala: string | null
          sezon: string | null
          stil: string | null
          suspendat: boolean
          teacher: string | null
          updated: string
          varsta: Database["public"]["Enums"]["varsta_curs"] | null
          zile: Database["public"]["Enums"]["zi_saptamana"][] | null
        }
        Insert: {
          capacitate_maxima?: number | null
          created?: string
          cursul_original?: string | null
          durata_cursului?: number | null
          facultativ?: boolean
          id?: string
          link_whatsapp?: string | null
          locatie?: string | null
          nivelul?: Database["public"]["Enums"]["nivel_curs"] | null
          numele: string
          old_sub_id?: number | null
          one_time?: boolean
          ora?: string | null
          ore_pe_zi?: Json | null
          participari_eveniment?: boolean
          pret_anual?: number | null
          pret_lunar?: number | null
          pret_lunar_promo?: number | null
          pret_sedinta?: number | null
          pret_sedinta_reziliere?: number | null
          sala?: string | null
          sezon?: string | null
          stil?: string | null
          suspendat?: boolean
          teacher?: string | null
          updated?: string
          varsta?: Database["public"]["Enums"]["varsta_curs"] | null
          zile?: Database["public"]["Enums"]["zi_saptamana"][] | null
        }
        Update: {
          capacitate_maxima?: number | null
          created?: string
          cursul_original?: string | null
          durata_cursului?: number | null
          facultativ?: boolean
          id?: string
          link_whatsapp?: string | null
          locatie?: string | null
          nivelul?: Database["public"]["Enums"]["nivel_curs"] | null
          numele?: string
          old_sub_id?: number | null
          one_time?: boolean
          ora?: string | null
          ore_pe_zi?: Json | null
          participari_eveniment?: boolean
          pret_anual?: number | null
          pret_lunar?: number | null
          pret_lunar_promo?: number | null
          pret_sedinta?: number | null
          pret_sedinta_reziliere?: number | null
          sala?: string | null
          sezon?: string | null
          stil?: string | null
          suspendat?: boolean
          teacher?: string | null
          updated?: string
          varsta?: Database["public"]["Enums"]["varsta_curs"] | null
          zile?: Database["public"]["Enums"]["zi_saptamana"][] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cursuri_cursul_original"
            columns: ["cursul_original"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_cursul_original"
            columns: ["cursul_original"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_cursuri_cursul_original"
            columns: ["cursul_original"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_cursuri_cursul_original"
            columns: ["cursul_original"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_cursul_original"
            columns: ["cursul_original"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_cursuri_cursul_original"
            columns: ["cursul_original"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_cursuri_cursul_original"
            columns: ["cursul_original"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_cursuri_cursul_original"
            columns: ["cursul_original"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_cursuri_cursul_original"
            columns: ["cursul_original"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "fk_cursuri_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_cursuri_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_cursuri_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_cursuri_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_cursuri_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "incasari_sala_luna"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "restante_sala_luna"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "sali"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_sezon"
            columns: ["sezon"]
            isOneToOne: false
            referencedRelation: "sezoane"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
        ]
      }
      cursuri_teacheri: {
        Row: {
          created: string
          curs_id: string
          rol: string
          teacher_id: string
        }
        Insert: {
          created?: string
          curs_id: string
          rol?: string
          teacher_id: string
        }
        Update: {
          created?: string
          curs_id?: string
          rol?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cursuri_teacheri_curs_id_fkey"
            columns: ["curs_id"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cursuri_teacheri_curs_id_fkey"
            columns: ["curs_id"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "cursuri_teacheri_curs_id_fkey"
            columns: ["curs_id"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "cursuri_teacheri_curs_id_fkey"
            columns: ["curs_id"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cursuri_teacheri_curs_id_fkey"
            columns: ["curs_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "cursuri_teacheri_curs_id_fkey"
            columns: ["curs_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "cursuri_teacheri_curs_id_fkey"
            columns: ["curs_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "cursuri_teacheri_curs_id_fkey"
            columns: ["curs_id"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "cursuri_teacheri_curs_id_fkey"
            columns: ["curs_id"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "cursuri_teacheri_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "cursuri_teacheri_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "cursuri_teacheri_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cursuri_teacheri_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "cursuri_teacheri_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "cursuri_teacheri_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
        ]
      }
      datorii: {
        Row: {
          articol_inventar: string | null
          bilet: string | null
          bucati: number | null
          categorie: Database["public"]["Enums"]["categorie_incasare"]
          client: string
          created: string
          descriere: string | null
          id: string
          locatie: string | null
          sezon: string | null
          suma_datorata: number
          updated: string
          voucher: string | null
        }
        Insert: {
          articol_inventar?: string | null
          bilet?: string | null
          bucati?: number | null
          categorie: Database["public"]["Enums"]["categorie_incasare"]
          client: string
          created?: string
          descriere?: string | null
          id?: string
          locatie?: string | null
          sezon?: string | null
          suma_datorata: number
          updated?: string
          voucher?: string | null
        }
        Update: {
          articol_inventar?: string | null
          bilet?: string | null
          bucati?: number | null
          categorie?: Database["public"]["Enums"]["categorie_incasare"]
          client?: string
          created?: string
          descriere?: string | null
          id?: string
          locatie?: string | null
          sezon?: string | null
          suma_datorata?: number
          updated?: string
          voucher?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "datorii_articol_inventar_fkey"
            columns: ["articol_inventar"]
            isOneToOne: false
            referencedRelation: "inventar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_articol_inventar_fkey"
            columns: ["articol_inventar"]
            isOneToOne: false
            referencedRelation: "produse_publice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_bilet_fkey"
            columns: ["bilet"]
            isOneToOne: false
            referencedRelation: "bilete_publice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_bilet_fkey"
            columns: ["bilet"]
            isOneToOne: false
            referencedRelation: "evenimente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "datorii_sezon_fkey"
            columns: ["sezon"]
            isOneToOne: false
            referencedRelation: "sezoane"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_voucher_fkey"
            columns: ["voucher"]
            isOneToOne: false
            referencedRelation: "vouchere"
            referencedColumns: ["id"]
          },
        ]
      }
      documente_client: {
        Row: {
          client: string
          created: string
          created_by: string | null
          data_expirarii: string | null
          id: string
          link: string
          observatii: string | null
          tip: Database["public"]["Enums"]["tip_document"]
          titlu: string | null
        }
        Insert: {
          client: string
          created?: string
          created_by?: string | null
          data_expirarii?: string | null
          id?: string
          link: string
          observatii?: string | null
          tip?: Database["public"]["Enums"]["tip_document"]
          titlu?: string | null
        }
        Update: {
          client?: string
          created?: string
          created_by?: string | null
          data_expirarii?: string | null
          id?: string
          link?: string
          observatii?: string | null
          tip?: Database["public"]["Enums"]["tip_document"]
          titlu?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documente_client_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documente_client_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documente_client_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "documente_client_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "documente_client_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documente_client_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "documente_client_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
        ]
      }
      email_logs: {
        Row: {
          client_id: string | null
          error: string | null
          familia_id: string | null
          id: string
          lead_id: string | null
          message_id: string | null
          status: string
          subject: string | null
          tip: string
          to_email: string
          trimis_la: string
        }
        Insert: {
          client_id?: string | null
          error?: string | null
          familia_id?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          status: string
          subject?: string | null
          tip: string
          to_email: string
          trimis_la?: string
        }
        Update: {
          client_id?: string | null
          error?: string | null
          familia_id?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          status?: string
          subject?: string | null
          tip?: string
          to_email?: string
          trimis_la?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "email_logs_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "lista_familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id_familie"]
          },
          {
            foreignKeyName: "email_logs_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_familie"]
          },
          {
            foreignKeyName: "email_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          activ: boolean
          client: string | null
          created: string
          cursul: string | null
          data_final: string | null
          data_incepere: string | null
          data_reziliere: string | null
          este_reinscriere: boolean
          foloseste_pret_promo: boolean
          id: string
          motiv_reziliere: string | null
          old_user_sub_id: number | null
          politica_discount: number
          promo_anulat_la: string | null
          retrogradat: boolean
          reziliat: boolean
          sezon_id: string | null
          suma: number | null
          suma_baza: number | null
          tip_plata: Database["public"]["Enums"]["tip_plata"] | null
          updated: string
          voucher: string | null
        }
        Insert: {
          activ?: boolean
          client?: string | null
          created?: string
          cursul?: string | null
          data_final?: string | null
          data_incepere?: string | null
          data_reziliere?: string | null
          este_reinscriere?: boolean
          foloseste_pret_promo?: boolean
          id?: string
          motiv_reziliere?: string | null
          old_user_sub_id?: number | null
          politica_discount?: number
          promo_anulat_la?: string | null
          retrogradat?: boolean
          reziliat?: boolean
          sezon_id?: string | null
          suma?: number | null
          suma_baza?: number | null
          tip_plata?: Database["public"]["Enums"]["tip_plata"] | null
          updated?: string
          voucher?: string | null
        }
        Update: {
          activ?: boolean
          client?: string | null
          created?: string
          cursul?: string | null
          data_final?: string | null
          data_incepere?: string | null
          data_reziliere?: string | null
          este_reinscriere?: boolean
          foloseste_pret_promo?: boolean
          id?: string
          motiv_reziliere?: string | null
          old_user_sub_id?: number | null
          politica_discount?: number
          promo_anulat_la?: string | null
          retrogradat?: boolean
          reziliat?: boolean
          sezon_id?: string | null
          suma?: number | null
          suma_baza?: number | null
          tip_plata?: Database["public"]["Enums"]["tip_plata"] | null
          updated?: string
          voucher?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_enrollments_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "fk_enrollments_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_enrollments_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_enrollments_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "fk_enrollments_sezon"
            columns: ["sezon_id"]
            isOneToOne: false
            referencedRelation: "sezoane"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_voucher"
            columns: ["voucher"]
            isOneToOne: false
            referencedRelation: "vouchere"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluari: {
        Row: {
          client: string
          created: string
          cursul: string
          data_evaluarii: string
          feedback_general: string | null
          id: string
          nivel_grupa: string | null
          skill_coordonare: number | null
          skill_coregrafie: number | null
          skill_expresivitate: number | null
          skill_freeze: number | null
          skill_improvizatie: number | null
          skill_izolari: number | null
          skill_pasi_baza: number | null
          skill_prezentare: number | null
          skill_ritm: number | null
          skill_sincronizare: number | null
          teacher: string
          updated: string
        }
        Insert: {
          client: string
          created?: string
          cursul: string
          data_evaluarii?: string
          feedback_general?: string | null
          id?: string
          nivel_grupa?: string | null
          skill_coordonare?: number | null
          skill_coregrafie?: number | null
          skill_expresivitate?: number | null
          skill_freeze?: number | null
          skill_improvizatie?: number | null
          skill_izolari?: number | null
          skill_pasi_baza?: number | null
          skill_prezentare?: number | null
          skill_ritm?: number | null
          skill_sincronizare?: number | null
          teacher: string
          updated?: string
        }
        Update: {
          client?: string
          created?: string
          cursul?: string
          data_evaluarii?: string
          feedback_general?: string | null
          id?: string
          nivel_grupa?: string | null
          skill_coordonare?: number | null
          skill_coregrafie?: number | null
          skill_expresivitate?: number | null
          skill_freeze?: number | null
          skill_improvizatie?: number | null
          skill_izolari?: number | null
          skill_pasi_baza?: number | null
          skill_prezentare?: number | null
          skill_ritm?: number | null
          skill_sincronizare?: number | null
          teacher?: string
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "evaluari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "evaluari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "evaluari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "evaluari_cursul_fkey"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluari_cursul_fkey"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "evaluari_cursul_fkey"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "evaluari_cursul_fkey"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluari_cursul_fkey"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "evaluari_cursul_fkey"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "evaluari_cursul_fkey"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "evaluari_cursul_fkey"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "evaluari_cursul_fkey"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "evaluari_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "evaluari_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "evaluari_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluari_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "evaluari_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "evaluari_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluari_teacher: {
        Row: {
          anul: number
          created: string
          evaluator_id: string
          feedback_cursanti: number | null
          id: string
          luna: number
          observatii: string | null
          scor_comunicare: number | null
          scor_disciplina: number | null
          scor_energie: number | null
          scor_pregatire: number | null
          scor_punctualitate: number | null
          scor_rezultate: number | null
          teacher_id: string
          updated: string
        }
        Insert: {
          anul: number
          created?: string
          evaluator_id?: string
          feedback_cursanti?: number | null
          id?: string
          luna: number
          observatii?: string | null
          scor_comunicare?: number | null
          scor_disciplina?: number | null
          scor_energie?: number | null
          scor_pregatire?: number | null
          scor_punctualitate?: number | null
          scor_rezultate?: number | null
          teacher_id: string
          updated?: string
        }
        Update: {
          anul?: number
          created?: string
          evaluator_id?: string
          feedback_cursanti?: number | null
          id?: string
          luna?: number
          observatii?: string | null
          scor_comunicare?: number | null
          scor_disciplina?: number | null
          scor_energie?: number | null
          scor_pregatire?: number | null
          scor_punctualitate?: number | null
          scor_rezultate?: number | null
          teacher_id?: string
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluari_teacher_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "evaluari_teacher_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "evaluari_teacher_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluari_teacher_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "evaluari_teacher_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "evaluari_teacher_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
        ]
      }
      evenimente: {
        Row: {
          capacitate: number | null
          cost_organizare: number | null
          created: string
          data: string | null
          descriere: string | null
          id: string
          locatia: string | null
          notite: string | null
          nume_eveniment: string
          ora: string | null
          organizator: string | null
          participant: string[]
          pret_bilet: number | null
          public: boolean
          status: Database["public"]["Enums"]["status_eveniment"] | null
          tip: Database["public"]["Enums"]["tip_eveniment"]
          updated: string
        }
        Insert: {
          capacitate?: number | null
          cost_organizare?: number | null
          created?: string
          data?: string | null
          descriere?: string | null
          id?: string
          locatia?: string | null
          notite?: string | null
          nume_eveniment: string
          ora?: string | null
          organizator?: string | null
          participant?: string[]
          pret_bilet?: number | null
          public?: boolean
          status?: Database["public"]["Enums"]["status_eveniment"] | null
          tip?: Database["public"]["Enums"]["tip_eveniment"]
          updated?: string
        }
        Update: {
          capacitate?: number | null
          cost_organizare?: number | null
          created?: string
          data?: string | null
          descriere?: string | null
          id?: string
          locatia?: string | null
          notite?: string | null
          nume_eveniment?: string
          ora?: string | null
          organizator?: string | null
          participant?: string[]
          pret_bilet?: number | null
          public?: boolean
          status?: Database["public"]["Enums"]["status_eveniment"] | null
          tip?: Database["public"]["Enums"]["tip_eveniment"]
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_evenimente_organizator"
            columns: ["organizator"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_evenimente_organizator"
            columns: ["organizator"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_evenimente_organizator"
            columns: ["organizator"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_evenimente_organizator"
            columns: ["organizator"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_evenimente_organizator"
            columns: ["organizator"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_evenimente_organizator"
            columns: ["organizator"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
        ]
      }
      facturi_fgo: {
        Row: {
          client_id: string | null
          client_nume: string
          created: string
          data_tranzactie: string
          descriere: string | null
          emis_la: string | null
          eroare_mesaj: string | null
          factura_fgo: string | null
          factura_link: string | null
          familia_id: string | null
          firma_cui: string
          incasare_id: string | null
          linii: Json | null
          platit_la: string | null
          ref: string
          status: Database["public"]["Enums"]["factura_fgo_status"]
          suma: number
          sursa: Database["public"]["Enums"]["factura_fgo_sursa"]
          updated: string
          valuta: string
        }
        Insert: {
          client_id?: string | null
          client_nume?: string
          created?: string
          data_tranzactie: string
          descriere?: string | null
          emis_la?: string | null
          eroare_mesaj?: string | null
          factura_fgo?: string | null
          factura_link?: string | null
          familia_id?: string | null
          firma_cui: string
          incasare_id?: string | null
          linii?: Json | null
          platit_la?: string | null
          ref: string
          status?: Database["public"]["Enums"]["factura_fgo_status"]
          suma: number
          sursa: Database["public"]["Enums"]["factura_fgo_sursa"]
          updated?: string
          valuta?: string
        }
        Update: {
          client_id?: string | null
          client_nume?: string
          created?: string
          data_tranzactie?: string
          descriere?: string | null
          emis_la?: string | null
          eroare_mesaj?: string | null
          factura_fgo?: string | null
          factura_link?: string | null
          familia_id?: string | null
          firma_cui?: string
          incasare_id?: string | null
          linii?: Json | null
          platit_la?: string | null
          ref?: string
          status?: Database["public"]["Enums"]["factura_fgo_status"]
          suma?: number
          sursa?: Database["public"]["Enums"]["factura_fgo_sursa"]
          updated?: string
          valuta?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturi_fgo_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturi_fgo_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturi_fgo_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "facturi_fgo_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "facturi_fgo_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturi_fgo_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "facturi_fgo_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "facturi_fgo_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturi_fgo_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "lista_familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturi_fgo_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id_familie"]
          },
          {
            foreignKeyName: "facturi_fgo_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_familie"]
          },
          {
            foreignKeyName: "facturi_fgo_incasare_id_fkey"
            columns: ["incasare_id"]
            isOneToOne: false
            referencedRelation: "incasari"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturi_fgo_incasare_id_fkey"
            columns: ["incasare_id"]
            isOneToOne: false
            referencedRelation: "lista_incasari"
            referencedColumns: ["id"]
          },
        ]
      }
      familii: {
        Row: {
          auth_user_id: string | null
          created: string
          doreste_sa_apara_in_poze: boolean
          email: string | null
          factura_pe_firma: boolean
          firma_adresa: string | null
          firma_banca: string | null
          firma_cif: string | null
          firma_denumire: string | null
          firma_iban: string | null
          firma_reg_com: string | null
          id: string
          metoda_comunicare: string | null
          metoda_plata: string | null
          nume_familie: string
          nume_reprezentant: string | null
          observatii: string | null
          opt_out_la: string | null
          opt_out_marketing: boolean
          opt_out_motiv: string | null
          prenume_reprezentant: string | null
          telefon: string | null
          telefon_2: string | null
          updated: string
        }
        Insert: {
          auth_user_id?: string | null
          created?: string
          doreste_sa_apara_in_poze?: boolean
          email?: string | null
          factura_pe_firma?: boolean
          firma_adresa?: string | null
          firma_banca?: string | null
          firma_cif?: string | null
          firma_denumire?: string | null
          firma_iban?: string | null
          firma_reg_com?: string | null
          id?: string
          metoda_comunicare?: string | null
          metoda_plata?: string | null
          nume_familie: string
          nume_reprezentant?: string | null
          observatii?: string | null
          opt_out_la?: string | null
          opt_out_marketing?: boolean
          opt_out_motiv?: string | null
          prenume_reprezentant?: string | null
          telefon?: string | null
          telefon_2?: string | null
          updated?: string
        }
        Update: {
          auth_user_id?: string | null
          created?: string
          doreste_sa_apara_in_poze?: boolean
          email?: string | null
          factura_pe_firma?: boolean
          firma_adresa?: string | null
          firma_banca?: string | null
          firma_cif?: string | null
          firma_denumire?: string | null
          firma_iban?: string | null
          firma_reg_com?: string | null
          id?: string
          metoda_comunicare?: string | null
          metoda_plata?: string | null
          nume_familie?: string
          nume_reprezentant?: string | null
          observatii?: string | null
          opt_out_la?: string | null
          opt_out_marketing?: boolean
          opt_out_motiv?: string | null
          prenume_reprezentant?: string | null
          telefon?: string | null
          telefon_2?: string | null
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "familii_auth_user_id_fkey"
            columns: ["auth_user_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      familii_date_semnatar: {
        Row: {
          actualizat_la: string
          actualizat_sursa: string | null
          adresa: string | null
          ci_eliberat_de: string | null
          ci_eliberat_la: string | null
          ci_numar: string | null
          ci_serie: string | null
          cnp: string | null
          familie_id: string
        }
        Insert: {
          actualizat_la?: string
          actualizat_sursa?: string | null
          adresa?: string | null
          ci_eliberat_de?: string | null
          ci_eliberat_la?: string | null
          ci_numar?: string | null
          ci_serie?: string | null
          cnp?: string | null
          familie_id: string
        }
        Update: {
          actualizat_la?: string
          actualizat_sursa?: string | null
          adresa?: string | null
          ci_eliberat_de?: string | null
          ci_eliberat_la?: string | null
          ci_numar?: string | null
          ci_serie?: string | null
          cnp?: string | null
          familie_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "familii_date_semnatar_familie_id_fkey"
            columns: ["familie_id"]
            isOneToOne: true
            referencedRelation: "familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "familii_date_semnatar_familie_id_fkey"
            columns: ["familie_id"]
            isOneToOne: true
            referencedRelation: "lista_familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "familii_date_semnatar_familie_id_fkey"
            columns: ["familie_id"]
            isOneToOne: true
            referencedRelation: "profil_client"
            referencedColumns: ["id_familie"]
          },
          {
            foreignKeyName: "familii_date_semnatar_familie_id_fkey"
            columns: ["familie_id"]
            isOneToOne: true
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_familie"]
          },
        ]
      }
      feedback: {
        Row: {
          autor: string | null
          context_achizitie: string | null
          created: string
          cursul: string | null
          detalii: string | null
          detalii_rezolvare: string | null
          id: string
          nume: string | null
          rating: number | null
          reprezentant: string | null
          rezolvat: boolean
          tip: Database["public"]["Enums"]["tip_feedback"] | null
          updated: string
        }
        Insert: {
          autor?: string | null
          context_achizitie?: string | null
          created?: string
          cursul?: string | null
          detalii?: string | null
          detalii_rezolvare?: string | null
          id?: string
          nume?: string | null
          rating?: number | null
          reprezentant?: string | null
          rezolvat?: boolean
          tip?: Database["public"]["Enums"]["tip_feedback"] | null
          updated?: string
        }
        Update: {
          autor?: string | null
          context_achizitie?: string | null
          created?: string
          cursul?: string | null
          detalii?: string | null
          detalii_rezolvare?: string | null
          id?: string
          nume?: string | null
          rating?: number | null
          reprezentant?: string | null
          rezolvat?: boolean
          tip?: Database["public"]["Enums"]["tip_feedback"] | null
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_feedback_autor"
            columns: ["autor"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feedback_autor"
            columns: ["autor"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feedback_autor"
            columns: ["autor"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "fk_feedback_autor"
            columns: ["autor"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_feedback_autor"
            columns: ["autor"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feedback_autor"
            columns: ["autor"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_feedback_autor"
            columns: ["autor"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_feedback_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feedback_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_feedback_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_feedback_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feedback_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_feedback_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_feedback_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_feedback_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_feedback_cursul"
            columns: ["cursul"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "fk_feedback_reprezentant"
            columns: ["reprezentant"]
            isOneToOne: false
            referencedRelation: "familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feedback_reprezentant"
            columns: ["reprezentant"]
            isOneToOne: false
            referencedRelation: "lista_familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_feedback_reprezentant"
            columns: ["reprezentant"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id_familie"]
          },
          {
            foreignKeyName: "fk_feedback_reprezentant"
            columns: ["reprezentant"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_familie"]
          },
        ]
      }
      incasari: {
        Row: {
          articol_inventar: string | null
          bilet: string | null
          bucati: number | null
          categorie: Database["public"]["Enums"]["categorie_incasare"] | null
          client: string | null
          created: string
          data: string | null
          datorie: string | null
          id: string
          inchiriere: string | null
          inregistrare: string | null
          lead: string | null
          locatie: string | null
          metoda: Database["public"]["Enums"]["metoda_plata"] | null
          observatii: string | null
          sezon: string | null
          suma: number | null
          updated: string
          voucher: string | null
        }
        Insert: {
          articol_inventar?: string | null
          bilet?: string | null
          bucati?: number | null
          categorie?: Database["public"]["Enums"]["categorie_incasare"] | null
          client?: string | null
          created?: string
          data?: string | null
          datorie?: string | null
          id?: string
          inchiriere?: string | null
          inregistrare?: string | null
          lead?: string | null
          locatie?: string | null
          metoda?: Database["public"]["Enums"]["metoda_plata"] | null
          observatii?: string | null
          sezon?: string | null
          suma?: number | null
          updated?: string
          voucher?: string | null
        }
        Update: {
          articol_inventar?: string | null
          bilet?: string | null
          bucati?: number | null
          categorie?: Database["public"]["Enums"]["categorie_incasare"] | null
          client?: string | null
          created?: string
          data?: string | null
          datorie?: string | null
          id?: string
          inchiriere?: string | null
          inregistrare?: string | null
          lead?: string | null
          locatie?: string | null
          metoda?: Database["public"]["Enums"]["metoda_plata"] | null
          observatii?: string | null
          sezon?: string | null
          suma?: number | null
          updated?: string
          voucher?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_incasari_articol"
            columns: ["articol_inventar"]
            isOneToOne: false
            referencedRelation: "inventar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_incasari_articol"
            columns: ["articol_inventar"]
            isOneToOne: false
            referencedRelation: "produse_publice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_incasari_bilet"
            columns: ["bilet"]
            isOneToOne: false
            referencedRelation: "bilete_publice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_incasari_bilet"
            columns: ["bilet"]
            isOneToOne: false
            referencedRelation: "evenimente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_incasari_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_incasari_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_incasari_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "fk_incasari_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_incasari_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_incasari_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_incasari_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_incasari_inregistrare"
            columns: ["inregistrare"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_incasari_inregistrare"
            columns: ["inregistrare"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_inrolare"]
          },
          {
            foreignKeyName: "fk_incasari_inregistrare"
            columns: ["inregistrare"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_enrollment"]
          },
          {
            foreignKeyName: "fk_incasari_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_incasari_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_incasari_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_incasari_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_incasari_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_incasari_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_incasari_sezon"
            columns: ["sezon"]
            isOneToOne: false
            referencedRelation: "sezoane"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_incasari_voucher"
            columns: ["voucher"]
            isOneToOne: false
            referencedRelation: "vouchere"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incasari_datorie_fkey"
            columns: ["datorie"]
            isOneToOne: false
            referencedRelation: "datorii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incasari_datorie_fkey"
            columns: ["datorie"]
            isOneToOne: false
            referencedRelation: "datorii_rest"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incasari_inchiriere_fkey"
            columns: ["inchiriere"]
            isOneToOne: false
            referencedRelation: "inchirieri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incasari_lead_fkey"
            columns: ["lead"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      inchirieri: {
        Row: {
          client: string | null
          created: string
          created_by: string | null
          data: string
          datorie: string | null
          durata_min: number
          guest_nume: string | null
          guest_tel: string | null
          id: string
          locatie: string | null
          observatii: string | null
          ora_final: string
          ora_start: string
          pret: number
          sala: string
          status_plata: Database["public"]["Enums"]["status_plata_inchiriere"]
          teacher: string | null
          tier: Database["public"]["Enums"]["tier_inchiriere"]
          updated: string
        }
        Insert: {
          client?: string | null
          created?: string
          created_by?: string | null
          data: string
          datorie?: string | null
          durata_min: number
          guest_nume?: string | null
          guest_tel?: string | null
          id?: string
          locatie?: string | null
          observatii?: string | null
          ora_final: string
          ora_start: string
          pret?: number
          sala: string
          status_plata?: Database["public"]["Enums"]["status_plata_inchiriere"]
          teacher?: string | null
          tier: Database["public"]["Enums"]["tier_inchiriere"]
          updated?: string
        }
        Update: {
          client?: string | null
          created?: string
          created_by?: string | null
          data?: string
          datorie?: string | null
          durata_min?: number
          guest_nume?: string | null
          guest_tel?: string | null
          id?: string
          locatie?: string | null
          observatii?: string | null
          ora_final?: string
          ora_start?: string
          pret?: number
          sala?: string
          status_plata?: Database["public"]["Enums"]["status_plata_inchiriere"]
          teacher?: string | null
          tier?: Database["public"]["Enums"]["tier_inchiriere"]
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "inchirieri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inchirieri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inchirieri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "inchirieri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "inchirieri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inchirieri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "inchirieri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "inchirieri_datorie_fkey"
            columns: ["datorie"]
            isOneToOne: false
            referencedRelation: "datorii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inchirieri_datorie_fkey"
            columns: ["datorie"]
            isOneToOne: false
            referencedRelation: "datorii_rest"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inchirieri_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "inchirieri_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inchirieri_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "inchirieri_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "inchirieri_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "inchirieri_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "inchirieri_sala_fkey"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "incasari_sala_luna"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "inchirieri_sala_fkey"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "inchirieri_sala_fkey"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "inchirieri_sala_fkey"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "restante_sala_luna"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "inchirieri_sala_fkey"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "sali"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inchirieri_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "inchirieri_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "inchirieri_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inchirieri_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "inchirieri_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "inchirieri_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
        ]
      }
      inventar: {
        Row: {
          articol: string
          categorie: Database["public"]["Enums"]["categorie_inventar"] | null
          created: string
          descriere: string | null
          descriere_publica: string | null
          id: string
          locatie: string | null
          ordine_public: number
          pret: string | null
          pret_public: string | null
          public: boolean
          stoc: number | null
          updated: string
        }
        Insert: {
          articol: string
          categorie?: Database["public"]["Enums"]["categorie_inventar"] | null
          created?: string
          descriere?: string | null
          descriere_publica?: string | null
          id?: string
          locatie?: string | null
          ordine_public?: number
          pret?: string | null
          pret_public?: string | null
          public?: boolean
          stoc?: number | null
          updated?: string
        }
        Update: {
          articol?: string
          categorie?: Database["public"]["Enums"]["categorie_inventar"] | null
          created?: string
          descriere?: string | null
          descriere_publica?: string | null
          id?: string
          locatie?: string | null
          ordine_public?: number
          pret?: string | null
          pret_public?: string | null
          public?: boolean
          stoc?: number | null
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_inventar_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_inventar_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_inventar_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_inventar_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_inventar_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_inventar_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
        ]
      }
      lead_contacte: {
        Row: {
          canal: Database["public"]["Enums"]["canal_contact"]
          created: string
          id: string
          lead_id: string
          observatii: string | null
          rezultat: Database["public"]["Enums"]["rezultat_contact"]
          user_id: string
        }
        Insert: {
          canal: Database["public"]["Enums"]["canal_contact"]
          created?: string
          id?: string
          lead_id: string
          observatii?: string | null
          rezultat: Database["public"]["Enums"]["rezultat_contact"]
          user_id?: string
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal_contact"]
          created?: string
          id?: string
          lead_id?: string
          observatii?: string | null
          rezultat?: Database["public"]["Enums"]["rezultat_contact"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contacte_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_history: {
        Row: {
          action_type: Database["public"]["Enums"]["lead_action_type"]
          created_at: string
          id: string
          lead_id: string
          new_value: string | null
          old_value: string | null
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["lead_action_type"]
          created_at?: string
          id?: string
          lead_id: string
          new_value?: string | null
          old_value?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["lead_action_type"]
          created_at?: string
          id?: string
          lead_id?: string
          new_value?: string | null
          old_value?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          cod_voucher: string | null
          created: string
          curs_interes: string | null
          data_callback_dorit: string | null
          data_conversie: string | null
          data_followup: string | null
          data_nasterii: string | null
          data_programare: string | null
          email: string | null
          flag_reminder: boolean
          flag_reminder_at: string | null
          flag_streak: number
          grupa_varsta: Database["public"]["Enums"]["grupa_lead"] | null
          id: string
          id_client: string | null
          interes: Database["public"]["Enums"]["interes_lead"] | null
          locatia: string | null
          motiv_pierdut: string | null
          nr_contactari: number
          nr_neprezentari: number
          nume: string
          nume_parinte: string | null
          observatii: string | null
          opt_out_la: string | null
          opt_out_marketing: boolean
          opt_out_motiv: string | null
          prenume: string | null
          responsabil_id: string | null
          sexul: Database["public"]["Enums"]["sex"] | null
          status: Database["public"]["Enums"]["status_lead"]
          sub_status: Database["public"]["Enums"]["sub_status_lead"] | null
          sursa: string | null
          telefon: string | null
          ultima_contactare_la: string | null
          updated: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          varsta: number | null
        }
        Insert: {
          cod_voucher?: string | null
          created?: string
          curs_interes?: string | null
          data_callback_dorit?: string | null
          data_conversie?: string | null
          data_followup?: string | null
          data_nasterii?: string | null
          data_programare?: string | null
          email?: string | null
          flag_reminder?: boolean
          flag_reminder_at?: string | null
          flag_streak?: number
          grupa_varsta?: Database["public"]["Enums"]["grupa_lead"] | null
          id?: string
          id_client?: string | null
          interes?: Database["public"]["Enums"]["interes_lead"] | null
          locatia?: string | null
          motiv_pierdut?: string | null
          nr_contactari?: number
          nr_neprezentari?: number
          nume: string
          nume_parinte?: string | null
          observatii?: string | null
          opt_out_la?: string | null
          opt_out_marketing?: boolean
          opt_out_motiv?: string | null
          prenume?: string | null
          responsabil_id?: string | null
          sexul?: Database["public"]["Enums"]["sex"] | null
          status?: Database["public"]["Enums"]["status_lead"]
          sub_status?: Database["public"]["Enums"]["sub_status_lead"] | null
          sursa?: string | null
          telefon?: string | null
          ultima_contactare_la?: string | null
          updated?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          varsta?: number | null
        }
        Update: {
          cod_voucher?: string | null
          created?: string
          curs_interes?: string | null
          data_callback_dorit?: string | null
          data_conversie?: string | null
          data_followup?: string | null
          data_nasterii?: string | null
          data_programare?: string | null
          email?: string | null
          flag_reminder?: boolean
          flag_reminder_at?: string | null
          flag_streak?: number
          grupa_varsta?: Database["public"]["Enums"]["grupa_lead"] | null
          id?: string
          id_client?: string | null
          interes?: Database["public"]["Enums"]["interes_lead"] | null
          locatia?: string | null
          motiv_pierdut?: string | null
          nr_contactari?: number
          nr_neprezentari?: number
          nume?: string
          nume_parinte?: string | null
          observatii?: string | null
          opt_out_la?: string | null
          opt_out_marketing?: boolean
          opt_out_motiv?: string | null
          prenume?: string | null
          responsabil_id?: string | null
          sexul?: Database["public"]["Enums"]["sex"] | null
          status?: Database["public"]["Enums"]["status_lead"]
          sub_status?: Database["public"]["Enums"]["sub_status_lead"] | null
          sursa?: string | null
          telefon?: string | null
          ultima_contactare_la?: string | null
          updated?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          varsta?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_leads_id_client"
            columns: ["id_client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_leads_id_client"
            columns: ["id_client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_leads_id_client"
            columns: ["id_client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "fk_leads_id_client"
            columns: ["id_client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_leads_id_client"
            columns: ["id_client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_leads_id_client"
            columns: ["id_client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_leads_id_client"
            columns: ["id_client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_leads_sursa"
            columns: ["sursa"]
            isOneToOne: false
            referencedRelation: "campanii_promovare"
            referencedColumns: ["id"]
          },
        ]
      }
      locatii: {
        Row: {
          adresa: string | null
          created: string
          id: string
          link_maps: string | null
          nume: string
          ora_inchidere: string
          telefon: string | null
          updated: string
        }
        Insert: {
          adresa?: string | null
          created?: string
          id?: string
          link_maps?: string | null
          nume: string
          ora_inchidere?: string
          telefon?: string | null
          updated?: string
        }
        Update: {
          adresa?: string | null
          created?: string
          id?: string
          link_maps?: string | null
          nume?: string
          ora_inchidere?: string
          telefon?: string | null
          updated?: string
        }
        Relationships: []
      }
      motivari_absenta: {
        Row: {
          absente: number
          aprobat_de: string | null
          client: string
          created: string
          document: string | null
          enrollment: string
          id: string
          luna: string
          observatii: string | null
          prag: number
          scutit: boolean
        }
        Insert: {
          absente?: number
          aprobat_de?: string | null
          client: string
          created?: string
          document?: string | null
          enrollment: string
          id?: string
          luna: string
          observatii?: string | null
          prag?: number
          scutit?: boolean
        }
        Update: {
          absente?: number
          aprobat_de?: string | null
          client?: string
          created?: string
          document?: string | null
          enrollment?: string
          id?: string
          luna?: string
          observatii?: string | null
          prag?: number
          scutit?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "motivari_absenta_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motivari_absenta_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motivari_absenta_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "motivari_absenta_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "motivari_absenta_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motivari_absenta_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "motivari_absenta_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "motivari_absenta_document_fkey"
            columns: ["document"]
            isOneToOne: false
            referencedRelation: "documente_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motivari_absenta_enrollment_fkey"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motivari_absenta_enrollment_fkey"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_inrolare"]
          },
          {
            foreignKeyName: "motivari_absenta_enrollment_fkey"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_enrollment"]
          },
        ]
      }
      netopia_orders: {
        Row: {
          amount: number
          auth_user_id: string
          client_id: string
          created: string
          eveniment_id: string | null
          fgo_emitat: string | null
          fgo_factura: string | null
          fifo_plan: Json
          id: string
          netopia_transaction_id: string | null
          nr_bilete: number | null
          order_ref: string
          order_type: string
          rezervare_id: string | null
          status: string
          updated: string
          voucher_id: string | null
        }
        Insert: {
          amount: number
          auth_user_id: string
          client_id: string
          created?: string
          eveniment_id?: string | null
          fgo_emitat?: string | null
          fgo_factura?: string | null
          fifo_plan: Json
          id?: string
          netopia_transaction_id?: string | null
          nr_bilete?: number | null
          order_ref: string
          order_type?: string
          rezervare_id?: string | null
          status?: string
          updated?: string
          voucher_id?: string | null
        }
        Update: {
          amount?: number
          auth_user_id?: string
          client_id?: string
          created?: string
          eveniment_id?: string | null
          fgo_emitat?: string | null
          fgo_factura?: string | null
          fifo_plan?: Json
          id?: string
          netopia_transaction_id?: string | null
          nr_bilete?: number | null
          order_ref?: string
          order_type?: string
          rezervare_id?: string | null
          status?: string
          updated?: string
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "netopia_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "netopia_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "netopia_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "netopia_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "netopia_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "netopia_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "netopia_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "netopia_orders_eveniment_id_fkey"
            columns: ["eveniment_id"]
            isOneToOne: false
            referencedRelation: "bilete_publice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "netopia_orders_eveniment_id_fkey"
            columns: ["eveniment_id"]
            isOneToOne: false
            referencedRelation: "evenimente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "netopia_orders_rezervare_id_fkey"
            columns: ["rezervare_id"]
            isOneToOne: false
            referencedRelation: "open_rezervari"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "netopia_orders_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchere"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          payload: Json | null
          read_at: string | null
          recipient_user_id: string
          requires_action: boolean
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          payload?: Json | null
          read_at?: string | null
          recipient_user_id: string
          requires_action?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          payload?: Json | null
          read_at?: string | null
          recipient_user_id?: string
          requires_action?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      open_rezervari: {
        Row: {
          anulat_at: string | null
          anulat_motiv: string | null
          client: string
          created: string
          enrollment: string | null
          id: string
          incasare: string | null
          sesiune: string
          status: Database["public"]["Enums"]["status_rezervare"]
          suma: number | null
        }
        Insert: {
          anulat_at?: string | null
          anulat_motiv?: string | null
          client: string
          created?: string
          enrollment?: string | null
          id?: string
          incasare?: string | null
          sesiune: string
          status?: Database["public"]["Enums"]["status_rezervare"]
          suma?: number | null
        }
        Update: {
          anulat_at?: string | null
          anulat_motiv?: string | null
          client?: string
          created?: string
          enrollment?: string | null
          id?: string
          incasare?: string | null
          sesiune?: string
          status?: Database["public"]["Enums"]["status_rezervare"]
          suma?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "open_rezervari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_rezervari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_rezervari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "open_rezervari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "open_rezervari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_rezervari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "open_rezervari_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "open_rezervari_enrollment_fkey"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_rezervari_enrollment_fkey"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_inrolare"]
          },
          {
            foreignKeyName: "open_rezervari_enrollment_fkey"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_enrollment"]
          },
          {
            foreignKeyName: "open_rezervari_incasare_fkey"
            columns: ["incasare"]
            isOneToOne: false
            referencedRelation: "incasari"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_rezervari_incasare_fkey"
            columns: ["incasare"]
            isOneToOne: false
            referencedRelation: "lista_incasari"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_rezervari_sesiune_fkey"
            columns: ["sesiune"]
            isOneToOne: false
            referencedRelation: "open_sesiuni"
            referencedColumns: ["id"]
          },
        ]
      }
      open_sesiuni: {
        Row: {
          capacitate: number
          created: string
          curs: string
          data: string
          id: string
          instructor: string | null
          observatii: string | null
          status: string
        }
        Insert: {
          capacitate?: number
          created?: string
          curs: string
          data: string
          id?: string
          instructor?: string | null
          observatii?: string | null
          status?: string
        }
        Update: {
          capacitate?: number
          created?: string
          curs?: string
          data?: string
          id?: string
          instructor?: string | null
          observatii?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "open_sesiuni_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_sesiuni_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "open_sesiuni_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "open_sesiuni_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_sesiuni_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "open_sesiuni_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "open_sesiuni_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "open_sesiuni_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "open_sesiuni_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "open_sesiuni_instructor_fkey"
            columns: ["instructor"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "open_sesiuni_instructor_fkey"
            columns: ["instructor"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "open_sesiuni_instructor_fkey"
            columns: ["instructor"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "open_sesiuni_instructor_fkey"
            columns: ["instructor"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "open_sesiuni_instructor_fkey"
            columns: ["instructor"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "open_sesiuni_instructor_fkey"
            columns: ["instructor"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
        ]
      }
      organizatie_firme: {
        Row: {
          auto_factura_portal: boolean
          capital: number | null
          cota_tva: number
          created: string
          cui: string | null
          factureaza: boolean
          ibans: string[]
          id: string
          judet: string | null
          localitate: string | null
          nume: string
          observatii: string | null
          registru_comert: string | null
          serie: string | null
          tip_factura: string
          updated: string
        }
        Insert: {
          auto_factura_portal?: boolean
          capital?: number | null
          cota_tva?: number
          created?: string
          cui?: string | null
          factureaza?: boolean
          ibans?: string[]
          id?: string
          judet?: string | null
          localitate?: string | null
          nume: string
          observatii?: string | null
          registru_comert?: string | null
          serie?: string | null
          tip_factura?: string
          updated?: string
        }
        Update: {
          auto_factura_portal?: boolean
          capital?: number | null
          cota_tva?: number
          created?: string
          cui?: string | null
          factureaza?: boolean
          ibans?: string[]
          id?: string
          judet?: string | null
          localitate?: string | null
          nume?: string
          observatii?: string | null
          registru_comert?: string | null
          serie?: string | null
          tip_factura?: string
          updated?: string
        }
        Relationships: []
      }
      parametri_aplicatie: {
        Row: {
          created: string
          id: string
          titlu: string
          updated: string
          valoare: string | null
        }
        Insert: {
          created?: string
          id?: string
          titlu: string
          updated?: string
          valoare?: string | null
        }
        Update: {
          created?: string
          id?: string
          titlu?: string
          updated?: string
          valoare?: string | null
        }
        Relationships: []
      }
      portal_accounts: {
        Row: {
          created_at: string
          email: string
          failed_attempts: number
          id: string
          last_login_at: string | null
          locked_until: string | null
          password_hash: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          failed_attempts?: number
          id?: string
          last_login_at?: string | null
          locked_until?: string | null
          password_hash: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          failed_attempts?: number
          id?: string
          last_login_at?: string | null
          locked_until?: string | null
          password_hash?: string
          status?: string
        }
        Relationships: []
      }
      portal_reset_tokens: {
        Row: {
          account_id: string
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_reset_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_sessions: {
        Row: {
          account_id: string
          created_at: string
          expires_at: string
          id: string
          last_used_at: string | null
          token_hash: string
        }
        Insert: {
          account_id: string
          created_at?: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          token_hash: string
        }
        Update: {
          account_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      prezente: {
        Row: {
          client: string | null
          created: string
          data: string | null
          enrollment: string | null
          id: string
          status: Database["public"]["Enums"]["status_prezenta"] | null
          updated: string
        }
        Insert: {
          client?: string | null
          created?: string
          data?: string | null
          enrollment?: string | null
          id?: string
          status?: Database["public"]["Enums"]["status_prezenta"] | null
          updated?: string
        }
        Update: {
          client?: string | null
          created?: string
          data?: string | null
          enrollment?: string | null
          id?: string
          status?: Database["public"]["Enums"]["status_prezenta"] | null
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_prezente_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_prezente_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_prezente_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "fk_prezente_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_prezente_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_prezente_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_prezente_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_prezente_enrollment"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_prezente_enrollment"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_inrolare"]
          },
          {
            foreignKeyName: "fk_prezente_enrollment"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_enrollment"]
          },
        ]
      }
      programari_leads: {
        Row: {
          created: string
          cursul_programat: string | null
          data_programarii: string | null
          eveniment_programat: string | null
          id: string
          interes: Database["public"]["Enums"]["interes_programare"] | null
          lead: string | null
          locatie: string | null
          observatii: string | null
          ora: string | null
          prezenta: Database["public"]["Enums"]["prezenta_lead"]
          updated: string
        }
        Insert: {
          created?: string
          cursul_programat?: string | null
          data_programarii?: string | null
          eveniment_programat?: string | null
          id?: string
          interes?: Database["public"]["Enums"]["interes_programare"] | null
          lead?: string | null
          locatie?: string | null
          observatii?: string | null
          ora?: string | null
          prezenta?: Database["public"]["Enums"]["prezenta_lead"]
          updated?: string
        }
        Update: {
          created?: string
          cursul_programat?: string | null
          data_programarii?: string | null
          eveniment_programat?: string | null
          id?: string
          interes?: Database["public"]["Enums"]["interes_programare"] | null
          lead?: string | null
          locatie?: string | null
          observatii?: string | null
          ora?: string | null
          prezenta?: Database["public"]["Enums"]["prezenta_lead"]
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_progr_curs"
            columns: ["cursul_programat"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_progr_curs"
            columns: ["cursul_programat"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_progr_curs"
            columns: ["cursul_programat"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_progr_curs"
            columns: ["cursul_programat"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_progr_curs"
            columns: ["cursul_programat"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_progr_curs"
            columns: ["cursul_programat"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_progr_curs"
            columns: ["cursul_programat"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_progr_curs"
            columns: ["cursul_programat"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_progr_curs"
            columns: ["cursul_programat"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "fk_progr_lead"
            columns: ["lead"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_progr_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_progr_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_progr_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_progr_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_progr_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_progr_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "programari_leads_eveniment_programat_fkey"
            columns: ["eveniment_programat"]
            isOneToOne: false
            referencedRelation: "bilete_publice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programari_leads_eveniment_programat_fkey"
            columns: ["eveniment_programat"]
            isOneToOne: false
            referencedRelation: "evenimente"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecti: {
        Row: {
          campanie: string | null
          convertit: boolean
          created: string
          detalii: string | null
          email: string | null
          id: string
          nume: string
          status: Database["public"]["Enums"]["status_prospect"] | null
          sursa: Database["public"]["Enums"]["sursa_prospect"] | null
          telefon: string | null
          ultimul_contact: string | null
          updated: string
        }
        Insert: {
          campanie?: string | null
          convertit?: boolean
          created?: string
          detalii?: string | null
          email?: string | null
          id?: string
          nume: string
          status?: Database["public"]["Enums"]["status_prospect"] | null
          sursa?: Database["public"]["Enums"]["sursa_prospect"] | null
          telefon?: string | null
          ultimul_contact?: string | null
          updated?: string
        }
        Update: {
          campanie?: string | null
          convertit?: boolean
          created?: string
          detalii?: string | null
          email?: string | null
          id?: string
          nume?: string
          status?: Database["public"]["Enums"]["status_prospect"] | null
          sursa?: Database["public"]["Enums"]["sursa_prospect"] | null
          telefon?: string | null
          ultimul_contact?: string | null
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_prospecti_campanie"
            columns: ["campanie"]
            isOneToOne: false
            referencedRelation: "campanii_promovare"
            referencedColumns: ["id"]
          },
        ]
      }
      qbot_kb: {
        Row: {
          activ: boolean
          audienta: string
          categorie: string
          continut: string
          id: string
          pagina: string | null
          rol_necesar: string | null
          titlu: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activ?: boolean
          audienta: string
          categorie: string
          continut: string
          id?: string
          pagina?: string | null
          rol_necesar?: string | null
          titlu: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activ?: boolean
          audienta?: string
          categorie?: string
          continut?: string
          id?: string
          pagina?: string | null
          rol_necesar?: string | null
          titlu?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      reconcilieri_cash: {
        Row: {
          created: string
          created_by: string | null
          data: string
          de_depus: number
          denominatii: Json
          fond_inceput: number
          fond_ramas: number
          id: string
          locatie: string | null
          notite: string | null
          total_numarat: number
          total_sistem: number
          updated: string
        }
        Insert: {
          created?: string
          created_by?: string | null
          data: string
          de_depus?: number
          denominatii?: Json
          fond_inceput?: number
          fond_ramas?: number
          id?: string
          locatie?: string | null
          notite?: string | null
          total_numarat?: number
          total_sistem?: number
          updated?: string
        }
        Update: {
          created?: string
          created_by?: string | null
          data?: string
          de_depus?: number
          denominatii?: Json
          fond_inceput?: number
          fond_ramas?: number
          id?: string
          locatie?: string | null
          notite?: string | null
          total_numarat?: number
          total_sistem?: number
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconcilieri_cash_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "reconcilieri_cash_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconcilieri_cash_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "reconcilieri_cash_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "reconcilieri_cash_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "reconcilieri_cash_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
        ]
      }
      reinscrieri_gate: {
        Row: {
          act_canal: string | null
          act_semnat_la: string | null
          act_status: string
          act_verificat_de: string | null
          act_verificat_la: string | null
          activat_la: string | null
          campanie_id: string
          client_id: string
          created: string
          curs_tinta_id: string
          document_link: string | null
          enrollment_id: string | null
          esemneaza_request_id: string | null
          id: string
          taxa_incasare_id: string | null
          taxa_platita_la: string | null
          updated: string
        }
        Insert: {
          act_canal?: string | null
          act_semnat_la?: string | null
          act_status?: string
          act_verificat_de?: string | null
          act_verificat_la?: string | null
          activat_la?: string | null
          campanie_id: string
          client_id: string
          created?: string
          curs_tinta_id: string
          document_link?: string | null
          enrollment_id?: string | null
          esemneaza_request_id?: string | null
          id?: string
          taxa_incasare_id?: string | null
          taxa_platita_la?: string | null
          updated?: string
        }
        Update: {
          act_canal?: string | null
          act_semnat_la?: string | null
          act_status?: string
          act_verificat_de?: string | null
          act_verificat_la?: string | null
          activat_la?: string | null
          campanie_id?: string
          client_id?: string
          created?: string
          curs_tinta_id?: string
          document_link?: string | null
          enrollment_id?: string | null
          esemneaza_request_id?: string | null
          id?: string
          taxa_incasare_id?: string | null
          taxa_platita_la?: string | null
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "reinscrieri_gate_campanie_id_fkey"
            columns: ["campanie_id"]
            isOneToOne: false
            referencedRelation: "campanii_reinscriere"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reinscrieri_gate_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reinscrieri_gate_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reinscrieri_gate_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "reinscrieri_gate_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "reinscrieri_gate_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reinscrieri_gate_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "reinscrieri_gate_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "reinscrieri_gate_curs_tinta_id_fkey"
            columns: ["curs_tinta_id"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reinscrieri_gate_curs_tinta_id_fkey"
            columns: ["curs_tinta_id"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "reinscrieri_gate_curs_tinta_id_fkey"
            columns: ["curs_tinta_id"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "reinscrieri_gate_curs_tinta_id_fkey"
            columns: ["curs_tinta_id"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reinscrieri_gate_curs_tinta_id_fkey"
            columns: ["curs_tinta_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "reinscrieri_gate_curs_tinta_id_fkey"
            columns: ["curs_tinta_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "reinscrieri_gate_curs_tinta_id_fkey"
            columns: ["curs_tinta_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "reinscrieri_gate_curs_tinta_id_fkey"
            columns: ["curs_tinta_id"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "reinscrieri_gate_curs_tinta_id_fkey"
            columns: ["curs_tinta_id"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "reinscrieri_gate_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reinscrieri_gate_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_inrolare"]
          },
          {
            foreignKeyName: "reinscrieri_gate_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_enrollment"]
          },
          {
            foreignKeyName: "reinscrieri_gate_taxa_incasare_id_fkey"
            columns: ["taxa_incasare_id"]
            isOneToOne: false
            referencedRelation: "incasari"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reinscrieri_gate_taxa_incasare_id_fkey"
            columns: ["taxa_incasare_id"]
            isOneToOne: false
            referencedRelation: "lista_incasari"
            referencedColumns: ["id"]
          },
        ]
      }
      salarii_teacher: {
        Row: {
          anul: number
          breakdown: Json
          created: string
          data_plata: string | null
          id: string
          luna: number
          status: string
          teacher: string
          total: number
          updated: string
        }
        Insert: {
          anul: number
          breakdown?: Json
          created?: string
          data_plata?: string | null
          id?: string
          luna: number
          status?: string
          teacher: string
          total?: number
          updated?: string
        }
        Update: {
          anul?: number
          breakdown?: Json
          created?: string
          data_plata?: string | null
          id?: string
          luna?: number
          status?: string
          teacher?: string
          total?: number
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "salarii_teacher_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "salarii_teacher_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "salarii_teacher_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salarii_teacher_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "salarii_teacher_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "salarii_teacher_teacher_fkey"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
        ]
      }
      sali: {
        Row: {
          capacitate: number | null
          created: string
          id: string
          locatie: string | null
          nume: string
          old_loc_id: number | null
          updated: string
        }
        Insert: {
          capacitate?: number | null
          created?: string
          id?: string
          locatie?: string | null
          nume: string
          old_loc_id?: number | null
          updated?: string
        }
        Update: {
          capacitate?: number | null
          created?: string
          id?: string
          locatie?: string | null
          nume?: string
          old_loc_id?: number | null
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
        ]
      }
      scorecard_obiective: {
        Row: {
          luna: string
          metric: string
          target: number
          updated: string
        }
        Insert: {
          luna: string
          metric: string
          target: number
          updated?: string
        }
        Update: {
          luna?: string
          metric?: string
          target?: number
          updated?: string
        }
        Relationships: []
      }
      scorecard_praguri: {
        Row: {
          cheie: string
          descriere: string | null
          directie: string
          eticheta: string
          faza: number
          pondere: number
          prag_peste: number
          prag_standard: number
          scorat: boolean
          unitate: string
          updated: string
        }
        Insert: {
          cheie: string
          descriere?: string | null
          directie?: string
          eticheta: string
          faza?: number
          pondere?: number
          prag_peste: number
          prag_standard: number
          scorat?: boolean
          unitate: string
          updated?: string
        }
        Update: {
          cheie?: string
          descriere?: string | null
          directie?: string
          eticheta?: string
          faza?: number
          pondere?: number
          prag_peste?: number
          prag_standard?: number
          scorat?: boolean
          unitate?: string
          updated?: string
        }
        Relationships: []
      }
      sezoane: {
        Row: {
          activ: boolean
          created: string
          data_final: string | null
          data_incepere: string | null
          id: string
          numele_sezonului: string
          scadenta_prima_rata: string | null
          scadenta_ultima_rata: string | null
          stare: string
          tip: string
          updated: string
        }
        Insert: {
          activ?: boolean
          created?: string
          data_final?: string | null
          data_incepere?: string | null
          id?: string
          numele_sezonului: string
          scadenta_prima_rata?: string | null
          scadenta_ultima_rata?: string | null
          stare?: string
          tip?: string
          updated?: string
        }
        Update: {
          activ?: boolean
          created?: string
          data_final?: string | null
          data_incepere?: string | null
          id?: string
          numele_sezonului?: string
          scadenta_prima_rata?: string | null
          scadenta_ultima_rata?: string | null
          stare?: string
          tip?: string
          updated?: string
        }
        Relationships: []
      }
      situatie_sms_uri: {
        Row: {
          clienti_vizati: string[]
          cod_mesaj: string | null
          created: string
          data_planificata: string | null
          data_trimitere: string | null
          id: string
          locatie: string | null
          mesaj: string | null
          status: Database["public"]["Enums"]["status_sms"] | null
          telefon: string | null
          updated: string
        }
        Insert: {
          clienti_vizati?: string[]
          cod_mesaj?: string | null
          created?: string
          data_planificata?: string | null
          data_trimitere?: string | null
          id?: string
          locatie?: string | null
          mesaj?: string | null
          status?: Database["public"]["Enums"]["status_sms"] | null
          telefon?: string | null
          updated?: string
        }
        Update: {
          clienti_vizati?: string[]
          cod_mesaj?: string | null
          created?: string
          data_planificata?: string | null
          data_trimitere?: string | null
          id?: string
          locatie?: string | null
          mesaj?: string | null
          status?: Database["public"]["Enums"]["status_sms"] | null
          telefon?: string | null
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_sms_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sms_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sms_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sms_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sms_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sms_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
        ]
      }
      sms_amanate: {
        Row: {
          created: string
          error: string | null
          id: string
          lead_id: string | null
          mesaj: string
          send_after: string
          status: string
          telefon: string
          tip: string | null
          trimis_la: string | null
        }
        Insert: {
          created?: string
          error?: string | null
          id?: string
          lead_id?: string | null
          mesaj: string
          send_after?: string
          status?: string
          telefon: string
          tip?: string | null
          trimis_la?: string | null
        }
        Update: {
          created?: string
          error?: string | null
          id?: string
          lead_id?: string | null
          mesaj?: string
          send_after?: string
          status?: string
          telefon?: string
          tip?: string | null
          trimis_la?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_amanate_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          error: string | null
          id: string
          lead_id: string | null
          mesaj: string | null
          status: string
          telefon: string | null
          tip: string
          trimis_la: string
        }
        Insert: {
          error?: string | null
          id?: string
          lead_id?: string | null
          mesaj?: string | null
          status?: string
          telefon?: string | null
          tip: string
          trimis_la?: string
        }
        Update: {
          error?: string | null
          id?: string
          lead_id?: string | null
          mesaj?: string | null
          status?: string
          telefon?: string | null
          tip?: string
          trimis_la?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      spectacol_act_performeri: {
        Row: {
          act: string
          client: string
          created: string
          id: string
        }
        Insert: {
          act: string
          client: string
          created?: string
          id?: string
        }
        Update: {
          act?: string
          client?: string
          created?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spectacol_act_performeri_act_fkey"
            columns: ["act"]
            isOneToOne: false
            referencedRelation: "spectacol_acte"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectacol_act_performeri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectacol_act_performeri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectacol_act_performeri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "spectacol_act_performeri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "spectacol_act_performeri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectacol_act_performeri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "spectacol_act_performeri_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
        ]
      }
      spectacol_acte: {
        Row: {
          created: string
          curs: string | null
          durata_min: number | null
          id: string
          note: string | null
          ordine: number
          responsabil: string | null
          spectacol: string
          titlu: string
        }
        Insert: {
          created?: string
          curs?: string | null
          durata_min?: number | null
          id?: string
          note?: string | null
          ordine?: number
          responsabil?: string | null
          spectacol: string
          titlu: string
        }
        Update: {
          created?: string
          curs?: string | null
          durata_min?: number | null
          id?: string
          note?: string | null
          ordine?: number
          responsabil?: string | null
          spectacol?: string
          titlu?: string
        }
        Relationships: [
          {
            foreignKeyName: "spectacol_acte_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectacol_acte_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "spectacol_acte_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "spectacol_acte_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectacol_acte_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "spectacol_acte_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "spectacol_acte_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "spectacol_acte_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "spectacol_acte_curs_fkey"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "spectacol_acte_responsabil_fkey"
            columns: ["responsabil"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "spectacol_acte_responsabil_fkey"
            columns: ["responsabil"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "spectacol_acte_responsabil_fkey"
            columns: ["responsabil"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectacol_acte_responsabil_fkey"
            columns: ["responsabil"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "spectacol_acte_responsabil_fkey"
            columns: ["responsabil"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "spectacol_acte_responsabil_fkey"
            columns: ["responsabil"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectacol_acte_spectacol_fkey"
            columns: ["spectacol"]
            isOneToOne: false
            referencedRelation: "spectacole"
            referencedColumns: ["id"]
          },
        ]
      }
      spectacole: {
        Row: {
          created: string
          data: string | null
          eveniment: string | null
          id: string
          locatie: string | null
          note: string | null
          nume: string
          ora: string | null
          sezon: string | null
          status: Database["public"]["Enums"]["status_spectacol"]
          updated: string
        }
        Insert: {
          created?: string
          data?: string | null
          eveniment?: string | null
          id?: string
          locatie?: string | null
          note?: string | null
          nume: string
          ora?: string | null
          sezon?: string | null
          status?: Database["public"]["Enums"]["status_spectacol"]
          updated?: string
        }
        Update: {
          created?: string
          data?: string | null
          eveniment?: string | null
          id?: string
          locatie?: string | null
          note?: string | null
          nume?: string
          ora?: string | null
          sezon?: string | null
          status?: Database["public"]["Enums"]["status_spectacol"]
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "spectacole_eveniment_fkey"
            columns: ["eveniment"]
            isOneToOne: false
            referencedRelation: "bilete_publice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectacole_eveniment_fkey"
            columns: ["eveniment"]
            isOneToOne: false
            referencedRelation: "evenimente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spectacole_sezon_fkey"
            columns: ["sezon"]
            isOneToOne: false
            referencedRelation: "sezoane"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_pontaj: {
        Row: {
          created: string
          end_at: string | null
          id: string
          locatie_id: string | null
          source: string | null
          start_at: string
          user_id: string
        }
        Insert: {
          created?: string
          end_at?: string | null
          id?: string
          locatie_id?: string | null
          source?: string | null
          start_at?: string
          user_id: string
        }
        Update: {
          created?: string
          end_at?: string | null
          id?: string
          locatie_id?: string | null
          source?: string | null
          start_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_pontaj_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "staff_pontaj_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_pontaj_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "staff_pontaj_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "staff_pontaj_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "staff_pontaj_locatie_id_fkey"
            columns: ["locatie_id"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
        ]
      }
      tarife_inchiriere: {
        Row: {
          id: string
          increment_30: number | null
          pret_120: number | null
          pret_60: number | null
          pret_90: number | null
          sala: string
          tier: Database["public"]["Enums"]["tier_inchiriere"]
          updated: string
        }
        Insert: {
          id?: string
          increment_30?: number | null
          pret_120?: number | null
          pret_60?: number | null
          pret_90?: number | null
          sala: string
          tier: Database["public"]["Enums"]["tier_inchiriere"]
          updated?: string
        }
        Update: {
          id?: string
          increment_30?: number | null
          pret_120?: number | null
          pret_60?: number | null
          pret_90?: number | null
          sala?: string
          tier?: Database["public"]["Enums"]["tier_inchiriere"]
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarife_inchiriere_sala_fkey"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "incasari_sala_luna"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "tarife_inchiriere_sala_fkey"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "tarife_inchiriere_sala_fkey"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "tarife_inchiriere_sala_fkey"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "restante_sala_luna"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "tarife_inchiriere_sala_fkey"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "sali"
            referencedColumns: ["id"]
          },
        ]
      }
      tarife_publice: {
        Row: {
          activ: boolean
          created: string
          descriere: string | null
          id: string
          ordine: number
          pret: string
          program: string
          taxa_rezervare: string | null
          updated: string
        }
        Insert: {
          activ?: boolean
          created?: string
          descriere?: string | null
          id?: string
          ordine?: number
          pret: string
          program: string
          taxa_rezervare?: string | null
          updated?: string
        }
        Update: {
          activ?: boolean
          created?: string
          descriere?: string | null
          id?: string
          ordine?: number
          pret?: string
          program?: string
          taxa_rezervare?: string | null
          updated?: string
        }
        Relationships: []
      }
      teacheri: {
        Row: {
          arhivat: boolean
          auth_user_id: string | null
          created: string
          data_nasterii: string | null
          email: string | null
          id: string
          link_contract: string | null
          marime_tricou: Database["public"]["Enums"]["marime_tricou"] | null
          model_salariu: string | null
          nivelul: Database["public"]["Enums"]["nivel_teacher"] | null
          nume: string
          observatii: string | null
          old_teacher_id: number | null
          poza: string | null
          prenume: string | null
          telefon: string | null
          updated: string
        }
        Insert: {
          arhivat?: boolean
          auth_user_id?: string | null
          created?: string
          data_nasterii?: string | null
          email?: string | null
          id?: string
          link_contract?: string | null
          marime_tricou?: Database["public"]["Enums"]["marime_tricou"] | null
          model_salariu?: string | null
          nivelul?: Database["public"]["Enums"]["nivel_teacher"] | null
          nume: string
          observatii?: string | null
          old_teacher_id?: number | null
          poza?: string | null
          prenume?: string | null
          telefon?: string | null
          updated?: string
        }
        Update: {
          arhivat?: boolean
          auth_user_id?: string | null
          created?: string
          data_nasterii?: string | null
          email?: string | null
          id?: string
          link_contract?: string | null
          marime_tricou?: Database["public"]["Enums"]["marime_tricou"] | null
          model_salariu?: string | null
          nivelul?: Database["public"]["Enums"]["nivel_teacher"] | null
          nume?: string
          observatii?: string | null
          old_teacher_id?: number | null
          poza?: string | null
          prenume?: string | null
          telefon?: string | null
          updated?: string
        }
        Relationships: []
      }
      vacante: {
        Row: {
          created: string
          data_final: string
          data_incepere: string
          id: string
          nume: string
          sezon_id: string
          updated: string
        }
        Insert: {
          created?: string
          data_final: string
          data_incepere: string
          id?: string
          nume: string
          sezon_id: string
          updated?: string
        }
        Update: {
          created?: string
          data_final?: string
          data_incepere?: string
          id?: string
          nume?: string
          sezon_id?: string
          updated?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacante_sezon_id_fkey"
            columns: ["sezon_id"]
            isOneToOne: false
            referencedRelation: "sezoane"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_redemptions: {
        Row: {
          client: string
          created: string
          enrollment: string | null
          id: string
          incasare: string | null
          voucher: string
        }
        Insert: {
          client: string
          created?: string
          enrollment?: string | null
          id?: string
          incasare?: string | null
          voucher: string
        }
        Update: {
          client?: string
          created?: string
          enrollment?: string | null
          id?: string
          incasare?: string | null
          voucher?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "voucher_redemptions_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "voucher_redemptions_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "voucher_redemptions_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "voucher_redemptions_enrollment_fkey"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_enrollment_fkey"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_inrolare"]
          },
          {
            foreignKeyName: "voucher_redemptions_enrollment_fkey"
            columns: ["enrollment"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_enrollment"]
          },
          {
            foreignKeyName: "voucher_redemptions_incasare_fkey"
            columns: ["incasare"]
            isOneToOne: false
            referencedRelation: "incasari"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_incasare_fkey"
            columns: ["incasare"]
            isOneToOne: false
            referencedRelation: "lista_incasari"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_voucher_fkey"
            columns: ["voucher"]
            isOneToOne: false
            referencedRelation: "vouchere"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchere: {
        Row: {
          cerinta_eligibilitate: string | null
          client: string | null
          cod_voucher: string
          created: string
          curs: string | null
          data_expirarii: string | null
          data_inceperii: string | null
          descriere: string | null
          id: string
          limita_per_client: number | null
          numar_utilizari: number | null
          tip: Database["public"]["Enums"]["tip_voucher"] | null
          tip_enrollment: Database["public"]["Enums"]["tip_plata"] | null
          updated: string
          valoare: number | null
        }
        Insert: {
          cerinta_eligibilitate?: string | null
          client?: string | null
          cod_voucher: string
          created?: string
          curs?: string | null
          data_expirarii?: string | null
          data_inceperii?: string | null
          descriere?: string | null
          id?: string
          limita_per_client?: number | null
          numar_utilizari?: number | null
          tip?: Database["public"]["Enums"]["tip_voucher"] | null
          tip_enrollment?: Database["public"]["Enums"]["tip_plata"] | null
          updated?: string
          valoare?: number | null
        }
        Update: {
          cerinta_eligibilitate?: string | null
          client?: string | null
          cod_voucher?: string
          created?: string
          curs?: string | null
          data_expirarii?: string | null
          data_inceperii?: string | null
          descriere?: string | null
          id?: string
          limita_per_client?: number | null
          numar_utilizari?: number | null
          tip?: Database["public"]["Enums"]["tip_voucher"] | null
          tip_enrollment?: Database["public"]["Enums"]["tip_plata"] | null
          updated?: string
          valoare?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_vouchere_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_vouchere_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_vouchere_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "fk_vouchere_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_vouchere_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_vouchere_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_vouchere_client"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "fk_vouchere_curs"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_vouchere_curs"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_vouchere_curs"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_vouchere_curs"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_vouchere_curs"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_vouchere_curs"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_vouchere_curs"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_vouchere_curs"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_vouchere_curs"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
        ]
      }
    }
    Views: {
      bilete_publice: {
        Row: {
          capacitate: number | null
          data: string | null
          descriere: string | null
          id: string | null
          locatie: string | null
          nume: string | null
          pret_bilet: number | null
        }
        Insert: {
          capacitate?: number | null
          data?: string | null
          descriere?: string | null
          id?: string | null
          locatie?: string | null
          nume?: string | null
          pret_bilet?: number | null
        }
        Update: {
          capacitate?: number | null
          data?: string | null
          descriere?: string | null
          id?: string | null
          locatie?: string | null
          nume?: string | null
          pret_bilet?: number | null
        }
        Relationships: []
      }
      clienti_unici: {
        Row: {
          clients: string | null
          id: string | null
          unique_clients: number | null
        }
        Relationships: []
      }
      datorii_rest: {
        Row: {
          articol_inventar: string | null
          bilet: string | null
          bucati: number | null
          categorie: Database["public"]["Enums"]["categorie_incasare"] | null
          client: string | null
          created: string | null
          descriere: string | null
          id: string | null
          locatie: string | null
          nume: string | null
          platit: number | null
          prenume: string | null
          rest: number | null
          sezon: string | null
          suma_datorata: number | null
        }
        Relationships: [
          {
            foreignKeyName: "datorii_articol_inventar_fkey"
            columns: ["articol_inventar"]
            isOneToOne: false
            referencedRelation: "inventar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_articol_inventar_fkey"
            columns: ["articol_inventar"]
            isOneToOne: false
            referencedRelation: "produse_publice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_bilet_fkey"
            columns: ["bilet"]
            isOneToOne: false
            referencedRelation: "bilete_publice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_bilet_fkey"
            columns: ["bilet"]
            isOneToOne: false
            referencedRelation: "evenimente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "inrolari_clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_client"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "datorii_client_fkey"
            columns: ["client"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_cursant"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "datorii_locatie_fkey"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "datorii_sezon_fkey"
            columns: ["sezon"]
            isOneToOne: false
            referencedRelation: "sezoane"
            referencedColumns: ["id"]
          },
        ]
      }
      de_incasat_pe_luna: {
        Row: {
          curs: string | null
          de_incasat: number | null
          id: number | null
          locatie: string | null
          luna: string | null
          sala: string | null
          teacher: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "incasari_sala_luna"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "restante_sala_luna"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "sali"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
        ]
      }
      incasari_curs_luna: {
        Row: {
          id: number | null
          id_curs: string | null
          luna: string | null
          nume_curs: string | null
          total: number | null
        }
        Relationships: []
      }
      incasari_locatie_luna: {
        Row: {
          id: number | null
          id_locatie: string | null
          luna: string | null
          nume_locatie: string | null
          total: number | null
        }
        Relationships: []
      }
      incasari_sala_luna: {
        Row: {
          id: number | null
          id_sala: string | null
          luna: string | null
          nume_sala: string | null
          total: number | null
        }
        Relationships: []
      }
      incasari_teacher_luna: {
        Row: {
          id: number | null
          id_teacher: string | null
          luna: string | null
          nume_teacher: string | null
          total: number | null
        }
        Relationships: []
      }
      incasat_pe_luna: {
        Row: {
          curs: string | null
          id: number | null
          incasat: number | null
          locatie: string | null
          luna: string | null
          sala: string | null
          teacher: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "incasari_sala_luna"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "restante_sala_luna"
            referencedColumns: ["id_sala"]
          },
          {
            foreignKeyName: "fk_cursuri_sala"
            columns: ["sala"]
            isOneToOne: false
            referencedRelation: "sali"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
        ]
      }
      inrolari_clienti: {
        Row: {
          cursuri: string | null
          email: string | null
          id: string | null
          nume: string | null
          prenume: string | null
          telefon: string | null
          telefonul_2: string | null
        }
        Relationships: []
      }
      lista_clienti: {
        Row: {
          activ: boolean | null
          cod_voucher: string | null
          data_nasterii: string | null
          foloseste_pret_promo: boolean | null
          id: number | null
          id_client: string | null
          id_curs: string | null
          id_inrolare: string | null
          nume: string | null
          numele_cursului: string | null
          prenume: string | null
          suma: number | null
          tip_plata: Database["public"]["Enums"]["tip_plata"] | null
          ultima_inrolare: string | null
          ultima_prezenta: string | null
        }
        Relationships: []
      }
      lista_cursuri: {
        Row: {
          balance: number | null
          capacitate_maxima: number | null
          id: string | null
          id_locatie: string | null
          id_teacher: string | null
          inscrisi: number | null
          locatie: string | null
          nivel_teacher: Database["public"]["Enums"]["nivel_teacher"] | null
          nivelul: Database["public"]["Enums"]["nivel_curs"] | null
          nume: string | null
          numele_cursului: string | null
          prenume: string | null
          sala: string | null
          sezon: string | null
          telefon: string | null
          zile: Database["public"]["Enums"]["zi_saptamana"][] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cursuri_sezon"
            columns: ["sezon"]
            isOneToOne: false
            referencedRelation: "sezoane"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_familii: {
        Row: {
          email: string | null
          id: string | null
          membri: string | null
          nume_familie: string | null
          nume_reprezentant: string | null
          observatii: string | null
          prenume_reprezentant: string | null
          telefon: string | null
          telefon_2: string | null
        }
        Relationships: []
      }
      lista_incasari: {
        Row: {
          data: string | null
          id: string | null
          locatie: string | null
          metoda: Database["public"]["Enums"]["metoda_plata"] | null
          nume: string | null
          nume_locatie: string | null
          numele: string | null
          observatii: string | null
          suma: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
        ]
      }
      opt_out_list: {
        Row: {
          email: string | null
          entity: string | null
          id: string | null
          motiv: string | null
          nume_complet: string | null
          opt_out_la: string | null
          telefon: string | null
        }
        Relationships: []
      }
      plati_inrolari: {
        Row: {
          cod_voucher: string | null
          data_incepere: string | null
          id: number | null
          id_curs: string | null
          id_cursant: string | null
          id_enrollment: string | null
          id_familie: string | null
          id_locatie: string | null
          id_voucher: string | null
          nume_client: string | null
          nume_curs: string | null
          nume_locatie: string | null
          platit: number | null
          politica_discount: number | null
          prenume_client: string | null
          prescris: boolean | null
          rest: number | null
          suma_baza: number | null
          tip_plata: Database["public"]["Enums"]["tip_plata"] | null
          total_de_plata: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_clienti_familia"
            columns: ["id_familie"]
            isOneToOne: false
            referencedRelation: "familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clienti_familia"
            columns: ["id_familie"]
            isOneToOne: false
            referencedRelation: "lista_familii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clienti_familia"
            columns: ["id_familie"]
            isOneToOne: false
            referencedRelation: "profil_client"
            referencedColumns: ["id_familie"]
          },
          {
            foreignKeyName: "fk_clienti_familia"
            columns: ["id_familie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_familie"]
          },
          {
            foreignKeyName: "fk_enrollments_voucher"
            columns: ["id_voucher"]
            isOneToOne: false
            referencedRelation: "vouchere"
            referencedColumns: ["id"]
          },
        ]
      }
      produse_publice: {
        Row: {
          activ: boolean | null
          created: string | null
          descriere: string | null
          id: string | null
          nume: string | null
          ordine: number | null
          pret: string | null
          updated: string | null
        }
        Insert: {
          activ?: boolean | null
          created?: string | null
          descriere?: never
          id?: string | null
          nume?: string | null
          ordine?: number | null
          pret?: never
          updated?: string | null
        }
        Update: {
          activ?: boolean | null
          created?: string | null
          descriere?: never
          id?: string | null
          nume?: string | null
          ordine?: number | null
          pret?: never
          updated?: string | null
        }
        Relationships: []
      }
      profil_client: {
        Row: {
          cursuri: string | null
          data_nasterii: string | null
          email: string | null
          id: string | null
          id_familie: string | null
          link_contract: string | null
          marime_tricou: Database["public"]["Enums"]["marime_tricou"] | null
          nume: string | null
          nume_familie: string | null
          prenume: string | null
          sexul: Database["public"]["Enums"]["sex"] | null
          telefon: string | null
          telefonul_2: string | null
        }
        Relationships: []
      }
      profil_teacher: {
        Row: {
          cursuri: string | null
          data_nasterii: string | null
          email: string | null
          id: string | null
          link_contract: string | null
          marime_tricou: Database["public"]["Enums"]["marime_tricou"] | null
          nivelul: Database["public"]["Enums"]["nivel_teacher"] | null
          nume: string | null
          observatii: string | null
          poza: string | null
          prenume: string | null
          telefon: string | null
        }
        Relationships: []
      }
      raport_financiar: {
        Row: {
          data_incepere: string | null
          data_platii: string | null
          id: number | null
          id_curs: string | null
          id_cursant: string | null
          id_familie: string | null
          id_locatie: string | null
          id_sala: string | null
          metoda: Database["public"]["Enums"]["metoda_plata"] | null
          nume_client: string | null
          nume_curs: string | null
          nume_familie: string | null
          nume_locatie: string | null
          nume_sala: string | null
          prenume_client: string | null
          suma: number | null
          tip_plata: Database["public"]["Enums"]["tip_plata"] | null
          total_de_plata: number | null
        }
        Relationships: []
      }
      raport_incasari: {
        Row: {
          categorie: Database["public"]["Enums"]["categorie_incasare"] | null
          data: string | null
          data_incepere: string | null
          data_platii: string | null
          id: number | null
          id_curs: string | null
          id_cursant: string | null
          id_locatie: string | null
          id_sala: string | null
          id_teacher: string | null
          metoda: Database["public"]["Enums"]["metoda_plata"] | null
          nume_client: string | null
          nume_curs: string | null
          nume_locatie: string | null
          nume_sala: string | null
          nume_teacher: string | null
          suma: number | null
        }
        Relationships: []
      }
      restante_curs_luna: {
        Row: {
          id: number | null
          id_curs: string | null
          luna: string | null
          nume_curs: string | null
          total_de_incasat: number | null
          total_incasat: number | null
        }
        Relationships: []
      }
      restante_locatie_luna: {
        Row: {
          id: number | null
          id_locatie: string | null
          luna: string | null
          nume_locatie: string | null
          total_de_incasat: number | null
          total_incasat: number | null
        }
        Relationships: []
      }
      restante_sala_luna: {
        Row: {
          id: number | null
          id_sala: string | null
          luna: string | null
          nume_sala: string | null
          total_de_incasat: number | null
          total_incasat: number | null
        }
        Relationships: []
      }
      restante_teacher_luna: {
        Row: {
          id: number | null
          id_teacher: string | null
          luna: string | null
          nume_teacher: string | null
          total_de_incasat: number | null
          total_incasat: number | null
        }
        Relationships: []
      }
      statistica_incasari_totale: {
        Row: {
          id: string | null
          total: number | null
        }
        Relationships: []
      }
      statistica_prezente_curs: {
        Row: {
          achitat: number | null
          curs: string | null
          id: string | null
          locatie: string | null
          luna: string | null
          teacher: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "incasari_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_clienti"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "restante_curs_luna"
            referencedColumns: ["id_curs"]
          },
          {
            foreignKeyName: "fk_enrollments_cursul"
            columns: ["curs"]
            isOneToOne: false
            referencedRelation: "teacher_curs_stats"
            referencedColumns: ["curs_id"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "incasari_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "locatii"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "plati_inrolari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_financiar"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_locatie"]
          },
          {
            foreignKeyName: "fk_sali_locatie"
            columns: ["locatie"]
            isOneToOne: false
            referencedRelation: "restante_locatie_luna"
            referencedColumns: ["id_locatie"]
          },
        ]
      }
      statistica_restante_totale: {
        Row: {
          id: string | null
          incasat: number | null
          total: number | null
        }
        Relationships: []
      }
      teacher_curs_stats: {
        Row: {
          balanta: number | null
          clienti_activi: number | null
          clienti_inscrisi: number | null
          curs_id: string | null
          curs_nivel: Database["public"]["Enums"]["nivel_curs"] | null
          curs_nume: string | null
          curs_sezon: string | null
          facultativ: boolean | null
          ora: string | null
          teacher_id: string | null
          zile: Database["public"]["Enums"]["zi_saptamana"][] | null
        }
        Insert: {
          balanta?: never
          clienti_activi?: never
          clienti_inscrisi?: never
          curs_id?: string | null
          curs_nivel?: Database["public"]["Enums"]["nivel_curs"] | null
          curs_nume?: string | null
          curs_sezon?: string | null
          facultativ?: boolean | null
          ora?: string | null
          teacher_id?: string | null
          zile?: Database["public"]["Enums"]["zi_saptamana"][] | null
        }
        Update: {
          balanta?: never
          clienti_activi?: never
          clienti_inscrisi?: never
          curs_id?: string | null
          curs_nivel?: Database["public"]["Enums"]["nivel_curs"] | null
          curs_nume?: string | null
          curs_sezon?: string | null
          facultativ?: boolean | null
          ora?: string | null
          teacher_id?: string | null
          zile?: Database["public"]["Enums"]["zi_saptamana"][] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_cursuri_sezon"
            columns: ["curs_sezon"]
            isOneToOne: false
            referencedRelation: "sezoane"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "incasari_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "lista_cursuri"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profil_teacher"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "raport_incasari"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "restante_teacher_luna"
            referencedColumns: ["id_teacher"]
          },
          {
            foreignKeyName: "fk_cursuri_teacher"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teacheri"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _anunt_staff_recipients: {
        Args: { p_target_locatie_ids: string[]; p_target_roles: string[] }
        Returns: string[]
      }
      _is_anunt_expeditor: { Args: { p_anunt: string }; Returns: boolean }
      _is_anunt_recipient: { Args: { p_anunt: string }; Returns: boolean }
      _try_activate_gate: { Args: { p_gate_id: string }; Returns: undefined }
      activate_eligible_sezoane: { Args: never; Returns: number }
      activate_reinscriere: {
        Args: { p_client_id: string; p_curs_id: string }
        Returns: number
      }
      activate_reinscriere_pe_sezon: {
        Args: { p_client_id: string; p_curs_tinta_id: string }
        Returns: number
      }
      activate_sezon: { Args: { p_sezon_id: string }; Returns: undefined }
      add_eveniment_participant: {
        Args: { p_client: string; p_eveniment: string }
        Returns: undefined
      }
      adjust_enrollment_price: {
        Args: {
          p_enrollment: string
          p_motiv: string
          p_new_suma: number
          p_surplus_action?: string
          p_target_id?: string
          p_target_type?: string
        }
        Returns: Json
      }
      adjust_inchiriere_price: {
        Args: { p_inchiriere: string; p_new_pret: number }
        Returns: Json
      }
      anuleaza_rezervare_open: {
        Args: { p_motiv?: string; p_rezervare: string }
        Returns: undefined
      }
      approve_act_aditional: {
        Args: {
          p_campanie_id: string
          p_client_id: string
          p_curs_tinta_id: string
        }
        Returns: string
      }
      aproba_motivare_absenta: {
        Args: {
          p_document?: string
          p_enrollment: string
          p_observatii?: string
        }
        Returns: Json
      }
      archive_expired_sezoane: { Args: never; Returns: number }
      audit_digest_dispatch_weekly: { Args: never; Returns: number }
      audit_log_record: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type: string
          p_locatie_id?: string
          p_new_value?: Json
          p_old_value?: Json
          p_reason?: string
        }
        Returns: {
          action: string
          actor_id: string | null
          actor_role: string
          created: string
          entity_id: string | null
          entity_type: string
          id: string
          locatie_id: string | null
          new_value: Json | null
          old_value: Json | null
          reason: string | null
        }
        SetofOptions: {
          from: "*"
          to: "audit_log"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auth_role: { Args: never; Returns: string }
      auto_mark_inactiv_si_exclient: {
        Args: never
        Returns: {
          inrolari_reziliate: number
          leads_create: number
          marcati_exclient: number
          marcati_inactiv: number
          reactivati: number
        }[]
      }
      build_fifo_plan_membru: {
        Args: {
          p_client: string
          p_datorii?: string[]
          p_include_inrolari?: boolean
          p_pana_la?: string
        }
        Returns: Json
      }
      calculeaza_salariu_teacher: {
        Args: { p_anul: number; p_luna: number; p_teacher: string }
        Returns: Json
      }
      cancel_expired_reinscrieri: { Args: never; Returns: number }
      cancel_netopia_order: {
        Args: { p_order_ref: string }
        Returns: undefined
      }
      clasifica_prag: {
        Args: { p_cheie: string; p_val: number }
        Returns: string
      }
      clear_opt_out: {
        Args: { p_entity: string; p_id: string }
        Returns: undefined
      }
      client_in_trupa: { Args: { p_client: string }; Returns: boolean }
      client_member_ids: { Args: never; Returns: string[] }
      clienti_activi_la: {
        Args: { p_data?: string; p_locatie?: string }
        Returns: {
          client: string
        }[]
      }
      clone_sezon: {
        Args: {
          p_cursuri?: Json
          p_data_final: string
          p_data_incepere: string
          p_nume: string
          p_scadenta_prima_rata?: string
          p_scadenta_ultima_rata?: string
          p_sezon_sursa: string
          p_tip: string
          p_vacante?: Json
        }
        Returns: string
      }
      close_campanie_reinscriere: {
        Args: { p_campanie_id: string }
        Returns: undefined
      }
      close_season_open_enrollments: {
        Args: { p_sezon: string }
        Returns: number
      }
      confirm_netopia_payment: {
        Args: {
          p_amount: number
          p_order_ref: string
          p_transaction_id: string
        }
        Returns: Json
      }
      confirma_salariu_teacher: {
        Args: {
          p_anul: number
          p_data_plata?: string
          p_luna: number
          p_teacher: string
        }
        Returns: {
          anul: number
          breakdown: Json
          created: string
          data_plata: string | null
          id: string
          luna: number
          status: string
          teacher: string
          total: number
          updated: string
        }
        SetofOptions: {
          from: "*"
          to: "salarii_teacher"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      converteste_abonament_in_sedinte: {
        Args: { p_abonament: string; p_motiv?: string }
        Returns: Json
      }
      converteste_sedinta_in_abonament: {
        Args: { p_motiv?: string; p_sedinta: string; p_target: string }
        Returns: Json
      }
      create_campanie_reinscriere: {
        Args: {
          p_data_final: string
          p_data_incepere: string
          p_nume: string
          p_sezon_tinta: string
          p_target: number
          p_taxa: number
          p_zile_procesare?: number
        }
        Returns: string
      }
      current_client: { Args: never; Returns: string }
      current_familie: { Args: never; Returns: string }
      current_teacher_id: { Args: never; Returns: string }
      delete_curs_safe: {
        Args: { p_force?: boolean; p_id: string }
        Returns: undefined
      }
      delete_teacher_safe: {
        Args: { p_force?: boolean; p_id: string }
        Returns: undefined
      }
      enqueue_confirmare_programare: {
        Args: { p_lead: string }
        Returns: undefined
      }
      enqueue_confirmare_review: {
        Args: { p_lead: string }
        Returns: undefined
      }
      evaluare_in_locatia_mea: { Args: { p_curs: string }; Returns: boolean }
      expire_open_holds: { Args: never; Returns: number }
      get_absente_consecutive: {
        Args: { p_locatie?: string; p_prag?: number }
        Returns: {
          absente_consecutive: number
          client_id: string
          client_nume: string
          curs_id: string
          curs_nume: string
          ultima_prezenta: string
        }[]
      }
      get_anunturi_client: {
        Args: never
        Returns: {
          continut: string
          created: string
          id: string
          read_at: string
          titlu: string
        }[]
      }
      get_arpu_trend: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          arpu: number
          clienti_activi: number
          luna: string
          venit: number
        }[]
      }
      get_bilete_membru: {
        Args: { p_client: string }
        Returns: {
          cod: string
          created: string
          data: string
          eveniment: string
          eveniment_nume: string
          id: string
          locatie: string
          pret: number
          status: string
        }[]
      }
      get_campanie_progress: {
        Args: { p_campanie_id: string }
        Returns: {
          act_de_verificat: number
          act_done: number
          in_proces: number
          procent: number
          re_inscrisi: number
          target_clienti: number
          taxa_done: number
        }[]
      }
      get_campanie_progress_curs: {
        Args: { p_campanie_id: string }
        Returns: {
          act_de_verificat: number
          act_done: number
          activi: number
          ambele: number
          capacitate: number
          curs_id: string
          curs_nume: string
          procent: number
          procent_ocupare: number
          ramasi: number
          taxa_done: number
          total_eligibili: number
          varsta: Database["public"]["Enums"]["varsta_curs"]
        }[]
      }
      get_client_restante: {
        Args: { p_client: string }
        Returns: {
          rest: number
          sezon_id: string
          sezon_nume: string
          sursa: string
        }[]
      }
      get_clienti_activi: {
        Args: never
        Returns: {
          activi: number
          locatie_id: string
          locatie_nume: string
        }[]
      }
      get_colectare_dso: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          dso_zile: number
          facturat: number
          incasat: number
          rata_colectare: number
          restante_net: number
        }[]
      }
      get_conversie_leads: {
        Args: { p_locatie?: string; p_luni?: number }
        Returns: {
          convertiti: number
          procent: number
          total_leads: number
          zile_medii: number
        }[]
      }
      get_crestere_neta: {
        Args: { p_locatie?: string; p_luni?: number }
        Returns: {
          activi: number
          intrati: number
          luna: string
          net: number
          pierduti: number
        }[]
      }
      get_cron_jobs_recent: {
        Args: { p_days?: number }
        Returns: {
          active: boolean
          command: string
          duration_ms: number
          end_time: string
          jobid: number
          jobname: string
          return_message: string
          runid: number
          schedule: string
          start_time: string
          status: string
        }[]
      }
      get_cursanti_multi_stil: {
        Args: never
        Returns: {
          multi_stil: number
          procent: number
          total_activi: number
        }[]
      }
      get_datorii_client: {
        Args: { p_client: string }
        Returns: {
          categorie: Database["public"]["Enums"]["categorie_incasare"]
          created: string
          datorie_id: string
          descriere: string
          platit: number
          rest: number
          suma_datorata: number
        }[]
      }
      get_documente_client: {
        Args: { p_client: string }
        Returns: {
          data_expirarii: string
          id: string
          link: string
          observatii: string
          tip: Database["public"]["Enums"]["tip_document"]
          titlu: string
        }[]
      }
      get_durata_medie_ltv: {
        Args: { p_locatie?: string }
        Returns: {
          durata_medie_luni: number
          ltv_recurent: number
          ltv_total: number
        }[]
      }
      get_evaluari_client: {
        Args: { p_client: string }
        Returns: {
          curs_nume: string
          data: string
          feedback_general: string
          id: string
          nivel_grupa: string
          skill_coordonare: number
          skill_coregrafie: number
          skill_expresivitate: number
          skill_freeze: number
          skill_improvizatie: number
          skill_izolari: number
          skill_pasi_baza: number
          skill_prezentare: number
          skill_ritm: number
          skill_sincronizare: number
          teacher_nume: string
        }[]
      }
      get_evenimente_client: {
        Args: never
        Returns: {
          data: string
          descriere: string
          eveniment_id: string
          locatie: string
          nume: string
          pret_bilet: number
          tip: Database["public"]["Enums"]["tip_eveniment"]
        }[]
      }
      get_familii_frati: {
        Args: never
        Returns: {
          copii_in_familii_frati: number
          familii_cu_frati: number
          total_familii: number
        }[]
      }
      get_grad_ocupare: {
        Args: { p_locatie?: string }
        Returns: {
          activi: number
          capacitate: number
          curs_id: string
          curs_nume: string
          facultativ: boolean
          locatie_nume: string
          media: number
          procent: number
          teacher_nume: string
        }[]
      }
      get_grupe_client: {
        Args: { p_client: string }
        Returns: {
          curs_id: string
          curs_nume: string
          data_final: string
          data_incepere: string
          enrollment_id: string
          instructori: string[]
          locatie_nume: string
          nivel: Database["public"]["Enums"]["nivel_curs"]
          ora: string
          sala: string
          stil: string
          tip_plata: Database["public"]["Enums"]["tip_plata"]
          varsta: Database["public"]["Enums"]["varsta_curs"]
          zile: Database["public"]["Enums"]["zi_saptamana"][]
        }[]
      }
      get_incasari_per_sezon: {
        Args: never
        Returns: {
          data_final: string
          data_incepere: string
          numele_sezonului: string
          sezon_id: string
          stare: string
          tip: string
          total_incasari: number
        }[]
      }
      get_instructori_clienti_trend: {
        Args: { p_luni?: number }
        Returns: {
          clienti_curent: number
          clienti_prev: number
          delta: number
          retentie_procent: number
          serie: number[]
          teacher_id: string
          teacher_nume: string
        }[]
      }
      get_kpis_financiar: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          cheltuieli: number
          incasari: number
          restante: number
        }[]
      }
      get_lead_funnel: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          contactati: number
          convertiti: number
          leads_total: number
          prezenti: number
          proba: number
          retentie_90z: number
          retentie_eligibili: number
          sursa_id: string
          sursa_nume: string
        }[]
      }
      get_leads_pe_luna: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          convertiti: number
          leads: number
          luna: string
        }[]
      }
      get_membri_familie: {
        Args: never
        Returns: {
          client_id: string
          data_nasterii: string
          nume: string
          prenume: string
        }[]
      }
      get_mix_categorii_cheltuieli: {
        Args: { p_from: string; p_to: string }
        Returns: {
          categorie: string
          total: number
        }[]
      }
      get_mix_categorii_incasari: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          categorie: string
          total: number
        }[]
      }
      get_mix_metode: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          metoda: string
          total: number
        }[]
      }
      get_mix_recurent_oneoff: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          tip: string
          total: number
        }[]
      }
      get_mrr_trend: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          enrolari_facultativ: number
          enrolari_recurent: number
          luna: string
          mrr_facultativ: number
          mrr_recurent: number
        }[]
      }
      get_ocupare_prime_time: {
        Args: { p_locatie?: string }
        Returns: {
          activi: number
          capacitate: number
          grupe: number
          procent: number
          slot: string
        }[]
      }
      get_pachet_luni: { Args: { p_locatie?: string }; Returns: Json }
      get_participari_client: {
        Args: { p_client: string }
        Returns: {
          data: string
          eveniment_id: string
          locatie: string
          nume: string
          tip: Database["public"]["Enums"]["tip_eveniment"]
        }[]
      }
      get_plati_client: {
        Args: { p_client: string }
        Returns: {
          cod_voucher: string
          curs_nume: string
          data_incepere: string
          enrollment_id: string
          platit: number
          rest: number
          sezon_id: string
          sezon_nume: string
          tip_plata: Database["public"]["Enums"]["tip_plata"]
          total_de_plata: number
        }[]
      }
      get_prezenta_saptamana_grupe: {
        Args: { p_locatie?: string }
        Returns: {
          curs_id: string
          curs_nume: string
          locatie_nume: string
          posibile: number
          prezenti: number
          rata: number
        }[]
      }
      get_prezente_client: {
        Args: { p_client: string }
        Returns: {
          curs_nume: string
          data: string
          status: Database["public"]["Enums"]["status_prezenta"]
        }[]
      }
      get_profil_client: {
        Args: { p_client: string }
        Returns: {
          client_id: string
          data_nasterii: string
          email: string
          marime_tricou: string
          nume: string
          prenume: string
          telefon: string
          telefonul_2: string
          unitate_invatamant: string
        }[]
      }
      get_profil_familie: {
        Args: never
        Returns: {
          doreste_sa_apara_in_poze: boolean
          email: string
          factura_pe_firma: boolean
          familie_id: string
          firma_adresa: string
          firma_banca: string
          firma_cif: string
          firma_denumire: string
          firma_iban: string
          firma_reg_com: string
          metoda_comunicare: string
          nume_familie: string
          nume_reprezentant: string
          opt_out_marketing: boolean
          prenume_reprezentant: string
          telefon: string
          telefon_2: string
        }[]
      }
      get_profitabilitate_teacher: {
        Args: { p_luni?: number }
        Returns: {
          incasari: number
          marja: number
          salariu: number
          teacher_id: string
          teacher_nume: string
        }[]
      }
      get_rata_prezenta_luna: {
        Args: { p_locatie?: string }
        Returns: {
          locatie_id: string
          locatie_nume: string
          posibile: number
          prezenti: number
        }[]
      }
      get_reduceri_familie: {
        Args: never
        Returns: {
          client_id: string
          client_nume: string
          cod_voucher: string
          curs_nume: string
          reducere: number
          suma: number
          suma_baza: number
          tip_plata: Database["public"]["Enums"]["tip_plata"]
        }[]
      }
      get_reinscrieri_conversie: {
        Args: { p_sezon_tinta: string }
        Returns: {
          activati: number
          curs_id: string
          curs_nume: string
          platiti: number
          procent_conversie: number
          varsta: Database["public"]["Enums"]["varsta_curs"]
        }[]
      }
      get_reinscrieri_pierderi: {
        Args: { p_sezon_tinta: string }
        Returns: {
          activati_curent: number
          curs_id: string
          curs_nume: string
          pierduti: number
          procent_pierdere: number
          varsta: Database["public"]["Enums"]["varsta_curs"]
        }[]
      }
      get_reinscrieri_progress: {
        Args: { p_sezon_tinta: string }
        Returns: {
          activati: number
          curs_id: string
          curs_nume: string
          procent: number
          ramasi: number
          total_eligibili: number
          varsta: Database["public"]["Enums"]["varsta_curs"]
        }[]
      }
      get_rentabilitate_grupa: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          activi: number
          curs_id: string
          curs_nume: string
          incasari: number
          locatie_nume: string
          marja: number
          salariu_atribuit: number
        }[]
      }
      get_restante_aging: {
        Args: { p_locatie?: string }
        Returns: {
          bucket: string
          nr: number
          total: number
        }[]
      }
      get_restante_totale: {
        Args: { p_locatie?: string }
        Returns: {
          rest_net: number
          rest_prescris: number
          rest_total: number
        }[]
      }
      get_restante_worklist: {
        Args: { p_locatie?: string; p_sezon?: string }
        Returns: {
          client_id: string
          nr_rate_neachitate: number
          nume: string
          nume_locatie: string
          prenume: string
          rest_total: number
          telefon: string
          ultim_apel_at: string
          ultim_apel_rezultat: string
          ultima_prezenta: string
          zile_depasire: number
        }[]
      }
      get_retentie_cohorte: {
        Args: { p_locatie?: string; p_sezon?: string }
        Returns: {
          cohorta_luna: string
          luni_de_la_start: number
          procent: number
          ramasi: number
          total_initial: number
        }[]
      }
      get_retentie_membri: {
        Args: { p_locatie?: string }
        Returns: {
          baza_prev: number
          pierduti: number
          retinuti: number
        }[]
      }
      get_rezervari_client: {
        Args: { p_client: string }
        Returns: {
          curs_nume: string
          data: string
          instructor_nume: string
          locatie: string
          rezervare_id: string
          sesiune_id: string
          status: Database["public"]["Enums"]["status_rezervare"]
          suma: number
        }[]
      }
      get_rezultate_concursuri: {
        Args: never
        Returns: {
          data: string
          id: string
          locul_i: number
          locul_ii: number
          locul_iii: number
          nume: string
          rezultate: string
        }[]
      }
      get_scorecard_operatori: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          clasa_generala: string
          contacte_dm: number
          contacte_email: number
          contacte_sms: number
          contacte_telefon: number
          contacte_total: number
          contacte_verificate: number
          conversie_clasa: string
          conversie_pct: number
          decalaj_flag: boolean
          followup_onorat_pct: number
          igiena_clasa: string
          igiena_crm_pct: number
          leaduri_lucrate: number
          nota_lipsa_pct: number
          persistenta_clasa: string
          persistenta_med: number
          rafala_flag: boolean
          scor_pct: number
          scor_total: number
          show_rate_clasa: string
          show_rate_pct: number
          user_id: string
          viteza_clasa: string
          viteza_med_ore: number
          volum_clasa: string
        }[]
      }
      get_scorecard_reactivari: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          clasa_generala: string
          clienti_contactati: number
          contacte_reactivare: number
          decalaj_flag: boolean
          igiena_clasa: string
          igiena_pct: number
          rafala_flag: boolean
          rata_clasa: string
          rata_reactivare_pct: number
          reactivati: number
          scor_pct: number
          scor_total: number
          user_id: string
          volum_clasa: string
        }[]
      }
      get_scorecard_restante: {
        Args: { p_from: string; p_locatie?: string; p_to: string }
        Returns: {
          clasa_generala: string
          clienti_contactati: number
          contacte_recuperare: number
          decalaj_flag: boolean
          igiena_clasa: string
          igiena_pct: number
          rafala_flag: boolean
          rata_clasa: string
          rata_recuperare_pct: number
          rest_ramas: number
          scor_pct: number
          scor_total: number
          suma_recuperata: number
          user_id: string
          volum_clasa: string
        }[]
      }
      get_sezon_curent_client: {
        Args: never
        Returns: {
          data_final: string
          data_incepere: string
          nume: string
          sezon_id: string
        }[]
      }
      get_sms_recipients: {
        Args: { p_cod?: string; p_locatie?: string; p_sezon?: string }
        Returns: {
          client_ids: string[]
          familia_id: string
          membri: Json
          nume_locatie: string
          scadenta: string
          telefon: string
          total_restanta: number
          zile_depasire: number
        }[]
      }
      get_sold_familie: {
        Args: never
        Returns: {
          client_id: string
          nume: string
          prenume: string
          restanta: number
        }[]
      }
      get_statistica_prezente_achitare: {
        Args: {
          p_curs?: string
          p_from: string
          p_locatie?: string
          p_teacher?: string
          p_to: string
        }
        Returns: {
          achitate: number
          din_trecut: number
          luna: string
          neachitate: number
        }[]
      }
      get_teacher_overview: {
        Args: { p_teacher_id: string }
        Returns: {
          activi: number
          curs_id: string
          curs_nivel: string
          curs_nume: string
          datorie: number
          facultativ: boolean
          posibile: number
          prezenti: number
        }[]
      }
      get_trend_prezente: {
        Args: {
          p_locatie?: string
          p_prag_scadere?: number
          p_saptamani?: number
          p_teacher?: string
        }
        Returns: {
          curs_id: string
          curs_nume: string
          in_scadere: boolean
          locatie_nume: string
          rata_precedenta: number
          rata_recenta: number
          saptamani: Json
          teacher_nume: string
        }[]
      }
      get_vacante_client: {
        Args: never
        Returns: {
          data_final: string
          data_incepere: string
          nume: string
          vacanta_id: string
        }[]
      }
      get_yoy_aceeasi_luna: {
        Args: { p_locatie?: string; p_metrica?: string }
        Returns: {
          an_curent: number
          an_precedent: number
          luna_num: number
        }[]
      }
      hold_bilete: {
        Args: {
          p_client: string
          p_eveniment: string
          p_order_ref: string
          p_qty: number
        }
        Returns: Json
      }
      hold_loc_open: {
        Args: { p_client: string; p_sesiune: string }
        Returns: Json
      }
      inrolari_active_la: {
        Args: { p_data?: string }
        Returns: {
          client: string
          cursul: string
          enrollment_id: string
        }[]
      }
      inrolari_active_luna: {
        Args: { p_luna: string }
        Returns: {
          client: string
          cursul: string
          enrollment_id: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_front_desk: { Args: never; Returns: boolean }
      is_in_my_locatie: { Args: { loc: string }; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_parinte: { Args: never; Returns: boolean }
      is_teacher: { Args: never; Returns: boolean }
      list_campanie_clienti_curs: {
        Args: { p_campanie_id: string; p_curs_tinta_id: string }
        Returns: {
          act_canal: string
          act_status: string
          activat_la: string
          client_id: string
          document_link: string
          email: string
          esemneaza_request_id: string
          nume: string
          prenume: string
          taxa_platita_la: string
          telefon: string
        }[]
      }
      list_open_sesiuni_client: {
        Args: { p_locatie?: string }
        Returns: {
          capacitate: number
          curs_id: string
          curs_nume: string
          data: string
          instructor_nume: string
          locuri_ramase: number
          pret: number
          sesiune_id: string
        }[]
      }
      list_reinscrieri_clienti: {
        Args: { p_curs_tinta_id: string }
        Returns: {
          activata: boolean
          client_id: string
          email: string
          nume: string
          prenume: string
          telefon: string
        }[]
      }
      list_targets_campanie: {
        Args: { p_campanie_id: string }
        Returns: {
          act_status: string
          are_contract: boolean
          client_id: string
          client_nume: string
          curs_nume: string
          curs_tinta_id: string
          familie_id: string
          familie_nume: string
          telefon: string
        }[]
      }
      mark_anunt_read: { Args: { p_anunt_id: string }; Returns: undefined }
      mark_anunturi_citite: { Args: never; Returns: undefined }
      mark_bank_factura: {
        Args: {
          p_client_nume: string
          p_data: string
          p_descriere: string
          p_firma_cui: string
          p_ref: string
          p_suma: number
          p_sursa: string
        }
        Returns: Json
      }
      mark_opt_out: {
        Args: { p_entity: string; p_id: string; p_motiv?: string }
        Returns: undefined
      }
      match_bank_payer: {
        Args: { p_detalii?: string; p_nume: string }
        Returns: {
          familia_id: string
          id: string
          nume: string
          scor: number
          tip: string
        }[]
      }
      my_teacher_id: { Args: never; Returns: string }
      notifications_mark_all_read: { Args: never; Returns: number }
      notifications_resolve: {
        Args: { p_id: string; p_raspuns?: string }
        Returns: undefined
      }
      notifications_unread_count: { Args: never; Returns: number }
      notify_enrollment_move: {
        Args: {
          p_enrollment: string
          p_from_curs: string
          p_motiv: string
          p_to_curs: string
        }
        Returns: number
      }
      notify_price_change: {
        Args: {
          p_context?: string
          p_enrollment: string
          p_motiv: string
          p_new: number
          p_old: number
        }
        Returns: number
      }
      ore_lucratoare: {
        Args: { p_end: string; p_start: string }
        Returns: number
      }
      ore_pe_zi_valid: { Args: { m: Json }; Returns: boolean }
      pontaj_auto_close_open_sessions: { Args: never; Returns: number }
      pontaj_close_session: {
        Args: { p_source?: string }
        Returns: {
          created: string
          end_at: string | null
          id: string
          locatie_id: string | null
          source: string | null
          start_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_pontaj"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pontaj_closing_at: {
        Args: { p_locatie: string; p_start: string }
        Returns: string
      }
      pontaj_open_session: {
        Args: never
        Returns: {
          created: string
          end_at: string | null
          id: string
          locatie_id: string | null
          source: string | null
          start_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_pontaj"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      portal_create_account: {
        Args: { p_email: string; p_password: string }
        Returns: string
      }
      portal_login: {
        Args: { p_email: string; p_password: string }
        Returns: {
          email: string
          id: string
        }[]
      }
      portal_set_password: {
        Args: { p_id: string; p_password: string }
        Returns: undefined
      }
      portal_upsert_credentials: {
        Args: { p_email: string; p_password: string }
        Returns: string
      }
      preview_anunt_client: { Args: { p_curs_id?: string }; Returns: number }
      preview_anunt_staff: {
        Args: { p_target_locatie_ids: string[]; p_target_roles: string[] }
        Returns: number
      }
      preview_pool_discount: {
        Args: {
          p_client: string
          p_curs?: string
          p_suma_baza: number
          p_tip_plata: Database["public"]["Enums"]["tip_plata"]
        }
        Returns: {
          politica_discount: number
          suma_finala: number
        }[]
      }
      prune_expired_leads: { Args: never; Returns: number }
      recalculate_pool_discount: {
        Args: { p_client: string }
        Returns: undefined
      }
      record_bank_factura: {
        Args: {
          p_client_id: string
          p_client_nume: string
          p_data: string
          p_descriere: string
          p_factura: string
          p_factura_link: string
          p_familia_id: string
          p_firma_cui: string
          p_ref: string
          p_suma: number
          p_sursa: string
        }
        Returns: Json
      }
      record_bank_incasare: {
        Args: {
          p_client_id: string
          p_client_nume: string
          p_data: string
          p_descriere: string
          p_factura: string
          p_factura_link: string
          p_familia_id: string
          p_firma_cui: string
          p_ref: string
          p_suma: number
          p_sursa: string
        }
        Returns: Json
      }
      record_taxa_rezervare: {
        Args: {
          p_campanie_id: string
          p_client_id: string
          p_curs_tinta_id: string
          p_incasare_id: string
        }
        Returns: string
      }
      reject_act_aditional: {
        Args: {
          p_campanie_id: string
          p_client_id: string
          p_curs_tinta_id: string
        }
        Returns: string
      }
      remove_eveniment_participant: {
        Args: { p_client: string; p_eveniment: string }
        Returns: undefined
      }
      resolve_anunt_clienti: {
        Args: { p_curs_id?: string }
        Returns: {
          client_id: string
        }[]
      }
      rezerva_bonus_open: {
        Args: { p_date_list: string[]; p_enrollment: string }
        Returns: number
      }
      rezerva_loc_open: {
        Args: {
          p_client: string
          p_curs?: string
          p_data?: string
          p_data_incasare?: string
          p_instructor?: string
          p_locatie: string
          p_metoda: Database["public"]["Enums"]["metoda_plata"]
          p_metoda2?: Database["public"]["Enums"]["metoda_plata"]
          p_permite_overbook?: boolean
          p_pret?: number
          p_sesiune?: string
          p_suma: number
          p_suma2?: number
        }
        Returns: string
      }
      rls_parinte_gap_report: {
        Args: never
        Returns: {
          problema: string
          tabel: string
        }[]
      }
      scor_num: { Args: { p_clasa: string }; Returns: number }
      send_anunt_client: {
        Args: { p_continut: string; p_curs_id?: string; p_titlu: string }
        Returns: Json
      }
      send_anunt_staff: {
        Args: {
          p_continut: string
          p_target_locatie_ids: string[]
          p_target_roles: string[]
          p_titlu: string
        }
        Returns: Json
      }
      set_act_aditional_manual: {
        Args: {
          p_campanie_id: string
          p_client_id: string
          p_curs_tinta_id: string
          p_document_link: string
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sterge_inrolare: {
        Args: { p_enrollment: string; p_motiv: string }
        Returns: undefined
      }
      submit_rating_client: {
        Args: {
          p_client: string
          p_context: string
          p_detalii?: string
          p_rating: number
        }
        Returns: undefined
      }
      teacher_can_access_curs: { Args: { p_curs: string }; Returns: boolean }
      update_profil_client: {
        Args: {
          p_client: string
          p_email?: string
          p_marime_tricou?: string
          p_telefon?: string
          p_telefonul_2?: string
          p_unitate_invatamant?: string
        }
        Returns: undefined
      }
      update_profil_familie: {
        Args: {
          p_doreste_poze?: boolean
          p_email?: string
          p_factura_pe_firma?: boolean
          p_firma_adresa?: string
          p_firma_banca?: string
          p_firma_cif?: string
          p_firma_denumire?: string
          p_firma_iban?: string
          p_firma_reg_com?: string
          p_metoda_comunicare?: string
          p_nume_reprezentant?: string
          p_opt_out_marketing?: boolean
          p_prenume_reprezentant?: string
          p_telefon?: string
          p_telefon_2?: string
        }
        Returns: undefined
      }
      use_client_credit: {
        Args: {
          p_action: string
          p_amount: number
          p_client: string
          p_motiv?: string
          p_target_id?: string
          p_target_type?: string
        }
        Returns: Json
      }
      user_locatie_id: { Args: never; Returns: string }
      validate_voucher_code: {
        Args: {
          p_client: string
          p_cod: string
          p_curs?: string
          p_tip?: Database["public"]["Enums"]["tip_plata"]
        }
        Returns: {
          cod: string
          reason: string
          tip: Database["public"]["Enums"]["tip_voucher"]
          valid: boolean
          valoare: number
          voucher_id: string
        }[]
      }
      valideaza_bilet: { Args: { p_cod: string }; Returns: Json }
      warn_existing_incasare: {
        Args: { p_client: string; p_data: string; p_suma: number }
        Returns: boolean
      }
    }
    Enums: {
      app_feedback_status:
        | "Nou"
        | "In lucru"
        | "Planificat"
        | "Rezolvat"
        | "Respins"
      app_feedback_tip: "Bug" | "Idee" | "Intrebare"
      canal_comunicare: "Online" | "Offline"
      canal_contact: "telefon" | "sms" | "email" | "dm"
      canale_online: "Meta ADS" | "Google ADS" | "TikTok Ads" | "Organic"
      categorie_cheltuiala: "Administrativa" | "Salariala" | "Alta"
      categorie_incasare:
        | "Abonament"
        | "Bilet"
        | "Merch"
        | "Taxa"
        | "Workshop"
        | "Auditie"
        | "Inchiriere"
      categorie_inventar:
        | "Haine"
        | "Accesorii"
        | "Costume"
        | "Merch"
        | "Consumabil"
      factura_fgo_status:
        | "Pending"
        | "Matched"
        | "Emisa"
        | "Marcata"
        | "Eroare"
        | "Ignorata"
      factura_fgo_sursa: "banca" | "portal"
      grupa_lead:
        | "Tiny"
        | "Junior"
        | "Varsity"
        | "Teens"
        | "Students"
        | "Adults"
      interes_lead:
        | "Street Dance"
        | "K-pop"
        | "Acrobatică"
        | "Zumba"
        | "Nu știu încă"
      interes_programare: "Dans" | "Gimnastica"
      lead_action_type:
        | "created"
        | "status_change"
        | "sub_status_change"
        | "sms_sent"
        | "note_added"
        | "field_edit"
        | "flag_set"
        | "flag_cleared"
        | "assigned"
      marime_tricou:
        | "110cm/4ani"
        | "122cm/6ani"
        | "134cm/8ani"
        | "146cm/10ani"
        | "158cm/12ani"
        | "XS"
        | "S"
        | "M"
        | "L"
        | "XL"
        | "XXL"
      metoda_plata: "Cash" | "Card" | "Transfer" | "Revolut" | "Online"
      nivel_curs: "Incepator" | "Intermediar" | "Avansat" | "Trupa"
      nivel_teacher: "Junior" | "Senior" | "Expert"
      prezenta_lead: "programat" | "prezent" | "absent"
      rezultat_contact: "reusit" | "follow_up" | "pierdut"
      sex: "B" | "F"
      status_client: "Activ" | "Inactiv" | "EXclient"
      status_eveniment: "Urmator" | "Finalizat" | "Anulat"
      status_lead:
        | "nou"
        | "contactat"
        | "waiting_list"
        | "programat"
        | "a_venit"
        | "nu_a_venit"
        | "convertit"
        | "pierdut"
        | "nurture"
      status_plata_inchiriere: "achitat" | "partial" | "neachitat"
      status_prezenta: "Prezent" | "Absent" | "Motivat"
      status_prospect:
        | "Nou"
        | "Programat"
        | "De revenit"
        | "Convertit"
        | "Nu doreste"
      status_rezervare: "rezervat" | "platit" | "anulat"
      status_sms:
        | "De trimis"
        | "In curs de trimitere"
        | "Trimis"
        | "Esuat"
        | "Amanat"
      status_spectacol: "planificat" | "confirmat" | "finalizat" | "anulat"
      sub_status_lead: "de_revenit" | "nu_raspunde"
      sursa_prospect:
        | "Meta ADS"
        | "Google ADS"
        | "Events"
        | "Website"
        | "Organic"
      tier_inchiriere: "staff" | "client"
      tip_document:
        | "Contract"
        | "Anexa"
        | "Reziliere"
        | "Medical"
        | "Declaratie"
        | "Altul"
      tip_eveniment: "Eveniment" | "Workshop" | "Auditie"
      tip_feedback: "Sesizare" | "Review"
      tip_plata: "Per sedinta" | "Per luna" | "Per an"
      tip_voucher: "Valoare" | "Procent" | "Special"
      varsta_curs:
        | "Tiny 4-7"
        | "Junior 7-10"
        | "Varsity 11-15"
        | "Teens 15-20"
        | "Students 20-25"
        | "Adults 25+"
        | "Mixt"
      zi_saptamana:
        | "Luni"
        | "Marti"
        | "Miercuri"
        | "Joi"
        | "Vineri"
        | "Sambata"
        | "Duminica"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_feedback_status: [
        "Nou",
        "In lucru",
        "Planificat",
        "Rezolvat",
        "Respins",
      ],
      app_feedback_tip: ["Bug", "Idee", "Intrebare"],
      canal_comunicare: ["Online", "Offline"],
      canal_contact: ["telefon", "sms", "email", "dm"],
      canale_online: ["Meta ADS", "Google ADS", "TikTok Ads", "Organic"],
      categorie_cheltuiala: ["Administrativa", "Salariala", "Alta"],
      categorie_incasare: [
        "Abonament",
        "Bilet",
        "Merch",
        "Taxa",
        "Workshop",
        "Auditie",
        "Inchiriere",
      ],
      categorie_inventar: [
        "Haine",
        "Accesorii",
        "Costume",
        "Merch",
        "Consumabil",
      ],
      factura_fgo_status: [
        "Pending",
        "Matched",
        "Emisa",
        "Marcata",
        "Eroare",
        "Ignorata",
      ],
      factura_fgo_sursa: ["banca", "portal"],
      grupa_lead: ["Tiny", "Junior", "Varsity", "Teens", "Students", "Adults"],
      interes_lead: [
        "Street Dance",
        "K-pop",
        "Acrobatică",
        "Zumba",
        "Nu știu încă",
      ],
      interes_programare: ["Dans", "Gimnastica"],
      lead_action_type: [
        "created",
        "status_change",
        "sub_status_change",
        "sms_sent",
        "note_added",
        "field_edit",
        "flag_set",
        "flag_cleared",
        "assigned",
      ],
      marime_tricou: [
        "110cm/4ani",
        "122cm/6ani",
        "134cm/8ani",
        "146cm/10ani",
        "158cm/12ani",
        "XS",
        "S",
        "M",
        "L",
        "XL",
        "XXL",
      ],
      metoda_plata: ["Cash", "Card", "Transfer", "Revolut", "Online"],
      nivel_curs: ["Incepator", "Intermediar", "Avansat", "Trupa"],
      nivel_teacher: ["Junior", "Senior", "Expert"],
      prezenta_lead: ["programat", "prezent", "absent"],
      rezultat_contact: ["reusit", "follow_up", "pierdut"],
      sex: ["B", "F"],
      status_client: ["Activ", "Inactiv", "EXclient"],
      status_eveniment: ["Urmator", "Finalizat", "Anulat"],
      status_lead: [
        "nou",
        "contactat",
        "waiting_list",
        "programat",
        "a_venit",
        "nu_a_venit",
        "convertit",
        "pierdut",
        "nurture",
      ],
      status_plata_inchiriere: ["achitat", "partial", "neachitat"],
      status_prezenta: ["Prezent", "Absent", "Motivat"],
      status_prospect: [
        "Nou",
        "Programat",
        "De revenit",
        "Convertit",
        "Nu doreste",
      ],
      status_rezervare: ["rezervat", "platit", "anulat"],
      status_sms: [
        "De trimis",
        "In curs de trimitere",
        "Trimis",
        "Esuat",
        "Amanat",
      ],
      status_spectacol: ["planificat", "confirmat", "finalizat", "anulat"],
      sub_status_lead: ["de_revenit", "nu_raspunde"],
      sursa_prospect: [
        "Meta ADS",
        "Google ADS",
        "Events",
        "Website",
        "Organic",
      ],
      tier_inchiriere: ["staff", "client"],
      tip_document: [
        "Contract",
        "Anexa",
        "Reziliere",
        "Medical",
        "Declaratie",
        "Altul",
      ],
      tip_eveniment: ["Eveniment", "Workshop", "Auditie"],
      tip_feedback: ["Sesizare", "Review"],
      tip_plata: ["Per sedinta", "Per luna", "Per an"],
      tip_voucher: ["Valoare", "Procent", "Special"],
      varsta_curs: [
        "Tiny 4-7",
        "Junior 7-10",
        "Varsity 11-15",
        "Teens 15-20",
        "Students 20-25",
        "Adults 25+",
        "Mixt",
      ],
      zi_saptamana: [
        "Luni",
        "Marti",
        "Miercuri",
        "Joi",
        "Vineri",
        "Sambata",
        "Duminica",
      ],
    },
  },
} as const

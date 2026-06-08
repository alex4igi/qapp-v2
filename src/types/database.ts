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
      cheltuieli: {
        Row: {
          achitat: boolean
          categorie: Database["public"]["Enums"]["categorie_cheltuiala"] | null
          created: string
          deadline: string | null
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
          deadline?: string | null
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
          deadline?: string | null
          descriere?: string | null
          id?: string
          nume?: string
          updated?: string
          valoare?: number | null
        }
        Relationships: []
      }
      clienti: {
        Row: {
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
      cursuri: {
        Row: {
          capacitate_maxima: number | null
          created: string
          cursul_original: string | null
          durata_cursului: number | null
          facultativ: boolean
          id: string
          locatie: string | null
          nivelul: Database["public"]["Enums"]["nivel_curs"] | null
          numele: string
          old_sub_id: number | null
          one_time: boolean
          ora: string | null
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
          locatie?: string | null
          nivelul?: Database["public"]["Enums"]["nivel_curs"] | null
          numele: string
          old_sub_id?: number | null
          one_time?: boolean
          ora?: string | null
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
          locatie?: string | null
          nivelul?: Database["public"]["Enums"]["nivel_curs"] | null
          numele?: string
          old_sub_id?: number | null
          one_time?: boolean
          ora?: string | null
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
          organizator: string | null
          participant: string[]
          pret_bilet: number | null
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
          organizator?: string | null
          participant?: string[]
          pret_bilet?: number | null
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
          organizator?: string | null
          participant?: string[]
          pret_bilet?: number | null
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
      familii: {
        Row: {
          created: string
          doreste_sa_apara_in_poze: boolean
          email: string | null
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
          created?: string
          doreste_sa_apara_in_poze?: boolean
          email?: string | null
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
          created?: string
          doreste_sa_apara_in_poze?: boolean
          email?: string | null
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
        Relationships: []
      }
      feedback: {
        Row: {
          autor: string | null
          created: string
          cursul: string | null
          detalii: string | null
          detalii_rezolvare: string | null
          id: string
          nume: string | null
          reprezentant: string | null
          rezolvat: boolean
          tip: Database["public"]["Enums"]["tip_feedback"] | null
          updated: string
        }
        Insert: {
          autor?: string | null
          created?: string
          cursul?: string | null
          detalii?: string | null
          detalii_rezolvare?: string | null
          id?: string
          nume?: string | null
          reprezentant?: string | null
          rezolvat?: boolean
          tip?: Database["public"]["Enums"]["tip_feedback"] | null
          updated?: string
        }
        Update: {
          autor?: string | null
          created?: string
          cursul?: string | null
          detalii?: string | null
          detalii_rezolvare?: string | null
          id?: string
          nume?: string | null
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
          id: string
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
          id?: string
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
          id?: string
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
            foreignKeyName: "incasari_lead_fkey"
            columns: ["lead"]
            isOneToOne: false
            referencedRelation: "leads"
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
          id: string
          locatie: string | null
          pret: string | null
          stoc: number | null
          updated: string
        }
        Insert: {
          articol: string
          categorie?: Database["public"]["Enums"]["categorie_inventar"] | null
          created?: string
          descriere?: string | null
          id?: string
          locatie?: string | null
          pret?: string | null
          stoc?: number | null
          updated?: string
        }
        Update: {
          articol?: string
          categorie?: Database["public"]["Enums"]["categorie_inventar"] | null
          created?: string
          descriere?: string | null
          id?: string
          locatie?: string | null
          pret?: string | null
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
          telefon: string | null
          updated: string
        }
        Insert: {
          adresa?: string | null
          created?: string
          id?: string
          link_maps?: string | null
          nume: string
          telefon?: string | null
          updated?: string
        }
        Update: {
          adresa?: string | null
          created?: string
          id?: string
          link_maps?: string | null
          nume?: string
          telefon?: string | null
          updated?: string
        }
        Relationships: []
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
          capital: number | null
          created: string
          cui: string | null
          id: string
          nume: string
          observatii: string | null
          registru_comert: string | null
          updated: string
        }
        Insert: {
          capital?: number | null
          created?: string
          cui?: string | null
          id?: string
          nume: string
          observatii?: string | null
          registru_comert?: string | null
          updated?: string
        }
        Update: {
          capital?: number | null
          created?: string
          cui?: string | null
          id?: string
          nume?: string
          observatii?: string | null
          registru_comert?: string | null
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
          id: string
          interes: Database["public"]["Enums"]["interes_programare"] | null
          lead: string | null
          locatie: string | null
          observatii: string | null
          prezenta: Database["public"]["Enums"]["prezenta_lead"]
          updated: string
        }
        Insert: {
          created?: string
          cursul_programat?: string | null
          data_programarii?: string | null
          id?: string
          interes?: Database["public"]["Enums"]["interes_programare"] | null
          lead?: string | null
          locatie?: string | null
          observatii?: string | null
          prezenta?: Database["public"]["Enums"]["prezenta_lead"]
          updated?: string
        }
        Update: {
          created?: string
          cursul_programat?: string | null
          data_programarii?: string | null
          id?: string
          interes?: Database["public"]["Enums"]["interes_programare"] | null
          lead?: string | null
          locatie?: string | null
          observatii?: string | null
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
      vouchere: {
        Row: {
          client: string | null
          cod_voucher: string
          created: string
          curs: string | null
          data_expirarii: string | null
          data_inceperii: string | null
          descriere: string | null
          id: string
          numar_utilizari: number | null
          tip: Database["public"]["Enums"]["tip_voucher"] | null
          tip_enrollment: Database["public"]["Enums"]["tip_plata"] | null
          updated: string
          valoare: number | null
        }
        Insert: {
          client?: string | null
          cod_voucher: string
          created?: string
          curs?: string | null
          data_expirarii?: string | null
          data_inceperii?: string | null
          descriere?: string | null
          id?: string
          numar_utilizari?: number | null
          tip?: Database["public"]["Enums"]["tip_voucher"] | null
          tip_enrollment?: Database["public"]["Enums"]["tip_plata"] | null
          updated?: string
          valoare?: number | null
        }
        Update: {
          client?: string | null
          cod_voucher?: string
          created?: string
          curs?: string | null
          data_expirarii?: string | null
          data_inceperii?: string | null
          descriere?: string | null
          id?: string
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
      clienti_unici: {
        Row: {
          clients: string | null
          id: string | null
          unique_clients: number | null
        }
        Relationships: []
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
      calculeaza_salariu_teacher: {
        Args: { p_anul: number; p_luna: number; p_teacher: string }
        Returns: Json
      }
      cancel_expired_reinscrieri: { Args: never; Returns: number }
      clear_opt_out: {
        Args: { p_entity: string; p_id: string }
        Returns: undefined
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
      current_teacher_id: { Args: never; Returns: string }
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
      get_clienti_activi: {
        Args: never
        Returns: {
          activi: number
          locatie_id: string
          locatie_nume: string
        }[]
      }
      get_conversie_leads: {
        Args: { p_luni?: number }
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
      is_admin: { Args: never; Returns: boolean }
      is_front_desk: { Args: never; Returns: boolean }
      is_in_my_locatie: { Args: { loc: string }; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
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
      mark_anunt_read: { Args: { p_anunt_id: string }; Returns: undefined }
      mark_opt_out: {
        Args: { p_entity: string; p_id: string; p_motiv?: string }
        Returns: undefined
      }
      my_teacher_id: { Args: never; Returns: string }
      notifications_mark_all_read: { Args: never; Returns: number }
      notifications_unread_count: { Args: never; Returns: number }
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
      preview_anunt_client: { Args: { p_curs_id?: string }; Returns: number }
      preview_anunt_staff: {
        Args: { p_target_locatie_ids: string[]; p_target_roles: string[] }
        Returns: number
      }
      prune_expired_leads: { Args: never; Returns: number }
      recalculate_pool_discount: {
        Args: { p_client: string }
        Returns: undefined
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
      resolve_anunt_clienti: {
        Args: { p_curs_id?: string }
        Returns: {
          client_id: string
        }[]
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
          p_sesiune?: string
          p_suma: number
        }
        Returns: string
      }
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
      teacher_can_access_curs: { Args: { p_curs: string }; Returns: boolean }
      user_locatie_id: { Args: never; Returns: string }
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
      canale_online: "Meta ADS" | "Google ADS" | "TikTok Ads" | "Organic"
      categorie_cheltuiala: "Administrativa" | "Salariala" | "Alta"
      categorie_incasare: "Abonament" | "Bilet" | "Merch" | "Taxa" | "Workshop"
      categorie_inventar:
        | "Haine"
        | "Accesorii"
        | "Costume"
        | "Merch"
        | "Consumabil"
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
        | "Gimnastică"
        | "Zumba"
        | "Acrobatică"
        | "Quasar for Kids"
        | "Altceva"
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
      metoda_plata: "Cash" | "Card" | "Transfer" | "Revolut"
      nivel_curs: "Incepator" | "Intermediar" | "Avansat" | "Trupa"
      nivel_teacher: "Junior" | "Senior" | "Expert"
      prezenta_lead: "programat" | "prezent" | "absent"
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
      status_prezenta: "Prezent" | "Absent" | "Motivat"
      status_prospect:
        | "Nou"
        | "Programat"
        | "De revenit"
        | "Convertit"
        | "Nu doreste"
      status_rezervare: "rezervat" | "platit" | "anulat"
      status_sms: "De trimis" | "In curs de trimitere" | "Trimis" | "Esuat"
      sub_status_lead: "de_revenit" | "nu_raspunde"
      sursa_prospect:
        | "Meta ADS"
        | "Google ADS"
        | "Events"
        | "Website"
        | "Organic"
      tip_eveniment: "Eveniment" | "Workshop"
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
      canale_online: ["Meta ADS", "Google ADS", "TikTok Ads", "Organic"],
      categorie_cheltuiala: ["Administrativa", "Salariala", "Alta"],
      categorie_incasare: ["Abonament", "Bilet", "Merch", "Taxa", "Workshop"],
      categorie_inventar: [
        "Haine",
        "Accesorii",
        "Costume",
        "Merch",
        "Consumabil",
      ],
      grupa_lead: ["Tiny", "Junior", "Varsity", "Teens", "Students", "Adults"],
      interes_lead: [
        "Street Dance",
        "K-pop",
        "Gimnastică",
        "Zumba",
        "Acrobatică",
        "Quasar for Kids",
        "Altceva",
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
      metoda_plata: ["Cash", "Card", "Transfer", "Revolut"],
      nivel_curs: ["Incepator", "Intermediar", "Avansat", "Trupa"],
      nivel_teacher: ["Junior", "Senior", "Expert"],
      prezenta_lead: ["programat", "prezent", "absent"],
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
      status_prezenta: ["Prezent", "Absent", "Motivat"],
      status_prospect: [
        "Nou",
        "Programat",
        "De revenit",
        "Convertit",
        "Nu doreste",
      ],
      status_rezervare: ["rezervat", "platit", "anulat"],
      status_sms: ["De trimis", "In curs de trimitere", "Trimis", "Esuat"],
      sub_status_lead: ["de_revenit", "nu_raspunde"],
      sursa_prospect: [
        "Meta ADS",
        "Google ADS",
        "Events",
        "Website",
        "Organic",
      ],
      tip_eveniment: ["Eveniment", "Workshop"],
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

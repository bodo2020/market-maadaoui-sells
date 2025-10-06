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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      admin_notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          read_at: string | null
          tenant_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          read_at?: string | null
          tenant_id?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          read_at?: string | null
          tenant_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          active: boolean | null
          branch_id: string | null
          city_id: string
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          branch_id?: string | null
          city_id: string
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          branch_id?: string | null
          city_id?: string
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "areas_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          active: boolean | null
          category_id: string | null
          company_id: string | null
          created_at: string | null
          end_date: string | null
          id: string
          image_url: string
          link: string | null
          main_category_id: string | null
          position: number | null
          products: string[] | null
          start_date: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          category_id?: string | null
          company_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          image_url: string
          link?: string | null
          main_category_id?: string | null
          position?: number | null
          products?: string[] | null
          start_date?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          category_id?: string | null
          company_id?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          image_url?: string
          link?: string | null
          main_category_id?: string | null
          position?: number | null
          products?: string[] | null
          start_date?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banners_main_category_id_fkey"
            columns: ["main_category_id"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_neighborhoods: {
        Row: {
          active: boolean | null
          branch_id: string
          created_at: string | null
          id: string
          neighborhood_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          branch_id: string
          created_at?: string | null
          id?: string
          neighborhood_id: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          branch_id?: string
          created_at?: string | null
          id?: string
          neighborhood_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_neighborhoods_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_neighborhoods_neighborhood_id_fkey"
            columns: ["neighborhood_id"]
            isOneToOne: false
            referencedRelation: "neighborhoods"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean | null
          address: string | null
          code: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          code?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          code?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string | null
          customer_id: string | null
          id: string
          metadata: Json | null
          product_id: string
          quantity: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          metadata?: Json | null
          product_id: string
          quantity?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          metadata?: Json | null
          product_id?: string
          quantity?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_tracking: {
        Row: {
          branch_id: string | null
          closing_balance: number | null
          created_at: string | null
          created_by: string | null
          date: string
          difference: number | null
          id: string
          notes: string | null
          opening_balance: number | null
          register_type: string
          updated_at: string | null
          verified_by: string | null
        }
        Insert: {
          branch_id?: string | null
          closing_balance?: number | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          difference?: number | null
          id?: string
          notes?: string | null
          opening_balance?: number | null
          register_type?: string
          updated_at?: string | null
          verified_by?: string | null
        }
        Update: {
          branch_id?: string | null
          closing_balance?: number | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          difference?: number | null
          id?: string
          notes?: string | null
          opening_balance?: number | null
          register_type?: string
          updated_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_tracking_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_tracking_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_tracking_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          amount: number
          balance_after: number
          branch_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          register_type: string
          transaction_date: string
          transaction_type: string
        }
        Insert: {
          amount: number
          balance_after: number
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          register_type: string
          transaction_date?: string
          transaction_type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          register_type?: string
          transaction_date?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transfers: {
        Row: {
          amount: number
          branch_id: string | null
          created_at: string | null
          created_by: string | null
          from_register: string
          from_transaction_id: string | null
          id: string
          notes: string | null
          to_register: string
          to_transaction_id: string | null
          transfer_date: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          from_register: string
          from_transaction_id?: string | null
          id?: string
          notes?: string | null
          to_register: string
          to_transaction_id?: string | null
          transfer_date?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          from_register?: string
          from_transaction_id?: string | null
          id?: string
          notes?: string | null
          to_register?: string
          to_transaction_id?: string | null
          transfer_date?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      cities: {
        Row: {
          active: boolean | null
          created_at: string | null
          governorate_id: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          governorate_id: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          governorate_id?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cities_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      coupon_usage: {
        Row: {
          created_at: string | null
          id: string
          offer_id: string | null
          order_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          offer_id?: string | null
          order_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          offer_id?: string | null
          order_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usage_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "special_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address: string
          area_id: string | null
          city_id: string | null
          created_at: string | null
          governorate_id: string | null
          id: string
          is_default: boolean | null
          latitude: number | null
          longitude: number | null
          neighborhood_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address: string
          area_id?: string | null
          city_id?: string | null
          created_at?: string | null
          governorate_id?: string | null
          id?: string
          is_default?: boolean | null
          latitude?: number | null
          longitude?: number | null
          neighborhood_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string
          area_id?: string | null
          city_id?: string | null
          created_at?: string | null
          governorate_id?: string | null
          id?: string
          is_default?: boolean | null
          latitude?: number | null
          longitude?: number | null
          neighborhood_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_governorate_id_fkey"
            columns: ["governorate_id"]
            isOneToOne: false
            referencedRelation: "governorates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_neighborhood_id_fkey"
            columns: ["neighborhood_id"]
            isOneToOne: false
            referencedRelation: "neighborhoods"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_interactions: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          id: string
          priority: string
          scheduled_at: string | null
          status: string
          subject: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          id?: string
          priority?: string
          scheduled_at?: string | null
          status?: string
          subject: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          priority?: string
          scheduled_at?: string | null
          status?: string
          subject?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_interactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          area_id: string | null
          city_id: string | null
          created_at: string
          email: string | null
          first_name: string | null
          governorate_id: string | null
          id: string
          last_name: string | null
          name: string
          neighborhood_id: string | null
          notes: string | null
          phone: string | null
          phone_verified: boolean | null
          updated_at: string
          user_id: string | null
          verified: boolean
        }
        Insert: {
          address?: string | null
          area_id?: string | null
          city_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          governorate_id?: string | null
          id?: string
          last_name?: string | null
          name: string
          neighborhood_id?: string | null
          notes?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          updated_at?: string
          user_id?: string | null
          verified?: boolean
        }
        Update: {
          address?: string | null
          area_id?: string | null
          city_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          governorate_id?: string | null
          id?: string
          last_name?: string | null
          name?: string
          neighborhood_id?: string | null
          notes?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          updated_at?: string
          user_id?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      damaged_products: {
        Row: {
          batch_number: string
          created_at: string
          created_by: string | null
          damage_cost: number
          damage_date: string
          damaged_quantity: number
          id: string
          notes: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          batch_number: string
          created_at?: string
          created_by?: string | null
          damage_cost: number
          damage_date?: string
          damaged_quantity: number
          id?: string
          notes?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          batch_number?: string
          created_at?: string
          created_by?: string | null
          damage_cost?: number
          damage_date?: string
          damaged_quantity?: number
          id?: string
          notes?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_type_pricing: {
        Row: {
          created_at: string | null
          delivery_location_id: string | null
          delivery_type_id: string | null
          estimated_time: string | null
          id: string
          price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_location_id?: string | null
          delivery_type_id?: string | null
          estimated_time?: string | null
          id?: string
          price?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_location_id?: string | null
          delivery_type_id?: string | null
          estimated_time?: string | null
          id?: string
          price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_type_pricing_delivery_type_id_fkey"
            columns: ["delivery_type_id"]
            isOneToOne: false
            referencedRelation: "delivery_types"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_types: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string | null
          created_at: string | null
          date: string
          description: string
          id: string
          receipt_url: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          branch_id?: string | null
          created_at?: string | null
          date: string
          description: string
          id?: string
          receipt_url?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string | null
          date?: string
          description?: string
          id?: string
          receipt_url?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string | null
          customer_id: string | null
          id: string
          product_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          product_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          product_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favorites_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      governorates: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          name: string
          provider_id: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name: string
          provider_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          name?: string
          provider_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "governorates_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          branch_id: string
          created_at: string | null
          id: string
          max_stock_level: number | null
          min_stock_level: number | null
          product_id: string
          quantity: number
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          id?: string
          max_stock_level?: number | null
          min_stock_level?: number | null
          product_id: string
          quantity?: number
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          id?: string
          max_stock_level?: number | null
          min_stock_level?: number | null
          product_id?: string
          quantity?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_alerts: {
        Row: {
          alert_enabled: boolean | null
          created_at: string | null
          id: string
          min_stock_level: number | null
          product_id: string
          updated_at: string | null
        }
        Insert: {
          alert_enabled?: boolean | null
          created_at?: string | null
          id?: string
          min_stock_level?: number | null
          product_id: string
          updated_at?: string | null
        }
        Update: {
          alert_enabled?: boolean | null
          created_at?: string | null
          id?: string
          min_stock_level?: number | null
          product_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_records: {
        Row: {
          actual_quantity: number
          branch_id: string | null
          created_at: string
          created_by: string | null
          difference: number
          difference_value: number
          expected_quantity: number
          id: string
          inventory_date: string
          notes: string | null
          product_id: string
          purchase_price: number
          status: string
          updated_at: string
        }
        Insert: {
          actual_quantity?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          difference?: number
          difference_value?: number
          expected_quantity?: number
          id?: string
          inventory_date?: string
          notes?: string | null
          product_id: string
          purchase_price?: number
          status?: string
          updated_at?: string
        }
        Update: {
          actual_quantity?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string | null
          difference?: number
          difference_value?: number
          expected_quantity?: number
          id?: string
          inventory_date?: string
          notes?: string | null
          product_id?: string
          purchase_price?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_sessions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_products: number
          created_at: string
          created_by: string | null
          discrepancy_products: number
          id: string
          matched_products: number
          session_date: string
          status: string
          total_difference_value: number
          total_products: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_products?: number
          created_at?: string
          created_by?: string | null
          discrepancy_products?: number
          id?: string
          matched_products?: number
          session_date?: string
          status?: string
          total_difference_value?: number
          total_products?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_products?: number
          created_at?: string
          created_by?: string | null
          discrepancy_products?: number
          id?: string
          matched_products?: number
          session_date?: string
          status?: string
          total_difference_value?: number
          total_products?: number
          updated_at?: string
        }
        Relationships: []
      }
      inventory_transfer_items: {
        Row: {
          id: string
          product_id: string
          quantity: number
          transfer_id: string
        }
        Insert: {
          id?: string
          product_id: string
          quantity: number
          transfer_id: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          from_branch_id: string
          id: string
          notes: string | null
          status: string
          to_branch_id: string
          updated_at: string | null
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          from_branch_id: string
          id?: string
          notes?: string | null
          status?: string
          to_branch_id: string
          updated_at?: string | null
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          from_branch_id?: string
          id?: string
          notes?: string | null
          status?: string
          to_branch_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          auto_print: boolean | null
          auto_send_email: boolean | null
          created_at: string | null
          footer_text: string | null
          id: string
          invoice_prefix: string | null
          next_invoice_number: number | null
          show_contact: boolean | null
          show_logo: boolean | null
          show_tax_id: boolean | null
          tax_id: string | null
          terms_and_conditions: string | null
          updated_at: string | null
        }
        Insert: {
          auto_print?: boolean | null
          auto_send_email?: boolean | null
          created_at?: string | null
          footer_text?: string | null
          id?: string
          invoice_prefix?: string | null
          next_invoice_number?: number | null
          show_contact?: boolean | null
          show_logo?: boolean | null
          show_tax_id?: boolean | null
          tax_id?: string | null
          terms_and_conditions?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_print?: boolean | null
          auto_send_email?: boolean | null
          created_at?: string | null
          footer_text?: string | null
          id?: string
          invoice_prefix?: string | null
          next_invoice_number?: number | null
          show_contact?: boolean | null
          show_logo?: boolean | null
          show_tax_id?: boolean | null
          tax_id?: string | null
          terms_and_conditions?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          score: number | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          score?: number | null
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          score?: number | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      main_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          position: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          position?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          position?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      neighborhoods: {
        Row: {
          active: boolean | null
          area_id: string
          branch_id: string | null
          created_at: string | null
          estimated_time: string | null
          id: string
          name: string
          price: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          area_id: string
          branch_id?: string | null
          created_at?: string | null
          estimated_time?: string | null
          id?: string
          name: string
          price?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          area_id?: string
          branch_id?: string | null
          created_at?: string | null
          estimated_time?: string | null
          id?: string
          name?: string
          price?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "neighborhoods_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      online_orders: {
        Row: {
          branch_id: string | null
          created_at: string | null
          customer_id: string | null
          delivery_location_id: string | null
          delivery_person: string | null
          id: string
          items: Json
          notes: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["order_payment_status"]
          return_status: string | null
          shipping_address: string | null
          shipping_cost: number | null
          status: Database["public"]["Enums"]["order_status"]
          total: number
          tracking_number: string | null
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          delivery_location_id?: string | null
          delivery_person?: string | null
          id?: string
          items: Json
          notes?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["order_payment_status"]
          return_status?: string | null
          shipping_address?: string | null
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          total: number
          tracking_number?: string | null
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          delivery_location_id?: string | null
          delivery_person?: string | null
          id?: string
          items?: Json
          notes?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["order_payment_status"]
          return_status?: string | null
          shipping_address?: string | null
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          total?: number
          tracking_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "online_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "online_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["order_status"]
          notes: string | null
          old_status: Database["public"]["Enums"]["order_status"] | null
          order_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: Database["public"]["Enums"]["order_status"]
          notes?: string | null
          old_status?: Database["public"]["Enums"]["order_status"] | null
          order_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["order_status"]
          notes?: string | null
          old_status?: Database["public"]["Enums"]["order_status"] | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          account_number: string | null
          auto_apply_fees: boolean
          bank_name: string | null
          card_processing_fee: number | null
          created_at: string | null
          e_wallet_name: string | null
          e_wallet_processing_fee: number | null
          enable_card: boolean
          enable_cash: boolean
          enable_e_wallet: boolean
          id: string
          updated_at: string | null
        }
        Insert: {
          account_number?: string | null
          auto_apply_fees?: boolean
          bank_name?: string | null
          card_processing_fee?: number | null
          created_at?: string | null
          e_wallet_name?: string | null
          e_wallet_processing_fee?: number | null
          enable_card?: boolean
          enable_cash?: boolean
          enable_e_wallet?: boolean
          id?: string
          updated_at?: string | null
        }
        Update: {
          account_number?: string | null
          auto_apply_fees?: boolean
          bank_name?: string | null
          card_processing_fee?: number | null
          created_at?: string | null
          e_wallet_name?: string | null
          e_wallet_processing_fee?: number | null
          enable_card?: boolean
          enable_cash?: boolean
          enable_e_wallet?: boolean
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      product_batches: {
        Row: {
          batch_number: string
          branch_id: string | null
          created_at: string
          expiry_date: string
          id: string
          notes: string | null
          product_id: string
          purchase_date: string | null
          purchase_item_id: string | null
          purchase_price: number | null
          quantity: number
          shelf_location: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          batch_number: string
          branch_id?: string | null
          created_at?: string
          expiry_date: string
          id?: string
          notes?: string | null
          product_id: string
          purchase_date?: string | null
          purchase_item_id?: string | null
          purchase_price?: number | null
          quantity?: number
          shelf_location?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          batch_number?: string
          branch_id?: string | null
          created_at?: string
          expiry_date?: string
          id?: string
          notes?: string | null
          product_id?: string
          purchase_date?: string | null
          purchase_item_id?: string | null
          purchase_price?: number | null
          quantity?: number
          shelf_location?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_purchase_item_id_fkey"
            columns: ["purchase_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_collections: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          id: string
          position: number | null
          products: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          position?: number | null
          products?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          position?: number | null
          products?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          active: boolean
          barcode: string | null
          bulk_barcode: string | null
          conversion_factor: number
          created_at: string
          id: string
          image_url: string | null
          name: string
          parent_product_id: string
          position: number | null
          price: number
          purchase_price: number
          updated_at: string
          variant_type: string
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          bulk_barcode?: string | null
          conversion_factor?: number
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          parent_product_id: string
          position?: number | null
          price?: number
          purchase_price?: number
          updated_at?: string
          variant_type: string
        }
        Update: {
          active?: boolean
          barcode?: string | null
          bulk_barcode?: string | null
          conversion_factor?: number
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          parent_product_id?: string
          position?: number | null
          price?: number
          purchase_price?: number
          updated_at?: string
          variant_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_parent_product_id_fkey"
            columns: ["parent_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          barcode_type: string | null
          base_unit: string | null
          bulk_barcode: string | null
          bulk_enabled: boolean | null
          bulk_price: number | null
          bulk_quantity: number | null
          company_id: string | null
          created_at: string | null
          description: string | null
          expiry_date: string | null
          has_variants: boolean | null
          id: string
          image_urls: string[] | null
          is_bulk: boolean | null
          is_offer: boolean | null
          is_variant: boolean | null
          main_category_id: string | null
          manufacturer_name: string | null
          name: string
          offer_price: number | null
          price: number
          purchase_price: number
          quantity: number | null
          shelf_location: string | null
          subcategory_id: string | null
          track_expiry: boolean | null
          unit_of_measure: string | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          barcode_type?: string | null
          base_unit?: string | null
          bulk_barcode?: string | null
          bulk_enabled?: boolean | null
          bulk_price?: number | null
          bulk_quantity?: number | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          expiry_date?: string | null
          has_variants?: boolean | null
          id?: string
          image_urls?: string[] | null
          is_bulk?: boolean | null
          is_offer?: boolean | null
          is_variant?: boolean | null
          main_category_id?: string | null
          manufacturer_name?: string | null
          name: string
          offer_price?: number | null
          price: number
          purchase_price: number
          quantity?: number | null
          shelf_location?: string | null
          subcategory_id?: string | null
          track_expiry?: boolean | null
          unit_of_measure?: string | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          barcode_type?: string | null
          base_unit?: string | null
          bulk_barcode?: string | null
          bulk_enabled?: boolean | null
          bulk_price?: number | null
          bulk_quantity?: number | null
          company_id?: string | null
          created_at?: string | null
          description?: string | null
          expiry_date?: string | null
          has_variants?: boolean | null
          id?: string
          image_urls?: string[] | null
          is_bulk?: boolean | null
          is_offer?: boolean | null
          is_variant?: boolean | null
          main_category_id?: string | null
          manufacturer_name?: string | null
          name?: string
          offer_price?: number | null
          price?: number
          purchase_price?: number
          quantity?: number | null
          shelf_location?: string | null
          subcategory_id?: string | null
          track_expiry?: boolean | null
          unit_of_measure?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_product_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_product_main_category"
            columns: ["main_category_id"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_product_subcategory"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_main_category_id_fkey"
            columns: ["main_category_id"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          batch_number: string | null
          branch_id: string | null
          created_at: string
          expiry_date: string | null
          id: string
          notes: string | null
          price: number
          product_id: string
          purchase_id: string
          quantity: number
          sale_price: number | null
          shelf_location: string | null
          total: number
          updated_at: string | null
        }
        Insert: {
          batch_number?: string | null
          branch_id?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          price: number
          product_id: string
          purchase_id: string
          quantity: number
          sale_price?: number | null
          shelf_location?: string | null
          total: number
          updated_at?: string | null
        }
        Update: {
          batch_number?: string | null
          branch_id?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          price?: number
          product_id?: string
          purchase_id?: string
          quantity?: number
          sale_price?: number | null
          shelf_location?: string | null
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          branch_id: string | null
          created_at: string
          date: string
          description: string | null
          id: string
          invoice_file_url: string | null
          invoice_number: string
          paid: number
          supplier_id: string
          total: number
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          date: string
          description?: string | null
          id?: string
          invoice_file_url?: string | null
          invoice_number: string
          paid: number
          supplier_id: string
          total: number
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          invoice_file_url?: string | null
          invoice_number?: string
          paid?: number
          supplier_id?: string
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          created_at: string | null
          id: string
          price: number
          product_id: string | null
          profit_loss: number | null
          purchase_price: number | null
          quantity: number
          reason: string | null
          return_id: string | null
          total: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          price: number
          product_id?: string | null
          profit_loss?: number | null
          purchase_price?: number | null
          quantity: number
          reason?: string | null
          return_id?: string | null
          total: number
        }
        Update: {
          created_at?: string | null
          id?: string
          price?: number
          product_id?: string | null
          profit_loss?: number | null
          purchase_price?: number | null
          quantity?: number
          reason?: string | null
          return_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      return_request_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string | null
          return_request_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          return_request_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          return_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_request_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_request_items_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          images: string[] | null
          order_id: string
          reason: string
          status: Database["public"]["Enums"]["return_request_status"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          images?: string[] | null
          order_id: string
          reason: string
          status?: Database["public"]["Enums"]["return_request_status"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          images?: string[] | null
          order_id?: string
          reason?: string
          status?: Database["public"]["Enums"]["return_request_status"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          branch_id: string | null
          created_at: string | null
          customer_id: string | null
          customer_name: string | null
          id: string
          order_id: string | null
          reason: string | null
          status: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          order_id?: string | null
          reason?: string | null
          status?: string
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          order_id?: string | null
          reason?: string | null
          status?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      salaries: {
        Row: {
          amount: number
          branch_id: string | null
          created_at: string | null
          created_by: string | null
          employee_id: string
          id: string
          month: number
          notes: string | null
          payment_date: string | null
          status: string
          updated_at: string | null
          year: number
        }
        Insert: {
          amount?: number
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          employee_id: string
          id?: string
          month: number
          notes?: string | null
          payment_date?: string | null
          status?: string
          updated_at?: string | null
          year: number
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          employee_id?: string
          id?: string
          month?: number
          notes?: string | null
          payment_date?: string | null
          status?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "salaries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salaries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salaries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          branch_id: string | null
          card_amount: number | null
          cash_amount: number | null
          cashier_id: string | null
          cashier_name: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          date: string
          discount: number
          id: string
          invoice_number: string
          items: Json
          payment_method: string
          profit: number
          subtotal: number
          total: number
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          card_amount?: number | null
          cash_amount?: number | null
          cashier_id?: string | null
          cashier_name?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          date?: string
          discount?: number
          id?: string
          invoice_number: string
          items: Json
          payment_method: string
          profit: number
          subtotal: number
          total: number
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          card_amount?: number | null
          cash_amount?: number | null
          cashier_id?: string | null
          cashier_name?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          date?: string
          discount?: number
          id?: string
          invoice_number?: string
          items?: Json
          payment_method?: string
          profit?: number
          subtotal?: number
          total?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          created_at: string | null
          employee_id: string | null
          end_time: string | null
          id: string
          start_time: string
          total_hours: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          employee_id?: string | null
          end_time?: string | null
          id?: string
          start_time: string
          total_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string | null
          end_time?: string | null
          id?: string
          start_time?: string
          total_hours?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      special_offers: {
        Row: {
          active: boolean | null
          code: string | null
          created_at: string | null
          description: string | null
          discount_type: string | null
          discount_value: number | null
          expiry_date: string | null
          id: string
          max_discount: number | null
          min_order_amount: number | null
          name: string
          offer_type: string
          updated_at: string | null
          usage_limit: number | null
        }
        Insert: {
          active?: boolean | null
          code?: string | null
          created_at?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          expiry_date?: string | null
          id?: string
          max_discount?: number | null
          min_order_amount?: number | null
          name: string
          offer_type: string
          updated_at?: string | null
          usage_limit?: number | null
        }
        Update: {
          active?: boolean | null
          code?: string | null
          created_at?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          expiry_date?: string | null
          id?: string
          max_discount?: number | null
          min_order_amount?: number | null
          name?: string
          offer_type?: string
          updated_at?: string | null
          usage_limit?: number | null
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          address: string | null
          created_at: string | null
          currency: string
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          primary_color: string | null
          rtl: boolean | null
          updated_at: string | null
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          currency?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          primary_color?: string | null
          rtl?: boolean | null
          updated_at?: string | null
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          currency?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          primary_color?: string | null
          rtl?: boolean | null
          updated_at?: string | null
          vat_number?: string | null
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          name: string
          position: number | null
          updated_at: string | null
        }
        Insert: {
          category_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          position?: number | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          position?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          balance: number | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          balance?: number | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          balance?: number | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tenant_analytics: {
        Row: {
          created_at: string
          id: string
          last_login_at: string | null
          last_order_at: string | null
          month_year: string
          tenant_id: string
          total_orders: number | null
          total_products: number | null
          total_revenue: number | null
          total_users: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          last_order_at?: string | null
          month_year: string
          tenant_id: string
          total_orders?: number | null
          total_products?: number | null
          total_revenue?: number | null
          total_users?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          last_order_at?: string | null
          month_year?: string
          tenant_id?: string
          total_orders?: number | null
          total_products?: number | null
          total_revenue?: number | null
          total_users?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_applications: {
        Row: {
          business_address: string | null
          business_description: string | null
          business_name: string
          business_type: string | null
          created_at: string
          expected_products_count: number | null
          expected_users_count: number | null
          id: string
          owner_email: string
          owner_name: string
          owner_phone: string | null
          rejection_reason: string | null
          requested_subdomain: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          business_address?: string | null
          business_description?: string | null
          business_name: string
          business_type?: string | null
          created_at?: string
          expected_products_count?: number | null
          expected_users_count?: number | null
          id?: string
          owner_email: string
          owner_name: string
          owner_phone?: string | null
          rejection_reason?: string | null
          requested_subdomain: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          business_address?: string | null
          business_description?: string | null
          business_name?: string
          business_type?: string | null
          created_at?: string
          expected_products_count?: number | null
          expected_users_count?: number | null
          id?: string
          owner_email?: string
          owner_name?: string
          owner_phone?: string | null
          rejection_reason?: string | null
          requested_subdomain?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenant_subscriptions: {
        Row: {
          billing_cycle: string
          created_at: string
          ends_at: string
          id: string
          last_payment_at: string | null
          next_payment_at: string | null
          payment_method: Json | null
          plan_name: string
          plan_price: number
          starts_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          created_at?: string
          ends_at: string
          id?: string
          last_payment_at?: string | null
          next_payment_at?: string | null
          payment_method?: Json | null
          plan_name: string
          plan_price?: number
          starts_at: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          created_at?: string
          ends_at?: string
          id?: string
          last_payment_at?: string | null
          next_payment_at?: string | null
          payment_method?: Json | null
          plan_name?: string
          plan_price?: number
          starts_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          permissions: Json | null
          role: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          permissions?: Json | null
          role?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          permissions?: Json | null
          role?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          city: string | null
          contact_email: string | null
          contact_phone: string | null
          country: string | null
          created_at: string
          description: string | null
          domain: string | null
          features: Json | null
          id: string
          limits: Json | null
          logo_url: string | null
          name: string
          settings: Json | null
          status: string
          subdomain: string
          subscription_status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          domain?: string | null
          features?: Json | null
          id?: string
          limits?: Json | null
          logo_url?: string | null
          name: string
          settings?: Json | null
          status?: string
          subdomain: string
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          domain?: string | null
          features?: Json | null
          id?: string
          limits?: Json | null
          logo_url?: string | null
          name?: string
          settings?: Json | null
          status?: string
          subdomain?: string
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_branch_roles: {
        Row: {
          branch_id: string
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_branch_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_branch_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          active: boolean | null
          created_at: string
          email: string | null
          id: string
          name: string
          password: string
          phone: string | null
          role: string
          username: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          password: string
          phone?: string | null
          role: string
          username: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          password?: string
          phone?: string | null
          role?: string
          username?: string
        }
        Relationships: []
      }
      verification_codes: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string
          id: string
          phone: string
          verified: boolean | null
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at: string
          id?: string
          phone: string
          verified?: boolean | null
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          phone?: string
          verified?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_cash_transaction: {
        Args:
          | {
              p_amount: number
              p_branch_id?: string
              p_created_by?: string
              p_notes: string
              p_register_type: string
              p_transaction_type: string
            }
          | {
              p_amount: number
              p_created_by?: string
              p_notes: string
              p_register_type: string
              p_transaction_type: string
            }
          | {
              p_amount: number
              p_notes: string
              p_register_type: string
              p_transaction_type: string
            }
        Returns: number
      }
      add_cash_transaction_api: {
        Args: {
          p_amount: number
          p_branch_id?: string
          p_created_by?: string
          p_notes: string
          p_register_type: string
          p_transaction_type: string
        }
        Returns: number
      }
      create_bucket_if_not_exists: {
        Args: { bucket_name: string }
        Returns: undefined
      }
      create_verification_codes_table: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      get_admin_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_current_cash_balance: {
        Args: { p_branch_id?: string; p_register_type: string }
        Returns: number
      }
      get_customer_id_from_user: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_merged_cash_balance: {
        Args: Record<PropertyKey, never> | { p_branch_id?: string }
        Returns: number
      }
      get_next_invoice_number: {
        Args: { p_branch_id: string }
        Returns: string
      }
      has_branch_access: {
        Args: { _branch: string; _user: string }
        Returns: boolean
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_super_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      record_merged_cash_transaction: {
        Args:
          | {
              p_amount: number
              p_branch_id?: string
              p_created_by?: string
              p_notes: string
              p_transaction_type: string
            }
          | {
              p_amount: number
              p_created_by?: string
              p_notes: string
              p_transaction_type: string
            }
        Returns: number
      }
      sales_summary_by_branch: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          branch_id: string
          branch_name: string
          sales_count: number
          total_profit: number
          total_sales: number
        }[]
      }
      top_products_by_branch: {
        Args: {
          p_branch?: string
          p_end?: string
          p_limit?: number
          p_start?: string
        }
        Returns: {
          branch_id: string
          branch_name: string
          product_id: string
          product_name: string
          qty_sold: number
          total_sales: number
        }[]
      }
    }
    Enums: {
      order_payment_status: "pending" | "paid" | "failed" | "refunded"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "shipped"
        | "delivered"
        | "cancelled"
      register_type: "store" | "online"
      return_request_status: "pending" | "approved" | "rejected"
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
      order_payment_status: ["pending", "paid", "failed", "refunded"],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "shipped",
        "delivered",
        "cancelled",
      ],
      register_type: ["store", "online"],
      return_request_status: ["pending", "approved", "rejected"],
    },
  },
} as const

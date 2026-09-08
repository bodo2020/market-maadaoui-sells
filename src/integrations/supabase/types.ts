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
      branch_delivery_zones: {
        Row: {
          branch_id: string
          color: string | null
          created_at: string | null
          delivery_price: number
          estimated_time: string | null
          id: string
          is_active: boolean | null
          polygon_coordinates: Json
          priority: number | null
          updated_at: string | null
          zone_name: string
        }
        Insert: {
          branch_id: string
          color?: string | null
          created_at?: string | null
          delivery_price?: number
          estimated_time?: string | null
          id?: string
          is_active?: boolean | null
          polygon_coordinates: Json
          priority?: number | null
          updated_at?: string | null
          zone_name: string
        }
        Update: {
          branch_id?: string
          color?: string | null
          created_at?: string | null
          delivery_price?: number
          estimated_time?: string | null
          id?: string
          is_active?: boolean | null
          polygon_coordinates?: Json
          priority?: number | null
          updated_at?: string | null
          zone_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_delivery_zones_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_neighborhoods: {
        Row: {
          active: boolean | null
          branch_id: string
          created_at: string | null
          delivery_radius_km: number | null
          estimated_time: string | null
          id: string
          is_primary: boolean | null
          neighborhood_id: string
          price: number | null
          priority: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          branch_id: string
          created_at?: string | null
          delivery_radius_km?: number | null
          estimated_time?: string | null
          id?: string
          is_primary?: boolean | null
          neighborhood_id: string
          price?: number | null
          priority?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          branch_id?: string
          created_at?: string | null
          delivery_radius_km?: number | null
          estimated_time?: string | null
          id?: string
          is_primary?: boolean | null
          neighborhood_id?: string
          price?: number | null
          priority?: number | null
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
      branch_product_pricing: {
        Row: {
          branch_id: string
          created_at: string | null
          id: string
          is_offer: boolean | null
          offer_price: number | null
          product_id: string
          purchase_price: number
          sale_price: number
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          id?: string
          is_offer?: boolean | null
          offer_price?: number | null
          product_id: string
          purchase_price: number
          sale_price: number
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          id?: string
          is_offer?: boolean | null
          offer_price?: number | null
          product_id?: string
          purchase_price?: number
          sale_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_product_pricing_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_product_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean | null
          address: string | null
          branch_type: Database["public"]["Enums"]["branch_type"]
          category: Database["public"]["Enums"]["branch_category"] | null
          closes_at: string | null
          code: string | null
          commission_rate: number | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string | null
          delivery_enabled: boolean
          delivery_fee: number
          delivery_radius_km: number
          email: string | null
          estimated_delivery_minutes: number | null
          franchise_code: string | null
          hub_branch_id: string | null
          id: string
          independent_inventory: boolean | null
          independent_pricing: boolean | null
          inventory_source_branch_id: string
          latitude: number | null
          longitude: number | null
          min_order_amount: number
          monthly_fee: number | null
          name: string
          opens_at: string | null
          parent_branch_id: string | null
          phone: string | null
          pricing_source_branch_id: string
          schema_name: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          branch_type?: Database["public"]["Enums"]["branch_type"]
          category?: Database["public"]["Enums"]["branch_category"] | null
          closes_at?: string | null
          code?: string | null
          commission_rate?: number | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          delivery_enabled?: boolean
          delivery_fee?: number
          delivery_radius_km?: number
          email?: string | null
          estimated_delivery_minutes?: number | null
          franchise_code?: string | null
          hub_branch_id?: string | null
          id?: string
          independent_inventory?: boolean | null
          independent_pricing?: boolean | null
          inventory_source_branch_id: string
          latitude?: number | null
          longitude?: number | null
          min_order_amount?: number
          monthly_fee?: number | null
          name: string
          opens_at?: string | null
          parent_branch_id?: string | null
          phone?: string | null
          pricing_source_branch_id: string
          schema_name?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          branch_type?: Database["public"]["Enums"]["branch_type"]
          category?: Database["public"]["Enums"]["branch_category"] | null
          closes_at?: string | null
          code?: string | null
          commission_rate?: number | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          delivery_enabled?: boolean
          delivery_fee?: number
          delivery_radius_km?: number
          email?: string | null
          estimated_delivery_minutes?: number | null
          franchise_code?: string | null
          hub_branch_id?: string | null
          id?: string
          independent_inventory?: boolean | null
          independent_pricing?: boolean | null
          inventory_source_branch_id?: string
          latitude?: number | null
          longitude?: number | null
          min_order_amount?: number
          monthly_fee?: number | null
          name?: string
          opens_at?: string | null
          parent_branch_id?: string | null
          phone?: string | null
          pricing_source_branch_id?: string
          schema_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branches_hub_branch_id_fkey"
            columns: ["hub_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_inventory_source_branch_id_fkey"
            columns: ["inventory_source_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_parent_branch_id_fkey"
            columns: ["parent_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_pricing_source_branch_id_fkey"
            columns: ["pricing_source_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
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
      cash_accounts: {
        Row: {
          account_type: string
          active: boolean
          branch_id: string
          created_at: string
          currency: string
          device_id: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          account_type: string
          active?: boolean
          branch_id: string
          created_at?: string
          currency?: string
          device_id?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          account_type?: string
          active?: boolean
          branch_id?: string
          created_at?: string
          currency?: string
          device_id?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_accounts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_ledger: {
        Row: {
          account_id: string
          branch_id: string
          created_at: string
          created_by: string | null
          description: string | null
          device_id: string | null
          entry_type: string
          id: string
          metadata: Json
          reference_id: string | null
          reference_type: string | null
          shift_id: string | null
          signed_amount: number
          transfer_id: string | null
          user_id: string | null
        }
        Insert: {
          account_id: string
          branch_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          device_id?: string | null
          entry_type: string
          id?: string
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
          shift_id?: string | null
          signed_amount: number
          transfer_id?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string
          branch_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          device_id?: string | null
          entry_type?: string
          id?: string
          metadata?: Json
          reference_id?: string | null
          reference_type?: string | null
          shift_id?: string | null
          signed_amount?: number
          transfer_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "cash_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
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
          from_account_id: string | null
          from_register: string
          from_transaction_id: string | null
          id: string
          notes: string | null
          shift_id: string | null
          status: string
          to_account_id: string | null
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
          from_account_id?: string | null
          from_register: string
          from_transaction_id?: string | null
          id?: string
          notes?: string | null
          shift_id?: string | null
          status?: string
          to_account_id?: string | null
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
          from_account_id?: string | null
          from_register?: string
          from_transaction_id?: string | null
          id?: string
          notes?: string | null
          shift_id?: string | null
          status?: string
          to_account_id?: string | null
          to_register?: string
          to_transaction_id?: string | null
          transfer_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
        ]
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
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
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
          assigned_branch_id: string | null
          city_id: string | null
          created_at: string | null
          distance_km: number | null
          governorate_id: string | null
          id: string
          is_default: boolean | null
          is_deliverable: boolean
          latitude: number | null
          longitude: number | null
          neighborhood_id: string | null
          road_distance_checked_at: string | null
          road_distance_km: number | null
          road_duration_minutes: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address: string
          area_id?: string | null
          assigned_branch_id?: string | null
          city_id?: string | null
          created_at?: string | null
          distance_km?: number | null
          governorate_id?: string | null
          id?: string
          is_default?: boolean | null
          is_deliverable?: boolean
          latitude?: number | null
          longitude?: number | null
          neighborhood_id?: string | null
          road_distance_checked_at?: string | null
          road_distance_km?: number | null
          road_duration_minutes?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string
          area_id?: string | null
          assigned_branch_id?: string | null
          city_id?: string | null
          created_at?: string | null
          distance_km?: number | null
          governorate_id?: string | null
          id?: string
          is_default?: boolean | null
          is_deliverable?: boolean
          latitude?: number | null
          longitude?: number | null
          neighborhood_id?: string | null
          road_distance_checked_at?: string | null
          road_distance_km?: number | null
          road_duration_minutes?: number | null
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
            foreignKeyName: "customer_addresses_assigned_branch_id_fkey"
            columns: ["assigned_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
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
      customer_notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          order_id: string | null
          read_at: string | null
          status: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          order_id?: string | null
          read_at?: string | null
          status?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          order_id?: string | null
          read_at?: string | null
          status?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
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
          created_by: string | null
          date: string
          description: string
          id: string
          paid_from_account_id: string | null
          payment_method: string | null
          receipt_url: string | null
          shift_id: string | null
          status: string
          type: string
          updated_at: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date: string
          description: string
          id?: string
          paid_from_account_id?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          shift_id?: string | null
          status?: string
          type: string
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          description?: string
          id?: string
          paid_from_account_id?: string | null
          payment_method?: string | null
          receipt_url?: string | null
          shift_id?: string | null
          status?: string
          type?: string
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "users"
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
          variant_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          product_id: string
          user_id?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string | null
          id?: string
          product_id?: string
          user_id?: string | null
          variant_id?: string | null
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
          {
            foreignKeyName: "favorites_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_settings: {
        Row: {
          branch_id: string
          can_add_products: boolean | null
          can_manage_inventory: boolean | null
          can_modify_prices: boolean | null
          can_view_analytics: boolean | null
          created_at: string | null
          id: string
          max_discount_percentage: number | null
          payment_terms: string | null
          profit_share_percentage: number | null
          requires_approval_for_orders: boolean | null
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          can_add_products?: boolean | null
          can_manage_inventory?: boolean | null
          can_modify_prices?: boolean | null
          can_view_analytics?: boolean | null
          created_at?: string | null
          id?: string
          max_discount_percentage?: number | null
          payment_terms?: string | null
          profit_share_percentage?: number | null
          requires_approval_for_orders?: boolean | null
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          can_add_products?: boolean | null
          can_manage_inventory?: boolean | null
          can_modify_prices?: boolean | null
          can_view_analytics?: boolean | null
          created_at?: string | null
          id?: string
          max_discount_percentage?: number | null
          payment_terms?: string | null
          profit_share_percentage?: number | null
          requires_approval_for_orders?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
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
          branch_id: string
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
          branch_id: string
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
          branch_id?: string
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
        Relationships: [
          {
            foreignKeyName: "inventory_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
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
          actual_arrival_date: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          expected_arrival_date: string | null
          from_branch_id: string
          id: string
          notes: string | null
          status: string
          to_branch_id: string
          transfer_type: string | null
          updated_at: string | null
        }
        Insert: {
          actual_arrival_date?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_arrival_date?: string | null
          from_branch_id: string
          id?: string
          notes?: string | null
          status?: string
          to_branch_id: string
          transfer_type?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_arrival_date?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          expected_arrival_date?: string | null
          from_branch_id?: string
          id?: string
          notes?: string | null
          status?: string
          to_branch_id?: string
          transfer_type?: string | null
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
          checkout_fingerprint: string | null
          checkout_version: number | null
          created_at: string | null
          customer_id: string | null
          customer_snapshot: Json | null
          delivery_location_id: string | null
          delivery_person: string | null
          delivery_zone_id: string | null
          id: string
          items: Json
          notes: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["order_payment_status"]
          return_status: string | null
          shipping_address: string | null
          shipping_cost: number | null
          shipping_snapshot: Json | null
          status: Database["public"]["Enums"]["order_status"]
          stock_deductions: Json | null
          stock_released_at: string | null
          total: number
          tracking_number: string | null
          updated_at: string | null
        }
        Insert: {
          branch_id?: string | null
          checkout_fingerprint?: string | null
          checkout_version?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_snapshot?: Json | null
          delivery_location_id?: string | null
          delivery_person?: string | null
          delivery_zone_id?: string | null
          id?: string
          items: Json
          notes?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["order_payment_status"]
          return_status?: string | null
          shipping_address?: string | null
          shipping_cost?: number | null
          shipping_snapshot?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          stock_deductions?: Json | null
          stock_released_at?: string | null
          total: number
          tracking_number?: string | null
          updated_at?: string | null
        }
        Update: {
          branch_id?: string | null
          checkout_fingerprint?: string | null
          checkout_version?: number | null
          created_at?: string | null
          customer_id?: string | null
          customer_snapshot?: Json | null
          delivery_location_id?: string | null
          delivery_person?: string | null
          delivery_zone_id?: string | null
          id?: string
          items?: Json
          notes?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["order_payment_status"]
          return_status?: string | null
          shipping_address?: string | null
          shipping_cost?: number | null
          shipping_snapshot?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          stock_deductions?: Json | null
          stock_released_at?: string | null
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
          {
            foreignKeyName: "online_orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "branch_delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      order_routing_log: {
        Row: {
          assigned_branch_id: string | null
          created_at: string | null
          id: string
          neighborhood_id: string | null
          order_id: string | null
          routing_reason: string | null
        }
        Insert: {
          assigned_branch_id?: string | null
          created_at?: string | null
          id?: string
          neighborhood_id?: string | null
          order_id?: string | null
          routing_reason?: string | null
        }
        Update: {
          assigned_branch_id?: string | null
          created_at?: string | null
          id?: string
          neighborhood_id?: string | null
          order_id?: string | null
          routing_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_routing_log_assigned_branch_id_fkey"
            columns: ["assigned_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_routing_log_neighborhood_id_fkey"
            columns: ["neighborhood_id"]
            isOneToOne: false
            referencedRelation: "neighborhoods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_routing_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
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
      payment_accounts: {
        Row: {
          account_type: string
          active: boolean
          branch_id: string
          created_at: string
          currency: string
          id: string
          name: string
          provider_code: string
          updated_at: string
        }
        Insert: {
          account_type: string
          active?: boolean
          branch_id: string
          created_at?: string
          currency?: string
          id?: string
          name: string
          provider_code: string
          updated_at?: string
        }
        Update: {
          account_type?: string
          active?: boolean
          branch_id?: string
          created_at?: string
          currency?: string
          id?: string
          name?: string
          provider_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_ledger: {
        Row: {
          account_id: string
          branch_id: string
          created_at: string
          created_by: string | null
          description: string | null
          entry_type: string
          external_reference: string | null
          id: string
          metadata: Json
          order_id: string | null
          payment_method: string | null
          return_id: string | null
          settlement_id: string | null
          signed_amount: number
        }
        Insert: {
          account_id: string
          branch_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_type: string
          external_reference?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          payment_method?: string | null
          return_id?: string | null
          settlement_id?: string | null
          signed_amount: number
        }
        Update: {
          account_id?: string
          branch_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          entry_type?: string
          external_reference?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          payment_method?: string | null
          return_id?: string | null
          settlement_id?: string | null
          signed_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_ledger_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_ledger_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_ledger_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_ledger_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "payment_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_refunds: {
        Row: {
          amount: number
          branch_id: string
          clearing_account_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          order_id: string
          payment_method: string
          provider_reference: string | null
          return_id: string
          status: string
        }
        Insert: {
          amount: number
          branch_id: string
          clearing_account_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          order_id: string
          payment_method: string
          provider_reference?: string | null
          return_id: string
          status?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          clearing_account_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string
          payment_method?: string
          provider_reference?: string | null
          return_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_refunds_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_clearing_account_id_fkey"
            columns: ["clearing_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_refunds_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: true
            referencedRelation: "returns"
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
      payment_settlements: {
        Row: {
          bank_account_id: string
          branch_id: string
          clearing_account_id: string
          created_at: string
          created_by: string | null
          fee_amount: number
          gross_amount: number
          id: string
          net_amount: number
          note: string | null
          payment_method: string
          provider_reference: string | null
          settled_at: string
        }
        Insert: {
          bank_account_id: string
          branch_id: string
          clearing_account_id: string
          created_at?: string
          created_by?: string | null
          fee_amount?: number
          gross_amount: number
          id?: string
          net_amount: number
          note?: string | null
          payment_method: string
          provider_reference?: string | null
          settled_at?: string
        }
        Update: {
          bank_account_id?: string
          branch_id?: string
          clearing_account_id?: string
          created_at?: string
          created_by?: string | null
          fee_amount?: number
          gross_amount?: number
          id?: string
          net_amount?: number
          note?: string | null
          payment_method?: string
          provider_reference?: string | null
          settled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlements_clearing_account_id_fkey"
            columns: ["clearing_account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_card_refunds: {
        Row: {
          amount: number
          branch_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          device_id: string | null
          failed_at: string | null
          failure_reason: string | null
          id: string
          provider_reference: string | null
          return_id: string
          sale_id: string
          shift_id: string | null
          status: string
        }
        Insert: {
          amount: number
          branch_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          provider_reference?: string | null
          return_id: string
          sale_id: string
          shift_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          id?: string
          provider_reference?: string | null
          return_id?: string
          sale_id?: string
          shift_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_card_refunds_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_card_refunds_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_card_refunds_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_card_refunds_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_card_refunds_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: true
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_card_refunds_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_card_refunds_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_devices: {
        Row: {
          active: boolean
          auto_lock_minutes: number
          branch_id: string
          cash_warning_threshold: number | null
          device_code: string
          device_token_hash: string
          id: string
          last_seen_at: string | null
          name: string
          registered_at: string
          registered_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_lock_minutes?: number
          branch_id: string
          cash_warning_threshold?: number | null
          device_code: string
          device_token_hash: string
          id?: string
          last_seen_at?: string | null
          name: string
          registered_at?: string
          registered_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_lock_minutes?: number
          branch_id?: string
          cash_warning_threshold?: number | null
          device_code?: string
          device_token_hash?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          registered_at?: string
          registered_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_devices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_devices_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_invoice_counters: {
        Row: {
          branch_id: string
          business_date: string
          last_number: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_date: string
          last_number?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_date?: string
          last_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_invoice_counters_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_operational_events: {
        Row: {
          branch_id: string
          created_at: string
          details: Json
          device_id: string | null
          event_type: string
          id: string
          message_code: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          shift_id: string | null
          user_id: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          details?: Json
          device_id?: string | null
          event_type: string
          id?: string
          message_code?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          shift_id?: string | null
          user_id?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          details?: Json
          device_id?: string | null
          event_type?: string
          id?: string
          message_code?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          shift_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_operational_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_operational_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_operational_events_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_operational_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_operational_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_shifts: {
        Row: {
          branch_id: string
          cash_difference: number | null
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          closing_notes: string | null
          created_at: string
          device_id: string
          drawer_account_id: string | null
          expected_cash: number | null
          id: string
          opened_at: string
          opening_cash: number
          opening_system_balance: number | null
          opening_variance: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          closing_notes?: string | null
          created_at?: string
          device_id: string
          drawer_account_id?: string | null
          expected_cash?: number | null
          id?: string
          opened_at?: string
          opening_cash?: number
          opening_system_balance?: number | null
          opening_variance?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          cash_difference?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          closing_notes?: string | null
          created_at?: string
          device_id?: string
          drawer_account_id?: string | null
          expected_cash?: number | null
          id?: string
          opened_at?: string
          opening_cash?: number
          opening_system_balance?: number | null
          opening_variance?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_drawer_account_id_fkey"
            columns: ["drawer_account_id"]
            isOneToOne: false
            referencedRelation: "cash_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_workspace_backups: {
        Row: {
          active_tab_id: string | null
          branch_id: string
          device_id: string | null
          tabs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          active_tab_id?: string | null
          branch_id: string
          device_id?: string | null
          tabs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          active_tab_id?: string | null
          branch_id?: string
          device_id?: string | null
          tabs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_workspace_backups_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_workspace_backups_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_workspace_backups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
          branch_id: string | null
          bulk_barcode: string | null
          bulk_enabled: boolean | null
          bulk_price: number | null
          bulk_quantity: number | null
          company_id: string | null
          created_at: string | null
          default_weight_grams: number
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
          branch_id?: string | null
          bulk_barcode?: string | null
          bulk_enabled?: boolean | null
          bulk_price?: number | null
          bulk_quantity?: number | null
          company_id?: string | null
          created_at?: string | null
          default_weight_grams?: number
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
          branch_id?: string | null
          bulk_barcode?: string | null
          bulk_enabled?: boolean | null
          bulk_price?: number | null
          bulk_quantity?: number | null
          company_id?: string | null
          created_at?: string | null
          default_weight_grams?: number
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
            foreignKeyName: "products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
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
          line_original_total: number | null
          price: number
          product_id: string | null
          profit_loss: number | null
          purchase_price: number | null
          quantity: number
          reason: string | null
          return_id: string | null
          sale_line_index: number | null
          sold_quantity: number | null
          total: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          line_original_total?: number | null
          price: number
          product_id?: string | null
          profit_loss?: number | null
          purchase_price?: number | null
          quantity: number
          reason?: string | null
          return_id?: string | null
          sale_line_index?: number | null
          sold_quantity?: number | null
          total: number
        }
        Update: {
          created_at?: string | null
          id?: string
          line_original_total?: number | null
          price?: number
          product_id?: string | null
          profit_loss?: number | null
          purchase_price?: number | null
          quantity?: number
          reason?: string | null
          return_id?: string | null
          sale_line_index?: number | null
          sold_quantity?: number | null
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
          approved_at: string | null
          approved_by: string | null
          branch_id: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          device_id: string | null
          id: string
          inventory_restored_at: string | null
          order_id: string | null
          pos_request_id: string | null
          reason: string | null
          refund_account_id: string | null
          refund_card_amount: number
          refund_cash_amount: number
          refund_method: string | null
          refund_status: string
          sale_id: string | null
          shift_id: string | null
          source: string
          status: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          device_id?: string | null
          id?: string
          inventory_restored_at?: string | null
          order_id?: string | null
          pos_request_id?: string | null
          reason?: string | null
          refund_account_id?: string | null
          refund_card_amount?: number
          refund_cash_amount?: number
          refund_method?: string | null
          refund_status?: string
          sale_id?: string | null
          shift_id?: string | null
          source?: string
          status?: string
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          device_id?: string | null
          id?: string
          inventory_restored_at?: string | null
          order_id?: string | null
          pos_request_id?: string | null
          reason?: string | null
          refund_account_id?: string | null
          refund_card_amount?: number
          refund_cash_amount?: number
          refund_method?: string | null
          refund_status?: string
          sale_id?: string | null
          shift_id?: string | null
          source?: string
          status?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "returns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
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
            foreignKeyName: "returns_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "online_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
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
          device_id: string | null
          discount: number
          id: string
          invoice_number: string
          items: Json
          payment_method: string
          profit: number
          request_fingerprint: string | null
          shift_id: string | null
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
          device_id?: string | null
          discount?: number
          id?: string
          invoice_number: string
          items: Json
          payment_method: string
          profit: number
          request_fingerprint?: string | null
          shift_id?: string | null
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
          device_id?: string | null
          discount?: number
          id?: string
          invoice_number?: string
          items?: Json
          payment_method?: string
          profit?: number
          request_fingerprint?: string | null
          shift_id?: string | null
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
          {
            foreignKeyName: "sales_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "pos_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
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
      staff_login_attempts: {
        Row: {
          created_at: string
          id: string
          identifier_hash: string
          ip_hash: string | null
          success: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          identifier_hash: string
          ip_hash?: string | null
          success?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          identifier_hash?: string
          ip_hash?: string | null
          success?: boolean
        }
        Relationships: []
      }
      staff_permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          module: string
          name_ar: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          module: string
          name_ar: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          module?: string
          name_ar?: string
        }
        Relationships: []
      }
      staff_pos_pins: {
        Row: {
          branch_id: string
          created_at: string
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_pos_pins_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_pos_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_role_permissions: {
        Row: {
          created_at: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "staff_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "staff_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_roles: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name_ar: string
          scope: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name_ar: string
          scope: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name_ar?: string
          scope?: string
          updated_at?: string
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
          active: boolean
          branch_id: string
          created_at: string | null
          id: string
          is_primary: boolean
          pos_enabled: boolean
          role: string
          role_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          branch_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean
          pos_enabled?: boolean
          role?: string
          role_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          branch_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean
          pos_enabled?: boolean
          role?: string
          role_id?: string | null
          updated_at?: string
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
            foreignKeyName: "user_branch_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "staff_roles"
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
          system_role_id: string | null
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
          system_role_id?: string | null
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
          system_role_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_system_role_id_fkey"
            columns: ["system_role_id"]
            isOneToOne: false
            referencedRelation: "staff_roles"
            referencedColumns: ["id"]
          },
        ]
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
      add_cash_transaction:
        | {
            Args: {
              p_amount: number
              p_notes: string
              p_register_type: string
              p_transaction_type: string
            }
            Returns: number
          }
        | {
            Args: {
              p_amount: number
              p_created_by?: string
              p_notes: string
              p_register_type: string
              p_transaction_type: string
            }
            Returns: number
          }
        | {
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
      add_float_to_pos_drawer: {
        Args: {
          p_amount: number
          p_branch_id: string
          p_device_id: string
          p_note?: string
        }
        Returns: Json
      }
      adjust_branch_inventory: {
        Args: {
          p_branch_id: string
          p_delta: number
          p_product_id: string
          p_request_id: string
        }
        Returns: number
      }
      approve_return_atomic: {
        Args: { p_refund_source?: string; p_return_id: string }
        Returns: Json
      }
      auto_transfer_from_hub: {
        Args: {
          p_product_id: string
          p_quantity: number
          p_target_branch_id: string
        }
        Returns: string
      }
      calculate_branch_needs: {
        Args: never
        Returns: {
          branch_id: string
          branch_name: string
          current_quantity: number
          min_stock_level: number
          needed_quantity: number
          product_id: string
          product_name: string
        }[]
      }
      cash_drop_to_safe: {
        Args: {
          p_amount: number
          p_device_id: string
          p_device_token: string
          p_note?: string
        }
        Returns: Json
      }
      check_point_in_delivery_zone: {
        Args: { p_lat: number; p_lng: number }
        Returns: {
          branch_id: string
          branch_name: string
          delivery_price: number
          estimated_time: string
          priority: number
          zone_id: string
          zone_name: string
        }[]
      }
      clear_my_pos_workspace: {
        Args: { p_branch_id: string }
        Returns: undefined
      }
      close_pos_shift: {
        Args: {
          p_closing_cash: number
          p_device_id: string
          p_device_token: string
          p_notes?: string
          p_shift_id: string
        }
        Returns: Json
      }
      confirm_online_refund: {
        Args: { p_provider_reference?: string; p_refund_id: string }
        Returns: Json
      }
      confirm_pos_card_refund: {
        Args: { p_provider_reference: string; p_refund_id: string }
        Returns: Json
      }
      create_branch_expense_atomic: {
        Args: {
          p_amount: number
          p_branch_id: string
          p_date?: string
          p_description: string
          p_receipt_url?: string
          p_source?: string
          p_type: string
        }
        Returns: Json
      }
      create_branch_schema: {
        Args: { p_branch_code: string; p_branch_id: string }
        Returns: string
      }
      create_bucket_if_not_exists: {
        Args: { bucket_name: string }
        Returns: undefined
      }
      create_customer_return_request: {
        Args: {
          p_images?: string[]
          p_items: Json
          p_order_id: string
          p_reason: string
        }
        Returns: string
      }
      create_pos_sale: {
        Args: { p_branch_id: string; p_request_id: string; p_sale: Json }
        Returns: Json
      }
      create_pos_sale_return: {
        Args: {
          p_device_id: string
          p_device_token: string
          p_items: Json
          p_reason?: string
          p_request_id: string
          p_sale_id: string
        }
        Returns: Json
      }
      create_verification_codes_table: { Args: never; Returns: undefined }
      deposit_online_cash_to_safe: {
        Args: { p_amount: number; p_branch_id: string; p_note?: string }
        Returns: Json
      }
      find_delivery_branch: {
        Args: { p_latitude: number; p_longitude: number }
        Returns: {
          branch_id: string
          branch_name: string
          delivery_fee: number
          delivery_radius_km: number
          distance_km: number
          estimated_delivery_minutes: number
          min_order_amount: number
        }[]
      }
      get_admin_role: { Args: never; Returns: string }
      get_branch_cash_overview: { Args: { p_branch_id: string }; Returns: Json }
      get_branch_for_neighborhood: {
        Args: { p_neighborhood_id: string }
        Returns: {
          branch_address: string
          branch_id: string
          branch_name: string
          branch_phone: string
          branch_type: Database["public"]["Enums"]["branch_type"]
          category: Database["public"]["Enums"]["branch_category"]
          priority: number
          routing_reason: string
        }[]
      }
      get_branch_from_neighborhood: {
        Args: { p_neighborhood_id: string }
        Returns: {
          branch_address: string
          branch_id: string
          branch_name: string
          branch_phone: string
        }[]
      }
      get_branch_neighborhoods: {
        Args: { p_branch_id: string }
        Returns: {
          active: boolean
          area_name: string
          city_name: string
          estimated_time: string
          governorate_name: string
          neighborhood_id: string
          neighborhood_name: string
          price: number
        }[]
      }
      get_branch_performance: {
        Args: {
          p_branch_id: string
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          avg_order_value: number
          completed_orders: number
          pending_orders: number
          total_orders: number
          total_revenue: number
        }[]
      }
      get_branch_pos_staff_status: {
        Args: { p_branch_id: string }
        Returns: {
          active: boolean
          has_pin: boolean
          name: string
          pos_enabled: boolean
          role_code: string
          role_name_ar: string
          user_id: string
          username: string
        }[]
      }
      get_branch_products: {
        Args: { p_branch_id: string }
        Returns: {
          product_id: string
        }[]
      }
      get_branches_by_category: {
        Args: { p_category: Database["public"]["Enums"]["branch_category"] }
        Returns: {
          active: boolean
          address: string
          branch_type: Database["public"]["Enums"]["branch_type"]
          category: Database["public"]["Enums"]["branch_category"]
          commission_rate: number
          franchise_code: string
          id: string
          name: string
          phone: string
        }[]
      }
      get_current_cash_balance: {
        Args: { p_branch_id?: string; p_register_type: string }
        Returns: number
      }
      get_customer_branch_catalog: {
        Args: {
          p_barcode?: string
          p_branch_id: string
          p_company_id?: string
          p_limit?: number
          p_main_category_id?: string
          p_product_id?: string
          p_search?: string
          p_subcategory_id?: string
        }
        Returns: Json[]
      }
      get_customer_branch_products_by_ids: {
        Args: { p_branch_id: string; p_product_ids: string[] }
        Returns: Json[]
      }
      get_customer_branch_runtime: {
        Args: { p_branch_id: string }
        Returns: Json
      }
      get_customer_id_from_user: { Args: never; Returns: string }
      get_delivery_price: {
        Args: { p_branch_id: string; p_neighborhood_id: string }
        Returns: {
          estimated_time: string
          price: number
        }[]
      }
      get_legacy_bulk_review_queue: {
        Args: { p_branch_id: string }
        Returns: Json[]
      }
      get_merged_cash_balance:
        | { Args: never; Returns: number }
        | { Args: { p_branch_id?: string }; Returns: number }
      get_my_open_pos_shift: {
        Args: { p_device_id: string; p_device_token: string }
        Returns: Json
      }
      get_my_pos_cash_summary: {
        Args: { p_device_id: string; p_device_token: string }
        Returns: Json
      }
      get_my_pos_workspace: { Args: { p_branch_id: string }; Returns: Json }
      get_my_staff_branches: {
        Args: never
        Returns: {
          branch_code: string
          branch_id: string
          branch_name: string
          is_primary: boolean
          permissions: string[]
          pos_enabled: boolean
          role_code: string
          role_name_ar: string
        }[]
      }
      get_my_staff_identity: { Args: never; Returns: Json }
      get_next_invoice_number: {
        Args: { p_branch_id: string }
        Returns: string
      }
      get_online_money_overview: {
        Args: { p_branch_id: string }
        Returns: Json
      }
      get_pending_online_refunds: {
        Args: { p_branch_id: string }
        Returns: {
          amount: number
          created_at: string
          order_id: string
          payment_method: string
          provider_reference: string
          refund_id: string
          return_id: string
          status: string
        }[]
      }
      get_pos_branch_catalog: {
        Args: {
          p_barcode?: string
          p_branch_id: string
          p_limit?: number
          p_search?: string
        }
        Returns: Json[]
      }
      get_pos_runtime_status: {
        Args: { p_device_id: string; p_device_token: string }
        Returns: Json
      }
      get_pos_sale_return_preview: {
        Args: { p_sale_id: string }
        Returns: Json
      }
      get_product_details_pro: {
        Args: { p_branch_id: string; p_product_id: string }
        Returns: Json
      }
      get_product_management_catalog: {
        Args: {
          p_branch_id: string
          p_category_id?: string
          p_company_id?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: Json[]
      }
      get_product_management_stats: {
        Args: { p_branch_id: string }
        Returns: Json
      }
      get_product_price: {
        Args: { p_branch_id: string; p_product_id: string }
        Returns: {
          is_offer: boolean
          offer_price: number
          purchase_price: number
          sale_price: number
        }[]
      }
      has_branch_access: {
        Args: { _branch: string; _user: string }
        Returns: boolean
      }
      has_my_pos_pin: { Args: { p_branch_id: string }; Returns: boolean }
      import_product_rows: {
        Args: { p_branch_id: string; p_mode?: string; p_rows: Json }
        Returns: Json
      }
      initialize_branch_safe: {
        Args: { p_amount: number; p_branch_id: string; p_note?: string }
        Returns: Json
      }
      initialize_external_branch: {
        Args: { p_branch_code: string; p_branch_id: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_delivery_available: {
        Args: { p_branch_id: string; p_neighborhood_id: string }
        Returns: boolean
      }
      is_external_branch: { Args: { p_branch_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      list_branch_pending_pos_card_refunds: {
        Args: { p_branch_id: string }
        Returns: Json
      }
      list_branch_pos_operational_events: {
        Args: { p_branch_id: string; p_limit?: number; p_severity?: string }
        Returns: Json[]
      }
      list_branch_pos_shifts: {
        Args: { p_branch_id: string; p_limit?: number; p_status?: string }
        Returns: Json[]
      }
      list_pos_devices: {
        Args: { p_branch_id: string }
        Returns: {
          active: boolean
          auto_lock_minutes: number
          cash_warning_threshold: number
          current_employee_name: string
          current_shift_id: string
          current_user_id: string
          device_code: string
          device_id: string
          device_name: string
          last_seen_at: string
          registered_at: string
          shift_opened_at: string
        }[]
      }
      list_pos_quick_staff: {
        Args: { p_device_id: string; p_device_token: string }
        Returns: {
          name: string
          role_name_ar: string
          user_id: string
        }[]
      }
      list_pos_sale_pending_card_refunds: {
        Args: { p_sale_id: string }
        Returns: Json
      }
      log_pos_operational_event: {
        Args: {
          p_details?: Json
          p_device_id: string
          p_device_token: string
          p_event_type: string
          p_message_code?: string
          p_severity?: string
        }
        Returns: string
      }
      manager_close_pos_shift: {
        Args: { p_closing_cash: number; p_notes: string; p_shift_id: string }
        Returns: Json
      }
      open_pos_shift: {
        Args: {
          p_device_id: string
          p_device_token: string
          p_opening_cash?: number
        }
        Returns: Json
      }
      place_customer_order: {
        Args: {
          p_address_id: string
          p_items: Json
          p_notes: string
          p_payment_method: string
          p_quote_token: string
          p_request_id: string
        }
        Returns: Json
      }
      preflight_pos_sale: {
        Args: { p_branch_id: string; p_items: Json }
        Returns: Json
      }
      process_online_order: {
        Args: {
          p_action: string
          p_expected_status?: string
          p_order_id: string
          p_payment_method?: string
          p_payment_reference?: string
          p_target_status?: string
        }
        Returns: Json
      }
      quote_customer_cart: {
        Args: { p_items: Json; p_latitude: number; p_longitude: number }
        Returns: Json
      }
      quote_customer_order: {
        Args: { p_address_id: string; p_items: Json }
        Returns: Json
      }
      record_merged_cash_transaction:
        | {
            Args: {
              p_amount: number
              p_created_by?: string
              p_notes: string
              p_transaction_type: string
            }
            Returns: number
          }
        | {
            Args: {
              p_amount: number
              p_branch_id?: string
              p_created_by?: string
              p_notes: string
              p_transaction_type: string
            }
            Returns: number
          }
      record_online_gateway_settlement: {
        Args: {
          p_branch_id: string
          p_fee?: number
          p_gross: number
          p_note?: string
          p_payment_method: string
          p_provider_reference?: string
        }
        Returns: Json
      }
      register_pos_device: {
        Args: { p_branch_id: string; p_name: string }
        Returns: Json
      }
      replace_customer_cart: {
        Args: { p_expected_user_id: string; p_items: Json }
        Returns: undefined
      }
      reset_staff_pos_pin: {
        Args: { p_branch_id: string; p_user_id: string }
        Returns: undefined
      }
      revoke_pos_device: { Args: { p_device_id: string }; Returns: undefined }
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
      save_my_pos_workspace: {
        Args: {
          p_active_tab_id?: string
          p_branch_id: string
          p_device_id: string
          p_tabs: Json
        }
        Returns: undefined
      }
      save_product_editor: {
        Args: {
          p_alert?: Json
          p_branch_id: string
          p_inventory?: Json
          p_product: Json
          p_product_id?: string
        }
        Returns: Json
      }
      save_product_variant: {
        Args: {
          p_branch_id: string
          p_parent_product_id: string
          p_variant: Json
          p_variant_id?: string
        }
        Returns: Json
      }
      set_customer_favorite: {
        Args: { p_favorite: boolean; p_product_id: string }
        Returns: undefined
      }
      set_customer_favorite_unit: {
        Args: {
          p_favorite: boolean
          p_product_id: string
          p_variant_id: string
        }
        Returns: undefined
      }
      set_default_customer_address: {
        Args: { p_address_id: string }
        Returns: undefined
      }
      set_my_pos_pin: {
        Args: { p_branch_id: string; p_pin: string }
        Returns: undefined
      }
      set_product_variant_active: {
        Args: { p_active: boolean; p_branch_id: string; p_variant_id: string }
        Returns: Json
      }
      set_staff_pos_access: {
        Args: { p_branch_id: string; p_enabled: boolean; p_user_id: string }
        Returns: undefined
      }
      set_staff_pos_pin: {
        Args: { p_branch_id: string; p_pin: string; p_user_id: string }
        Returns: undefined
      }
      setup_branch_tables: {
        Args: { p_schema_name: string }
        Returns: undefined
      }
      staff_has_permission: {
        Args: { p_branch_id?: string; p_permission_code: string }
        Returns: boolean
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
      update_pos_device_runtime_settings: {
        Args: {
          p_auto_lock_minutes: number
          p_cash_warning_threshold?: number
          p_device_id: string
        }
        Returns: Json
      }
      verify_pos_quick_login: {
        Args: {
          p_device_id: string
          p_device_token: string
          p_pin: string
          p_user_id: string
        }
        Returns: Json
      }
      void_branch_expense_atomic: {
        Args: { p_expense_id: string; p_reason?: string }
        Returns: Json
      }
    }
    Enums: {
      branch_category:
        | "main_hub"
        | "franchise"
        | "internal"
        | "retail"
        | "warehouse"
      branch_type: "internal" | "external"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      branch_category: [
        "main_hub",
        "franchise",
        "internal",
        "retail",
        "warehouse",
      ],
      branch_type: ["internal", "external"],
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

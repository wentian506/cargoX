export type Role = "sender" | "transporter" | "admin";

export type User = {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  status: string;
  state?: string | null;
  district?: string | null;
  preferred_language?: string | null;
  mobile?: string | null;
  verified?: boolean;
};

export type Allocation = {
  allocated_share: number;
  standalone_cost: number;
  saving: number;
  approval: "pending" | "approved" | "rejected";
  method: string;
  participation_ok: boolean;
};

export type Shipment = {
  id: string;
  code: string;
  sender_id: string;
  sender_name?: string;
  commodity: string;
  quantity_kg: number;
  quantity_quintal: number;
  pickup_village: string;
  pickup_district?: string;
  pickup: { lat: number; lng: number };
  destination_name?: string;
  destination_id?: string;
  destination: { lat: number; lng: number };
  ready_from?: string;
  ready_to?: string;
  deadline?: string;
  packaging?: string;
  handling?: string;
  temperature?: string;
  special_instructions?: string;
  status: string;
  status_label: string;
  freight_estimate: number;
  freight_approved: boolean;
  direction: string;
  is_synthetic: boolean;
  created_at: string;
  updated_at: string;
  allocation?: Allocation | null;
  transporter?: { name: string; vehicle: string; vehicle_class: string; assignment_status: string } | null;
  trip?: { id: string; code: string; status: string; started_at?: string } | null;
  timeline?: any[];
};

export type Vehicle = {
  id: string;
  transporter_id: string;
  transporter_name?: string;
  reg_no: string;
  vehicle_class: string;
  payload_kg: number;
  volume_m3: number;
  body_type?: string;
  fuel?: string;
  operating_districts?: string;
  availability: string;
  cost_per_km: number;
  verified: boolean;
  verified_at?: string;
  created_at: string;
};

export type CapacityBlock = {
  id: string;
  transporter_id: string;
  transporter_name?: string;
  vehicle_id?: string;
  reg_no?: string;
  vehicle_class: string;
  payload_kg: number;
  volume_m3: number;
  corridor?: string;
  window_from?: string;
  window_to?: string;
  block_size_kg?: number;
  min_run_km?: number;
  reserve_price_per_km?: number;
  cancellation_terms?: string;
  status: string;
  verification_status?: string;
};

export type Trip = {
  id: string;
  trip_code: string;
  status: string;
  vehicle_id?: string;
  reg_no?: string;
  vehicle_class?: string;
  driver_name?: string;
  started_at?: string;
  finished_at?: string;
  delay_reported?: string;
  revenue?: number;
  distance_km?: number;
  assignment_id?: string;
  assignment_status?: string;
  next_action?: string;
  shipments: Shipment[];
  legs: any[];
};

export type Paged<T> = { items: T[]; page: number; page_size: number; total: number; pages: number };

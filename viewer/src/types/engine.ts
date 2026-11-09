export interface SatelliteConfig {
  id: string;
  norad_id: number;
  buffer_capacity_gb: number;
  initial_buffer_gb: number;
  generation_gb_per_hour: number;
  downlink_rate_mbps: number;
}

export interface AntennaConfig {
  id: string;
  name: string;
  lat_deg: number;
  lon_deg: number;
  alt_m: number;
  min_elevation_deg: number;
  dishes: number;
  setup_s: number;
}

export interface ScenarioData {
  schema_version: string;
  scenario_id: string;
  start_utc: string;
  duration_hours: number;
  satellites: SatelliteConfig[];
  antennas: AntennaConfig[];
}

export interface TleEntry {
  satellite_id: string;
  norad_id: number;
  name: string;
  line1: string;
  line2: string;
}

export type TlesMap = Record<string, TleEntry>;

export interface PassRecord {
  pass_id: string;
  satellite_id: string;
  antenna_id: string;
  aos_utc: string;
  los_utc: string;
  max_elevation_deg: number;
  duration_s: number;
  max_volume_gb: number;
  expected_volume_gb: number;
}

export interface ConflictRecord {
  pass_a: string;
  pass_b: string;
  reason: 'same_antenna' | 'same_satellite';
}

export interface PassesDocument {
  schema_version: string;
  scenario_id: string;
  passes: PassRecord[];
  conflicts?: ConflictRecord[];
}

export interface AssignmentRecord {
  pass_id: string;
  satellite_id: string;
  antenna_id: string;
  start_utc: string;
  end_utc: string;
  planned_gb: number;
}

export interface BufferPoint {
  t_utc: string;
  level_gb: number;
}

export interface ScheduleDocument {
  schema_version: string;
  scenario_id: string;
  method: 'greedy' | 'optimizer';
  assignments: AssignmentRecord[];
  buffer_timeline: Record<string, BufferPoint[]>;
  summary: {
    gb_delivered: number;
    overflow_gb: number;
    overflow_events: number;
    passes_used: number;
    passes_available: number;
    conflicts: number;
  };
}

export interface ScoreboardDocument {
  scenario_id: string;
  generated_gb: number;
  methods: {
    method: string;
    passes_used: number;
    gb_delivered: number;
    overflow_gb: number;
    overflow_events: number;
    share_of_generated_pct: number;
  }[];
  gain_gb: number;
  gain_pct: number | null;
}

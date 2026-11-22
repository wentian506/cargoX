import {
  Activity, BarChart3, Bell, Boxes, Brain, ClipboardCheck, ClipboardList, Clock, Coins, Compass,
  Container, Crosshair, FileText, Gauge, HelpCircle, Layers, LayoutDashboard, LifeBuoy, LineChart,
  MapPin, Mic, PackagePlus, PieChart, Route, Scale, Settings, ShieldCheck, Sparkles, Split, Truck,
  Users, Warehouse, Waves, Waypoints, Wrench,
} from "lucide-react";
import type { NavGroup } from "@/components/AppShell";

export const senderNav: NavGroup[] = [
  {
    title: "Operate",
    items: [
      { href: "/sender", label: "Overview", icon: LayoutDashboard },
      { href: "/sender/create", label: "Create shipment", icon: PackagePlus },
      { href: "/sender/shipments", label: "My shipments", icon: Container },
      { href: "/sender/capacity", label: "Find transportation", icon: Truck },
      { href: "/sender/tracking", label: "Shipment tracking", icon: MapPin },
    ],
  },
  {
    title: "Understand",
    items: [
      { href: "/sender/costs", label: "Freight & fair share", icon: Scale },
      { href: "/sender/destinations", label: "Destination advisor", icon: Compass },
      { href: "/sender/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Support",
    items: [
      { href: "/sender/voice", label: "VoiceBoli", icon: Mic },
      { href: "/sender/notifications", label: "Notifications", icon: Bell },
      { href: "/sender/settings", label: "Profile & settings", icon: Settings },
      { href: "/sender/help", label: "Help centre", icon: HelpCircle },
    ],
  },
];

export const transporterNav: NavGroup[] = [
  {
    title: "Fleet",
    items: [
      { href: "/transporter", label: "Overview", icon: LayoutDashboard },
      { href: "/transporter/vehicles", label: "My vehicles", icon: Truck },
      { href: "/transporter/vehicles/add", label: "Add vehicle", icon: PackagePlus },
      { href: "/transporter/capacity", label: "Capacity exchange", icon: Boxes },
    ],
  },
  {
    title: "Work",
    items: [
      { href: "/transporter/assignments", label: "Available assignments", icon: ClipboardList },
      { href: "/transporter/trips", label: "Trip management", icon: Route },
      { href: "/transporter/backhaul", label: "Return loads", icon: Waypoints },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/transporter/earnings", label: "Earnings & reports", icon: Coins },
      { href: "/transporter/performance", label: "Performance", icon: Gauge },
      { href: "/transporter/notifications", label: "Notifications", icon: Bell },
      { href: "/transporter/settings", label: "Profile & verification", icon: Settings },
    ],
  },
];

export const adminNav: NavGroup[] = [
  {
    title: "Control tower",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/tower", label: "Digital twin map", icon: Crosshair },
      { href: "/admin/trips", label: "Trip monitoring", icon: Activity },
    ],
  },
  {
    title: "People",
    items: [
      { href: "/admin/senders", label: "Senders", icon: Users },
      { href: "/admin/transporters", label: "Transporters", icon: Truck },
      { href: "/admin/vehicles", label: "Vehicles", icon: Container },
      { href: "/admin/support", label: "Support", icon: LifeBuoy },
    ],
  },
  {
    title: "Flow",
    items: [
      { href: "/admin/shipments", label: "Shipments", icon: ClipboardList },
      { href: "/admin/pools", label: "Shipment pool", icon: Layers },
      { href: "/admin/capacity", label: "Capacity exchange", icon: Boxes },
      { href: "/admin/planning", label: "Plan & route", icon: Route },
      { href: "/admin/dispatch", label: "DispatchSense", icon: Clock },
      { href: "/admin/allocations", label: "ShapleySplit", icon: Scale },
      { href: "/admin/assignments", label: "Assignments", icon: ClipboardCheck },
      { href: "/admin/deliveries", label: "Delivery verification", icon: FileText },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { href: "/admin/harvestpulse", label: "HarvestPulse", icon: Brain },
      { href: "/admin/readysync", label: "ReadySync", icon: ClipboardCheck },
      { href: "/admin/grantwin", label: "GramTwin-2E & hubs", icon: Warehouse },
      { href: "/admin/valueclock", label: "ValueClock", icon: Compass },
      { href: "/admin/agrocompat", label: "AgroCompat", icon: Sparkles },
      { href: "/admin/recovery", label: "ShadowFleet-Heal", icon: Wrench },
      { href: "/admin/backhaul", label: "CrossFlow-Backhaul", icon: Waypoints },
      { href: "/admin/monsoonpass", label: "MonsoonPass", icon: Waves },
      { href: "/admin/simulator", label: "Policy simulator", icon: LineChart },
    ],
  },
  {
    title: "Governance",
    items: [
      { href: "/admin/analytics", label: "Analytics & reports", icon: BarChart3 },
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/admin/system", label: "System & audit", icon: ShieldCheck },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const moduleMeta: Record<string, { name: string; blurb: string; icon: any }> = {
  harvestpulse: { name: "HarvestPulse", blurb: "7–21 day harvest-ready demand with p10/p50/p90 bands", icon: Brain },
  dispatch: { name: "DispatchSense", blurb: "GO / WAIT / SPLIT / CANCEL with a rupee trade-off", icon: Clock },
  readysync: { name: "ReadySync", blurb: "T-60 / T-45 readiness check-ins and wave management", icon: ClipboardCheck },
  grantwin: { name: "GramTwin-2E", blurb: "First-mile collection + hub line-haul, with hub selection", icon: Warehouse },
  valueclock: { name: "ValueClock", blurb: "Net realisation comparison across destinations", icon: Compass },
  agrocompat: { name: "AgroCompat", blurb: "Hard and soft commodity compatibility rules", icon: Sparkles },
  allocations: { name: "ShapleySplit", blurb: "Marginal-cost fair allocation with participation checks", icon: Scale },
  recovery: { name: "ShadowFleet-Heal", blurb: "Freeze unaffected, repair affected, await approval", icon: Wrench },
  backhaul: { name: "CrossFlow-Backhaul", blurb: "Return-load matching with an explicit accept rule", icon: Waypoints },
  monsoonpass: { name: "MonsoonPass", blurb: "Seasonal road access by vehicle class", icon: Waves },
  simulator: { name: "Policy simulator", blurb: "Fixed-seed comparison of four operating policies", icon: LineChart },
};

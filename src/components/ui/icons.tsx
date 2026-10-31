import type { CSSProperties, ReactNode } from "react";
import { FIFI } from "@/components/brand/fifi-paths";

type IconProps = { size?: number; stroke?: number; className?: string; style?: CSSProperties };

function Stroke({ size = 18, stroke = 2.2, className, style, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {children}
    </svg>
  );
}

export const WhatsAppIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </Stroke>
);
export const WhatsAppFabIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    <path d="M9 10c.5 2 2 3.5 4 4l1.2-1.2 2 1-.5 1.7c-3.5.2-7-3.3-6.8-6.8l1.7-.5 1 2z" />
  </Stroke>
);
export const PhoneIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </Stroke>
);
export const PinIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0" />
    <circle cx="12" cy="10" r="3" />
  </Stroke>
);
export const CalendarIcon = ({ variant, ...p }: IconProps & { variant?: "check" | "plus" }) => (
  <Stroke {...p}>
    <rect x="3" y="4" width="18" height="18" rx="3" />
    <path d={`M16 2v4M8 2v4M3 10h18${variant === "check" ? "M9 16l2 2 4-4" : variant === "plus" ? "M12 14v4M10 16h4" : ""}`} />
  </Stroke>
);
export const HomeIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Stroke>
);
export const UsersIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
  </Stroke>
);
export const ArrowRightIcon = (p: IconProps) => (
  <Stroke stroke={2.4} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Stroke>
);
export const ArrowDownIcon = (p: IconProps) => (
  <Stroke stroke={2.4} {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Stroke>
);
export const ChevronLeftIcon = (p: IconProps) => (
  <Stroke stroke={2.4} {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Stroke>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Stroke stroke={2.4} {...p}>
    <path d="M9 18l6-6-6-6" />
  </Stroke>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Stroke stroke={2.4} {...p}>
    <path d="M6 9l6 6 6-6" />
  </Stroke>
);
export const MenuIcon = (p: IconProps) => (
  <Stroke size={20} stroke={2.4} {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Stroke>
);
export const CloseIcon = (p: IconProps) => (
  <Stroke size={20} stroke={2.4} {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Stroke>
);
export const MinusIcon = (p: IconProps) => (
  <Stroke size={16} stroke={2.6} {...p}>
    <path d="M5 12h14" />
  </Stroke>
);
export const PlusIcon = (p: IconProps) => (
  <Stroke size={16} stroke={2.6} {...p}>
    <path d="M5 12h14M12 5v14" />
  </Stroke>
);
export const LoginIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
  </Stroke>
);
export const LogoutIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Stroke>
);
export const ArrowUpIcon = (p: IconProps) => (
  <Stroke stroke={2.4} {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Stroke>
);
export const CheckIcon = (p: IconProps) => (
  <Stroke stroke={2.4} {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Stroke>
);
export const SearchIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Stroke>
);
export const ClockIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Stroke>
);
export const InfoIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </Stroke>
);
export const AlertIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </Stroke>
);
export const WarningIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
  </Stroke>
);
export const GridIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Stroke>
);
export const ListIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01" />
  </Stroke>
);
export const BanIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M5.7 5.7l12.6 12.6" />
  </Stroke>
);
export const TagIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z" />
    <circle cx="7.5" cy="7.5" r="1.2" />
  </Stroke>
);
export const ImageIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <circle cx="9" cy="9" r="1.8" />
    <path d="m21 15-4.6-4.6a1.5 1.5 0 0 0-2.1 0L5 20" />
  </Stroke>
);
export const FileTextIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />
  </Stroke>
);
export const ExternalLinkIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Stroke>
);
export const UploadIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </Stroke>
);
export const TrashIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
  </Stroke>
);
export const MailIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2.5" />
    <path d="m22 7-10 6L2 7" />
  </Stroke>
);
export const WalletIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3h-4a2 2 0 0 0 0 4h4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
  </Stroke>
);
export const RefreshIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5" />
  </Stroke>
);
export const EyeIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Stroke>
);
export const EyeOffIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M9.9 4.2A10 10 0 0 1 12 4c6.4 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.6 8 10 8a9.7 9.7 0 0 0 5.4-1.6M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20" />
  </Stroke>
);
export const NoteIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Stroke>
);

// Silueta de Fifí (trazos de components/brand/fifi-paths.ts, encuadre MARK_FIFI_VIEWBOX) para el ícono de las
// notificaciones de Android, que solo usa la forma (lib/app-icon.tsx). Cada trazo se rellena con evenodd: los ojos y
// la fosa nasal quedan calados. El logo de la marca es la imagen de components/brand/logo.tsx.
export const MARK_FIFI_VIEWBOX = "14 14 330 282";
export const MARK_FIFI = [
  FIFI.hornLeft,
  FIFI.hornRight,
  FIFI.earLeft,
  FIFI.earRight,
  `${FIFI.head}M130 172a26 29 0 1 0 52 0a26 29 0 1 0 -52 0ZM204 154a24 27 0 1 0 48 0a24 27 0 1 0 -48 0Z`,
  `${FIFI.muzzle}M79 244a21 12 0 1 0 42 0a21 12 0 1 0 -42 0Z`,
  FIFI.tongue,
  FIFI.tag,
];

// Una huella (mascotas).
export const PawIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
    <ellipse cx="12" cy="16" rx="5.2" ry="4.4" />
    <ellipse cx="5.6" cy="9.6" rx="2.1" ry="2.7" />
    <ellipse cx="9.8" cy="5.4" rx="2.1" ry="2.7" />
    <ellipse cx="14.4" cy="5.4" rx="2.1" ry="2.7" />
    <ellipse cx="18.6" cy="9.6" rx="2.1" ry="2.7" />
  </svg>
);

export const BellIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
  </Stroke>
);
export const SendIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
  </Stroke>
);
export const SlidersIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Stroke>
);
export const ReceiptIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6M9 16h3" />
  </Stroke>
);
export const VolumeIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
  </Stroke>
);
export const VolumeOffIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6" />
  </Stroke>
);
export const PencilIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </Stroke>
);
export const LockIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2.5" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Stroke>
);
export const DownloadIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </Stroke>
);
export const ArrowLeftIcon = (p: IconProps) => (
  <Stroke stroke={2.4} {...p}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Stroke>
);
export const PauseIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </Stroke>
);
export const PlayIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M6 4l14 8-14 8z" />
  </Stroke>
);
export const TrendIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M22 7l-8.5 8.5-5-5L2 17M16 7h6v6" />
  </Stroke>
);
export const MoonIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
  </Stroke>
);
export const StarOutlineIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M12 2l3 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.8 20.6l1.4-6.8L2.1 9.1 9 8.3z" />
  </Stroke>
);
export const GiftIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </Stroke>
);
export const LinkIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </Stroke>
);
export const PaletteIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M12 3a9 9 0 0 0 0 18c1 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.5-.7-.5-1.2 0-1 .8-1.7 1.7-1.7H17a4 4 0 0 0 4-4c0-4.6-4-8.3-9-8.3z" />
    <circle cx="7.5" cy="11.5" r="1" fill="currentColor" />
    <circle cx="10" cy="7.5" r="1" fill="currentColor" />
    <circle cx="15" cy="7.5" r="1" fill="currentColor" />
  </Stroke>
);
export const ShieldIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </Stroke>
);
export const MonitorIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Stroke>
);
export const SmartphoneIcon = (p: IconProps) => (
  <Stroke stroke={2} {...p}>
    <rect x="6.5" y="2" width="11" height="20" rx="2.5" />
    <path d="M11 18.5h2" />
  </Stroke>
);

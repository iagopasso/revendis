import type { ReactNode } from 'react';

type IconProps = { className?: string };

const IconBase = ({ children, className }: { children: ReactNode; className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className ? `app-icon ${className}` : 'app-icon'}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconDashboard = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M4 13a8 8 0 1 1 16 0" />
    <path d="M12 13l4-4" />
    <circle cx="12" cy="13" r="1.5" />
  </IconBase>
);

export const IconBox = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M3 7l9-4 9 4v10l-9 4-9-4V7z" />
    <path d="M3 7l9 4 9-4" />
    <path d="M12 11v10" />
  </IconBase>
);

export const IconTag = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M3 7v6l6 6 9-9-6-6H3z" />
    <circle cx="7.5" cy="9.5" r="1" />
  </IconBase>
);

export const IconCart = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M4 6h2l2 9h9l2-6H8" />
    <circle cx="10" cy="20" r="1.5" />
    <circle cx="17" cy="20" r="1.5" />
  </IconBase>
);

export const IconUsers = ({ className }: IconProps) => (
  <IconBase className={className}>
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M4 19c0-3 3-5 5-5s5 2 5 5" />
    <path d="M13 19c0-2 2-3.5 4-3.5 2 0 4 1.5 4 3.5" />
  </IconBase>
);

export const IconDollar = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M12 3v18" />
    <path d="M16 7.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.5 2.4 4 2.9 4 1.2 4 3-1.8 3-4 3-4-1.3-4-3" />
  </IconBase>
);

export const IconChart = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <rect x="6.5" y="12" width="2.5" height="6" rx="0.5" />
    <rect x="11" y="9" width="2.5" height="9" rx="0.5" />
    <rect x="15.5" y="6" width="2.5" height="12" rx="0.5" />
  </IconBase>
);

export const IconCalendar = ({ className }: IconProps) => (
  <IconBase className={className}>
    <rect x="4" y="6" width="16" height="14" rx="2" />
    <path d="M8 3v6" />
    <path d="M16 3v6" />
    <path d="M4 10h16" />
  </IconBase>
);

export const IconCreditCard = ({ className }: IconProps) => (
  <IconBase className={className}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" />
    <path d="M7 14h4" />
  </IconBase>
);

export const IconClipboard = ({ className }: IconProps) => (
  <IconBase className={className}>
    <rect x="6" y="5" width="12" height="16" rx="2" />
    <path d="M9 5a3 3 0 0 1 6 0" />
    <path d="M9 9h6" />
    <path d="M9 13h6" />
  </IconBase>
);

export const IconPercent = ({ className }: IconProps) => (
  <IconBase className={className}>
    <line x1="5" y1="19" x2="19" y2="5" />
    <circle cx="7" cy="7" r="2" />
    <circle cx="17" cy="17" r="2" />
  </IconBase>
);

export const IconCoins = ({ className }: IconProps) => (
  <IconBase className={className}>
    <ellipse cx="12" cy="6" rx="6" ry="2.5" />
    <path d="M6 6v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V6" />
    <path d="M6 11v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5" />
  </IconBase>
);

export const IconGrid = ({ className }: IconProps) => (
  <IconBase className={className}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <rect x="14" y="14" width="6" height="6" rx="1" />
  </IconBase>
);

export const IconList = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M5 7h14" />
    <path d="M5 12h14" />
    <path d="M5 17h14" />
  </IconBase>
);

export const IconDots = ({ className }: IconProps) => (
  <IconBase className={className}>
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </IconBase>
);

export const IconUpload = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M12 3v12" />
    <path d="M8 7l4-4 4 4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </IconBase>
);

export const IconPlus = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </IconBase>
);

export const IconEdit = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M4 20h4l10-10-4-4L4 16v4z" />
    <path d="M14 6l4 4" />
  </IconBase>
);

export const IconTrash = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </IconBase>
);

export const IconUser = ({ className }: IconProps) => (
  <IconBase className={className}>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M5 19c0-3.3 3.1-5.4 7-5.4s7 2.1 7 5.4" />
  </IconBase>
);

export const IconSettings = ({ className }: IconProps) => (
  <IconBase className={className}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 1 1-3.6 0v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 1 1 0-3.6h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1.8 1.8 0 0 1 3.6 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2a1.8 1.8 0 1 1 0 3.6h-.2a1 1 0 0 0-.9.6z" />
  </IconBase>
);

export const IconLogout = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M14 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2" />
    <path d="M10 12h11" />
    <path d="M18 8l4 4-4 4" />
  </IconBase>
);

export const IconStar = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M12 3.5l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.6-4.4 6.3-.9z" />
  </IconBase>
);

export const IconDiamond = ({ className }: IconProps) => (
  <IconBase className={className}>
    <path d="M6 9l6 11 6-11-6-6-6 6z" />
    <path d="M6 9h12" />
  </IconBase>
);

export const IconLock = ({ className }: IconProps) => (
  <IconBase className={className}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </IconBase>
);

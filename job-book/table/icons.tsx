// Small line icons for the table's format panel, drawn like Excalidraw's own.

const Icon = ({ children }: { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 20 20"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const RowAddIcon = (
  <Icon>
    <rect x="2.5" y="3" width="15" height="9" rx="1.5" />
    <path d="M2.5 7.5h15M10 14.5v4M8 16.5h4" />
  </Icon>
);
export const RowAboveIcon = (
  <Icon>
    <rect x="2.5" y="8" width="15" height="9" rx="1.5" />
    <path d="M2.5 12.5h15M10 1.5v4M8 3.5h4" />
  </Icon>
);
export const RowRemoveIcon = (
  <Icon>
    <rect x="2.5" y="3" width="15" height="9" rx="1.5" />
    <path d="M2.5 7.5h15M7.5 16.5h5" />
  </Icon>
);
export const ColumnAddIcon = (
  <Icon>
    <rect x="3" y="2.5" width="9" height="15" rx="1.5" />
    <path d="M7.5 2.5v15M16.5 8v4M14.5 10h4" />
  </Icon>
);
export const ColumnLeftIcon = (
  <Icon>
    <rect x="8" y="2.5" width="9" height="15" rx="1.5" />
    <path d="M12.5 2.5v15M3.5 8v4M1.5 10h4" />
  </Icon>
);
export const ColumnRemoveIcon = (
  <Icon>
    <rect x="3" y="2.5" width="9" height="15" rx="1.5" />
    <path d="M7.5 2.5v15M16.5 7.5v5" />
  </Icon>
);
export const SortUpIcon = (
  <Icon>
    <path d="M6 15V4M3 7l3-3 3 3M11 6h6M11 10h4.5M11 14h3" />
  </Icon>
);
export const SortDownIcon = (
  <Icon>
    <path d="M6 4v11M3 12l3 3 3-3M11 6h3M11 10h4.5M11 14h6" />
  </Icon>
);
export const FilterIcon = (
  <Icon>
    <path d="M3 4h14l-5.5 6.5V16l-3 1.5v-7z" />
  </Icon>
);
export const BoldIcon = (
  <Icon>
    <path d="M6 4h5a3 3 0 0 1 0 6H6zM6 10h6a3 3 0 0 1 0 6H6z" strokeWidth="2" />
  </Icon>
);
export const AlignLeftIcon = (
  <Icon>
    <path d="M3 5h14M3 9h9M3 13h14M3 17h9" />
  </Icon>
);
export const AlignCenterIcon = (
  <Icon>
    <path d="M3 5h14M5.5 9h9M3 13h14M5.5 17h9" />
  </Icon>
);
export const AlignRightIcon = (
  <Icon>
    <path d="M3 5h14M8 9h9M3 13h14M8 17h9" />
  </Icon>
);
export const LineSolidIcon = (
  <Icon>
    <path d="M3 10h14" />
  </Icon>
);
export const LineDashedIcon = (
  <Icon>
    <path d="M3 10h3.5M8.5 10h3M13.5 10h3.5" />
  </Icon>
);
export const LineDottedIcon = (
  <Icon>
    <path d="M3.5 10h.01M7.2 10h.01M10.9 10h.01M14.6 10h.01" strokeWidth="2.2" />
  </Icon>
);
export const ThinIcon = (
  <Icon>
    <path d="M3 10h14" strokeWidth="1" />
  </Icon>
);
export const BoldLineIcon = (
  <Icon>
    <path d="M3 10h14" strokeWidth="3" />
  </Icon>
);
export const SharpCornerIcon = (
  <Icon>
    <path d="M5 16V5h11" />
  </Icon>
);
export const RoundCornerIcon = (
  <Icon>
    <path d="M5 16V10a5 5 0 0 1 5-5h6" />
  </Icon>
);

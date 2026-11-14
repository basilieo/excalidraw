import type { ReactElement } from "react";

// Whether the board is saved, as one small icon in the bottom bar beside
// zoom and undo. Hover it for the words.

const icons: Record<string, ReactElement> = {
  // a cloud with a tick: everything is on the server
  saved: (
    <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.2a4 4 0 0 1-.5 9.8H7zM9.5 13l2 2 3.5-3.5" />
  ),
  // two arrows going round: a save is under way or waiting
  saving: (
    <path d="M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6M18 3v3.6h-3.6M6 21v-3.6h3.6" />
  ),
  // a cloud with a warning: saving has stopped
  problem: (
    <path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.2a4 4 0 0 1-.5 9.8H7zM12 10v3M12 15.5v.01" />
  ),
  // an eye: this board is view only for you
  readonly: (
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6z" />
  ),
};

const kind = (status: string) =>
  status === "saved"
    ? "saved"
    : status === "conflict" || status === "error"
    ? "problem"
    : status === "readonly"
    ? "readonly"
    : "saving";

export const SyncStatus = ({
  status,
  label,
}: {
  status: string;
  label: string;
}) => {
  const k = kind(status);
  return (
    <div
      className={`jb-sync is-${k}${status === "saving" ? " is-spinning" : ""}`}
      data-ref="save-status"
      data-status={status}
      title={label}
      aria-label={label}
      role="status"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icons[k]}
      </svg>
    </div>
  );
};

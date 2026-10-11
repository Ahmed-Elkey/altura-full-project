export function BagIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5.6 8.2h12.8l-1.1 10.6a2.4 2.4 0 0 1-2.4 2.2H9.1a2.4 2.4 0 0 1-2.4-2.2L5.6 8.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 8.2V7a3.2 3.2 0 0 1 6.4 0v1.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

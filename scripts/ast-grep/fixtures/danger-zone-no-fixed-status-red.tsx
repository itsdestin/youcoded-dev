// Violation fixture for danger-zone-no-fixed-status-red — each line fires once.
export const A = () => <span className="text-[#DD4444] text-xs">This cannot be undone.</span>;
export const cls = (dim: boolean) => `text-[#DD4444] ${dim ? 'opacity-50' : ''}`;
